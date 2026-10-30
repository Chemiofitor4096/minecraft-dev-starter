/**
 * 工程浮层：按模块分组列出目标，单选一个；真正启动由胶囊的 ▶ 负责。
 *
 * 为什么单选而不是每行一个按钮：同一个工程同时只能跑一个实例（服务端强制），
 * 摆一排按钮只会让人以为能并行点。列表在这里表达"选哪个"，动作在胶囊上。
 * @module minecraft-dev-starter/client/Flyout
 */

import { h } from './h.js'
import { kindLabel, projectSubtitle, projectTitle } from './format.js'
import { IconRefresh } from './icons.js'
import { groupByModule, selectedTarget, targetKey } from './selection.js'
import { Skeleton } from './Skeleton.js'
import { activeLaunchFor, loadScan, selectTarget, store, useLaunches, useStoreState } from './state.js'
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
      h(
        'button',
        { type: 'button', className: 'mcdev-link mcdev-icon-text', onClick: () => loadScan({ refresh: true }) },
        h('span', { className: 'mcdev-icon' }, h(IconRefresh, undefined)),
        state.loading ? '扫描中…' : '刷新',
      ),
    ),
    h('div', { className: 'mcdev-muted mcdev-code' }, state.scan?.root ?? '—'),
    state.error === undefined ? undefined : h('div', { className: 'mcdev-error', style: { marginTop: 6 } }, state.error),
    launches.error === undefined ? undefined : h('div', { className: 'mcdev-error', style: { marginTop: 6 } }, launches.error),
    projects.length === 0 && state.error === undefined
      ? state.loading
        ? h(Skeleton, { rows: 3, hint: '正在扫描工作区…' })
        : h('div', { className: 'mcdev-muted', style: { marginTop: 8 } }, '没有找到 Gradle 工程')
      : undefined,
    projects.map((project) => h(ProjectBlock, { key: project.root, project, launches, selection: state.selection })),
    state.scan?.truncated === true ? h('div', { className: 'mcdev-warn', style: { marginTop: 8 } }, '扫描超出预算，结果可能不全') : undefined,
    h('div', { className: 'mcdev-divider' }),
    h('div', { className: 'mcdev-hint' }, '选中目标后用标题栏的 ▶ 启动；同一工程同时只能跑一个。'),
  )
}

/**
 * 一个工程。
 *
 * 单选只属于「当前工程」——一个工作区里每个工程各记着自己的目标，
 * 如果全都画出单选，看起来就像"全都选中了"，反而是最容易被误读的地方。
 * 非当前工程收成一行摘要 + 一个"切到这里"，点了才展开它的单选。
 *
 * @param {{ project: Record<string, any>, launches: ReturnType<typeof useLaunches>, selection: Record<string, string> }} props
 */
function ProjectBlock({ project, launches, selection }) {
  const state = useStoreState()
  const active = state.selectedRoot === project.root
  const targets = /** @type {Array<Record<string, any>>} */ (project.runTargets ?? [])
  const groups = groupByModule(targets)
  const chosen = selectedTarget(project, selection)
  const running = launches.list.find(
    (entry) =>
      String(entry.root).toLowerCase() === String(project.root).toLowerCase() &&
      (entry.status === 'starting' || entry.status === 'running'),
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
      h(
        'span',
        { className: 'mcdev-row', style: { gap: 6, minWidth: 0 } },
        h('span', { className: 'mcdev-title', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, projectTitle(project)),
        active ? h('span', { className: 'mcdev-badge' }, '当前') : undefined,
      ),
      h('span', { className: 'mcdev-muted' }, kindLabel(project.kind)),
    ),
    h('div', { className: 'mcdev-sub' }, projectSubtitle(project)),
    running === undefined
      ? undefined
      : h(
          'div',
          { className: 'mcdev-status' },
          h('span', { className: 'mcdev-dot', 'data-state': 'ok', 'data-pulse': 'true' }),
          ` ${running.label} ${running.status === 'starting' ? '启动中' : '运行中'} · ${elapsed(running.startedAt)}`,
        ),
    targets.length === 0
      ? h('div', { className: 'mcdev-hint', style: { marginTop: 6 } }, '没有找到可运行目标')
      : active
        ? h(
            'div',
            { className: 'mcdev-options' },
            groups.map((group) =>
              h(
                'div',
                { key: group.module, className: 'mcdev-option-group' },
                groups.length > 1 ? h('div', { className: 'mcdev-option-module' }, group.module) : undefined,
                group.targets.map((target) => {
                  const checked = chosen !== undefined && targetKey(chosen) === targetKey(target)
                  return h(
                    'label',
                    {
                      key: targetKey(target),
                      className: `mcdev-option${running === undefined ? '' : ' is-disabled'}`,
                      title: target.taskPath,
                    },
                    h('input', {
                      type: 'radio',
                      className: 'mcdev-radio',
                      name: `mcdev-${project.root}`,
                      checked,
                      disabled: running !== undefined,
                      onChange: () => selectTarget(project.root, targetKey(target)),
                    }),
                    h('span', { className: 'mcdev-option-label' }, target.label),
                    target.guessed === true ? h('span', { className: 'mcdev-badge', 'data-guessed': 'true', title: '按 loader 惯例推测，尚未验证' }, '未验证') : undefined,
                  )
                }),
              ),
            ),
          )
        : h(
            'div',
            { className: 'mcdev-row', style: { justifyContent: 'space-between', gap: 8, marginTop: 6 } },
            h('span', { className: 'mcdev-hint' }, `目标 ${chosen?.label ?? '—'}${targets.length > 1 ? `（共 ${targets.length} 个）` : ''}`),
            h(
              'button',
              {
                type: 'button',
                className: 'mcdev-link',
                onClick: (event) => {
                  event.stopPropagation()
                  store.set({ selectedRoot: project.root })
                },
              },
              '切到这里',
            ),
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
