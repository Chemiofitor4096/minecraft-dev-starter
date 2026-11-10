/**
 * 启动服务：把识别出来的 Gradle 任务跑成"实例"，并管住它的生命周期。
 *
 * 为什么不用 `ctx.subprocess` / `ctx.jobs`：两者都会随宿主作用域 dispose 被杀，
 * 而游戏要能活过 DSH 会话（依据见 doc/调研-DSH插件机制.md §6）。
 *
 * 进程模型：
 *   - `child_process.spawn({ windowsHide: true })`，输出走管道收进环形缓冲并落盘；
 *   - Windows 上**不能** detached（会丢标准输出、还会多开一个控制台），
 *     POSIX 上保留 detached 以便按进程组整组终止；
 *   - 停止用 `taskkill /PID <pid> /T /F`（Windows）杀整棵树，不留 java 孤儿；
 *   - 宿主重启时按 `pid` 探活：探不到就说 `unknown`，不伪造结束原因。
 * @module minecraft-dev-starter/lib/launches
 */

import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { gradlewCommand, isAlive, TASK_PATH_PATTERN } from './argv.js'
import { t } from '../i18n/messages.js'
import { adoptLegacyState, baseStateDir, loadState, logPath, saveState, stateDir } from '../state.js'
import { modeOf, readVerdict } from './verify.js'

/**
 * 常驻目标"就绪"的日志特征。命中即把实例从 starting 置为 running。
 * 一次性任务（data / gameTestServer）不走这里：它们生下来就是 running，
 * 唯一的结局是跑完，见 verify.js。
 */
const READY_MARKERS = {
  client: [/Backend library: LWJGL/i, /OpenAL initialized/i, /\[Render thread\/INFO\]/],
  server: [/Done \([0-9.]+s\)!/i, /For help, type "help"/i],
}

/** 这些特征说明是崩溃而不是正常退出。 */
const CRASH_MARKERS = [
  /A fatal error has been detected/i,
  /Mixin apply failed/i,
  /Unsupported class file major version/i,
  /No matching toolchains found/i,
  /Could not resolve/i,
  /BUILD FAILED/i,
]

/**
 * 崩溃归因规则。只做"看得懂的一句话"，不做自动修复。
 * 命中顺序有讲究：越具体的越靠前。
 *
 * 文案不写在这里：`hint` / `suggestion` 按 `code` 从词典取，读日志时决定语言。
 */
const DIAGNOSES = [
  { code: 'DEPENDENCY_UNRESOLVED', pattern: /Could not resolve|Could not find [\w.:-]+:/ },
  { code: 'JDK_VERSION_MISMATCH', pattern: /Unsupported class file major version/ },
  { code: 'JDK_TOOLCHAIN_MISSING', pattern: /No matching toolchains found/ },
  { code: 'PORT_IN_USE', pattern: /Address already in use|FAILED TO BIND TO PORT/i },
  { code: 'MIXIN_APPLY_FAILED', pattern: /Mixin apply failed/i },
  { code: 'OUT_OF_MEMORY', pattern: /OutOfMemoryError|Metaspace/i },
  { code: 'GAME_CRASH_REPORT', pattern: /crash-reports[\\/]/ },
  { code: 'GRADLE_BUILD_FAILED', pattern: /BUILD FAILED/ },
]

/**
 * 从日志尾部找一条能给人看的结论。
 *
 * `hint` 是给面板显示的一句话；`code` 与 `suggestion` 是给模型的结构化信息，
 * 让它不用解析中文就能决定下一步。
 * @param {string[]} lines
 * @returns {{ code: string, hint: string, suggestion: string, line: string } | undefined}
 */
export function diagnose(lines) {
  for (const rule of DIAGNOSES) {
    const hit = lines.find((line) => rule.pattern.test(line))
    if (hit !== undefined) {
      return {
        code: rule.code,
        hint: t(`diagnosis.${rule.code}.hint`),
        suggestion: t(`diagnosis.${rule.code}.suggestion`),
        line: hit.trim().slice(0, 300),
      }
    }
  }
  return undefined
}

