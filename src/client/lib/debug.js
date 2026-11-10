/**
 * 诊断上报：只在开发期用来回答"客户端到底走到哪一步"。
 * 生产不依赖它，失败也不影响功能。
 * @module minecraft-dev-starter/client/debug
 */

/** 每次页面加载只报一次，避免刷屏。 */
const reported = new Set()

/**
 * @param {string} event
 * @param {Record<string, unknown>} [detail]
 */
export function report(event, detail = {}) {
  if (reported.has(event)) return
  reported.add(event)
  try {
    fetch('/mcdev/api/client.report', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, detail }),
    }).catch(() => {})
  } catch {
    /* 上报失败无所谓 */
  }
}
