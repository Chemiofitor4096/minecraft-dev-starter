/**
 * 宿主对外提供的窄接口：给别的 DSH 插件用的"带环境变量跑一个目标"。
 *
 * 只暴露四件事——launch / stop / list / resolve-java。识别、JDK 选择、单实例锁、
 * 就绪判定、结论裁决全在 api 与 launch 层里，不重复实现，也不把整个 api 表外泄
 * （api 的方法名是客户端合同，不是插件间合同）。
 *
 * 消费方（比如数据导出插件）拿到的是 `ctx.mcdev`：它要做的只有两件事——
 * 给 `env` 塞 `JAVA_TOOL_OPTIONS=-javaagent:…`，然后 `await launch(...)`。
 * @module minecraft-dev-starter/lib/service
 */

import { waitForLaunch } from './launch/wait.js'

/** 服务暴露的能力：消费方据此决定要不要展示入口（版本/能力握手）。 */
const CAPABILITIES = ['projects', 'launch', 'stop', 'list', 'resolve-java']

/**
 * 把识别结果压成"插件间"的视图：只留语言中立的事实。
 *
 * 证据、警告、冲突这些是给人看的文案（会跟着 `lang` 变），服务不往外传——
 * 消费方要的是"这个工程是什么、能不能跑"，不是"我们怎么判断的"。要那些就去看面板。
 * @param {Record<string, any>} project
 */
export function projectView(project) {
  const targets = Array.isArray(project.runTargets) ? project.runTargets : []
  const java = project.java ?? {}
  /** @type {Record<string, any>} */
  const view = {
    root: project.root,
    name: project.name,
    kind: project.kind,
    loader: project.loader,
    gradleRoot: project.gradleRoot ?? project.root,
    runTargets: targets.map((target) => ({
      taskPath: target.taskPath ?? target.task,
      label: target.label,
      kind: target.kind,
      mode: target.mode,
      source: target.source,
      guessed: target.guessed === true,
    })),
    java: {},
    confidence: project.confidence,
  }
  // 可选字段只在有值时出现：`undefined` 会把整条工具返回值判成非无损 JSON
  for (const key of ['loaderVersion', 'modId', 'modName']) {
    const value = project[key]
    if (typeof value === 'string' && value !== '') view[key] = value
  }
  if (typeof project.minecraftVersion === 'string' && project.minecraftVersion !== '') {
    view.mcVersion = project.minecraftVersion
  }
  if (typeof java.required === 'number') view.java.required = java.required
  const selected = java.selected ?? java.toolchain
  if (typeof selected === 'string' && selected !== '') view.java.selected = selected
  return view
}

/**
 * 只保留"字符串到字符串"的键值，其余丢弃——环境变量不是任意 JSON 的垃圾桶。
 * @param {unknown} value
 * @returns {Record<string, string> | undefined}
 */
export function sanitizeEnv(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  /** @type {Record<string, string>} */
  const env = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key !== 'string' || key === '') continue
    if (typeof entry !== 'string') continue
    env[key] = entry
  }
  return Object.keys(env).length === 0 ? undefined : env
}

/**
 * 造服务对象。纯函数，不碰 cordis——单测可以直接调。
 * @param {{ api: Record<string, any>, version: string }} options
 */
