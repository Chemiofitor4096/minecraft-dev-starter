/**
 * 启动命令行构造与进程存活探测。
 *
 * Windows 的关键点在引号：`cmd.exe /d /s /c` 需要把整条命令再包一层引号，
 * 且必须让 node 原样传递（`windowsVerbatimArguments: true`），否则 node 会把
 * `"` 转义成 `\"`，cmd 不认。这套写法在 minecraft-dev 的 mc_gradle 上验证过。
 * @module minecraft-dev-starter/lib/argv
 */

import { posix, win32 } from 'node:path'

/**
 * Gradle 任务路径只允许 `run*`（可能带 `:module:` 前缀）。
 * 界面上没有自由输入的入口，但 API 是公开的，仍然要挡一道。
 */
export const TASK_PATH_PATTERN = /^(?::[A-Za-z0-9_.-]+)*:?run[A-Za-z0-9_]+$/

/** `-Dkey=value` 里的 key：字母数字、下划线、点、短横线。 */
const PROPERTY_KEY_PATTERN = /^[A-Za-z0-9_.-]+$/

/**
 * 这些属性我们没有资格替调用方转发：JDK 由 jdk.json / 面板决定，
 * 从启动参数偷偷改掉会让"面板说 21、实际跑 17"这类问题重新出现。
 */
const RESERVED_PROPERTIES = new Set(['org.gradle.java.home'])

/**
 * 把结构化的 Gradle 选项变成 argv 片段。
 *
 * 只收三种：`--offline`、`--refresh-dependencies`、`-Dkey=value`。
 * 不收自由参数：`-p` / `-x` / `--project-dir` 这类会推翻"在哪个目录、跑哪个任务"的判定，
 * 而那两件事必须由识别结果决定。
 *
 * @param {{ offline?: boolean, refreshDependencies?: boolean, properties?: Record<string, string> }} [options]
 * @returns {string[]}
 */
export function gradleOptionArgs(options = {}) {
  /** @type {string[]} */
  const args = []
  if (options.offline === true) args.push('--offline')
  if (options.refreshDependencies === true) args.push('--refresh-dependencies')
  for (const [key, raw] of Object.entries(options.properties ?? {})) {
    if (!PROPERTY_KEY_PATTERN.test(key)) {
      throw Object.assign(new Error(`invalid Gradle property name: ${key}`), { code: 'BAD_GRADLE_PROPERTY' })
    }
    if (RESERVED_PROPERTIES.has(key)) {
      throw Object.assign(new Error(`Gradle property ${key} is managed by the JDK selector; change the JDK instead`), {
        code: 'BAD_GRADLE_PROPERTY',
      })
    }
    const value = String(raw ?? '')
    if (/[\r\n]/.test(value)) {
      throw Object.assign(new Error(`invalid Gradle property value for ${key}`), { code: 'BAD_GRADLE_PROPERTY' })
    }
    args.push(`-D${key}=${value}`)
  }
  return args
}

/**
 * @param {{
 *   platform?: string,
 *   projectDir: string,
 *   gradlew?: string,
 *   taskPath: string,
 *   javaHome?: string,
 *   options?: string[],
 * }} options
 * @returns {{ argv: string[], windowsVerbatimArguments: boolean, cwd: string }}
 */
export function gradlewCommand(options) {
  const platform = options.platform ?? process.platform
  // `-Dorg.gradle.java.home` 是 Gradle 的"用哪个 JVM 跑构建"，等价于 IDEA 里的 Gradle JVM。
  // 放在任务名前面：它是 gradlew 自己的参数，不是任务参数。
  const jvmArgs = options.javaHome === undefined || options.javaHome === '' ? [] : [`-Dorg.gradle.java.home=${options.javaHome}`]
  // 用户选项也必须在任务名之前——`gradle build -Dfoo=bar` 会被当成任务选项
  // （实测报 `Task '.foo=bar' not found`）。
  const extra = options.options ?? []

  if (platform === 'win32') {
    const wrapper = win32.resolve(options.projectDir, options.gradlew ?? 'gradlew.bat')
    const parts = [
      quoteCmdArg(wrapper),
      ...jvmArgs.map(quoteCmdArg),
      ...extra.map(quoteCmdArg),
      quoteCmdArg(options.taskPath),
    ]
    return {
      // `/s` 会剥掉最外层的一对引号，所以这里要包两层：cmd /c ""prog" "arg""
      argv: ['cmd.exe', '/d', '/s', '/c', `"${parts.join(' ')}"`],
      windowsVerbatimArguments: true,
      cwd: options.projectDir,
    }
  }

  return {
    argv: [posix.join(options.projectDir, options.gradlew ?? 'gradlew'), ...jvmArgs, ...extra, options.taskPath],
    windowsVerbatimArguments: false,
    cwd: options.projectDir,
  }
}

/**
 * @param {string} arg
 * @returns {string}
 */
function quoteCmdArg(arg) {
  return `"${String(arg).replace(/"/g, '\\"')}"`
}

/**
 * 进程是否还活着（配合持久化记录做对账）。
 * @param {number | null | undefined} pid
 * @returns {boolean}
 */
export function isAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM 说明进程存在但没权限发信号；ESRCH 才是真的没了
    return error?.code === 'EPERM'
  }
}