/**
 * @typedef {object} LaunchRequest
 * @property {string} root
 * @property {string} taskPath
 * @property {string} label
 * @property {string} kind
 * @property {'daemon' | 'oneshot'} [mode] 省略时按 kind 推
 * @property {string} [javaHome] 用哪个 JDK 跑构建（透传成 -Dorg.gradle.java.home 与 JAVA_HOME）
 * @property {string} [module]
 * @property {string} [gradleRoot] 聚合工程根：子模块工程的任务要在这里跑
 * @property {string[]} [extraArgs]
 */

/**
 * @param {{ dir?: string, legacyDir?: string, platform?: string, spawnImpl?: typeof spawn, maxLogLines?: number, readyTimeoutMs?: number, commandFor?: typeof gradlewCommand, env?: NodeJS.ProcessEnv }} [options]
 */
export function createLaunchService(options = {}) {
  const dir = options.dir ?? stateDir()
  // profile 分目录之前的位置：第一次启动时把旧记录搬进来。
  // 显式给了 dir（测试、独立实例）就默认没有旧记录可搬，别去碰真实的状态目录。
  const legacyDir = options.legacyDir ?? (options.dir === undefined ? baseStateDir() : dir)
  const platform = options.platform ?? process.platform
  const spawnImpl = options.spawnImpl ?? spawn
  const commandFor = options.commandFor ?? gradlewCommand
  const baseEnv = options.env ?? process.env
  const maxLogLines = options.maxLogLines ?? 2000
  const readyTimeoutMs = options.readyTimeoutMs ?? 90_000

  /**
   * @typedef {object} Runtime
   * @property {string[]} ring
   * @property {boolean} ready
   * @property {NodeJS.Timeout | undefined} readyTimer
   * @property {import('node:child_process').ChildProcess | undefined} child
   */
  /** @type {Map<string, Runtime>} */
  const runtimes = new Map()

  /** 串行化状态写入，避免并发 start/stop 互相覆盖。 */
  let chain = Promise.resolve()
  /** @type {import('../state.js').PersistentState | undefined} */
  let state

  /**
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  function serialize(fn) {
    const next = chain.then(fn, fn)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  async function ensureState() {
    if (state !== undefined) return state
    // profile 分目录前留下的旧记录：搬一次，之后各 profile 各管各的
    await adoptLegacyState(dir, legacyDir)
    state = await loadState(dir)
    for (const record of state.launches) {
      if (record.status !== 'starting' && record.status !== 'running') continue
      if (isAlive(record.pid)) continue
      // 宿主重启后进程没了：不猜它怎么结束的
      record.status = 'unknown'
      record.endedAt = new Date().toISOString()
      if ((record.mode ?? modeOf(record.kind)) === 'oneshot' && record.verdict === undefined) {
        record.verdict = 'unknown'
      }
    }
    await saveState(dir, state)
    return state
  }

  /**
   * 找这个工程当前活跃的实例。
   * @param {string} root
   */
  function activeFor(root) {
    return (state?.launches ?? []).find(
      (record) => record.root.toLowerCase() === root.toLowerCase() && (record.status === 'starting' || record.status === 'running'),
    )
  }

  /**
   * @param {LaunchRequest} request
   */
  async function start(request) {
    if (!TASK_PATH_PATTERN.test(request.taskPath)) {
      throw Object.assign(new Error(t('error.unknownTask', { task: request.taskPath })), { code: 'BAD_TASK' })
    }
    const current = await ensureState()
    return serialize(async () => {
      const running = activeFor(request.root)
      if (running !== undefined) {
        throw Object.assign(new Error(t('error.alreadyRunning', { root: request.root, task: running.taskPath })), {
          code: 'ALREADY_RUNNING',
          launch: running,
        })
      }

      const id = `launch-${current.nextLaunch}`
      current.nextLaunch += 1
      const file = logPath(dir, id)
      await mkdir(dirname(file), { recursive: true })

      /** @type {import('../state.js').LaunchRecord} */
      const record = {
        id,
        root: request.root,
        taskPath: request.taskPath,
        label: request.label,
        kind: request.kind,
        mode: request.mode ?? modeOf(request.kind),
        javaHome: request.javaHome ?? null,
        module: request.module ?? '.',
        pid: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        status: 'starting',
        outcome: null,
        exitCode: null,
        signal: null,
        logPath: file,
      }

      const javaHome = typeof request.javaHome === 'string' && request.javaHome !== '' ? request.javaHome : undefined
      // 子模块工程：任务路径带模块前缀，必须在聚合根里执行
      const projectDir = request.gradleRoot ?? request.root
      const command = commandFor({ platform, projectDir, taskPath: request.taskPath, javaHome, extraArgs: request.extraArgs })
      /** @type {Runtime} */
      const runtime = { ring: [], ready: false, readyTimer: undefined, child: undefined }

      try {
        const child = spawnImpl(command.argv[0], command.argv.slice(1), {
          cwd: command.cwd,
          windowsHide: true,
          windowsVerbatimArguments: command.windowsVerbatimArguments,
          // 指定了 JDK 就一起接管 JAVA_HOME：gradlew 自己要用它找 java，
          // 只传 -Dorg.gradle.java.home 在"默认 java 太老"的机器上连 wrapper 都起不来。
          env: javaHome === undefined ? baseEnv : { ...baseEnv, JAVA_HOME: javaHome },
          // Windows 上不能 detached：DETACHED_PROCESS 与 CREATE_NO_WINDOW 组合后
          // 子进程的标准输出会整个丢掉（实测同一命令 detached 拿到 0 字节、
          // attached 拿到完整输出），顺带还会让 java 自己新开一个可见控制台。
          // POSIX 仍要 detached，否则 `kill(-pid)` 杀不到进程组。
          detached: platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        runtime.child = child
        record.pid = child.pid ?? null
        // 一次性任务没有"就绪"这一步：进程活着就是在跑，唯一的结局是跑完。
        // 直接置 running 也让面板与工具不必等一个永远不来的就绪标记。
        if (record.mode === 'oneshot') record.status = 'running'
        current.launches.unshift(record)
        if (current.launches.length > 100) current.launches.length = 100
        await saveState(dir, current)

        const sink = createWriteStream(file, { flags: 'a' })
        attachStream(runtime, record, child.stdout, sink)
        attachStream(runtime, record, child.stderr, sink)

        // 只有常驻目标才存在"迟迟没就绪"这回事；给一次性任务打这个标记只会误导。
        if (record.mode !== 'oneshot') {
          runtime.readyTimer = setTimeout(() => {
            if (record.status === 'starting') record.readyTimedOut = true
          }, readyTimeoutMs)
          runtime.readyTimer.unref?.()
        }

        child.on('exit', (code, signal) => {
          if (runtime.readyTimer !== undefined) clearTimeout(runtime.readyTimer)
          record.pid = null
          record.exitCode = code
          record.signal = signal
          const crashed = code !== 0 && code !== null
          record.outcome = record.stoppedByUser === true ? 'killed' : crashed ? 'crashed' : 'normal'
          // 只有一次性任务有"过没过"这回事；常驻目标的结局在 outcome 与归因里。
          if (record.mode === 'oneshot') {
            const verdict = readVerdict({ exitCode: code, outcome: record.outcome, lines: runtime.ring.slice(-600) })
            record.verdict = verdict.verdict
            if (verdict.summary !== undefined) record.summary = verdict.summary
            if (verdict.failures !== undefined) record.failures = verdict.failures
          }
          record.status = 'exited'
          record.endedAt = new Date().toISOString()
          sink.end()
          void serialize(async () => saveState(dir, current))
        })

        return { ...record, logPath: file }
      } catch (error) {
        record.status = 'exited'
        record.outcome = 'failed'
        if (record.mode === 'oneshot') record.verdict = 'error'
        record.endedAt = new Date().toISOString()
        current.launches.unshift(record)
        await saveState(dir, current)
        throw Object.assign(new Error(t('error.spawnFailed', { message: error instanceof Error ? error.message : String(error) })), { code: 'SPAWN_FAILED' })
      }
    })
  }

  /**
   * 把一路输出接到环形缓冲、就绪判定与日志文件。
   *
   * 按字节切行再逐行解码：中文 Windows 上 Gradle 与游戏可能输出 GBK，
   * 逐块 toString('utf8') 会把多字节字符切坏，逐行才有机会回退到 GBK。
   * @param {Runtime} runtime
   * @param {import('../state.js').LaunchRecord} record
   * @param {NodeJS.ReadableStream | null} stream
   * @param {import('node:fs').WriteStream} sink
   */
  function attachStream(runtime, record, stream, sink) {
    if (stream === null) return
    /** @type {Buffer} */
    let partial = Buffer.alloc(0)
    stream.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      sink.write(buffer)
      partial = partial.length === 0 ? buffer : Buffer.concat([partial, buffer])
      let index = partial.indexOf(0x0a)
      while (index >= 0) {
        const line = partial.subarray(0, index)
        partial = partial.subarray(index + 1)
        pushLine(runtime, record, decodeLine(line))
        index = partial.indexOf(0x0a)
      }
    })
    stream.on('end', () => {
      if (partial.length > 0) pushLine(runtime, record, decodeLine(partial))
      partial = Buffer.alloc(0)
    })
  }

  /**
   * @param {Runtime} runtime
   * @param {import('../state.js').LaunchRecord} record
   * @param {string} line
   */
  function pushLine(runtime, record, line) {
    runtime.ring.push(line)
    if (runtime.ring.length > maxLogLines) runtime.ring.shift()
    if (runtime.ready || record.status !== 'starting') return
    const markers = READY_MARKERS[/** @type {keyof typeof READY_MARKERS} */ (record.kind)] ?? READY_MARKERS.server
    if (markers.some((pattern) => pattern.test(line))) {
      runtime.ready = true
      record.status = 'running'
      if (runtime.readyTimer !== undefined) clearTimeout(runtime.readyTimer)
      void serialize(async () => saveState(dir, state))
    }
  }

  /**
   * @param {string} launchId
   * @param {{ graceMs?: number }} [request]
   */
  async function stop(launchId, request = {}) {
    const current = await ensureState()
    const record = current.launches.find((entry) => entry.id === launchId)
    if (record === undefined) throw Object.assign(new Error(t('error.unknownLaunch', { id: launchId })), { code: 'UNKNOWN_LAUNCH' })

    record.stoppedByUser = true
    if (record.pid === null || !isAlive(record.pid)) {
      if (record.status === 'starting' || record.status === 'running') {
        record.status = 'unknown'
        record.endedAt = new Date().toISOString()
        if ((record.mode ?? modeOf(record.kind)) === 'oneshot') record.verdict = 'unknown'
      }
      await serialize(async () => saveState(dir, current))
      return { ...record }
    }

    await killTree(record.pid, platform, request.graceMs ?? 8000)
    return { ...record }
  }

  /** @returns {Promise<Array<Record<string, unknown>>>} */
  async function list() {
    const current = await ensureState()
    return current.launches.map((record) => snapshot(record))
  }

  /**
   * @param {string} root
   * @returns {Promise<Record<string, unknown> | undefined>}
   */
  async function current(root) {
    const currentState = await ensureState()
    const record = currentState.launches.find(
      (entry) => entry.root.toLowerCase() === root.toLowerCase() && (entry.status === 'starting' || entry.status === 'running'),
    )
    return record === undefined ? undefined : snapshot(record)
  }

  /**
   * 读日志：文件是权威来源（宿主重启后内存缓冲就没了）。
   * @param {string} launchId
   * @param {number} offset 起始行号（0 起）
   * @param {number} limit
   */
  async function logs(launchId, offset = 0, limit = 400) {
    const currentState = await ensureState()
    const record = currentState.launches.find((entry) => entry.id === launchId)
    if (record === undefined) throw Object.assign(new Error(t('error.unknownLaunch', { id: launchId })), { code: 'UNKNOWN_LAUNCH' })
    let all = []
    try {
      all = splitBufferLines(await readFile(record.logPath))
    } catch {
      all = []
    }
    const lines = all.slice(Math.max(0, offset), Math.max(0, offset) + limit)
    const abnormal = record.outcome !== null && record.outcome !== 'normal'
    return {
      launchId,
      lines,
      nextOffset: Math.max(0, offset) + lines.length,
      total: all.length,
      status: record.status,
      outcome: record.outcome ?? null,
      exitCode: record.exitCode ?? null,
      mode: record.mode ?? modeOf(record.kind),
      javaHome: record.javaHome ?? null,
      verdict: record.verdict ?? null,
      summary: record.summary ?? null,
      failures: record.failures ?? [],
      readyTimedOut: record.readyTimedOut === true,
      startedAt: record.startedAt,
      endedAt: record.endedAt ?? null,
      label: record.label,
      taskPath: record.taskPath,
      root: record.root,
      diagnosis: abnormal ? diagnose(all.slice(-300)) : undefined,
    }
  }

  /**
   * @param {import('../state.js').LaunchRecord} record
   */
  function snapshot(record) {
    const running = record.status === 'starting' || record.status === 'running'
    const runtime = runtimes.get(record.id)
    return {
      id: record.id,
      root: record.root,
      taskPath: record.taskPath,
      label: record.label,
      kind: record.kind,
      mode: record.mode ?? modeOf(record.kind),
      javaHome: record.javaHome ?? null,
      module: record.module,
      pid: record.pid,
      status: record.status,
      outcome: record.outcome ?? null,
      exitCode: record.exitCode ?? null,
      verdict: record.verdict ?? null,
      summary: record.summary ?? null,
      failures: record.failures ?? [],
      startedAt: record.startedAt,
      endedAt: record.endedAt ?? null,
      logPath: record.logPath,
      readyTimedOut: record.readyTimedOut === true,
      tail: runtime?.ring.slice(-8) ?? (running ? [] : lastLinesFromMarker(record)),
    }
  }

  /**
   * 已结束的实例没有内存缓冲时，用日志尾部给界面一个摘要。
   * @param {import('../state.js').LaunchRecord} record
   * @returns {string[]}
   */
  function lastLinesFromMarker(record) {
    return crashSummary(record) === undefined ? [] : [crashSummary(record) ?? '']
  }

  /**
   * 粗粒度归因：M3 会做成规则表，这里先给一条能看懂的话。
   * @param {import('../state.js').LaunchRecord} record
   * @returns {string | undefined}
   */
  function crashSummary(record) {
    if (record.outcome === 'normal') return undefined
    if (record.exitCode === null) return undefined
    return t('summary.exitCode', { code: record.exitCode })
  }

  return { start, stop, list, current, logs, ensureState, stateDir: dir }
}

