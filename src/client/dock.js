/**
 * 日志标签的落点选择。
 *
 * 右列属于 DSH 原生右侧栏；底部工作台是 dsh-better-sidebar 提供的。
 * 默认策略：**装了 better-sidebar 就落底部工作台**——它本来就是双工作台的设计，
 * 日志这种持续输出的面板放底部更合适；只有明确写 `logDock: right` 才回右侧栏。
 * 没装 better-sidebar 时一律右侧栏，配置值被忽略。
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
  if (config?.logDock === LOG_DOCK_RIGHT) return LOG_DOCK_RIGHT
  return LOG_DOCK_BOTTOM
}
