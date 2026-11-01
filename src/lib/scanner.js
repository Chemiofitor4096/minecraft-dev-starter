/**
 * 工作区扫描：找出哪些目录是 MC 工程，再交给 detectProject 出画像。
 *
 * 规则（对应策划 §6.1）：
 *   - 从工作区根 BFS，深度默认 3；
 *   - 命中构建文件的目录即视为工程根，**不再往下走**（子模块由 detect 的 include 展开）；
 *   - 剪掉 build/out/bin/run/.gradle 这类产物与依赖目录——不剪会把
 *     `reference/` 里别人家的 mods.toml、`bin/` 里旧的 Eclipse 产物当成工程。
 * @module minecraft-dev-starter/lib/scanner
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { detectProject } from './detect.js'
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
  const depth = options.depth ?? 3
  const maxDirs = options.maxDirs ?? 2000
  const maxProjects = options.maxProjects ?? 120
  const jdks = options.jdks ?? (await discoverJdks())

  /** @type {Array<{ dir: string, depth: number }>} */
  const queue = [{ dir: root, depth: 0 }]
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

    if (item.depth > 0 && entries.files.some((name) => BUILD_FILES.has(name))) {
      candidates.push(item.dir)
      continue // 工程内部不再展开，模块交给 detect
    }

    if (item.depth >= depth) continue
    for (const child of entries.dirs) {
      if (PRUNE_DIRS.has(child)) continue
      queue.push({ dir: join(item.dir, child), depth: item.depth + 1 })
    }
  }

  // 工作区根本身就是一个工程的情况
  const rootEntries = await safeReaddir(root)
  if (rootEntries !== undefined && !candidates.includes(root)) {
    const isProject = rootEntries.files.some((name) => BUILD_FILES.has(name))
    if (isProject) candidates.unshift(root)
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

  return { root, projects, scannedDirs, truncated }
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
