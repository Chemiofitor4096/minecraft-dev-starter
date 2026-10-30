/**
 * M0 探针（宿主半边）：证明插件能被 profile 加载、HTTP 路由能被客户端取到，
 * 并且能收回客户端上报的激活结果（不用肉眼看截图也能验证）。
 * 正式实现会在这里挂 ProjectScanner / LaunchService，见 doc/策划.md §5。
 * @module minecraft-dev-starter
 */

/** Cordis 插件名。 */
export const name = 'mcdev-host'

/** 需要宿主提供 Web 服务（dsh-host-webserver）。 */
export const inject = ['webServer']

/** 探针版本，客户端会把它显示出来，用来确认两边是同一份代码。 */
const VERSION = '0.0.1-m0'

/** 客户端上报的最近若干条记录（M0 验证用，正式实现不需要）。 */
const reports = []

/**
 * 读请求体（限长）。
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 64 * 1024) reject(new Error('body too large'))
    })
    req.on('end', () => {
      if (raw.length === 0) return resolve(undefined)
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
 * 写一个 JSON 响应。
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
 * 注册探针路由。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/mcdev/api',
        handler: async (req, res) => {
          const { pathname } = new URL(req.url ?? '/', 'http://dsh.internal')

          if (req.method === 'GET' && pathname === '/mcdev/api/ping') {
            writeJson(res, 200, {
              ok: true,
              version: VERSION,
              pid: process.pid,
              at: new Date().toISOString(),
            })
            return
          }

          // M0 专用：客户端把激活/注册结果回传。
          if (req.method === 'POST' && pathname === '/mcdev/api/report') {
            const body = await readJsonBody(req)
            reports.push({ at: new Date().toISOString(), body })
            if (reports.length > 20) reports.shift()
            console.log('[mcdev] client report:', JSON.stringify(body))
            writeJson(res, 200, { ok: true, stored: reports.length })
            return
          }

          if (req.method === 'GET' && pathname === '/mcdev/api/reports') {
            writeJson(res, 200, { ok: true, reports })
            return
          }

          writeJson(res, 404, { ok: false, error: 'not-found', path: pathname })
        },
      }),
    'mcdev: /mcdev/api routes',
  )
  console.log(`[mcdev] host half ready (${VERSION}) — GET /mcdev/api/ping`)
}
