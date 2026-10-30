/**
 * 工程浮层：列出工作区里的工程与它们能跑的目标。
 *
 * M1 阶段只读：目标是**徽标**不是按钮，避免看起来能点却没有反应。
 * @module minecraft-dev-starter/client/Flyout
 */

import { h } from './h.js'
import { kindLabel, projectSubtitle, projectTitle } from './format.js'
import { loadScan, store, useStoreState } from './state.js'
import { openDetailTab } from './runtime.js'

export function Flyout() {
  const state = useStoreState()
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
        { type: 'button', className: 'mcdev-link', onClick: () => loadScan({ refresh: true }) },
        state.loading ? '扫描中…' : '刷新',
      ),
    ),
    h('div', { className: 'mcdev-muted mcdev-code' }, state.scan?.root ?? '—'),
    state.error === undefined ? undefined : h('div', { className: 'mcdev-error', style: { marginTop: 6 } }, state.error),
    projects.length === 0 && state.error === undefined
      ? h('div', { className: 'mcdev-muted', style: { marginTop: 8 } }, state.loading ? '正在扫描…' : '没有找到 Gradle 工程')
      : undefined,
    projects.map((project) => h(ProjectRow, { key: project.root, project })),
    state.scan?.truncated === true ? h('div', { className: 'mcdev-warn', style: { marginTop: 8 } }, '扫描超出预算，结果可能不全') : undefined,
    h('div', { className: 'mcdev-divider' }),
    h('div', { className: 'mcdev-hint' }, '识别结果只读；启动能力在 M2 接入。'),
  )
}

/**
 * @param {{ project: Record<string, any> }} props
 */
function ProjectRow({ project }) {
  const state = useStoreState()
  const active = state.selectedRoot === project.root
  const targets = /** @type {Array<Record<string, any>>} */ (project.runTargets ?? [])

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
    targets.length === 0
      ? h('div', { className: 'mcdev-hint', style: { marginTop: 6 } }, '没有找到可运行目标')
      : h(
          'div',
          { className: 'mcdev-badges' },
          targets.map((target) =>
            h(
              'span',
              {
                key: `${target.module}:${target.task}`,
                className: 'mcdev-badge',
                'data-guessed': target.guessed === true ? 'true' : 'false',
                title: `${target.taskPath}${target.guessed === true ? '（按惯例推测，未验证）' : ''}`,
              },
              target.label,
              target.module !== undefined && target.module !== '.' ? h('span', { className: 'mcdev-badge-tag' }, target.module) : undefined,
            ),
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
