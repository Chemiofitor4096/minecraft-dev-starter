/**
 * 日志级别过滤。
 *
 * 过滤只作用于**有级别的行**；没有级别的行（Gradle 任务、堆栈帧、纯文本）一律保留——
 * 堆栈属于它上面那条错误，Gradle 任务行数量很少，隐藏它们只会让上下文更难读。
 *
 * @module minecraft-dev-starter/client/logFilter
 */

/** @typedef {'all'|'info'|'warn'|'error'} LevelFilter */

export const LEVEL_FILTERS = /** @type {const} */ ([
  { value: 'all', label: '全部' },
  { value: 'info', label: 'INFO+' },
  { value: 'warn', label: 'WARN+' },
  { value: 'error', label: 'ERROR' },
])

const STORAGE_KEY = 'mcdev.logLevel'

/** 过滤强度的数值序：越高越严格。 */
const RANK = { debug: 0, info: 1, warn: 2, error: 3 }

/**
 * 从高亮片段里取级别；没有级别返回 undefined。
 * @param {Array<{ kind: string }>} parts
 * @returns {'debug'|'info'|'warn'|'error'|undefined}
 */
export function levelOfParts(parts) {
  let level
  for (const part of parts) {
    if (part.kind === 'level-error' || part.kind === 'fail') level = 'error'
    else if (part.kind === 'level-warn') level = level === 'error' ? level : 'warn'
    else if (part.kind === 'level-info' || part.kind === 'ok') level = level === undefined ? 'info' : level
    else if (part.kind === 'level-debug') level = level === undefined ? 'debug' : level
  }
  return level
}

/**
 * @param {Array<Array<{ kind: string, text: string }>>} parsed
 * @param {LevelFilter} filter
 * @returns {{ lines: Array<Array<{ kind: string, text: string }>>, hidden: number }}
 */
export function filterByLevel(parsed, filter) {
  if (filter !== 'info' && filter !== 'warn' && filter !== 'error') {
    return { lines: parsed, hidden: 0 }
  }
  const min = RANK[filter]
  /** @type {Array<Array<{ kind: string, text: string }>>} */
  const lines = []
  for (const parts of parsed) {
    const level = levelOfParts(parts)
    if (level === undefined || RANK[level] >= min) lines.push(parts)
  }
  return { lines, hidden: parsed.length - lines.length }
}

/**
 * 记住过滤档位；读不出来或值不合法时回退「全部」。
 * @returns {LevelFilter}
 */
export function readLevelFilter() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw === 'info' || raw === 'warn' || raw === 'error') return raw
  } catch {
    /* 隐身模式等场景读不到 */
  }
  return 'all'
}

/**
 * @param {LevelFilter} filter
 */
export function writeLevelFilter(filter) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, filter)
  } catch {
    /* 写不进去就只在本次会话生效 */
  }
}
