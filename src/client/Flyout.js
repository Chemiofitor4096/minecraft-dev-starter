/**
 * 工程浮层：三层结构——表头固定、工程列表滚动、选中工程的运行目标固定在底部。
 *
 * 这样选工程只改底部选择区，列表每行高度恒定，不会出现"点一下整块跳一下"。
 * 每行不再挂按钮：点行 = 选中；详情与刷新各只有一处。
 *
 * @module minecraft-dev-starter/client/Flyout
 */

import { h } from './h.js'
import { kindLabel, projectSubtitle } from './format.js'
import { IconChevronRight, IconRefresh } from './icons.js'
import { groupByModule, selectedTarget, targetKey } from './selection.js'
import { Skeleton } from './Skeleton.js'
import { loadScan, selectTarget, store, useLaunches, useStoreState } from './state.js'
import { openDetailTab } from './runtime.js'

export function Flyout() {
  const state = useStoreState()
  const launches = useLaunches(1500)
  const projects = state.scan?.projects ?? []
  const current = projects.find((project) => project.root === state.selectedRoot) ?? projects[0]
  const running = launches.list.find(
    (entry) =>
      (entry.status === 'starting' || entry.status === 'running') &&
      String(entry.root).toLowerCase() === String(current?.root ?? '').toLowerCase(),
  )

  return h(
    'div',
    { className: 'mcdev-flyout', role: 'dialog', 'aria-label': 'MC 工程' },

    // ① 表头：与列表之间有一条通栏分割线，滚动时不动
    h(
      'div',
      { className: 'mcdev-flyout-head' },
      h(
        'div',
        { className: 'mcdev-row', style: { justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { className: 'mcdev-title' }, 'MC 工程'),
        h(
          'button',
          {
            type: 'button',
            className: 'mcdev-mini mcdev-mini-icon',
            title: state.loading ? '扫描中…' : '重新扫描工作区',
            disabled: state.loading,
            onClick: () => loadScan({ refresh: true }),
          },
          h('span', { className: 'mcdev-icon' }, h(IconRefresh, { size: 12 })),
        ),
      ),
      h('div', { className: 'mcdev-muted mcdev-code mcdev-ellipsis', title: state.scan?.root ?? '' }, state.scan?.root ?? '—'),
      state.error === undefined ? undefined : h('div', { className: 'mcdev-error' }, state.error),
      launches.error === undefined ? undefined : h('div', { className: 'mcdev-error' }, launches.error),
    ),

    // ② 列表：每行只有名字与 loader/版本，高度恒定
    h(
      'div',
      { className: 'mcdev-flyout-list' },
      projects.length === 0
        ? state.loading
          ? h(Skeleton, { rows: 3, hint: '正在扫描工作区…' })
          : h('div', { className: 'mcdev-hint', style: { padding: '10px 4px' } }, '没有找到 Gradle 工程')
        : projects.map((project) =>
            h(
              'button',
              {
                key: project.root,
                type: 'button',
                className: 'mcdev-list-row',
                'data-current': project.root === current?.root ? 'true' : 'false',
                title: `${project.root}\n${kindLabel(project.kind)}`,
                onClick: () => store.set({ selectedRoot: project.root }),
              },
              h('span', { className: 'mcdev-list-name' }, project.modName ?? project.name ?? project.root),
              h('span', { className: 'mcdev-list-meta' }, projectSubtitle(project)),
            ),
          ),
    ),

    // ③ 选择区：选中工程的目标，位置固定
    h(
      'div',
      { className: 'mcdev-flyout-pane' },
      current === undefined
        ? undefined
        : [
            h(
              'div',
              { className: 'mcdev-row', style: { justifyContent: 'space-between', alignItems: 'center' } },
              h(
                'span',
                { className: 'mcdev-ellipsis', style: { minWidth: 0 } },
                h('span', { className: 'mcdev-muted' }, '运行目标'),
                running === undefined
                  ? undefined
                  : h(
                      'span',
                      { className: 'mcdev-inline-status' },
                      h('span', { className: 'mcdev-dot', 'data-state': 'ok', 'data-pulse': 'true' }),
                      `${running.label} 运行中 · ${elapsed(running.startedAt)}`,
                    ),
              ),
              h(
                'button',
                { type: 'button', className: 'mcdev-mini', onClick: () => openDetailTab() },
                '详情',
                h('span', { className: 'mcdev-icon' }, h(IconChevronRight, { size: 12 })),
              ),
            ),
            renderTargets(current, state.selection, running !== undefined),
          ],
    ),
  )
}

/**
 * @param {Record<string, any>} project
 * @param {Record<string, string>} selection
 * @param {boolean} locked 有实例在跑时不允许换目标
 */
function renderTargets(project, selection, locked) {
  const targets = /** @type {Array<Record<string, any>>} */ (project.runTargets ?? [])
  if (targets.length === 0) return h('div', { className: 'mcdev-hint', style: { marginTop: 6 } }, '没有找到可运行目标')

  const chosen = selectedTarget(project, selection)
  const groups = groupByModule(targets)

  return h(
    'div',
    { className: 'mcdev-options' },
    groups.map((group) =>
      h(
        'div',
        { key: group.module, className: 'mcdev-option-group' },
        groups.length > 1 ? h('div', { className: 'mcdev-option-module' }, group.module) : undefined,
        group.targets.map((target) =>
          h(
            'label',
            { key: targetKey(target), className: `mcdev-option${locked ? ' is-disabled' : ''}`, title: target.taskPath },
            h('input', {
              type: 'radio',
              className: 'mcdev-radio',
              name: `mcdev-${project.root}`,
              checked: chosen !== undefined && targetKey(chosen) === targetKey(target),
              disabled: locked,
              onChange: () => selectTarget(project.root, targetKey(target)),
            }),
            h('span', { className: 'mcdev-option-label' }, target.label),
            target.guessed === true
              ? h('span', { className: 'mcdev-badge', 'data-guessed': 'true', title: '按 loader 惯例推测，尚未验证' }, '未验证')
              : undefined,
          ),
        ),
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
