/**
 * 标题栏胶囊：状态点 + 选中目标名 + 一个启停按钮。点名字展开浮层选目标。
 *
 * 只做三件事——告诉人现在选的是哪个目标、它跑没跑、点了会不会动。
 * @module minecraft-dev-starter/client/Capsule
 */

import { useEffect, useRef } from 'react'
import { h } from './h.js'
import { IconPlay, IconStop } from './icons.js'
import { report } from './debug.js'
import { capsuleSummary, selectedTarget } from './selection.js'
import {
  activeLaunchFor,
  loadScan,
  loadStateInfo,
  selectedProject,
  startTarget,
  stopLaunch,
  store,
  useLaunches,
  useStoreState,
} from './state.js'
import { Flyout } from './Flyout.js'

export function Capsule() {
  const state = useStoreState()
  const launches = useLaunches(5000)
  const anchor = useRef(/** @type {HTMLDivElement | null} */ (null))

  useEffect(() => {
    report('capsule.mounted')
    void loadStateInfo()
    loadScan()
  }, [])

  useEffect(() => {
    if (!state.flyoutOpen) return undefined
    const onPointerDown = (event) => {
      if (anchor.current !== null && anchor.current.contains(/** @type {Node} */ (event.target))) return
      store.set({ flyoutOpen: false })
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [state.flyoutOpen])

  const project = selectedProject()
  const target = selectedTarget(project, state.selection)
  const running = project === undefined ? undefined : activeLaunchFor(project.root)
  const busy = launches.busy !== undefined
  const multipleProjects = (state.scan?.projects?.length ?? 0) > 1

  const tone = running !== undefined ? 'ok' : state.error !== undefined || launches.error !== undefined ? 'error' : project === undefined ? 'idle' : 'ok'
  const label = running !== undefined ? running.label : capsuleSummary(project, target, { multipleProjects })
  const title =
    launches.error ??
    state.error ??
    (project === undefined
      ? '没有识别到 MC 工程'
      : `${project.modName ?? project.name}\n${project.root}\n${target === undefined ? '没有可运行目标' : target.taskPath}`)

  return h(
    'div',
    { className: 'mcdev-anchor', ref: anchor },
    h(
      'div',
      { className: 'mcdev-capsule' },
      h(
        'button',
        { type: 'button', className: 'mcdev-pill', title, onClick: () => store.set({ flyoutOpen: !state.flyoutOpen }) },
        h('span', { className: 'mcdev-dot', 'data-state': tone, 'data-pulse': running === undefined ? 'false' : 'true' }),
        h('span', { className: 'mcdev-pill-text' }, label),
      ),
      running === undefined
        ? h(
            'button',
            {
              type: 'button',
              className: 'mcdev-run mcdev-run-icon',
              disabled: target === undefined || busy,
              title: target === undefined ? '没有可运行目标' : `启动 ${target.taskPath}`,
              onClick: () => {
                if (project !== undefined && target !== undefined) void startTarget(project, target)
              },
            },
            h('span', { className: 'mcdev-icon' }, h(IconPlay, undefined)),
          )
        : h(
            'button',
            {
              type: 'button',
              className: 'mcdev-run mcdev-run-icon',
              'data-tone': 'stop',
              disabled: busy,
              title: `停止 ${running.taskPath}`,
              onClick: () => void stopLaunch(running.id),
            },
            h('span', { className: 'mcdev-icon' }, h(IconStop, undefined)),
          ),
    ),
    state.flyoutOpen ? h(Flyout) : undefined,
  )
}
