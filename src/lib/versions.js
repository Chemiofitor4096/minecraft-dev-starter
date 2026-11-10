/**
 * 版本解析：把 `(loader, MC 版本)` 解析成一组可以直接写进工程的精确版本。
 *
 * 设计前提：**版本号不是我们维护的表**。模组生态集中在几条热门线上，等我们去盯上游
 * 只会让表越来越旧；正确做法是调用时向上游问一次（Fabric meta / NeoForge maven），
 * 拿不到才退回 `data/versions.json` 里的 seed。
 *
 * 这里只做"取哪几个数"的判断，不生成任何文件；模板和生成器在未来消费它的返回值。
 *
 * @module minecraft-dev-starter/lib/versions
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Maven 仓库根地址。 */
const REPOS = {
  fabric: 'https://maven.fabricmc.net/',
  neoforged: 'https://maven.neoforged.net/releases/',
}

/** 上游抓取的缓存时间：同一会话里连续生成不用重复抓。 */
const CACHE_TTL_MS = 5 * 60 * 1000

/** 模块级缓存：url → { at, text }。测试传自己的 cache 绕开它。 */
const defaultCache = new Map()

/**
 * 某个 MC 版本对应的 Java 大版本。
 *
 * 规则来自上游模板的 toolchain，而不是猜：1.20.x 是 17，1.21.x 是 21。
 * 26.x 是新的版本号方案，这里按 25 处理并标注未验证——真跑通后会改成已验证。
 * @param {string} mcVersion
 * @returns {number}
 */
export function javaForMc(mcVersion) {
  const match = /^(\d+)\.(\d+)/.exec(String(mcVersion))
  if (match === null) return 21
  const major = Number(match[1])
  const minor = Number(match[2])
  if (major === 1) return minor <= 20 ? 17 : 21
  return 25
}

/**
 * NeoForge 的坐标随版本线变化：1.20.1 是 legacyforge（`net.neoforged:forge`），
 * 1.21+ 才改回 `net.neoforged:neoforge`，而且版本号前缀是 `21.1.` 而不是 `1.21.1`。
 * @param {string} mcVersion
 * @returns {{ coord: string, prefix: string } | undefined}
 */
export function neoforgeLine(mcVersion) {
  const match = /^1\.(\d+)\.(\d+)$/.exec(String(mcVersion))
  if (match === null) return undefined
  const major = Number(match[1])
  const minor = Number(match[2])
  if (major === 20 && minor <= 1) return { coord: 'net.neoforged:forge', prefix: `${mcVersion}-` }
  return { coord: 'net.neoforged:neoforge', prefix: `${major}.${minor}.` }
}

/**
 * 解析 maven-metadata.xml。
 * @param {string} xml
 * @returns {{ latest?: string, release?: string, versions: string[] }}
 */
export function parseMavenMetadata(xml) {
  const versions = [...String(xml).matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1])
  const tag = (name) => {
    const match = new RegExp(`<${name}>([^<]+)</${name}>`).exec(String(xml))
    return match === undefined || match === null ? undefined : match[1]
  }
  return { latest: tag('latest'), release: tag('release'), versions }
}

/**
 * 版本比较：数字段按数值，字母段比数字段旧（所以 `1.19.4` < `1.20.0-alpha`）。
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
 * 在版本列表里挑这条线最新的一个。
 *
 * `prefix` 是字面量前缀（NeoForge 的 `21.1.`），`suffix` 是字面量后缀（Fabric API 的 `+1.21.1`）。
 * 必须用精确的前后缀而不是 contains：`+1.21.1` 会误伤 `+1.21.11`，这是实际踩过的坑。
 * @param {string[]} versions
 * @param {{ prefix?: string, suffix?: string, releaseOnly?: boolean }} [options]
 * @returns {string | undefined}
 */
export function pickVersion(versions, options = {}) {
  let pool = [...versions]
  if (typeof options.prefix === 'string') pool = pool.filter((version) => version.startsWith(options.prefix))
  if (typeof options.suffix === 'string') pool = pool.filter((version) => version.endsWith(options.suffix))
  if (options.releaseOnly === true) pool = pool.filter((version) => !/(alpha|beta|rc|snapshot|pre)/i.test(version))
  pool.sort(compareVersions)
  return pool.at(-1)
}

/**
 * 抓文本（带缓存），失败抛错由调用方决定是否退回 seed。
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, cache?: Map<string, { at: number, text: string }> }} options
 * @returns {Promise<string>}
 */
