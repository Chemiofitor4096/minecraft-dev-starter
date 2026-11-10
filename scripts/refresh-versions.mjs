#!/usr/bin/env node
/**
 * 刷新 `data/versions.json` 里每个单元的上游最新版本。
 *
 * 只刷新**已有单元内部的版本号**，绝不新增版本线：哪些 MC 版本值得支持是人的判断
 * （模组生态集中在 1.20.1 / 1.21.1 这类热门线上，而不是"上游刚发了什么"）。
 *
 * 用法：
 *   node scripts/refresh-versions.mjs            # 只比较，打印差异
 *   node scripts/refresh-versions.mjs --write    # 把上游值写进 latest（不动 pinned / status）
 *   node scripts/refresh-versions.mjs --json     # 机器可读输出
 *   node scripts/refresh-versions.mjs --fail-on-drift   # 有差异时退出码 1（给 CI 用）
 *
 * `pinned` 是生成器实际使用的组合，`status` 是"这个组合被验证到什么程度"：
 *   supported = 上游存在、我们没跑过；verified = 我们真的生成并跑通过。
 * 这两样都只能由人（或跑通后的工具）改动，脚本只负责提醒"上游变了"。
 *
 * @module scripts/refresh-versions
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MATRIX = join(HERE, '..', 'data', 'versions.json')

/** Maven 仓库根地址。 */
export const REPOS = {
  fabric: 'https://maven.fabricmc.net/',
  neoforged: 'https://maven.neoforged.net/releases/',
}

/** `group:artifact` → maven-metadata.xml 的地址。 */
export function metadataUrl(repo, coord) {
  const base = REPOS[repo]
  if (base === undefined) throw new Error(`unknown maven repo: ${repo}`)
  const parts = String(coord).split(':')
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') throw new Error(`bad coordinate: ${coord}`)
  const [group, artifact] = parts
  return `${base}${group.replaceAll('.', '/')}/${artifact}/maven-metadata.xml`
}

/**
 * 解析 maven-metadata.xml 里我们关心的部分。
 * @param {string} xml
 * @returns {{ latest: string | undefined, release: string | undefined, versions: string[] }}
 */
export function parseMavenMetadata(xml) {
  const versions = [...String(xml).matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1])
  const tag = (name) => {
    const match = new RegExp(`<${name}>([^<]+)</${name}>`).exec(String(xml))
    return match === null ? undefined : match[1]
  }
  return { latest: tag('latest'), release: tag('release'), versions }
}

/**
 * 版本号比较：数字段按数值，非数字段按字典序，数字段比字母段"新"
 * （这样 `1.19.4` > `1.20.0-alpha.24` 只在过滤 alpha 后才成立，所以过滤是必须的）。
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareVersions(a, b) {
  const left = tokenize(a)
  const right = tokenize(b)
  const size = Math.max(left.length, right.length)
  for (let i = 0; i < size; i += 1) {
    const x = left[i]
    const y = right[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y
      continue
    }
    if (typeof x === 'number') return 1
    if (typeof y === 'number') return -1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * @param {string} value
 * @returns {Array<string | number>}
 */
function tokenize(value) {
  return String(value)
    .split(/[.+\-_]/)
    .filter((part) => part !== '')
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()))
}

/**
 * 从版本列表里挑出"这条线最新的一条"。
 * @param {string[]} versions
 * @param {{ filter?: string, channel?: 'release' | 'latest' }} [options]
 * @returns {string | undefined}
 */
export function pickVersion(versions, options = {}) {
  let pool = [...versions]
  if (options.filter !== undefined) {
    const pattern = new RegExp(options.filter)
    pool = pool.filter((version) => pattern.test(version))
  }
  if (options.channel === 'release') {
    pool = pool.filter((version) => !/(alpha|beta|rc|snapshot|pre)/i.test(version))
  }
  pool.sort(compareVersions)
  return pool.at(-1)
}

/**
 * 从版本列表里挑出这条线最新的一个：先按字面量/正则过滤，再比大小。
 * @param {string[]} versions
 * @param {{ contains?: string, suffix?: string, filter?: string, channel?: 'release' | 'latest' }} source
 * @returns {string | undefined}
 */
export function selectVersion(versions, source) {
  let pool = [...versions]
  // contains / suffix 都是字面量（`+1.21.8` 这种后缀），filter 才是正则——避免让人去转义 `+`。
  // 用 suffix 而不是 contains：`+1.21.1` 会误伤 `+1.21.11`，这是实际踩过的坑。
  if (typeof source.contains === 'string') {
    pool = pool.filter((version) => version.includes(source.contains))
  }
  if (typeof source.suffix === 'string') {
    pool = pool.filter((version) => version.endsWith(source.suffix))
  }
  return pickVersion(pool, { filter: source.filter, channel: source.channel })
}

/**
 * 把一个单元的上游值和 pinned 对照，返回逐字段差异。
 * @param {{ pinned: Record<string, string>, latest?: Record<string, string> }} cell
 * @param {Record<string, string>} latest
 * @returns {Array<{ field: string, pinned: string | undefined, latest: string | undefined, drift: boolean }>}
 */
export function diffCell(cell, latest) {
  /** @type {Array<{ field: string, pinned: string | undefined, latest: string | undefined, drift: boolean }>} */
  const rows = []
  const fields = new Set([...Object.keys(cell.pinned ?? {}), ...Object.keys(latest)])
  for (const field of [...fields].sort()) {
    const pinned = cell.pinned?.[field]
    const fresh = latest[field]
    rows.push({ field, pinned, latest: fresh, drift: pinned !== fresh })
  }
  return rows
}

