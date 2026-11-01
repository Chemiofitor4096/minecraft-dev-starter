/**
 * JDK 需求推导与探测。
 *
 * 只读文件系统，不启动 `java -version`：识别面板要在打开瞬间出结果，
 * 起进程既慢又会被 PATH 上的无关 JDK 带偏。版本从 JDK 目录里的 `release` 文件读。
 * @module minecraft-dev-starter/lib/java
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readText } from './text.js'

/**
 * 目标 MC 版本需要的 JDK 大版本。
 * 1.7.10/1.12.2/1.16.5 → 8；1.17 → 16；1.18–1.20.4 → 17；1.20.5+/1.21+ → 21；26.x → 25。
 * @param {string | undefined} mcVersion
 * @returns {number | undefined}
 */
export function requiredJava(mcVersion) {
  if (mcVersion === undefined) return undefined
  const parts = mcVersion.split('.').map((part) => Number(part))
  if (parts.some((part) => Number.isNaN(part))) return undefined
  const [major, minor = 0, patch = 0] = parts
  if (major >= 26) return 25
  if (major !== 1) return undefined
  if (minor >= 21) return 21
  if (minor === 20) return patch >= 5 ? 21 : 17
  if (minor >= 18) return 17
  if (minor === 17) return 16
  return 8
}

/**
 * Gradle 从哪个版本开始支持某个 JDK 大版本。
 * 只列已知边界；不在表里的按 0 处理。
 * @type {Record<number, string>}
 */
const GRADLE_JDK_FLOOR = {
  25: '9.0',
  24: '8.14',
  23: '8.10',
  22: '8.8',
  21: '8.5',
  20: '8.3',
  19: '7.6',
  17: '7.3',
  16: '7.0',
}

/**
 * 判断 wrapper 的 Gradle 能不能跑这个 JDK。
 * @param {string | undefined} gradleVersion
 * @param {number | undefined} javaMajor
 * @returns {{ ok: boolean, reason?: string }}
 */
export function gradleSupportsJava(gradleVersion, javaMajor) {
  if (gradleVersion === undefined || javaMajor === undefined) return { ok: true }
  const floor = GRADLE_JDK_FLOOR[javaMajor]
  if (floor === undefined) return { ok: true }
  if (compareVersions(gradleVersion, floor) >= 0) return { ok: true }
  return {
    ok: false,
    reason: `wrapper 是 Gradle ${gradleVersion}，JDK ${javaMajor} 需要 Gradle ${floor} 以上`,
  }
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareVersions(a, b) {
  const left = a.split('.').map((part) => Number(part) || 0)
  const right = b.split('.').map((part) => Number(part) || 0)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * @typedef {object} JdkInfo
 * @property {string} home      JDK 根目录
 * @property {string} version   完整版本号，如 21.0.7
 * @property {number} major     大版本，如 21
 * @property {string} source    从哪找到的：env / dir:xxx
 */

/** 常见的 JDK 安装根目录（Windows 为主，其他平台给几个通用位置）。 */
function jdkRoots(env = process.env, platform = process.platform) {
  /** @type {string[]} */
  const roots = []
  if (env.JAVA_HOME) roots.push(env.JAVA_HOME)
  if (env.MC_DEV_STARTER_JDKS) {
    for (const entry of env.MC_DEV_STARTER_JDKS.split(';')) {
      if (entry.trim() !== '') roots.push(entry.trim())
    }
  }
  if (platform === 'win32') {
    roots.push(
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files\\Zulu',
      'C:\\Program Files\\Amazon Corretto',
      'C:\\Program Files (x86)\\Java',
    )
  } else {
    roots.push('/usr/lib/jvm', '/Library/Java/JavaVirtualMachines', join(env.HOME ?? '', '.sdkman/candidates/java'))
  }
  if (env.USERPROFILE) roots.push(join(env.USERPROFILE, '.jdks'))
  return roots
}

/**
 * 找本机所有 JDK。
 * @param {{ env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, extraDirs?: string[] }} [options]
 * @returns {Promise<JdkInfo[]>}
 */
export async function discoverJdks(options = {}) {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  /** @type {Set<string>} */
  const candidates = new Set()
  for (const dir of options.extraDirs ?? []) candidates.add(dir)
  for (const entry of jdkRoots(env, platform)) {
    if (!entry) continue
    candidates.add(entry)
    // 根目录本身可能就是 JDK（JAVA_HOME / .jdks/<name>），也可能是装了一堆 JDK 的父目录
    for (const child of await safeReaddir(entry)) {
      candidates.add(join(entry, child))
    }
  }

  /** @type {Map<string, JdkInfo>} */
  const found = new Map()
  for (const home of candidates) {
    const info = await readJdk(home)
    if (info === undefined) continue
    if (!found.has(info.home)) found.set(info.home, info)
  }
  return [...found.values()].sort((left, right) => right.major - left.major)
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function safeReaddir(dir) {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

/**
 * 读一个目录像不像 JDK，并拿到版本。
 * 面板里"手动添加 JDK"也走这里：加之前先确认它真的是个 JDK。
 * @param {string} home
 * @returns {Promise<JdkInfo | undefined>}
 */
export async function readJdk(home) {
  const release = await readText(join(home, 'release'))
  if (release !== undefined) {
    const match = /JAVA_VERSION="([^"]+)"/.exec(release)
    if (match) {
      const version = match[1]
      const major = Number.parseInt(version, 10)
      if (!Number.isNaN(major)) return { home, version, major, source: 'release' }
    }
  }
  // 没有 release（比如某些精简发行版）时退一步看目录名
  const name = home.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
  const byName = /jdk-?(\d+)(?:\.\d+)*/.exec(name) ?? /java-?1\.(\d+)/.exec(name)
  if (byName) {
    const major = Number(byName[1])
    if (!Number.isNaN(major)) return { home, version: String(major), major, source: 'dirname' }
  }
  return undefined
}

/**
 * 挑一个满足要求的 JDK：优先大版本完全匹配，其次取不低于要求的最高版本。
 * @param {JdkInfo[]} jdks
 * @param {number | undefined} required
 * @param {string | undefined} configured 显式配置的 JAVA_HOME / org.gradle.java.home
 * @returns {{ home: string, exact: boolean } | undefined}
 */
export function pickJdk(jdks, required, configured) {
  if (configured) {
    const hit = jdks.find((jdk) => jdk.home.toLowerCase() === configured.toLowerCase())
    if (hit) return { home: hit.home, exact: hit.major === required }
    return { home: configured, exact: false }
  }
  if (required === undefined) return jdks[0] ? { home: jdks[0].home, exact: false } : undefined
  const exact = jdks.find((jdk) => jdk.major === required)
  if (exact) return { home: exact.home, exact: true }
  const above = jdks.find((jdk) => jdk.major > required)
  if (above) return { home: above.home, exact: false }
  return undefined
}
