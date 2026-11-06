/**
 * 跟随宿主语言的重绘钩子。
 *
 * `t()` 在调用时才读当前语言，所以**只要组件重绘一次，文案就会切过去**；
 * 问题在于语言切换本身不是我们组件的 state 变化，React 不会自己重绘。
 * 这里订阅宿主的 locale 服务（`ctx.locale.subscribe` / `getSnapshot().active`），
 * 把「当前语言」变成组件的外部 store——切语言时面板、浮层、胶囊、日志一起换。
 *
 * 宿主没有 locale 服务时（纯浏览器 / 测试）退化成空订阅，不报错。
 * @module minecraft-dev-starter/client/useLocale
 */

import { useCallback, useSyncExternalStore } from 'react'
import { localeSource } from './messages.js'

/**
 * 订阅宿主语言并在变化时重绘当前组件。
 * @returns {string} 当前语言（仅用于建立依赖，文案仍由 t() 取）
 */
export function useLocale() {
  const source = localeSource()
  const subscribe = useCallback((callback) => source.subscribe(callback), [source])
  const snapshot = useCallback(() => source.snapshot(), [source])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