/**
 * 抓文本，失败抛带上下文的错误。
 * @param {string} url
 * @param {typeof fetch} [fetcher]
 * @returns {Promise<string>}
 */
async function fetchText(url, fetcher = fetch) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return await response.text()
}

/**
 * @param {typeof fetch} [fetcher]
 * @returns {Promise<Record<string, string>>}
 */
async function fabricMeta(mc, fetcher = fetch) {
  const [loaderRaw, yarnRaw] = await Promise.all([
    fetchText(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`, fetcher),
    fetchText(`https://meta.fabricmc.net/v2/versions/yarn/${encodeURIComponent(mc)}`, fetcher),
  ])
  const loader = JSON.parse(loaderRaw)
  const yarn = JSON.parse(yarnRaw)
  /** @type {Record<string, string>} */
  const out = {}
  const loaderVersion = loader?.[0]?.loader?.version
  if (typeof loaderVersion === 'string') out.loaderVersion = loaderVersion
  const yarnVersion = yarn?.[0]?.version
  if (typeof yarnVersion === 'string') out.yarn = yarnVersion
  return out
}

/**
 * @param {{ kind: string, mc?: string, repo?: string, coord?: string, field?: string, filter?: string, channel?: string }} source
 * @param {Map<string, string[]>} cache
 * @param {typeof fetch} fetcher
 * @returns {Promise<Record<string, string>>}
 */
async function resolveSource(source, cache, fetcher) {
  if (source.kind === 'fabric-meta') {
    if (typeof source.mc !== 'string') throw new Error('fabric-meta source needs mc')
    return await fabricMeta(source.mc, fetcher)
  }
  if (source.kind === 'maven') {
    const url = metadataUrl(source.repo, source.coord)
    if (!cache.has(url)) {
      const { versions } = parseMavenMetadata(await fetchText(url, fetcher))
      cache.set(url, versions)
    }
    let versions = cache.get(url) ?? []
    const picked = selectVersion(versions, /** @type {any} */ (source))
    if (picked === undefined) {
      throw new Error(`no version matched ${source.coord} ${source.suffix ?? source.contains ?? source.filter ?? '-'}`)
    }
    if (typeof source.field !== 'string') throw new Error('maven source needs field')
    return { [source.field]: picked }
  }
  throw new Error(`unknown source kind: ${source.kind}`)
}

/**
 * 刷新一个单元。
 * @param {any} cell
 * @param {Map<string, string[]>} cache
 * @param {typeof fetch} fetcher
 * @returns {Promise<Record<string, string>>}
 */
export async function resolveCell(cell, cache = new Map(), fetcher = fetch) {
  /** @type {Record<string, string>} */
  let out = {}
  for (const source of cell.sources ?? []) {
    out = { ...out, ...(await resolveSource(source, cache, fetcher)) }
  }
  return out
}

/**
 * @param {Array<{ id: string, rows: Array<{ field: string, pinned?: string, latest?: string, drift: boolean }> }>} report
 */
function printReport(report) {
  const widthId = Math.max(4, ...report.map((entry) => entry.id.length))
  const widthField = Math.max(5, ...report.flatMap((entry) => entry.rows.map((row) => row.field.length)))
  let drift = 0
  for (const entry of report) {
    for (const row of entry.rows) {
      const mark = row.drift ? 'CHANGED' : 'ok'
      if (row.drift) drift += 1
      console.log(
        `${entry.id.padEnd(widthId)}  ${row.field.padEnd(widthField)}  ${String(row.pinned ?? '-').padEnd(22)}  ${String(row.latest ?? '-').padEnd(22)}  ${mark}`,
      )
    }
  }
  console.log(`\n${report.length} 个单元，${drift} 处上游变化`)
}

/**
 * @param {string[]} [argv]
 */
async function main(argv = process.argv.slice(2)) {
  const write = argv.includes('--write')
  const asJson = argv.includes('--json')
  const failOnDrift = argv.includes('--fail-on-drift')

  const matrix = JSON.parse(await readFile(MATRIX, 'utf8'))
  /** @type {Map<string, string[]>} */
  const cache = new Map()
  /** @type {Array<{ id: string, rows: Array<{ field: string, pinned?: string, latest?: string, drift: boolean }> }>} */
  const report = []
  /** @type {string[]} */
  const failures = []

  for (const cell of matrix.cells ?? []) {
    try {
      const latest = await resolveCell(cell, cache)
      report.push({ id: cell.id, rows: diffCell(cell, latest) })
      if (write) {
        cell.latest = { fetchedAt: new Date().toISOString().slice(0, 10), ...latest }
      }
    } catch (error) {
      failures.push(`${cell.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ report, failures }, null, 2))
  } else {
    printReport(report)
    for (const failure of failures) console.error(`failed  ${failure}`)
  }

  if (write) {
    matrix.updatedAt = new Date().toISOString().slice(0, 10)
    await writeFile(MATRIX, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8')
    if (!asJson) console.log(`written ${MATRIX}`)
  }

  const drift = report.some((entry) => entry.rows.some((row) => row.drift))
  if (failures.length > 0) process.exitCode = 1
  else if (failOnDrift && drift) process.exitCode = 1
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  await main()
}