export function createMcdevService({ api, version }) {
  return {
    version,
    capabilities: [...CAPABILITIES],

    /**
     * 这个工作区里有哪些工程、是不是 Minecraft 工程、能不能跑。
     *
     * 返回的是压缩视图（见 `projectView`）：语言中立、不带证据文案，够消费方判断
     * "有没有 MC 工程 / 该用哪个 root / 有没有 runServer"，细节仍然在面板里。
     * @param {{ root?: string, workspace?: string, depth?: number, refresh?: boolean }} [input]
     */
    async projects(input) {
      const request = /** @type {{ root?: string, workspace?: string, depth?: number, refresh?: boolean }} */ (input ?? {})
      const scanned = await api['projects.scan']({
        root: request.root,
        workspace: request.workspace,
        ...(Number.isFinite(request.depth) ? { depth: Number(request.depth) } : {}),
        ...(request.refresh === true ? { refresh: true } : {}),
      })
      return {
        root: scanned?.root,
        scannedDirs: scanned?.scannedDirs ?? 0,
        truncated: scanned?.truncated === true,
        projects: (scanned?.projects ?? []).map(projectView),
      }
    },

    /**
     * 起一个目标，按 mode 等它"就绪"或"跑完"。
     *
     * `wait`：`auto`（默认，按 mode 决定）/ `ready` / `exit` / `detach`。
     * 返回启动记录；等到结果时再并上 `timedOut` 与最终状态字段。
     * @param {{ root?: string, workspace?: string, taskPath: string, env?: Record<string, string>, wait?: 'auto'|'ready'|'exit'|'detach', timeoutMs?: number, signal?: AbortSignal }} input
     */
    async launch(input) {
      const request = /** @type {Record<string, any>} */ (input ?? {})
      if (typeof request.taskPath !== 'string' || request.taskPath === '') {
        throw Object.assign(new Error('launch 需要 taskPath'), { code: 'BAD_REQUEST' })
      }
      const env = sanitizeEnv(request.env)
      const record = await api['launch.start']({
        root: request.root,
        workspace: request.workspace,
        taskPath: request.taskPath,
        ...(env === undefined ? {} : { env }),
      })
      const wait = request.wait ?? 'auto'
      if (wait === 'detach') return { ...record, timedOut: false }

      const until = wait === 'auto'
        ? (record.mode === 'oneshot' ? 'exit' : 'ready')
        : wait
      const timeoutMs = Number.isFinite(request.timeoutMs) ? Number(request.timeoutMs) : 600_000
      const settled = await waitForLaunch({
        list: () => api['launch.list']({}),
        id: record.id,
        until,
        timeoutMs,
        signal: request.signal,
      })
      return { ...(settled.entry ?? record), timedOut: settled.timedOut }
    },

    /**
     * 停一个实例：给了 `id` 就停它，没给就停这个工作区当前活跃的那个。
     * @param {{ id?: string, root?: string, workspace?: string }} [input]
     */
    async stop(input) {
      const request = /** @type {{ id?: string, root?: string, workspace?: string }} */ (input ?? {})
      if (typeof request.id === 'string' && request.id !== '') {
        return await api['launch.stop']({ id: request.id })
      }
      const current = await api['launch.current']({ root: request.root, workspace: request.workspace })
      if (current === null || current === undefined) {
        throw Object.assign(new Error('这个工作区没有活跃实例'), { code: 'NO_INSTANCE' })
      }
      return await api['launch.stop']({ id: current.id })
    },

    /**
     * 列实例（可按工作区过滤）。
     * @param {{ root?: string, workspace?: string }} [input]
     */
    async list(input) {
      const request = /** @type {{ root?: string, workspace?: string }} */ (input ?? {})
      return await api['launch.list']({ root: request.root, workspace: request.workspace })
    },

    /**
     * 这个工程该用哪个 JDK——attach 模式要按工程那个 JDK 去起小程序。
     * 没有可用 JDK 时返回 `undefined`，不猜。
     * @param {{ root?: string, workspace?: string }} [input]
     * @returns {Promise<{ home: string, major: number | undefined, required: number | undefined } | undefined>}
     */
    async resolveJava(input) {
      const request = /** @type {{ root?: string, workspace?: string }} */ (input ?? {})
      const detail = await api['projects.detail']({ root: request.root, workspace: request.workspace })
      const java = detail?.java
      const home = typeof java?.selected === 'string' && java.selected !== '' ? java.selected : undefined
      if (home === undefined) return undefined
      const available = Array.isArray(java.available) ? java.available : []
      const match = available.find((entry) => entry?.home === home)
      return {
        home,
        major: typeof match?.major === 'number' ? match.major : undefined,
        required: typeof java.required === 'number' ? java.required : undefined,
      }
    },
  }
}
