/**
 * 客户端运行时句柄。
 *
 * 用模块级对象而不是 props：slot 组件的注入约定会随版本变，
 * 而 `ctx` 在 apply 时就确定了，组件里读它最稳。
 * @module minecraft-dev-starter/client/runtime
 */

/** 右侧栏详情标签的 kind；与 index.js 的注册保持同一常量。 */
export const DETAIL_KIND = 'mcdev.detail'

/** @type {{ ctx?: any }} */
export const runtime = {}

/**
 * 打开右侧栏的工程详情标签（openTab 会顺带展开面板）。
 * @returns {boolean} 是否成功调用
 */
export function openDetailTab() {
  const sidebar = runtime.ctx?.sidebarRight
  if (sidebar === undefined) return false
  try {
    sidebar.openTab(DETAIL_KIND)
    return true
  } catch {
    return false
  }
}
