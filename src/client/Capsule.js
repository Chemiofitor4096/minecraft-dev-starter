/**
 * 标题栏胶囊：一个状态点 + 一行字。点开是工程浮层。
 *
 * 刻意做得窄：标题栏这一排已经有会话日志等控件，胶囊只回答"这个工作区里
 * 有没有 MC 工程、是什么"。
 * @module minecraft-dev-starter/client/Capsule
 */

import { useEffect, useRef } from 'react'
import { h } from './h.js'
import { capsuleLabel } from './format.js'
import { loadScan, store, useStoreState } from './state.js'
import { Flyout } from './Flyout.js'

export function Capsule() {
  const state = useStoreState()
  const anchor = useRef(/** @type {HTMLDivElement | null} */ (null))

  // 首次渲染时拉一次；之后由用户点"刷新"或切会话时重拉。
  useEffect(() => {
    loadScan()
  }, [])

  // 点外面关闭浮层
  useEffect(() => {
    if (!state.flyoutOpen) return undefined
    const onPointerDown = (event) => {
      if (anchor.current !== null && anchor.current.contains(/** @type {Node} */ (event.target))) return
      store.set({ flyoutOpen: false })
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [state.flyoutOpen])

  const projects = state.scan?.projects ?? []
  const label = state.error !== undefined ? 'MC 识别失败' : capsuleLabel(projects, state.selectedRoot)
  const dot = state.error !== undefined ? 'error' : projects.length > 0 ? 'ok' : 'idle'
  const tooltip = state.error ?? `${label}\n点击查看工程与运行目标`

  return h(
    'div',
    { className: 'mcdev-anchor', ref: anchor },
    h(
      'button',
      {
        type: 'button',
        className: 'mcdev-pill',
        title: tooltip,
        onClick: () => store.set({ flyoutOpen: !state.flyoutOpen }),
      },
      h('span', { className: 'mcdev-dot', 'data-state': dot }),
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, label),
    ),
    state.flyoutOpen ? h(Flyout) : undefined,
  )
}
