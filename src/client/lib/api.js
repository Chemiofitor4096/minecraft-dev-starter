/**
 * 客户端 ↔ 宿主的唯一通道。
 *
 * 必须用**相对路径**：桌面版外壳的页面是 `dsh-app://app/`，由外壳把非静态路径
 * 转发给宿主；写成绝对 origin 会变成跨域（宿主不返回 CORS 头）。
 * 依据见 doc/调研-DSH插件机制.md §2.2。
 * @module minecraft-dev-starter/client/api
 */

import { activeLanguage, t } from './messages.js'

/**
 * @template T
 * @param {string} method
 * @param {unknown} [payload]
 * @returns {Promise<T>}
 */
export async function call(method, payload) {
  const response = await fetch(`/mcdev/api/${method}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    // lang：宿主侧没有 locale 服务，证据 / 警告 / 归因的文案靠它选语言
    body: JSON.stringify({ ...(payload ?? {}), lang: activeLanguage() }),
  })
  let body
  try {
    body = await response.json()
  } catch {
    throw new Error(t('error.httpNotJson', { status: response.status }))
  }
  if (body?.ok !== true) {
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
  }
  return body.result
}
