/**
 * 客户端运行时句柄。
 *
 * 用模块级对象而不是 props：slot 组件的注入约定会随版本变，
 * 而 `ctx` 在 apply 时就确定了，组件里读它最稳。
 * @module minecraft-dev-starter/client/runtime
 */

import { chooseLogDock, LOG_DOCK_BOTTOM } from './dock.js'

/** 右侧栏「Mod Dev」详情标签的 kind。 */
export const DETAIL_KIND = 'mcdev.detail'

/** 右侧栏「运行日志」标签的 kind。 */
export const LOG_KIND = 'mcdev.logs'

/** 向 dsh-better-sidebar 注册时用的 tab id；打开底部工作台需要同一个 id。 */
export const BETTER_DETAIL_ID = 'minecraft-dev-starter:project'
export const BETTER_LOG_ID = 'minecraft-dev-starter:logs'

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

/**
 * 取可选的 better-sidebar 服务；未安装时返回 undefined（不抛错）。
 * @returns {any}
 */
export function betterSidebar() {
  try {
    return runtime.ctx?.get?.('betterSidebar', false)
  } catch {
    return undefined
  }
}

/** 打开工程详情标签（openTab 会顺带展开面板）。 */
export function openDetailTab() {
  return open(DETAIL_KIND)
}

/**
 * 打开运行日志标签。
 *
 * 落点由配置 `logDock` 决定：`bottom` 且装了 better-sidebar 时落到底部工作台，
 * 其余情况一律落原生右侧栏。配置由调用方传入，避免 runtime ←→ state 循环依赖。
 * @param {{ logDock?: string } | undefined} [config]
 */
export function openLogTab(config) {
  const service = betterSidebar()
  if (chooseLogDock(config, service !== undefined) === LOG_DOCK_BOTTOM) {
    try {
      service.openTab({ type: BETTER_LOG_ID, title: '运行日志', target: 'bottom' })
      return true
    } catch {
      /* 落底部失败就退回右侧栏，不吞掉日志入口 */
    }
  }
  return open(LOG_KIND)
}
