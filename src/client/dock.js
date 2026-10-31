/**
 * 日志标签的落点选择。
 *
 * 右列属于 DSH 原生右侧栏；底部工作台是 dsh-better-sidebar 提供的。
 * 未安装 better-sidebar 时只能落在右侧栏，配置值在这种情况下被忽略。
 * @module minecraft-dev-starter/client/dock
 */

export const LOG_DOCK_RIGHT = 'right'
export const LOG_DOCK_BOTTOM = 'bottom'

/**
 * @param {{ logDock?: string } | undefined} config
 * @param {boolean} hasBetterSidebar
 * @returns {'right' | 'bottom'}
 */
export function chooseLogDock(config, hasBetterSidebar) {
  if (hasBetterSidebar !== true) return LOG_DOCK_RIGHT
  return config?.logDock === LOG_DOCK_BOTTOM ? LOG_DOCK_BOTTOM : LOG_DOCK_RIGHT
}
