/**
 * 每个工程的 JDK 选择。
 *
 * 选择存在 `$DSH_HOME/mc-dev-starter/jdk.json`，不写进 `gradle.properties`：
 * 后者是跟着仓库走的文件，"这台机器用哪个 JDK"是本机事实，提交上去会打扰别人。
 *
 * 解析优先级：手动指定 > `gradle.properties` 的 `org.gradle.java.home` > 按 MC 版本自动挑。
 * @module minecraft-dev-starter/lib/jdks
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gradleSupportsJava, pickJdk } from './java.js'

/**
 * @typedef {object} JdkPrefs
 * @property {string[]} extra                手动添加过的 JDK 根目录
 * @property {Record<string, string>} projects 工程根 → JDK 根目录
 */

/**
 * @typedef {object} JdkChoice
 * @property {string} home
 * @property {'override' | 'configured' | 'auto'} source
 * @property {boolean} exact   大版本是否与 MC 版本要求完全一致
 * @property {number} [major]
 */

/** 手动添加的 JDK 最多记多少个（防止 jdk.json 无限膨胀）。 */
const MAX_EXTRA = 20

/**
 * @param {string} dir 状态目录
 * @returns {string}
 */
export function jdkPrefsPath(dir) {
  return join(dir, 'jdk.json')
}

/** @returns {JdkPrefs} */
export function emptyJdkPrefs() {
  return { extra: [], projects: {} }
}

/**
 * @param {string} dir
 * @returns {Promise<JdkPrefs>}
 */
export async function loadJdkPrefs(dir) {
  try {
    const parsed = JSON.parse(await readFile(jdkPrefsPath(dir), 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return emptyJdkPrefs()
    return {
      extra: Array.isArray(parsed.extra) ? parsed.extra.filter((entry) => typeof entry === 'string' && entry !== '') : [],
      projects: parsed.projects !== null && typeof parsed.projects === 'object' ? parsed.projects : {},
    }
  } catch {
    return emptyJdkPrefs()
  }
}

/**
 * @param {string} dir
 * @param {JdkPrefs} prefs
 * @returns {Promise<void>}
 */
export async function saveJdkPrefs(dir, prefs) {
  await mkdir(dir, { recursive: true })
  const target = jdkPrefsPath(dir)
  const temp = `${target}.tmp`
  await writeFile(temp, `${JSON.stringify(prefs, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}

/**
 * 工程根的归一化 key：统一反斜杠、去尾斜杠、小写。
 * 同一个工程从会话 cwd 和从面板进来可能是两种写法。
 * @param {string} root
 * @returns {string}
 */
export function projectKey(root) {
  return String(root).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

/**
 * @param {JdkPrefs} prefs
 * @param {string} root
 * @returns {string | undefined}
 */
export function overrideFor(prefs, root) {
  const home = prefs.projects[projectKey(root)]
  return typeof home === 'string' && home !== '' ? home : undefined
}

/**
 * 把某个 JDK 记进"手动添加过"的列表。
 * @param {JdkPrefs} prefs
 * @param {string} home
 * @returns {JdkPrefs}
 */
export function withExtra(prefs, home) {
  const exists = prefs.extra.some((entry) => entry.toLowerCase() === home.toLowerCase())
  if (exists) return prefs
  return { ...prefs, extra: [home, ...prefs.extra].slice(0, MAX_EXTRA) }
}

/**
 * 解析这个工程最终用哪个 JDK。
 * @param {JdkPrefs} prefs
 * @param {string} root
 * @param {import('./java.js').JdkInfo[]} jdks
 * @param {number | undefined} required
 * @param {string | undefined} configured 工程脚本里显式配置的 org.gradle.java.home
 * @returns {JdkChoice | undefined}
 */
export function resolveJdk(prefs, root, jdks, required, configured) {
  const override = overrideFor(prefs, root)
  if (override !== undefined) {
    const hit = jdks.find((jdk) => jdk.home.toLowerCase() === override.toLowerCase())
    // 手动选过但 JDK 已经不在了：仍然返回，让面板把这件事实显示出来
    return { home: hit?.home ?? override, source: 'override', exact: hit === undefined ? false : hit.major === required, major: hit?.major }
  }
  const picked = pickJdk(jdks, required, configured)
  if (picked === undefined) return undefined
  const hit = jdks.find((jdk) => jdk.home.toLowerCase() === picked.home.toLowerCase())
  return {
    home: hit?.home ?? picked.home,
    source: configured === undefined ? 'auto' : 'configured',
    exact: picked.exact,
    major: hit?.major,
  }
}

/**
 * 启动时是否真的把这个 JDK 传给 Gradle。
 *
 * 只注入两类：
 *   - `override`：人明确选的，照办；
 *   - `auto`：大版本完全匹配且 wrapper 的 Gradle 跑得动，才敢接管。
 *
 * 自动挑到"高一档"的 JDK（比如需要 21 只装了 25）不注入——那种情况下原来的
 * JAVA_HOME 也许能用，硬换成一个 Gradle 不支持的 JVM 反而会把能跑的工程弄挂。
 * @param {JdkChoice | undefined} choice
 * @param {string | undefined} gradleVersion
 * @returns {boolean}
 */
export function shouldInjectJdk(choice, gradleVersion) {
  if (choice === undefined) return false
  if (choice.source === 'override') return true
  if (choice.source !== 'auto') return false
  return choice.exact === true && gradleSupportsJava(gradleVersion, choice.major).ok
}

/**
 * 从识别结果里取这次启动的 JDK 选择（`profile.java` → `JdkChoice`）。
 * 只是搬数据，不做决策；决策在 `shouldInjectJdk`。
 * @param {Record<string, any>} profile
 * @returns {JdkChoice | undefined}
 */
export function javaChoiceFor(profile) {
  const java = /** @type {Record<string, any>} */ (profile.java ?? {})
  if (typeof java.selected !== 'string' || java.selected === '') return undefined
  const hit = (java.available ?? []).find((jdk) => jdk.home === java.selected)
  return {
    home: java.selected,
    source: java.source ?? 'auto',
    exact: java.exact === true,
    major: hit?.major,
  }
}