/**
 * 杀整棵进程树。
 * @param {number} pid
 * @param {string} platform
 * @param {number} graceMs
 */
async function killTree(pid, platform, graceMs) {
  if (platform === 'win32') {
    await new Promise((resolve) => {
      const child = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
      child.on('exit', () => resolve(undefined))
      child.on('error', () => resolve(undefined))
    })
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      return
    }
  }
  await new Promise((resolve) => setTimeout(resolve, Math.min(graceMs, 3000)))
  if (isAlive(pid)) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* 已经没了 */
      }
    }
  }
}

/** 供测试与调用方复用。 */
export { READY_MARKERS, CRASH_MARKERS, DIAGNOSES }

/** GBK 解码器；运行时不带完整 ICU 时为 undefined，此时只能退回 UTF-8。 */
const GBK_DECODER = (() => {
  try {
    return new TextDecoder('gbk')
  } catch {
    return undefined
  }
})()

/**
 * 一行输出 → 文本：先按 UTF-8，出现替换字符时回退 GBK（中文 Windows 的 Gradle 常见）。
 * @param {Buffer} buffer
 * @returns {string}
 */
export function decodeLine(buffer) {
  const text = buffer.toString('utf8').replace(/\r$/, '')
  if (!text.includes('\uFFFD') || GBK_DECODER === undefined) return text
  try {
    return GBK_DECODER.decode(buffer).replace(/\r$/, '')
  } catch {
    return text
  }
}

/**
 * 整个文件的字节 → 按行解码（逐行才有机会对 GBK 回退）。
 * @param {Buffer} buffer
 * @returns {string[]}
 */
export function splitBufferLines(buffer) {
  /** @type {string[]} */
  const lines = []
  let start = 0
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0x0a) continue
    lines.push(decodeLine(buffer.subarray(start, index)))
    start = index + 1
  }
  if (start < buffer.length) lines.push(decodeLine(buffer.subarray(start)))
  return lines
}
