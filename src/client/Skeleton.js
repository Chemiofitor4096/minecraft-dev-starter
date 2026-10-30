/**
 * 骨架占位：扫描或加载中时给几行灰条，避免面板一片空白。
 * @module minecraft-dev-starter/client/Skeleton
 */

import { h } from './h.js'

/**
 * @param {{ rows?: number, hint?: string }} [props]
 */
export function Skeleton({ rows = 3, hint } = {}) {
  return h(
    'div',
    { className: 'mcdev-skeleton', 'aria-busy': 'true' },
    Array.from({ length: rows }, (_value, index) => h('div', { key: index, className: 'mcdev-skeleton-row' })),
    hint === undefined ? undefined : h('div', { className: 'mcdev-hint' }, hint),
  )
}
