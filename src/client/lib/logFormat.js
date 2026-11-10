/**
 * 运行日志的逐行解析：把一行拆成若干片段，交给 CSS 按语义上色。
 *
 * 为什么不按 ANSI 上色：Gradle 在管道里默认关闭颜色，Minecraft 的 log4j 也只在
 * 终端里输出色码。多数日志查看器（mclo.gs / Aternos codex）同样是先解析出 level
 * 再染色，而不是解析转义序列。这里沿用同一思路，顺便把万一出现的 ANSI 码剥掉。
 *
 * 支持的三种真实格式：
 *   [01:28:45] [Render thread/WARN] [minecraft/SoundEngine]: message   ← log4j
 *   [01:28:45 INFO]: message                                          ← Paper
 *   WARN StatusConsoleListener ...                                     ← 无时间戳的 log4j 状态行
 * 另外识别 Gradle 的 `> Task`、`BUILD SUCCESSFUL`、`FAILURE:` 与堆栈帧。
 *
 * @module minecraft-dev-starter/client/logFormat
 */

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g

/** @typedef {'time'|'thread'|'level-info'|'level-warn'|'level-error'|'level-debug'|'logger'|'message'|'task'|'ok'|'fail'|'stack'|'muted'} SegmentKind */

/**
 * @param {string} text
 * @param {SegmentKind} kind
 * @returns {{ text: string, kind: SegmentKind }}
 */
function seg(text, kind) {
  return { text, kind }
}

/**
 * 把 WARN / ERROR / FATAL 等归一成三档。
 * @param {string} level
 * @returns {SegmentKind}
 */
function levelKind(level) {
  const upper = level.toUpperCase()
  if (upper === 'WARN' || upper === 'WARNING') return 'level-warn'
  if (upper === 'ERROR' || upper === 'FATAL' || upper === 'SEVERE') return 'level-error'
  if (upper === 'DEBUG' || upper === 'TRACE' || upper === 'FINE' || upper === 'FINER') return 'level-debug'
  return 'level-info'
}

const LOG4J = /^\[(\d{2}:\d{2}:\d{2})\]\s+\[([^\]]+?)\/([A-Z]+)\]\s*(?:\[([^\]]*)\]:\s*|:\s*)?(.*)$/
const PAPER = /^\[(\d{2}:\d{2}:\d{2}) ([A-Z]+)\]:\s*(.*)$/
const BARE_LEVEL = /^(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s+(.*)$/
const STACK = /^\s+(at |\.\.\. \d+ more)/

/**
 * 一行日志 → 片段数组。永远至少返回一个片段。
 * @param {string} raw
 * @returns {Array<{ text: string, kind: SegmentKind }>}
 */
export function highlightLine(raw) {
  const line = String(raw ?? '').replace(ANSI, '')
  if (line === '') return [seg('', 'plain')]

  if (/^Caused by:|^\s+Suppressed:/.test(line)) return [seg(line, 'fail')]
  if (STACK.test(line)) return [seg(line, 'stack')]

  const log4j = LOG4J.exec(line)
  if (log4j !== null) {
    const [, time, thread, level, logger, message] = log4j
    const kind = levelKind(level)
    /** @type {Array<{ text: string, kind: SegmentKind }>} */
    const parts = [
      seg(`[${time}] `, 'time'),
      seg(`[${thread}/`, 'thread'),
      seg(level, kind),
      seg(logger === undefined ? ']: ' : '] ', 'thread'),
    ]
    if (logger !== undefined) parts.push(seg(`[${logger}]: `, 'logger'))
    parts.push(seg(message, kind === 'level-error' ? 'level-error' : 'message'))
    return parts
  }

  const paper = PAPER.exec(line)
  if (paper !== null) {
    const [, time, level, message] = paper
    return [
      seg(`[${time} `, 'time'),
      seg(level, levelKind(level)),
      seg(']: ', 'time'),
      seg(message, levelKind(level) === 'level-error' ? 'level-error' : 'message'),
    ]
  }

  const bare = BARE_LEVEL.exec(line)
  if (bare !== null) {
    const [, level, message] = bare
    return [seg(`${level} `, levelKind(level)), seg(message, levelKind(level) === 'level-error' ? 'level-error' : 'message')]
  }

  if (/^> Task /.test(line) || /^> Configure project /.test(line)) return [seg(line, 'task')]
  if (/^BUILD SUCCESSFUL/.test(line)) return [seg(line, 'ok')]
  if (/^BUILD FAILED/.test(line) || /^FAILURE:/.test(line)) return [seg(line, 'fail')]
  if (/^\* What went wrong:|^\* Where:|^\* Try:/.test(line)) return [seg(line, 'level-warn')]
  if (/^(Reusing configuration cache|Deprecated Gradle features|You can use)/.test(line)) return [seg(line, 'muted')]

  return [seg(line, 'plain')]
}

/**
 * 批量解析，便于测试与 memo 化调用。
 * @param {string[]} lines
 * @returns {Array<Array<{ text: string, kind: SegmentKind }>>}
 */
export function highlightLines(lines) {
  return (lines ?? []).map(highlightLine)
}
