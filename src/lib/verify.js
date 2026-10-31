/**
 * 目标分类与验证裁决。
 *
 * MC 开发里的"运行目标"其实是两种东西：
 *   - `client` / `server`：**守护进程**。窗口或控制台开着就不退，"就绪"是个有意义的状态；
 *   - `data` / `gameTestServer`：**一次性任务**。跑完即结束，"结束"本身就是唯一的结局。
 *
 * 用同一套"等就绪"的语义去管两类目标会出两个错：一是把 `BUILD SUCCESSFUL` 这种
 * **终止**信号当成**就绪**信号（runData 会在即将退出的瞬间被标成运行中）；
 * 二是跑完之后没有任何"过没过"的结论可拿——而 agent 要的恰恰是这个结论。
 *
 * 所以 mode 与裁决在这里单独成型，启动服务只负责按 mode 走不同的生命周期。
 * @module minecraft-dev-starter/lib/verify
 */

/** 目标模式：常驻，还是会跑完。 */
export const MODES = ['daemon', 'oneshot']

/** 一次运行的结论。`aborted` 是人停的，`error` 是根本没起来。 */
export const VERDICTS = ['passed', 'failed', 'aborted', 'error', 'unknown']

/**
 * kind → mode。**认不出来的 kind 一律当 daemon**：不擅自宣告一个陌生任务"已经跑完"，
 * 误判成一次性会让界面在任务还跑着的时候说它结束了。
 * @type {Record<string, 'daemon' | 'oneshot'>}
 */
const MODE_BY_KIND = {
  client: 'daemon',
  server: 'daemon',
  data: 'oneshot',
  datagen: 'oneshot',
  gameTest: 'oneshot',
  gameTestServer: 'oneshot',
}

/**
 * @param {string | undefined} kind
 * @returns {'daemon' | 'oneshot'}
 */
export function modeOf(kind) {
  return MODE_BY_KIND[kind ?? ''] ?? 'daemon'
}

/** 说明"跑完了并且成功"的行。 */
const SUCCESS_LINES = [/All required tests passed/i, /BUILD SUCCESSFUL/i]

/**
 * 说明"跑完了但失败"的行。只在退出码为 0 时才靠它们——退出码非 0 本身就是失败。
 * 越具体的越靠前，因为 `summary` 取第一条命中。
 */
const FAILURE_LINES = [
  /\d+ (?:required )?tests? failed/i,
  /GameTest\b[^\n]*\bfailed\b/i,
  /\bAssertionError\b/,
  /BUILD FAILED/i,
  /A fatal error has been detected/i,
  /FAILED TO BIND TO PORT/i,
]

/** 日志里可能有 ANSI 颜色（Gradle 的 `--console=rich`）。 */
const ANSI = /\u001B\[[0-9;]*[A-Za-z]/g

/**
 * @param {string} line
 * @returns {string}
 */
function clean(line) {
  return line.replace(ANSI, '').trim().slice(0, 300)
}

/**
 * 按模式表挑出命中的行（去重、保序、限量）。
 * @param {string[]} lines
 * @param {RegExp[]} patterns
 * @param {number} limit
 * @returns {string[]}
 */
function pick(lines, patterns, limit = 8) {
  /** @type {string[]} */
  const picked = []
  for (const line of lines) {
    const text = clean(line)
    if (text === '') continue
    if (!patterns.some((pattern) => pattern.test(text))) continue
    if (picked.includes(text)) continue
    picked.push(text)
    if (picked.length >= limit) break
  }
  return picked
}

/**
 * 给一次**一次性任务**下结论。
 *
 * 判定顺序：被停 → 起不来 → 失败特征 → 非零退出码 → 成功特征 → 零退出码 → 未知。
 * 失败特征排在退出码前面，是为了抓住"测试挂了但进程仍然退了 0"这种情况
 * （部分 GameTest 运行器就是这么收场的）。
 * @param {{ exitCode?: number | null, outcome?: string | null, lines?: string[] }} input
 * @returns {{ verdict: 'passed' | 'failed' | 'aborted' | 'error' | 'unknown', summary?: string, failures?: string[] }}
 */
export function readVerdict(input) {
  const lines = input.lines ?? []
  if (input.outcome === 'killed') return { verdict: 'aborted' }
  if (input.outcome === 'failed') return { verdict: 'error', summary: '进程没能启动' }

  const failures = pick(lines, FAILURE_LINES)
  if (failures.length > 0) return { verdict: 'failed', summary: failures[0], failures }
  if (typeof input.exitCode === 'number' && input.exitCode !== 0) {
    return { verdict: 'failed', summary: `退出码 ${input.exitCode}` }
  }

  const success = pick(lines, SUCCESS_LINES, 1)
  if (success.length > 0) return { verdict: 'passed', summary: success[0] }
  if (input.exitCode === 0) return { verdict: 'passed' }
  return { verdict: 'unknown' }
}
