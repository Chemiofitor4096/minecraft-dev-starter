/**
 * 客户端运行时句柄。
 *
 * 用模块级对象而不是 props：slot 组件的注入约定会随版本变，
 * 而 `ctx` 在 apply 时就确定了，组件里读它最稳。
 * @module minecraft-dev-starter/client/runtime
 */

/** 右侧栏「MC 工程」详情标签的 kind。 */
export const DETAIL_KIND = 'mcdev.detail'

/** 右侧栏「运行日志」标签的 kind。 */
export const LOG_KIND = 'mcdev.logs'

/** @type {{ ctx?: any }} */
export const runtime = {}

/**
 * @param {string} kind
 * @returns {boolean}
 */
function open(kind) {
  const sidebar = runtime.ctx?.sidebarRight
  if (sidebar === undefined) return false
  try {
    sidebar.openTab(kind)
    return true
  } catch {
    return false
  }
}

/** 打开工程详情标签（openTab 会顺带展开面板）。 */
export function openDetailTab() {
  return open(DETAIL_KIND)
}

/** 打开运行日志标签。 */
export function openLogTab() {
  return open(LOG_KIND)
}
