/**
 * 状态落盘：`$DSH_HOME/mc-dev-starter/state.json` 与同目录下的日志。
 *
 * 写入用「临时文件 + rename」：宿主被强杀时不会留下半个 JSON。
 * @module minecraft-dev-starter/lib/state
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 状态目录。`DSH_HOME` 优先，其次 `~/.dsh`。
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function stateDir(env = process.env) {
  const home = env.DSH_HOME ?? join(env.USERPROFILE ?? homedir(), '.dsh')
  return join(home, 'mc-dev-starter')
}

/**
 * @param {string} dir
 * @param {string} launchId
 * @returns {string}
 */
export function logPath(dir, launchId) {
  return join(dir, 'logs', `${launchId}.log`)
}

/**
 * @typedef {object} LaunchRecord
 * @property {string} id
 * @property {string} root
 * @property {string} taskPath
 * @property {string} label
 * @property {string} kind        client | server | data | gameTestServer
 * @property {'daemon' | 'oneshot'} [mode] 常驻还是会跑完；旧记录没有这个字段时按 kind 推
 * @property {string | null} [javaHome] 启动时用的 JDK；没指定就是继承环境
 * @property {string} module
 * @property {number | null} pid
 * @property {string} startedAt
 * @property {string | null} endedAt
 * @property {'starting' | 'running' | 'exited' | 'unknown'} status
 * @property {'normal' | 'crashed' | 'killed' | 'failed' | null} outcome
 * @property {number | null} exitCode
 * @property {string | null} signal
 * @property {string} logPath
 * @property {'passed' | 'failed' | 'aborted' | 'error' | 'unknown'} [verdict] 只对一次性任务计算
 * @property {string} [summary]   给结论的那一行日志
 * @property {string[]} [failures]
 */

/**
 * @typedef {object} PersistentState
 * @property {number} version
 * @property {number} nextLaunch
 * @property {LaunchRecord[]} launches
 */

/** @returns {PersistentState} */
export function emptyState() {
  return { version: 1, nextLaunch: 1, launches: [] }
}

/**
 * @param {string} dir
 * @returns {Promise<PersistentState>}
 */
export async function loadState(dir) {
  try {
    const raw = await readFile(join(dir, 'state.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return emptyState()
    return {
      version: Number(parsed.version ?? 1),
      nextLaunch: Number(parsed.nextLaunch ?? 1),
      launches: Array.isArray(parsed.launches) ? parsed.launches : [],
    }
  } catch {
    return emptyState()
  }
}

/**
 * @param {string} dir
 * @param {PersistentState} state
 * @returns {Promise<void>}
 */
export async function saveState(dir, state) {
  await mkdir(dir, { recursive: true })
  const target = join(dir, 'state.json')
  const temp = `${target}.tmp`
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}
