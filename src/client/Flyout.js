/**
 * 工程浮层：列出工作区里的工程，并给每个可运行目标一个真按钮。
 *
 * 并发规则（服务端强制）：同一工程同时只能有一个实例；所以有实例在跑时，
 * 其它目标的按钮禁用并说明原因，运行中的那个变成"停止"。
 * @module minecraft-dev-starter/client/Flyout
 */

import { h } from './h.js'
import { kindLabel, projectSubtitle, projectTitle } from './format.js'
import {
  activeLaunchFor,
  loadScan,
  startTarget,
  stopLaunch,
  store,
  useLaunches,
  useStoreState,
} from './state.js'
import { openDetailTab } from './runtime.js'

export function Flyout() {
  const state = useStoreState()
  const launches = useLaunches(1500)
  const projects = state.scan?.projects ?? []

  return h(
    'div',
    { className: 'mcdev-flyout', role: 'dialog', 'aria-label': 'MC 工程' },
    h(
      'div',
      { className: 'mcdev-row', style: { justifyContent: 'space-between', alignItems: 'center' } },
      h('span', { className: 'mcdev-title' }, '工作区 MC 工程'),
      h('button', { type: 'button', className: 'mcdev-link', onClick: () => loadScan({ refresh: true }) }, state.loading ? '扫描中…' : '刷新'),
    ),
    h('div', { className: 'mcdev-muted mcdev-code' }, state.scan?.root ?? '—'),
    state.error === undefined ? undefined : h('div', { className: 'mcdev-error', style: { marginTop: 6 } }, state.error),
    launches.error === undefined ? undefined : h('div', { className: 'mcdev-error', style: { marginTop: 6 } }, launches.error),
    projects.length === 0 && state.error === undefined
      ? h('div', { className: 'mcdev-muted', style: { marginTop: 8 } }, state.loading ? '正在扫描…' : '没有找到 Gradle 工程')
      : undefined,
    projects.map((project) => h(ProjectRow, { key: project.root, project, launches })),
    state.scan?.truncated === true ? h('div', { className: 'mcdev-warn', style: { marginTop: 8 } }, '扫描超出预算，结果可能不全') : undefined,
    h('div', { className: 'mcdev-divider' }),
    h('div', { className: 'mcdev-hint' }, '同一工程同时只能跑一个目标；日志在右侧栏「MC 工程」标签里。'),
  )
}

/**
 * @param {{ project: Record<string, any>, launches: ReturnType<typeof useLaunches> }} props
 */
function ProjectRow({ project, launches }) {
  const state = useStoreState()
  const active = state.selectedRoot === project.root
  const targets = /** @type {Array<Record<string, any>>} */ (project.runTargets ?? [])
  const running = launches.list.find(
    (entry) => String(entry.root).toLowerCase() === String(project.root).toLowerCase() && (entry.status === 'starting' || entry.status === 'running'),
  )

  return h(
    'div',
    {
      className: `mcdev-project${active ? ' is-active' : ''}`,
      onMouseDown: () => store.set({ selectedRoot: project.root }),
    },
    h(
      'div',
      { className: 'mcdev-row', style: { justifyContent: 'space-between', gap: 8 } },
      h('span', { className: 'mcdev-title', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, projectTitle(project)),
      h('span', { className: 'mcdev-muted' }, kindLabel(project.kind)),
    ),
    h('div', { className: 'mcdev-sub' }, projectSubtitle(project)),
    running === undefined ? undefined : h('div', { className: 'mcdev-status' }, `● ${running.label} ${running.status === 'starting' ? '启动中' : '运行中'} · ${elapsed(running.startedAt)}`),
    targets.length === 0
      ? h('div', { className: 'mcdev-hint', style: { marginTop: 6 } }, '没有找到可运行目标')
      : h(
          'div',
          { className: 'mcdev-actions' },
          targets.map((target) => {
            const isRunning = running !== undefined && running.taskPath === target.taskPath
            const busy = launches.busy === `${project.root}:${target.taskPath}` || launches.busy === running?.id
            if (isRunning) {
              return h(
                'button',
                {
                  key: target.taskPath,
                  type: 'button',
                  className: 'mcdev-run',
                  'data-tone': 'stop',
                  disabled: busy === true,
                  onClick: () => stopLaunch(running.id),
                  title: `停止 ${target.taskPath}`,
                },
                '⏹ 停止',
              )
            }
            return h(
              'button',
              {
                key: target.taskPath,
                type: 'button',
                className: 'mcdev-run',
                disabled: busy === true || running !== undefined,
                title: running !== undefined ? '这个工程已经有实例在跑，先停掉它' : target.taskPath,
                onClick: () => startTarget(project, target),
              },
              `▶ ${target.label}`,
            )
          }),
        ),
    h(
      'div',
      { style: { marginTop: 6 } },
      h(
        'button',
        {
          type: 'button',
          className: 'mcdev-link',
          onClick: () => {
            store.set({ selectedRoot: project.root })
            openDetailTab()
          },
        },
        '查看详情',
      ),
    ),
  )
}

/**
 * @param {string} startedAt
 * @returns {string}
 */
function elapsed(startedAt) {
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return '—'
  const seconds = Math.max(0, Math.round((Date.now() - started) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`
}
