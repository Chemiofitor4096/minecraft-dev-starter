/**
 * 启动命令行构造与进程存活探测。
 *
 * Windows 的关键点在引号：`cmd.exe /d /s /c` 需要把整条命令再包一层引号，
 * 且必须让 node 原样传递（`windowsVerbatimArguments: true`），否则 node 会把
 * `"` 转义成 `\"`，cmd 不认。这套写法在 minecraft-dev 的 mc_gradle 上验证过。
 * @module minecraft-dev-starter/lib/argv
 */

import { posix, resolve, win32 } from 'node:path'

/**
 * Gradle 任务路径只允许 `run*`（可能带 `:module:` 前缀）。
 * 界面上没有自由输入的入口，但 API 是公开的，仍然要挡一道。
 */
export const TASK_PATH_PATTERN = /^(?::[A-Za-z0-9_.-]+)*:?run[A-Za-z0-9_]+$/

/**
 * @param {{ platform?: string, projectDir: string, gradlew?: string, taskPath: string, extraArgs?: string[] }} options
 * @returns {{ argv: string[], windowsVerbatimArguments: boolean, cwd: string }}
 */
export function gradlewCommand(options) {
  const platform = options.platform ?? process.platform
  const extraArgs = options.extraArgs ?? []

  if (platform === 'win32') {
    const wrapper = win32.resolve(options.projectDir, options.gradlew ?? 'gradlew.bat')
    const parts = [quoteCmdArg(wrapper), quoteCmdArg(options.taskPath), ...extraArgs.map(quoteCmdArg)]
    return {
      // `/s` 会剥掉最外层的一对引号，所以这里要包两层：cmd /c ""prog" "arg""
      argv: ['cmd.exe', '/d', '/s', '/c', `"${parts.join(' ')}"`],
      windowsVerbatimArguments: true,
      cwd: options.projectDir,
    }
  }

  return {
    argv: [posix.join(options.projectDir, options.gradlew ?? 'gradlew'), options.taskPath, ...extraArgs],
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