async function fetchText(url, options) {
  const cache = options.cache ?? defaultCache
  const hit = cache.get(url)
  if (hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS) return hit.text
  const fetcher = options.fetchImpl ?? fetch
  const response = await fetcher(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  const text = await response.text()
  cache.set(url, { at: Date.now(), text })
  return text
}

/**
 * @param {string} repo
 * @param {string} coord `group:artifact`
 * @returns {string}
 */
export function metadataUrl(repo, coord) {
  const base = REPOS[repo]
  if (base === undefined) throw new Error(`unknown maven repo: ${repo}`)
  const parts = String(coord).split(':')
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') throw new Error(`bad coordinate: ${coord}`)
  return `${base}${parts[0].replaceAll('.', '/')}/${parts[1]}/maven-metadata.xml`
}

/**
 * @param {string} url
 * @param {string} field
 * @param {{ prefix?: string, suffix?: string, releaseOnly?: boolean }} options
 * @param {{ fetchImpl?: typeof fetch, cache?: Map<string, any> }} context
 * @returns {Promise<string>}
 */
async function mavenField(url, field, options, context) {
  const xml = await fetchText(url, context)
  const picked = pickVersion(parseMavenMetadata(xml).versions, options)
  if (picked === undefined) throw new Error(`no version matched ${field} (${url})`)
  return picked
}

/**
 * 从上游解析一组版本。
 * @param {{ loader: string, mcVersion: string, fetchImpl?: typeof fetch, cache?: Map<string, any> }} request
 * @returns {Promise<{ loader: string, mcVersion: string, java: number, versions: Record<string, string>, source: 'upstream' }>}
 */
async function resolveUpstream(request) {
  const loader = String(request.loader)
  const mcVersion = String(request.mcVersion)
  const context = { fetchImpl: request.fetchImpl, cache: request.cache }
  const java = javaForMc(mcVersion)

  if (loader === 'fabric') {
    const [loaderRaw, yarnRaw, loom, api] = await Promise.all([
      fetchText(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`, context),
      fetchText(`https://meta.fabricmc.net/v2/versions/yarn/${encodeURIComponent(mcVersion)}`, context),
      mavenField(metadataUrl('fabric', 'net.fabricmc:fabric-loom'), 'loom', { releaseOnly: true }, context),
      mavenField(metadataUrl('fabric', 'net.fabricmc.fabric-api:fabric-api'), 'api', { suffix: `+${mcVersion}` }, context),
    ])
    const loaderVersion = JSON.parse(loaderRaw)?.[0]?.loader?.version
    const yarn = JSON.parse(yarnRaw)?.[0]?.version
    if (typeof loaderVersion !== 'string' || typeof yarn !== 'string') throw new Error('fabric meta: unexpected shape')
    return { loader, mcVersion, java, versions: { loaderVersion, yarn, loom, api }, source: 'upstream' }
  }

  if (loader === 'neoforge') {
    const line = neoforgeLine(mcVersion)
    if (line === undefined) throw new Error(`unsupported Minecraft version for NeoForge: ${mcVersion}`)
    const [neoforge, gradlePlugin] = await Promise.all([
      mavenField(metadataUrl('neoforged', line.coord), 'neoforge', { prefix: line.prefix }, context),
      mavenField(metadataUrl('neoforged', 'net.neoforged.gradle:userdev'), 'gradlePlugin', {}, context),
    ])
    return { loader, mcVersion, java, versions: { neoforge, gradlePlugin }, source: 'upstream' }
  }

  throw new Error(`unknown loader: ${loader}`)
}

/**
 * 读 seed / verified。
 * @returns {Promise<{ seed: Array<Record<string, any>>, verified: Array<Record<string, any>> }>}
 */
export async function loadVersionsData() {
  const text = await readFile(join(ROOT, 'data', 'versions.json'), 'utf8')
  const data = JSON.parse(text)
  return { seed: data.seed ?? [], verified: data.verified ?? [] }
}

/**
 * 解析 (loader, MC 版本)。上游失败时退回 seed；seed 也没有就抛错。
 * @param {{ loader: string, mcVersion: string, fetchImpl?: typeof fetch, cache?: Map<string, any>, seed?: Array<Record<string, any>> }} request
 * @returns {Promise<{ loader: string, mcVersion: string, java: number, versions: Record<string, string>, source: 'upstream' | 'seed', reason?: string }>}
 */
export async function resolveVersions(request) {
  const seed = request.seed ?? (await loadVersionsData()).seed
  try {
    return await resolveUpstream(request)
  } catch (error) {
    const fallback = seed.find((entry) => entry.loader === request.loader && entry.mcVersion === request.mcVersion)
    if (fallback === undefined) throw error
    return {
      loader: String(request.loader),
      mcVersion: String(request.mcVersion),
      java: javaForMc(request.mcVersion),
      versions: { ...fallback.versions },
      source: 'seed',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
