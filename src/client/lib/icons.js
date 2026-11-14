/**
 * 手绘图标：16px 栅格、1.5 描边、`currentColor`，和系统图标同一套视觉语言。
 *
 * 为什么不 import `@deepseek-ai/dsh-client-ui-primitives`：我们的客户端包是
 * 懒 CJS，顶层 `require` 一旦在某个运行时里解析不到，整个 bundle 都会挂。
 * `dsh-better-sidebar` 对库里没有的字形也是自己画 SVG，这里沿用同一做法。
 *
 * @module minecraft-dev-starter/client/icons
 */

import { h } from './h.js'

/**
 * @param {number} size
 * @param {Array<any>} children
 */
function svg(size, children) {
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    ...children,
  )
}

/** 播放：实心三角，和系统的 run 语义一致。 */
export function IconPlay({ size = 13 } = {}) {
  return svg(size, [h('path', { key: 'p', d: 'M5.5 3.4v9.2l7.2-4.6z', fill: 'currentColor' })])
}

/** 停止：圆角方块。 */
export function IconStop({ size = 13 } = {}) {
  return svg(size, [h('rect', { key: 'r', x: 4.2, y: 4.2, width: 7.6, height: 7.6, rx: 1.4, fill: 'currentColor' })])
}

/** 刷新：缺口圆 + 箭头。 */
export function IconRefresh({ size = 13 } = {}) {
  return svg(size, [
    h('path', {
      key: 'a',
      d: 'M13 8a5 5 0 1 1-1.46-3.54',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    }),
    h('path', {
      key: 'b',
      d: 'M13 2.9v3.3h-3.3',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  ])
}

/** 警告：三角 + 感叹号。 */
export function IconWarning({ size = 13 } = {}) {
  return svg(size, [
    h('path', {
      key: 'a',
      d: 'M8 2.4 14 13H2z',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinejoin: 'round',
    }),
    h('path', { key: 'b', d: 'M8 6.4v3.1', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
    h('circle', { key: 'c', cx: 8, cy: 11.5, r: 0.85, fill: 'currentColor' }),
  ])
}

/** 展开：下箭头（浮层入口提示用不到时也留着，保持图标集完整）。 */
export function IconChevronDown({ size = 13 } = {}) {
  return svg(size, [
    h('path', {
      key: 'a',
      d: 'm4.5 6.5 3.5 3.5 3.5-3.5',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  ])
}

/** 前进：右箭头，用于"详情"这类进入动作。 */
export function IconChevronRight({ size = 13 } = {}) {
  return svg(size, [
    h('path', {
      key: 'a',
      d: 'm6.5 4.5 3.5 3.5-3.5 3.5',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  ])
}

/** 勾选：用于"切换到此工程"这类确认动作。 */
export function IconCheck({ size = 13 } = {}) {
  return svg(size, [
    h('path', {
      key: 'a',
      d: 'm3.8 8.4 2.7 2.7 5.7-6',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  ])
}

/** 信息：环形 i，用来替代页面里的说明文字（tooltip 放 title）。 */
export function IconInfo({ size = 12 } = {}) {
  return svg(size, [
    h('circle', { key: 'a', cx: 8, cy: 8, r: 6, stroke: 'currentColor', strokeWidth: 1.3 }),
    h('path', { key: 'b', d: 'M8 7.2v3.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
    h('circle', { key: 'c', cx: 8, cy: 5.2, r: 0.85, fill: 'currentColor' }),
  ])
}

/**
 * 草方块配色：草绿在上、泥土在下。这是图标集里唯一的实色——
 * 它模仿 Minecraft 的草方块，靠色块区分面，和面板里的语义色无关。
 */
const GRASS = '#87CE54'
const GRASS_SHADE = '#74B84A'
const DIRT = '#C1885D'
const DIRT_SHADE = '#A9724C'

/**
 * 草方块：代表"模组工程"（侧边栏标签图标）。
 *
 * 三个面只靠色差分层，不画接缝描边——14px 下描边会把面糊在一起；
 * 草皮往下带一点点，才有草方块的样子，而不是一个纯色立方体。
 */
export function IconGrassBlock({ size = 14 } = {}) {
  return svg(size, [
    h('path', { key: 'top', d: 'M8 1.9 13.9 5 8 8.1 2.1 5z', fill: GRASS }),
    h('path', { key: 'left', d: 'M2.1 5 8 8.1v6.1L2.1 11.1z', fill: DIRT }),
    h('path', { key: 'right', d: 'M8 8.1 13.9 5v6.1L8 14.2z', fill: DIRT_SHADE }),
    h('path', { key: 'leftGrass', d: 'M2.1 5 8 8.1v1.35L2.1 6.35z', fill: GRASS }),
    h('path', { key: 'rightGrass', d: 'M8 8.1 13.9 5v1.35L8 9.45z', fill: GRASS_SHADE }),
  ])
}

/** 卷轴：代表"运行日志"（侧边栏标签图标）。上下两根卷轴杆，中间是纸。 */
export function IconScroll({ size = 14 } = {}) {
  return svg(size, [
    h('rect', { key: 'top', x: 2.4, y: 2, width: 11.2, height: 2.6, rx: 1.3, stroke: 'currentColor', strokeWidth: 1.3 }),
    h('rect', {
      key: 'bottom',
      x: 2.4,
      y: 11.4,
      width: 11.2,
      height: 2.6,
      rx: 1.3,
      stroke: 'currentColor',
      strokeWidth: 1.3,
    }),
    h('path', { key: 'edges', d: 'M4.4 4.6v6.8M11.6 4.6v6.8', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
    h('path', { key: 'text', d: 'M6 7h4M6 8.8h2.6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
  ])
}
