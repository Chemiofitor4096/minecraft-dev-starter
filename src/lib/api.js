/**
 * `/mcdev/api` 的方法表。宿主入口只负责挂路由，具体动作在这里。
 *
 * 方法名与请求体形状一旦定下就是客户端合同，改名前先改客户端与文档。
 * @module minecraft-dev-starter/lib/api
 */

import { detectProject } from './detect.js'
import { discoverJdks } from './java.js'
import { createLaunchService } from './launches.js'
import { scanWorkspace } from './scanner.js'

/** 扫描结果的短缓存：面板打开/切会话会连着问几次，没必要每次重扫。 */
const CACHE_TTL_MS = 5000

/** 客户端诊断上报的最近若干条（只在开发期用）。 */
const clientReports = []

/**
 * 判断子路径是否落在父路径之下（Windows 下大小写不敏感）。
 * @param {string} child
 * @param {string} parent
 * @returns {boolean}
 */
function isInside(child, parent) {
  const normalize = (value) => value.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const a = normalize(child)
  const b = normalize(parent)
  return a === b || a.startsWith(`${b}\\`)
}

/**
 * @param {{ resolveRoot: () => Promise<string | undefined>, resolveRoots?: () => Promise<string[]>, version?: string, config?: Record<string, unknown>, launchService?: ReturnType<typeof createLaunchService> }} options
 */
