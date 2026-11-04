/**
 * 工作区扫描：找出哪些目录是 MC 工程，再交给 detectProject 出画像。
 *
 * 规则（对应策划 §6.1）：
 *   - 从工作区根 BFS，深度默认 3；
 *   - 命中构建文件的目录即视为工程根，**不再往下走**（子模块由 detect 的 include 展开）；
 *   - 剪掉 build/out/bin/run/.gradle 这类产物与依赖目录——不剪会把
 *     `reference/` 里别人家的 mods.toml、`bin/` 里旧的 Eclipse 产物当成工程。
 *   - 传进来的根如果是 `.idea` 目录，退回它的父目录：从 IDE 里复制路径时很常见。
 * @module minecraft-dev-starter/lib/scanner
 */

import { readdir } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { detectProject } from './detect.js'
import { parseSettingsIncludes } from './gradle.js'
import { readIdeaProject, resolveProjectDir } from './idea.js'
import { readText } from './text.js'
import { projectKey } from './jdks.js'
import { discoverJdks } from './java.js'

/** 扫描时直接跳过的目录名。 */
export const PRUNE_DIRS = new Set([
  '.git',
  '.gradle',
  '.idea',
  '.vscode',
  '.dsh',
  'build',
  'out',
  'bin',
  'run',
  'node_modules',
  'libs',
  'reference',
  'logs',
])

/** 构建脚本名；命中任一即认为这是一个 Gradle 工程。 */
const BUILD_FILES = new Set(['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'])

/**
 * @typedef {object} ScanResult
 * @property {string} root
 * @property {Array<Record<string, unknown>>} projects
 * @property {number} scannedDirs
 * @property {boolean} truncated
 */

/**
 * 扫一个工作区。
 * @param {string} root
 * @param {{ depth?: number, maxDirs?: number, maxProjects?: number, jdks?: import('./java.js').JdkInfo[], overrides?: Record<string, string>, signal?: AbortSignal }} [options]
 * @returns {Promise<ScanResult>}
 */
export async function scanWorkspace(root, options = {}) {
  // 从 IDE 里复制出来的路径常常是 `…\.idea`，这里直接退回工程根
  const startRoot = resolveProjectDir(root)
  const depth = options.depth ?? 3
  const maxDirs = options.maxDirs ?? 2000
  const maxProjects = options.maxProjects ?? 120
  const jdks = options.jdks ?? (await discoverJdks())

  /** @type {Array<{ dir: string, depth: number }>} */
  const queue = [{ dir: startRoot, depth: 0 }]
  /** @type {string[]} */
  const candidates = []
  let scannedDirs = 0
  let truncated = false

  while (queue.length > 0) {
    if (options.signal?.aborted === true) break
    const item = queue.shift()
    if (item === undefined) break
    scannedDirs += 1
    if (scannedDirs > maxDirs) {
      truncated = true
      break
    }
    if (candidates.length >= maxProjects) {
      truncated = true
      break
    }

    const entries = await safeReaddir(item.dir)
    if (entries === undefined) continue

    if (entries.files.some((name) => BUILD_FILES.has(name))) {
      if (candidates.length >= maxProjects) {
        truncated = true
        continue
      }
      // 聚合工程：子模块各自成工程，聚合根不单列（它的目标与子工程重复）
      const subs = await subprojectDirs(item.dir)
      if (subs.length === 0) candidates.push(item.dir)
      for (const sub of subs) {
        if (candidates.length >= maxProjects) {
          truncated = true
          break
        }
        if (!candidates.includes(sub)) candidates.push(sub)
      }
      continue
    }

    if (item.depth >= depth) continue
    for (const child of entries.dirs) {
      if (PRUNE_DIRS.has(child)) continue
      queue.push({ dir: join(item.dir, child), depth: item.depth + 1 })
    }
  }

  // 工作区根是不是工程，上面的循环已经判过了（它就是队列里的第一项）——
  // 这里只兜底"根目录有构建脚本、但那一轮 readdir 失败过"的情况。
  if (candidates.length === 0) {
    const rootEntries = await safeReaddir(startRoot)
    if (rootEntries !== undefined && rootEntries.files.some((name) => BUILD_FILES.has(name))) {
      candidates.push(startRoot)
    }
  }

  /** @type {Array<Record<string, unknown>>} */
  const projects = []
  for (const dir of candidates) {
    if (options.signal?.aborted === true) break
    try {
      projects.push(await detectProject(dir, { jdks, overrideJavaHome: options.overrides?.[projectKey(dir)] }))
    } catch (error) {
      projects.push({ root: dir, loader: 'unknown', error: error instanceof Error ? error.message : String(error) })
    }
  }

  // 子模块各自成工程后，聚合根不再单列：它的目标与子工程重复
  /** @param {string} value */
  const norm = (value) => String(value).replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
  const childOwners = new Set(
    projects
      .map((project) => /** @type {string | undefined} */ (project.parentRoot))
      .filter((value) => typeof value === 'string')
      .map((value) => norm(String(value))),
  )
  const kept = projects.filter((project) => !childOwners.has(norm(String(project.root))))

  return { root: startRoot, projects: kept, scannedDirs, truncated }
}

/**
 * 聚合工程的子工程目录。
 *
 * 模块清单的主来源是 `settings.gradle` 的 include——没有 IDE 的工程同样要能拆开；
 * `.idea` 的 Gradle 模块清单兜底（它比 include 多出"同步过但没写进 settings"的模块）。
 * @param {string} root
 * @returns {Promise<string[]>}
 */
async function subprojectDirs(root) {
  /** @type {string[]} */
  const declared = []
  for (const name of ['settings.gradle.kts', 'settings.gradle']) {
    const text = await readText(join(root, name))
    if (text === undefined) continue
    declared.push(...parseSettingsIncludes(text))
    break
  }
  const idea = await readIdeaProject(root)
  if (idea !== undefined) declared.push(...idea.gradleModules)

  /** @type {string[]} */
  const dirs = []
  for (const modulePath of declared) {
    const normalized = normalizeModulePath(modulePath)
    if (normalized === '') continue
    const dir = join(root, normalized)
    // include 里写 `../shared` 时不能跑出工作区
    const rel = relative(root, dir)
    if (rel.startsWith('..') || isAbsolute(rel)) continue
    const sub = await safeReaddir(dir)
    if (sub === undefined) continue
    if (!sub.files.some((name) => BUILD_FILES.has(name))) continue
    if (!dirs.includes(dir)) dirs.push(dir)
  }
  return dirs
}

/**
 * `modules:core`（settings.gradle 的写法）与 `modules/core`（IDE 的写法）统一成相对路径。
 * @param {string} path
 * @returns {string}
 */
function normalizeModulePath(path) {
  const normalized = String(path ?? '')
    .trim()
    .replace(/^:+/, '')
    .replace(/[:\\]+/g, '/')
    .replace(/\/+$/, '')
  return normalized === '.' ? '' : normalized
}

/**
 * @param {string} dir
 * @returns {Promise<{ files: string[], dirs: string[] } | undefined>}
 */
async function safeReaddir(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const files = []
    const dirs = []
    for (const entry of entries) {
      if (entry.isDirectory()) dirs.push(entry.name)
      else if (entry.isFile()) files.push(entry.name)
    }
    return { files, dirs }
  } catch {
    return undefined
  }
}
