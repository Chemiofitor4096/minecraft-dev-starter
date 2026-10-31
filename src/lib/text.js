/**
 * 文本小工具：读文件、解析 .properties、解析 ${...} 占位符。
 * 识别引擎的每个规则都靠这几样东西，单独放一处方便测试。
 * @module minecraft-dev-starter/lib/text
 */

import { readFile } from 'node:fs/promises'

/**
 * 读文本文件；不存在、没权限、是目录都返回 undefined（识别过程不该因为个别文件中断）。
 * @param {string} path
 * @returns {Promise<string | undefined>}
 */
export async function readText(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * 解析 Java 风格的 .properties（`key=value`，`#`/`!` 注释）。
 * 不处理续行与转义——Gradle 工程里几乎用不到。
 * @param {string | undefined} text
 * @returns {Record<string, string>}
 */
export function parseProperties(text) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!text) return out
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#') || line.startsWith('!')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (key === '') continue
    out[key] = line.slice(eq + 1).trim()
  }
  return out
}

const PLACEHOLDER = /\$\{([^}]+)\}/g

/**
 * 把 `${key}` 替换成属性表里的值，替换不掉的保留原文并记下来。
 * 元数据文件（fabric.mod.json / mods.toml）普遍写占位符，不解析就只能拿到字面量。
 * @param {string | undefined} value
 * @param {Record<string, string>} properties
 * @returns {{ value: string | undefined, unresolved: string[] }}
 */
export function resolvePlaceholders(value, properties) {
  if (typeof value !== 'string' || !value.includes('${')) {
    return { value, unresolved: [] }
  }
  /** @type {string[]} */
  const unresolved = []
  const resolved = value.replace(PLACEHOLDER, (match, rawName) => {
    const key = String(rawName).trim()
    if (Object.hasOwn(properties, key) && properties[key] !== '') return String(properties[key])
    unresolved.push(key)
    return match
  })
  return { value: resolved, unresolved }
}

/**
 * 取第一个命中的捕获组。
 * @param {string | undefined} text
 * @param {RegExp} pattern
 * @returns {string | undefined}
 */
export function firstMatch(text, pattern) {
  if (!text) return undefined
  const match = pattern.exec(text)
  return match?.[1]
}

/**
 * 逐条尝试一组正则，返回第一个命中。
 * @param {string | undefined} text
 * @param {RegExp[]} patterns
 * @returns {string | undefined}
 */
export function firstMatchOf(text, patterns) {
  for (const pattern of patterns) {
    const hit = firstMatch(text, pattern)
    if (hit !== undefined) return hit
  }
  return undefined
}
