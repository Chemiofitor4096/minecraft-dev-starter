/**
 * 读模组/插件元数据文件并解析成统一形状。
 *
 * 查找路径覆盖三种真实形态（本机 17 个工程实测）：
 *   - `src/main/resources/...`（最常见）
 *   - `src/main/templates/...`（NeoForge 的 processResources 模板，占位符还没展开）
 *   - 子模块里各自一套（Architectury）
 *
 * @module minecraft-dev-starter/lib/metadata
 */

import { join } from 'node:path'
import { parseToml } from '../util/toml.js'
import { readText } from '../util/text.js'

/**
 * @typedef {object} MetadataHit
 * @property {'fabric' | 'forge' | 'neoforge' | 'mcmod' | 'bukkit' | 'paper'} kind
 * @property {string} file            相对于模块目录的路径
 * @property {Record<string, unknown>} data
 */

const LOCATIONS = [
  ['fabric', 'src/main/resources/fabric.mod.json'],
  ['fabric', 'src/main/templates/fabric.mod.json'],
  ['neoforge', 'src/main/resources/META-INF/neoforge.mods.toml'],
  ['neoforge', 'src/main/templates/META-INF/neoforge.mods.toml'],
  ['forge', 'src/main/resources/META-INF/mods.toml'],
  ['forge', 'src/main/templates/META-INF/mods.toml'],
  ['mcmod', 'src/main/resources/mcmod.info'],
  ['mcmod', 'src/main/templates/mcmod.info'],
  ['paper', 'src/main/resources/paper-plugin.yml'],
  ['paper', 'src/main/templates/paper-plugin.yml'],
  ['bukkit', 'src/main/resources/plugin.yml'],
  ['bukkit', 'src/main/templates/plugin.yml'],
]

/**
 * 扫一个模块目录下所有元数据文件。
 * @param {string} moduleDir
 * @returns {Promise<MetadataHit[]>}
 */
export async function locateMetadata(moduleDir) {
  /** @type {MetadataHit[]} */
  const hits = []
  for (const [kind, rel] of LOCATIONS) {
    const text = await readText(join(moduleDir, rel))
    if (text === undefined) continue
    const data = parseMetadataText(kind, text)
    if (data !== undefined) hits.push({ kind, file: rel, data })
  }
  return hits
}

/**
 * @param {MetadataHit['kind']} kind
 * @param {string} text
 * @returns {Record<string, unknown> | undefined}
 */
function parseMetadataText(kind, text) {
  try {
    if (kind === 'fabric' || kind === 'mcmod') {
      const parsed = JSON.parse(text)
      if (kind === 'mcmod' && Array.isArray(parsed)) {
        return /** @type {Record<string, unknown>} */ (parsed[0] ?? {})
      }
      return /** @type {Record<string, unknown>} */ (parsed)
    }
    if (kind === 'forge' || kind === 'neoforge') return parseModsToml(text)
    return parseYamlSubset(text)
  } catch {
    return undefined
  }
}

/**
 * `mods.toml` / `neoforge.mods.toml`。
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseModsToml(text) {
  const root = parseToml(text)
  const mods = Array.isArray(root.mods) ? root.mods : []
  const first = /** @type {Record<string, unknown>} */ (mods[0] ?? {})
  /** @type {Array<{ modId?: string, versionRange?: string }>} */
  const dependencies = []
  const deps = root.dependencies
  if (deps !== null && typeof deps === 'object' && !Array.isArray(deps)) {
    for (const value of Object.values(/** @type {Record<string, unknown>} */ (deps))) {
      if (Array.isArray(value)) {
        for (const dep of value) {
          if (dep !== null && typeof dep === 'object') {
            dependencies.push(/** @type {{ modId?: string, versionRange?: string }} */ (dep))
          }
        }
      }
    }
  }
  return {
    modLoader: root.modLoader,
    loaderVersion: root.loaderVersion,
    license: root.license,
    modId: first.modId,
    version: first.version,
    displayName: first.displayName,
    description: first.description,
    dependencies,
  }
}

/**
 * 极简 YAML：只取顶层 `key: value`，够读 plugin.yml。
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseYamlSubset(text) {
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s/.test(raw)) continue // 嵌套结构不关心
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()
    if (value.startsWith("'") || value.startsWith('"')) value = value.slice(1, -1)
    value = value.replace(/\s+#.*$/, '')
    out[key] = value
  }
  return out
}

/**
 * 从一组命中里挑能代表工程的元数据（优先级：neoforge > forge > fabric > mcmod > paper > bukkit）。
 * @param {MetadataHit[]} hits
 * @returns {MetadataHit | undefined}
 */
export function primaryMetadata(hits) {
  const order = ['neoforge', 'forge', 'fabric', 'mcmod', 'paper', 'bukkit']
  for (const kind of order) {
    const hit = hits.find((entry) => entry.kind === kind)
    if (hit) return hit
  }
  return undefined
}

/**
 * 把元数据里的 `depends` / `dependencies` 拉平成 `modId → 版本范围`。
 * @param {MetadataHit | undefined} hit
 * @returns {Record<string, string>}
 */
export function dependencyRanges(hit) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!hit) return out
  const data = hit.data
  const depends = data.depends
  if (depends !== null && typeof depends === 'object' && !Array.isArray(depends)) {
    for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (depends))) {
      out[key] = typeof value === 'string' ? value : String(value)
    }
  }
  const deps = data.dependencies
  if (Array.isArray(deps)) {
    for (const dep of deps) {
      if (dep === null || typeof dep !== 'object') continue
      const record = /** @type {{ modId?: unknown, versionRange?: unknown }} */ (dep)
      if (typeof record.modId === 'string' && typeof record.versionRange === 'string') {
        out[record.modId] = record.versionRange
      }
    }
  }
  return out
}
