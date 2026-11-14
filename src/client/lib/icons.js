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
 * @param {string} [viewBox]
 */
function svg(size, children, viewBox = '0 0 16 16') {
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox,
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
 * 草方块：代表"模组工程"（侧边栏标签图标）。
 *
 * 不上色块，用 14 根线段拼出立方体：上面 9 根草绿（顶面 4 + 两条外竖线上半 + 两条分层线 + 前棱上半），
 * 下面 5 根泥土色（两条外竖线下半 + 底部两条 + 前棱下半）。分层取侧面高度 2.4，
 * 草皮薄、泥土厚，像草方块；草绿最后画，所以相接处绿色压在上面。
 *
 * 颜色是 Minecraft 的语义色，不随主题变；其余图标仍是 currentColor。
 */
const GRASS = '#87CE54'
const DIRT = '#C1885D'

/** 侧面上的草皮厚度（侧面总高 6.5）。 */
const LAYER = 2.4
const Y_OUTER = (4.85 + LAYER).toFixed(2)
const Y_FRONT = (7.6 + LAYER).toFixed(2)

export function IconGrassBlock({ size = 14 } = {}) {
  return svg(size, [
    // 先画泥土：相接处会被草绿盖住，视觉上草皮在上
    h('path', {
      key: 'dirt',
      d: `M2.5 ${Y_OUTER}V11.35M13.5 ${Y_OUTER}V11.35M2.5 11.35 8 13.95 13.5 11.35M8 ${Y_FRONT}V13.95`,
      stroke: DIRT,
      strokeWidth: 1.3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
    h('path', {
      key: 'grassTop',
      d: 'M8 2.1 13.5 4.85 8 7.6 2.5 4.85z',
      stroke: GRASS,
      strokeWidth: 1.3,
      strokeLinejoin: 'round',
    }),
    h('path', {
      key: 'grassSides',
      d: `M2.5 4.85V${Y_OUTER}M13.5 4.85V${Y_OUTER}M2.5 ${Y_OUTER} 8 ${Y_FRONT} 13.5 ${Y_OUTER}M8 7.6V${Y_FRONT}`,
      stroke: GRASS,
      strokeWidth: 1.3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  ])
}

/**
 * 卷轴：代表"运行日志"（侧边栏标签图标）。
 * 图形来自用户提供的 1024 栅格实心卷轴，只把填充色换成 `currentColor`。
 */
export function IconScroll({ size = 14 } = {}) {
  return svg(
    size,
    [
      h('path', {
        key: 'scroll',
        d: 'M864 672v64a96 96 0 0 1-96 96H384a96 96 0 0 1-96-96V416H192a32 32 0 0 1-31.776-28.256L160 384V288a96 96 0 0 1 96-96h416a96 96 0 0 1 96 96v352h64a32 32 0 0 1 32 32zM672 256H346.56c3.52 10.016 5.44 20.8 5.44 32v448a32 32 0 0 0 64 0v-64a32 32 0 0 1 32-32h256V288a32 32 0 0 0-32-32z m-192 448v32c0 11.232-1.92 22.016-5.472 32H768a32 32 0 0 0 32-32v-32H480zM256 256a32 32 0 0 0-32 32v64h64V288a32 32 0 0 0-28.256-31.776L256 256z',
        fill: 'currentColor',
      }),
    ],
    '52 52 920 920',
  )
}
