/**
 * 工程浮层。两种形态：
 *
 * - **多工程**：三层结构——表头固定、工程列表滚动、选中工程的目标固定在底部。
 *   列表按"能不能跑"分组：可运行的在上，识别不出 loader / 没有目标的收进"其他"，
 *   默认折叠。工程多了给搜索框，重名工程补目录名区分。
 * - **单工程**（更常见）：跳过列表，表头直接显示工程名与 loader/版本，底下就是目标；
 *   少一层选择，也少一次点击。
 *
 * @module minecraft-dev-starter/client/Flyout
 */

import { useState } from 'react'
import { h } from './h.js'
import { kindLabel, listRows, loaderLabel, PANEL_TITLE, projectSubtitle, projectTitle } from './format.js'
import { IconChevronDown, IconChevronRight, IconRefresh } from './icons.js'
import { groupByModule, selectedTarget, targetKey } from './selection.js'
import { Skeleton } from './Skeleton.js'
import { loadScan, selectTarget, store, useLaunches, useStoreState } from './state.js'
import { openDetailTab } from './runtime.js'

/** 工程多到这个数才给搜索框：再少的话列表一眼扫完，输入框只是噪音。 */
const SEARCH_THRESHOLD = 8

export function Flyout() {
  const state = useStoreState()
  const launches = useLaunches(1500)
  const [query, setQuery] = useState('')
  const [showOthers, setShowOthers] = useState(false)

  const projects = state.scan?.projects ?? []
  const current = projects.find((project) => project.root === state.selectedRoot) ?? projects[0]
  const single = projects.length === 1
  const running = launches.list.find(
    (entry) =>
      (entry.status === 'starting' || entry.status === 'running') &&
      String(entry.root).toLowerCase() === String(current?.root ?? '').toLowerCase(),
  )

  const needle = query.trim().toLowerCase()
  const matches = (project) =>
    needle === '' ||
    [project.root, project.name, project.modName, loaderLabel(project.loader), project.minecraftVersion]
      .filter((value) => value !== undefined)
      .some((value) => String(value).toLowerCase().includes(needle))

  const visible = projects.filter(matches)
  const runnable = visible.filter((project) => (project.runTargets ?? []).length > 0)
  const others = visible.filter((project) => (project.runTargets ?? []).length === 0)
  const othersOpen = showOthers || needle !== ''

  return h(
    'div',
    { className: 'mcdev-flyout', role: 'dialog', 'aria-label': PANEL_TITLE },

    // ① 表头：与列表之间有一条通栏分割线，滚动时不动
    h(
      'div',
      { className: 'mcdev-flyout-head' },
      h(
        'div',
        { className: 'mcdev-row', style: { justifyContent: 'space-between', alignItems: 'center' } },
        h('span', { className: 'mcdev-title' }, PANEL_TITLE),
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
      // 单工程：表头直接承担原来列表行的工作，省掉一层选择
      single && current !== undefined
        ? h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('div', { className: 'mcdev-title', title: String(current.root) }, projectTitle(current)),
            h('div', { className: 'mcdev-sub' }, projectSubtitle(current)),
            h('div', { className: 'mcdev-muted mcdev-code mcdev-ellipsis', title: current.root }, current.root),
          )
        : h(
            'div',
            { className: 'mcdev-row', style: { justifyContent: 'space-between', gap: 8 } },
            h('div', { className: 'mcdev-muted mcdev-code mcdev-ellipsis', title: state.scan?.root ?? '' }, state.scan?.root ?? '—'),
            projects.length === 0 ? undefined : h('span', { className: 'mcdev-count' }, `${projects.length} 个工程`),
          ),
      state.error === undefined ? undefined : h('div', { className: 'mcdev-error' }, state.error),
      launches.error === undefined ? undefined : h('div', { className: 'mcdev-error' }, launches.error),
    ),

    // ② 列表：只在多工程时出现
    single
      ? undefined
      : h(
          'div',
          { className: 'mcdev-flyout-list' },
          projects.length === 0
            ? state.loading
              ? h(Skeleton, { rows: 3, hint: '正在扫描工作区…' })
              : h('div', { className: 'mcdev-hint', style: { padding: '10px 4px' } }, '没有找到 Gradle 工程')
            : [
                projects.length > SEARCH_THRESHOLD
                  ? h('input', {
                      key: 'search',
                      className: 'mcdev-search',
                      type: 'search',
                      placeholder: '按名字、loader 或路径过滤',
                      value: query,
                      onChange: (event) => setQuery(event.target.value),
                    })
                  : undefined,
                runnable.length === 0
                  ? undefined
                  : h(
                      'div',
                      { key: 'runnable', className: 'mcdev-group' },
                      h('div', { className: 'mcdev-group-head' }, h('span', undefined, '可运行'), h('span', { className: 'mcdev-count' }, runnable.length)),
                      rows(runnable, current),
                    ),
                others.length === 0
                  ? undefined
                  : h(
                      'div',
                      { key: 'others', className: 'mcdev-group' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'mcdev-group-head',
                          'data-toggle': 'true',
                          title: '识别不出 loader 或没有可运行目标',
                          onClick: () => setShowOthers(!showOthers),
                        },
                        h('span', { className: 'mcdev-icon' }, h(othersOpen ? IconChevronDown : IconChevronRight, { size: 12 })),
                        h('span', undefined, '其他'),
                        h('span', { className: 'mcdev-count' }, others.length),
                      ),
                      othersOpen ? rows(others, current) : undefined,
                    ),
                visible.length === 0
                  ? h('div', { key: 'empty', className: 'mcdev-hint', style: { padding: '10px 4px' } }, '没有匹配的工程')
                  : undefined,
              ],
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
                      h('span', {
                        className: 'mcdev-dot',
                        'data-state': running.status === 'starting' ? 'warn' : 'ok',
                        'data-pulse': 'true',
                      }),
                      `${running.label} ${running.status === 'starting' ? '启动中' : '运行中'} · ${elapsed(running.startedAt)}`,
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
 * 一组工程行；同名工程补目录名。
 * @param {Array<Record<string, any>>} projects
 * @param {Record<string, any> | undefined} current
 */
function rows(projects, current) {
  return listRows(projects).map(({ project, title, suffix }) =>
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
      h(
        'span',
        { className: 'mcdev-list-name' },
        h('span', { className: 'mcdev-ellipsis' }, title),
        suffix === '' ? undefined : h('span', { className: 'mcdev-list-suffix' }, suffix),
      ),
      h('span', { className: 'mcdev-list-meta' }, projectSubtitle(project) || loaderLabel(project.loader)),
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
