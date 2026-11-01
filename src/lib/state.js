/**
 * 状态落盘：`$DSH_HOME/mc-dev-starter/` 下的 state.json 与日志。
 *
 * 运行实例按 **profile** 分目录：宿主进程的 argv 里带着
 * `…/.dsh/profiles/<name>`，不同 profile 的实例记录不该混在一起。
 * JDK 选择是机器级偏好，仍留在根目录（见 jdks.js）。
 *
 * 写入用「临时文件 + rename」：宿主被强杀时不会留下半个 JSON。
 * @module minecraft-dev-starter/lib/state
 */

import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** profile 目录在 profile 路径里的位置。 */
const PROFILE_PATTERN = /[\\/]profiles[\\/]([^\\/]+)[\\/]?$/i

/**
 * 当前宿主跑在哪个 profile 上。
 *
 * 桌面版与 CLI 都把 profile 目录作为参数传给 `host.js`
 * （实测：`…/app.asar/lib/host.js <asar> C:\Users\…\.dsh\profiles\desktop <runtime>`），
 * 所以从 argv 里认这一段最可靠。
 *
 * **argv 优先于环境变量**：桌面版会给自己的子进程设 `DSH_PROFILE`（在里面开终端时很有用），
 * 从那儿启动的 CLI 会继承到 "desktop"，而它自己的 argv 写的是 `--profile m10smoke`。
 * @param {string[]} [argv]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | undefined}
 */
export function profileName(argv = process.argv, env = process.env) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (typeof arg !== 'string' || arg === '') continue
    // 桌面版：argv 里直接是 profile 目录
    const match = PROFILE_PATTERN.exec(arg)
    if (match !== null) return match[1]
    // CLI：`dsh --profile m10smoke`（实测 headless 的 argv 就长这样）
    if (arg === '--profile') {
      const next = argv[index + 1]
      if (typeof next === 'string' && next !== '' && !next.startsWith('-')) return next
    }
    const inline = /^--profile=(.+)$/.exec(arg)
    if (inline !== null) return inline[1]
  }
  if (typeof env.DSH_PROFILE === 'string' && env.DSH_PROFILE !== '') return env.DSH_PROFILE
  return undefined
}

/**
 * 根目录（跨 profile 共用）。`DSH_HOME` 优先，其次 `~/.dsh`。
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function baseStateDir(env = process.env) {
  const home = env.DSH_HOME ?? join(env.USERPROFILE ?? homedir(), '.dsh')
  return join(home, 'mc-dev-starter')
}

/**
 * 状态目录：有 profile 就 `<base>/profiles/<name>`，认不出来时退回根目录
 * （宁可和以前一样共用，也不能把已有记录弄丢）。
 * @param {{ env?: NodeJS.ProcessEnv, argv?: string[] }} [options]
 * @returns {string}
 */
export function stateDir(options = {}) {
  const env = options.env ?? process.env
  const base = baseStateDir(env)
  const profile = profileName(options.argv ?? process.argv, env)
  return profile === undefined ? base : join(base, 'profiles', profile)
}

/**
 * 把拆分前的旧记录搬进当前 profile 目录。
 *
 * 只在"新目录还没有 state.json、旧目录有"时动一次，之后各 profile 各管各的。
 * 搬不动（比如被占用）就放弃，不影响启动：旧记录留在原处，只是这个 profile 看不到。
 * @param {string} dir    当前 profile 的状态目录
 * @param {string} legacy 拆分前的共用目录
 * @returns {Promise<boolean>} 是否真的搬了
 */
export async function adoptLegacyState(dir, legacy) {
  if (dir === legacy) return false
  if (await exists(join(dir, 'state.json'))) return false
  if (!(await exists(join(legacy, 'state.json')))) return false
  try {
    await mkdir(dir, { recursive: true })
    await rename(join(legacy, 'state.json'), join(dir, 'state.json'))
    try {
      await rename(join(legacy, 'logs'), join(dir, 'logs'))
    } catch {
      /* 没有日志目录或搬不动：记录还能用，日志缺就缺 */
    }
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
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
