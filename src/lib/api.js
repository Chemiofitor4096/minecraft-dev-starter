/**
 * `/mcdev/api` 的方法表。宿主入口只负责挂路由，具体动作在这里。
 *
 * 方法名与请求体形状一旦定下就是客户端合同，改名前先改客户端与文档。
 * @module minecraft-dev-starter/lib/api
 */

import { detectProject } from './detect.js'
import { discoverJdks, readJdk } from './java.js'
import { loadJdkPrefs, overrideFor, projectKey, saveJdkPrefs, shouldInjectJdk, withExtra } from './jdks.js'
import { createLaunchService } from './launches.js';
import { baseStateDir } from './state.js'
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
 * @param {{ resolveRoot: () => Promise<string | undefined>, resolveRoots?: () => Promise<string[]>, version?: string, config?: Record<string, unknown>, launchService?: ReturnType<typeof createLaunchService>, listJdks?: (extraDirs: string[]) => Promise<import('./java.js').JdkInfo[]> }} options
 */
export function createApi(options) {
  /** @type {Map<string, { at: number, value: unknown }>} */
  const cache = new Map()
  const launches = options.launchService ?? createLaunchService()
  // JDK 选择是**机器级**偏好：同一个工程换 profile 不该换 JDK，所以不跟着 profile 分目录
  const jdkDir = options.jdkDir ?? baseStateDir()
  /** JDK 探测可替换：单测不想依赖本机装了什么。 */
  const listJdks = options.listJdks ?? ((extraDirs) => discoverJdks({ extraDirs }))

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

  /**
   * 本机 JDK 与"每个工程选了哪个"，一次读齐。
   * 手动添加过的 JDK 目录也在这里并进探测结果。
   */
  async function environment() {
    const prefs = await loadJdkPrefs(jdkDir)
    const jdks = await listJdks(prefs.extra)
    return { prefs, jdks }
  }

  /**
   * 这次启动该不该把 JDK 传给 Gradle。
   * `source` 与 `exact` 来自识别结果，规则见 jdks.shouldInjectJdk。
   * @param {Record<string, any>} profile
   */
  function javaChoiceFor(profile) {
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

  /**
   * 清掉扫描缓存（改了 JDK 选择后必须重扫，否则面板还显示旧值）。
   */
  function dropCache() {
    cache.clear()
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
      const { prefs, jdks } = await environment()
      const result = await scanWorkspace(root, { depth: input.depth, jdks, overrides: prefs.projects })
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
      const { prefs, jdks } = await environment()
      return detectProject(root, { jdks, overrideJavaHome: overrideFor(prefs, root) })
    },

    /**
     * 本机 JDK 列表（含手动添加过的）与每个工程的指定。
     * @param {unknown} _payload
     */
    'java.list': async (_payload) => {
      const { prefs, jdks } = await environment()
      return {
        jdks: jdks.map((jdk) => ({ home: jdk.home, version: jdk.version, major: jdk.major })),
        extra: prefs.extra,
      }
    },

    /**
     * 给某个工程指定 JDK：`{ root, home }`，`home` 为空表示恢复自动。
     * @param {unknown} payload
     */
    'projects.jdk.set': async (payload) => {
      const input = /** @type {{ root?: string, home?: string }} */ (payload ?? {})
      const root = await resolveRoot(input.root)
      const home = typeof input.home === 'string' ? input.home.trim() : ''
      let prefs = await loadJdkPrefs(jdkDir)
      /** @type {Record<string, string>} */
      const projects = { ...prefs.projects }
      const key = projectKey(root)
      if (home === '') {
        delete projects[key]
        prefs = { ...prefs, projects }
      } else {
        const info = await readJdk(home)
        if (info === undefined) {
          throw Object.assign(new Error(`这个目录不像 JDK：${home}`), { code: 'BAD_JDK' })
        }
        projects[key] = info.home
        prefs = withExtra({ ...prefs, projects }, info.home)
      }
      await saveJdkPrefs(jdkDir, prefs)
      dropCache()
      const { jdks } = await environment()
      return {
        root,
        override: projects[key] ?? null,
        jdks: jdks.map((jdk) => ({ home: jdk.home, major: jdk.major })),
      }
    },

    /**
     * 把一个 JDK 目录加进可选列表：`{ path }`。
     * 只是记下来，真正给某个工程用还要 `projects.jdk.set`。
     * @param {unknown} payload
     */
    'projects.jdk.add': async (payload) => {
      const input = /** @type {{ path?: string }} */ (payload ?? {})
      const path = typeof input.path === 'string' ? input.path.trim() : ''
      if (path === '') throw Object.assign(new Error('缺少 JDK 目录'), { code: 'BAD_REQUEST' })
      const info = await readJdk(path)
      if (info === undefined) {
        throw Object.assign(new Error(`这个目录不像 JDK（没有 release 文件，目录名里也没有版本号）：${path}`), { code: 'BAD_JDK' })
      }
      const prefs = withExtra(await loadJdkPrefs(jdkDir), info.home)
      await saveJdkPrefs(jdkDir, prefs)
      dropCache()
      return { jdk: { home: info.home, version: info.version, major: info.major } }
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
      const { prefs, jdks } = await environment()
      const overrideJavaHome = overrideFor(prefs, root)
      const profile = await detectProject(root, { jdks, overrideJavaHome })
      const targets = /** @type {Array<Record<string, any>>} */ (profile.runTargets ?? [])
      const target = targets.find((entry) => entry.taskPath === input.taskPath)
      if (target === undefined) {
        throw Object.assign(new Error(`工程里没有这个可运行目标：${input.taskPath}`), { code: 'UNKNOWN_TARGET' })
      }
      const choice = javaChoiceFor(profile)
      const record = await launches.start({
        root,
        taskPath: target.taskPath,
        label: input.label ?? target.label ?? target.taskPath,
        kind: input.kind ?? target.kind ?? 'client',
        // 以识别结果为准：调用方传的 kind 可能过时，mode 决定"跑完"还是"就绪"
        mode: target.mode,
        // 只有"人明确选的"或"完全匹配且 Gradle 跑得动"的自动选择才接管 JDK
        javaHome: shouldInjectJdk(choice, profile.gradleVersion) ? choice.home : undefined,
        module: input.module ?? target.module ?? '.',
        extraArgs: Array.isArray(input.extraArgs) ? input.extraArgs.filter((entry) => typeof entry === 'string') : [],
      })
      console.log(`[mcdev] launch.start ${record.id} ${record.taskPath} @ ${root} (pid ${record.pid}${record.javaHome === null ? '' : `, jdk ${record.javaHome}`})`)
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
