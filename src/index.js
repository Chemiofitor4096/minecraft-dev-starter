/**
 * 宿主入口：挂 `/mcdev/api` 路由，把请求交给方法表。
 *
 * 工作区根从"最近一个活跃会话的 cwd"取——HTTP 请求本身不带会话，
 * 而模型工具那条路径有 `exec.agent.session.header.cwd`；两条路径最终都落到同一个扫描器。
 * @module minecraft-dev-starter
 */

import { readFileSync } from 'node:fs'
import { createApi } from './lib/api.js'
import { createLaunchService } from './lib/launches.js'
import { setLanguage } from './lib/messages.js'
import { profileName, stateDir } from './lib/state.js'
import { applyTools } from './tools.js'

/** Cordis 插件名。 */
export const name = 'mcdev-host'

/** 依赖的宿主服务。 */
/**
 * 必需服务：会话（取工作区）与工具注册表。
 *
 * `webServer` 不在这里——它是可选的（纯 CLI profile 没有 web 层），
 * 由 `apply` 里的 `ctx.inject(['webServer'], …)` 单独等。
 */
export const inject = ['sessions', 'tools']

/**
 * 插件版本；客户端会显示，用来确认两边同一份代码。
 *
 * 从 package.json 读，不再手写——手写的常量在发版后必然忘记同步，
 * 面板上就会出现"装了 0.1.1、显示 0.1.0"的假版本。
 */
const VERSION = readPackageVersion()

/** @returns {string} */
function readPackageVersion() {
  try {
    const url = new URL('../package.json', import.meta.url)
    return String(JSON.parse(readFileSync(url, 'utf8')).version)
  } catch {
    return '0.0.0-unknown'
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1024 * 1024) reject(new Error('body too large'))
    })
    req.on('end', () => {
      if (raw.trim() === '') return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} value
 */
function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * 活跃会话的工作目录清单。
 *
 * 面板切会话时由客户端把 cwd 显式传下来；这里是"没传时"的兜底与启动校验的依据。
 * `MCDEV_WORKSPACE` 是测试/固定工作区的逃生门。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {string[]}
 */
function sessionCwds(ctx) {
  const pinned = process.env.MCDEV_WORKSPACE
  if (typeof pinned === 'string' && pinned !== '') return [pinned]
  /** @type {string[]} */
  const roots = []
  try {
    for (const session of ctx.sessions.list()) {
      const cwd = session?.header?.cwd
      if (typeof cwd === 'string' && cwd !== '' && !roots.includes(cwd)) roots.push(cwd)
    }
  } catch {
    /* 没有会话服务时退回进程 cwd */
  }
  if (roots.length === 0) roots.push(process.cwd())
  return roots
}

/**
 * 最近一个活跃会话的工作目录（扫描默认值）。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {string | undefined}
 */
function resolveWorkspaceRoot(ctx) {
  return sessionCwds(ctx).at(-1)
}

/** 部署配置默认值；patch 行的 `config` 会覆盖同名项。 */
const DEFAULTS = {
  autoOpenLogTab: true,
  // logDock 不设默认值：由客户端按"是否装了 better-sidebar"决定落点，
  // 只有用户显式写 right / bottom 才下发给面板。
  readyTimeoutMs: 90_000,
  logRingLines: 2_000,
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} [config]
 */
export function apply(ctx, config = {}) {
  const settings = { ...DEFAULTS, ...(config ?? {}) }
  const api = createApi({
    version: VERSION,
    resolveRoot: () => resolveWorkspaceRoot(ctx),
    resolveRoots: () => sessionCwds(ctx),
    config: {
      autoOpenLogTab: settings.autoOpenLogTab !== false,
      // 只在显式配置时下发，缺省交给客户端按 better-sidebar 是否存在决定
      ...(settings.logDock === 'bottom' || settings.logDock === 'right' ? { logDock: settings.logDock } : {}),
    },
    launchService: createLaunchService({
      readyTimeoutMs: Number(settings.readyTimeoutMs) || DEFAULTS.readyTimeoutMs,
      maxLogLines: Number(settings.logRingLines) || DEFAULTS.logRingLines,
    }),
  })

  // 面板与模型共用同一套服务；工具只是薄封装（M5）
  applyTools(ctx, { api })

  // webServer 是**可选**的：纯 CLI / headless profile 里没有它，
  // 这时插件应当照常激活（工具可用），只是没有 HTTP 路由。
  // 早期把它写进 inject 会让整个 profile 加载失败（"pending: waiting for service"）。
  ctx.effect(() => {
    const mount = (scoped) => {
      const webServer = scoped?.webServer
      if (webServer === undefined || typeof webServer.register !== 'function') return undefined
      const dispose = webServer.register({
        kind: 'prefix',
        path: '/mcdev/api',
        handler: async (req, res) => {
          const { pathname } = new URL(req.url ?? '/', 'http://dsh.internal')

          if (req.method === 'GET' && pathname === '/mcdev/api/ping') {
            writeJson(res, 200, { ok: true, version: VERSION, pid: process.pid })
            return
          }
          if (req.method !== 'POST') {
            writeJson(res, 405, { ok: false, error: { code: 'method', message: 'use POST' } })
            return
          }

          const method = pathname.startsWith('/mcdev/api/') ? pathname.slice('/mcdev/api/'.length) : ''
          if (method === '' || method.includes('/')) {
            writeJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown method "${method}"` } })
            return
          }
          const handler = Object.hasOwn(api, method) ? api[method] : undefined
          if (typeof handler !== 'function') {
            writeJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown method "${method}"` } })
            return
          }

          try {
            const payload = await readJsonBody(req)
            // 界面语言由客户端随请求带上：宿主 ctx 里没有 locale 服务（那是网页客户端那层）
            setLanguage(payload?.lang)
            const result = await handler(payload)
            writeJson(res, 200, { ok: true, result })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`[mcdev] ${method} failed: ${message}`)
            writeJson(res, 500, { ok: false, error: { code: 'internal', message } })
          }
        },
      })
      console.log('[mcdev] http routes mounted at /mcdev/api')
      return () => {
        try {
          dispose?.()
        } catch {
          /* 已经在卸载 */
        }
      }
    }

    if (typeof ctx.inject === 'function') {
      return ctx.inject(['webServer'], (scoped) => mount(scoped))
    }
    try {
      return mount(ctx)
    } catch {
      return undefined
    }
  }, 'mcdev: /mcdev/api routes')

  console.log(`[mcdev] host ready (${VERSION}) — /mcdev/api/{projects.scan,projects.detail,state.info}`)
  // 把状态目录打出来：查日志、确认 profile 隔离都靠这一行
  console.log(`[mcdev] state dir: ${stateDir()}${profileName() === undefined ? '（未识别 profile，沿用共用目录）' : `（profile: ${profileName()}）`}`)
}