export function createApi(options) {
  /** @type {Map<string, { at: number, value: unknown }>} */
  const cache = new Map()
  const launches = options.launchService ?? createLaunchService()

  /**
   * @param {string | undefined} requested
   * @returns {Promise<string>}
   */
  async function resolveRoot(requested) {
    const root = requested ?? (await options.resolveRoot())
    if (root === undefined || root === '') {
      throw new Error('找不到工作区目录：请求里没带 root，宿主也没有活跃会话')
    }
    return root
  }

  return {
    /**
     * 扫工作区：`{ root?, depth?, refresh? }` → `{ root, projects, truncated, scannedAt }`。
     * @param {unknown} payload
     */
    'projects.scan': async (payload) => {
      const input = /** @type {{ root?: string, depth?: number, refresh?: boolean }} */ (payload ?? {})
      const root = await resolveRoot(input.root)
      const key = `${root}|${input.depth ?? 3}`
      const cached = cache.get(key)
      if (input.refresh !== true && cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.value
      }
      const jdks = await discoverJdks()
      const result = await scanWorkspace(root, { depth: input.depth, jdks })
      console.log(`[mcdev] projects.scan ${root} → ${result.projects.length} 个工程（${result.scannedDirs} 个目录）`)
      const value = { ...result, scannedAt: new Date().toISOString() }
      cache.set(key, { at: Date.now(), value })
      return value
    },

    /**
     * 单工程详情：`{ root }` → 完整画像。
     * @param {unknown} payload
     */
    'projects.detail': async (payload) => {
      const input = /** @type {{ root?: string }} */ (payload ?? {})
      const root = await resolveRoot(input.root)
      return detectProject(root, { jdks: await discoverJdks() })
    },

    /** 宿主/插件版本、工作区根与部署配置，客户端启动时打一次。 */
    'state.info': async () => ({
      version: options.version,
      root: await options.resolveRoot(),
      config: options.config ?? {},
    }),

    /**
     * 启动实例：`{ root, taskPath, label?, kind?, module?, extraArgs? }`。
     * 只允许启动"识别得出的目标"，并且工程必须落在当前工作区之内。
     * @param {unknown} payload
     */
    'launch.start': async (payload) => {
      const input = /** @type {{ root?: string, taskPath?: string, label?: string, kind?: string, module?: string, extraArgs?: string[] }} */ (payload ?? {})
      const root = await resolveRoot(input.root)
      // 工作区可能不止一个（每个会话一个 cwd）：只要落在其中任意一个之内就放行，
      // 否则切到另一个工程的会话后会被误判成"越界"。
      const workspaces = options.resolveRoots === undefined ? [await resolveRoot(undefined)] : await options.resolveRoots()
      if (!workspaces.some((workspace) => isInside(root, workspace))) {
        throw Object.assign(new Error(`工程不在当前工作区内：${root}`), { code: 'OUTSIDE_WORKSPACE' })
      }
      if (typeof input.taskPath !== 'string' || input.taskPath === '') {
        throw Object.assign(new Error('缺少 taskPath'), { code: 'BAD_REQUEST' })
      }
      const profile = await detectProject(root, { jdks: await discoverJdks() })
      const targets = /** @type {Array<Record<string, any>>} */ (profile.runTargets ?? [])
      const target = targets.find((entry) => entry.taskPath === input.taskPath)
      if (target === undefined) {
        throw Object.assign(new Error(`工程里没有这个可运行目标：${input.taskPath}`), { code: 'UNKNOWN_TARGET' })
      }
      const record = await launches.start({
        root,
        taskPath: target.taskPath,
        label: input.label ?? target.label ?? target.taskPath,
        kind: input.kind ?? target.kind ?? 'client',
        // 以识别结果为准：调用方传的 kind 可能过时，mode 决定"跑完"还是"就绪"
        mode: target.mode,
        module: input.module ?? target.module ?? '.',
        extraArgs: Array.isArray(input.extraArgs) ? input.extraArgs.filter((entry) => typeof entry === 'string') : [],
      })
      console.log(`[mcdev] launch.start ${record.id} ${record.taskPath} @ ${root} (pid ${record.pid})`)
      return record
    },

    /**
     * 停止实例：`{ id }`。
     * @param {unknown} payload
     */
    'launch.stop': async (payload) => {
      const input = /** @type {{ id?: string }} */ (payload ?? {})
      if (typeof input.id !== 'string' || input.id === '') {
        throw Object.assign(new Error('缺少实例 id'), { code: 'BAD_REQUEST' })
      }
      const record = await launches.stop(input.id)
      console.log(`[mcdev] launch.stop ${input.id} → ${record.status}/${record.outcome ?? '-'}`)
      return record
    },

    /**
     * 列实例：`{ root? }`，最新的在前。
     * @param {unknown} payload
     */
    'launch.list': async (payload) => {
      const input = /** @type {{ root?: string }} */ (payload ?? {})
      const all = await launches.list()
      if (typeof input.root !== 'string' || input.root === '') return all
      const root = input.root.toLowerCase()
      return all.filter((record) => String(record.root).toLowerCase() === root)
    },

    /**
     * 这个工程当前活跃的实例：`{ root }`。
     * @param {unknown} payload
     */
    'launch.current': async (payload) => {
      const input = /** @type {{ root?: string }} */ (payload ?? {})
      const root = await resolveRoot(input.root)
      return (await launches.current(root)) ?? null
    },

    /**
     * 读日志：`{ id, offset?, limit? }`。
     * @param {unknown} payload
     */
    'launch.logs': async (payload) => {
      const input = /** @type {{ id?: string, offset?: number, limit?: number }} */ (payload ?? {})
      if (typeof input.id !== 'string' || input.id === '') {
        throw Object.assign(new Error('缺少实例 id'), { code: 'BAD_REQUEST' })
      }
      return launches.logs(input.id, Number.isFinite(input.offset) ? Number(input.offset) : 0, Number.isFinite(input.limit) ? Number(input.limit) : 400)
    },

    /**
     * 客户端诊断上报（开发期）：`{ event, detail }` → `{ ok, count }`。
     * 只在宿主日志里留一行，并保留最近 20 条供后续排查。
     * @param {unknown} payload
     */
    'client.report': async (payload) => {
      const input = /** @type {{ event?: string, detail?: unknown }} */ (payload ?? {})
      clientReports.push({ at: new Date().toISOString(), event: input.event, detail: input.detail })
      if (clientReports.length > 20) clientReports.shift()
      console.log(`[mcdev] client: ${input.event} ${JSON.stringify(input.detail ?? {})}`)
      return { ok: true, count: clientReports.length }
    },
  }
}
