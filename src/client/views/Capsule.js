/**
 * 标题栏胶囊：状态点 + 选中目标名 + 一个启停按钮。点名字展开浮层选目标。
 *
 * 工作区跟着**当前会话**走：会话头 slot 会把 `sessionId` 与 `useSessions` 传给组件，
 * 我们从中取 cwd 再让宿主按这个目录扫描。早期版本只在挂载时扫一次、且宿主用的是
 * "最近创建的会话"，于是切会话后胶囊不会同步。
 * @module minecraft-dev-starter/client/Capsule
 */

import { useEffect, useRef } from 'react'
import { h } from '../lib/h.js'
import { IconPlay, IconStop } from '../lib/icons.js'
import { report } from '../lib/debug.js'
import { t } from '../lib/messages.js'
import { useLocale } from '../lib/useLocale.js'
import { capsuleParts, hasActiveLaunch, hasRunnableProject, selectedTarget } from '../lib/selection.js'
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
} from '../lib/state.js'
import { Flyout } from './Flyout.js'

/**
 * 入口：有会话标准工具（sessionId + useSessions）就按会话取 cwd，否则退回宿主默认。
 * @param {{ sessionId?: string, useSessions?: any }} [props]
 */
export function Capsule(props) {
  if (props?.useSessions === undefined) return h(CapsuleBody, { cwd: undefined })
  return h(SessionCapsule, props)
}

/**
 * 订阅当前会话的 cwd；会话切换时这里会重渲染，把新 root 交给下面的 body。
 * @param {{ sessionId?: string, useSessions: any }} props
 */
function SessionCapsule(props) {
  const cwd = props.useSessions((state) => state.byId?.[props.sessionId]?.cwd)
  return h(CapsuleBody, { cwd: typeof cwd === 'string' && cwd !== '' ? cwd : undefined })
}

/**
 * @param {{ cwd?: string }} props
 */
function CapsuleBody({ cwd }) {
  const state = useStoreState()
  const launches = useLaunches(5000)
  useLocale()
  const anchor = useRef(/** @type {HTMLDivElement | null} */ (null))
  const lastRoot = useRef(/** @type {string | undefined} */ (undefined))

  useEffect(() => {
    report('capsule.mounted')
    void loadStateInfo()
  }, [])

  // 会话切换 = 工作区切换：清掉上一个工作区的扫描结果再重新扫
  useEffect(() => {
    if (cwd === undefined) {
      if (lastRoot.current === undefined) void loadScan()
      return
    }
    if (lastRoot.current === cwd) return
    lastRoot.current = cwd
    store.set({ workspaceRoot: cwd, scan: undefined, selectedRoot: undefined, error: undefined })
    report('workspace.changed', { root: cwd })
    void loadScan({ root: cwd, refresh: true })
  }, [cwd])

  useEffect(() => {
    if (!state.flyoutOpen) return undefined
    const onPointerDown = (event) => {
      if (anchor.current !== null && anchor.current.contains(/** @type {Node} */ (event.target))) return
      store.set({ flyoutOpen: false })
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [state.flyoutOpen])

  // 没有可运行的工程、也没有在跑的实例时不占位：头上挂个"未检测到 MC 工程"只是噪音。
  // 扫描中（scan 还没有）同样不占位，避免先闪一下灰胶囊再消失。
  const hasWork = hasRunnableProject(state.scan?.projects) || hasActiveLaunch(launches.list)
  if (!hasWork && state.error === undefined) return null

  const project = selectedProject()
  const target = selectedTarget(project, state.selection)
  const running = project === undefined ? undefined : activeLaunchFor(project.root)
  const busy = launches.busy !== undefined
  const multipleProjects = (state.scan?.projects?.length ?? 0) > 1

  // 四种状态：错误（红）、启动中（黄，呼吸）、运行中（绿，呼吸）、空闲（灰）
  const tone =
    state.error !== undefined || launches.error !== undefined
      ? 'error'
      : running === undefined
        ? (project === undefined ? 'idle' : 'ok')
        : running.status === 'starting'
          ? 'warn'
          : 'ok'
  const parts = capsuleParts(project, target, { multipleProjects })
  const runningLabel = running === undefined ? undefined : running.label
  const title =
    launches.error ??
    state.error ??
    (project === undefined
      ? t('capsule.noProjectTitle', { root: state.workspaceRoot ?? '' })
      : t('capsule.title', {
          project: project.modName ?? project.name,
          root: project.root,
          target: target === undefined ? t('common.noTarget') : target.taskPath,
        }))

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
        h(
          'span',
          { className: 'mcdev-pill-text' },
          runningLabel !== undefined || parts.project === undefined
            ? undefined
            : [
                h('span', { key: 'project', className: 'mcdev-pill-project', title: parts.project }, parts.project),
                h('span', { key: 'sep', className: 'mcdev-pill-sep' }, '·'),
              ],
          h('span', { key: 'target', className: 'mcdev-pill-target' }, runningLabel ?? parts.target),
        ),
      ),
      running === undefined
        ? h(
            'button',
            {
              type: 'button',
              className: 'mcdev-run mcdev-run-icon',
              disabled: target === undefined || busy,
              title: target === undefined ? t('common.noTarget') : t('capsule.start', { target: target.taskPath }),
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
              title: t('capsule.stop', { target: running.taskPath }),
              onClick: () => void stopLaunch(running.id),
            },
            h('span', { className: 'mcdev-icon' }, h(IconStop, undefined)),
          ),
    ),
    state.flyoutOpen ? h(Flyout) : undefined,
  )
}
