/**
 * 右侧栏「MC 工程」标签：单个工程的完整画像——版本、环境、模块与目标、证据、警告。
 *
 * 这是给人核对"你凭什么说它是 Forge 1.20.1"的地方，所以证据永远展开显示。
 * @module minecraft-dev-starter/client/DetailTab
 */

import { useEffect } from 'react'
import { h } from './h.js'
import { kindLabel, loaderLabel, PANEL_TITLE, projectSubtitle, projectTitle, text } from './format.js'
import { IconRefresh, IconWarning } from './icons.js'
import { capsuleText, selectedTarget } from './selection.js'
import { Skeleton } from './Skeleton.js'
import { openLogTab } from './runtime.js'
import {
  loadScan,
  selectedProject,
  startTarget,
  stopLaunch,
  useLaunches,
  useStoreState,
} from './state.js'

export function DetailTab() {
  const state = useStoreState()
  const launches = useLaunches(1500)

  useEffect(() => {
    if (state.scan === undefined) loadScan()
  }, [state.scan])

  const project = selectedProject()
  const chosen = selectedTarget(project, state.selection)

  const running = project === undefined
    ? undefined
    : launches.list.find(
        (entry) =>
          String(entry.root).toLowerCase() === String(project.root).toLowerCase() &&
          (entry.status === 'starting' || entry.status === 'running'),
      )

  if (project === undefined) {
    return h(
      'div',
      { className: 'mcdev-detail' },
      h('div', { className: 'mcdev-title' }, PANEL_TITLE),
      state.loading
        ? h(Skeleton, { rows: 4, hint: '正在扫描工作区…' })
        : h('div', { className: 'mcdev-muted', style: { marginTop: 8 } }, '当前工作区没有识别到模组工程'),
      state.error === undefined ? undefined : h('div', { className: 'mcdev-error', style: { marginTop: 8 } }, state.error),
    )
  }

  const java = /** @type {Record<string, any>} */ (project.java ?? {})
  const modules = /** @type {Array<Record<string, any>>} */ (project.modules ?? [])
  const evidence = /** @type {Array<Record<string, any>>} */ (project.evidence ?? [])
  const warnings = /** @type {string[]} */ (project.warnings ?? [])
  const conflicts = /** @type {string[]} */ (project.conflicts ?? [])

  return h(
    'div',
    { className: 'mcdev-detail' },
    h('div', { className: 'mcdev-title' }, projectTitle(project)),
    h('div', { className: 'mcdev-sub' }, projectSubtitle(project)),
    h('div', { className: 'mcdev-muted mcdev-code' }, project.root),
    h(
      'div',
      { className: 'mcdev-muted', style: { marginTop: 2 } },
      `${kindLabel(project.kind)} · 置信度 ${Math.round(Number(project.confidence ?? 0) * 100)}%`,
    ),

    section('基本信息', [
      row('loader', loaderLabel(project.loader)),
      row('MC 版本', text(project.minecraftVersion)),
      row('loader 版本', text(project.loaderVersion)),
      row('mod id', text(project.modId)),
      row('mod 版本', text(project.modVersion)),
    ]),

    section('构建环境', [
      row('Gradle', `${text(project.gradleVersion)}${project.wrapper === true ? '（wrapper）' : '（无 wrapper）'}`),
      row('JDK 需求', text(java.required)),
      row('JDK 选中', `${text(java.selected)}${java.exact === true ? '' : '（不完全匹配）'}`),
      row('本机 JDK', java.available?.length > 0 ? java.available.map((jdk) => `${jdk.major}`).join(' / ') : '未发现'),
    ]),

    section('运行', [
      ...(running === undefined
        ? [
            row('目标', capsuleText(project, chosen)),
            h(
              'div',
              { className: 'mcdev-actions', style: { marginTop: 6 } },
              h(
                'button',
                {
                  type: 'button',
                  className: 'mcdev-run',
                  disabled: chosen === undefined || launches.busy !== undefined,
                  title: chosen?.taskPath ?? '',
                  onClick: () => {
                    if (chosen !== undefined) void startTarget(project, chosen)
                  },
                },
                '▶ 启动',
              ),
              h('span', { className: 'mcdev-hint' }, '在标题栏胶囊的浮层里切换目标'),
            ),
          ]
        : [
            row('实例', `${running.id} · ${running.taskPath}`),
            row('状态', `${running.status === 'starting' ? '启动中' : '运行中'}${running.readyTimedOut === true ? '（还没看到启动信号，可能仍在构建）' : ''}`),
            row('PID', text(running.pid)),
            h(
              'div',
              { className: 'mcdev-actions', style: { marginTop: 6 } },
              h(
                'button',
                { type: 'button', className: 'mcdev-run', 'data-tone': 'stop', disabled: launches.busy === running.id, onClick: () => stopLaunch(running.id) },
                '⏹ 停止',
              ),
              h(
                'button',
                { type: 'button', className: 'mcdev-run', onClick: () => openLogTab() },
                '打开日志',
              ),
            ),
          ]),
    ]),

    section('模块与运行目标', [
      ...(modules.length === 0
        ? [h('div', { className: 'mcdev-muted' }, '没有模块信息')]
        : [
            h(
              'table',
              { className: 'mcdev-table' },
              h('thead', undefined, h('tr', undefined, h('th', undefined, '模块'), h('th', undefined, '平台'), h('th', undefined, '任务'))),
              h(
                'tbody',
                undefined,
                modules.map((module) =>
                  h(
                    'tr',
                    { key: module.path },
                    h('td', undefined, module.path),
                    h('td', undefined, module.platform),
                    h(
                      'td',
                      { className: 'mcdev-code' },
                      module.targets?.length > 0
                        ? module.targets.map((target) => `${target.taskPath}${target.guessed === true ? ' ?' : ''}`).join('  ')
                        : '—',
                    ),
                  ),
                ),
              ),
            ),
          ]),
      h('div', { className: 'mcdev-hint', style: { marginTop: 6 } }, '带 ? 的任务是按 loader 惯例推测的，尚未真实运行验证；可以直接启动试，失败时日志里会给出原因。'),
    ]),

    section(
      '证据',
      evidence.length === 0
        ? [h('div', { className: 'mcdev-muted' }, '没有证据')]
        : [
            h(
              'div',
              { className: 'mcdev-stack' },
              evidence.map((entry, index) =>
                h(
                  'div',
                  { key: `${entry.file}:${index}` },
                  h('span', { className: 'mcdev-code mcdev-sub' }, entry.file),
                  h('span', { className: 'mcdev-muted' }, ` — ${entry.detail}`),
                ),
              ),
            ),
          ],
    ),

    warnings.length === 0 && conflicts.length === 0
      ? undefined
      : section('提示', [
          ...warnings.map((warning, index) =>
            h(
              'div',
              { key: `w${index}`, className: 'mcdev-warn mcdev-icon-text' },
              h('span', { className: 'mcdev-icon' }, h(IconWarning, undefined)),
              warning,
            ),
          ),
          ...conflicts.map((conflict, index) => h('div', { key: `c${index}`, className: 'mcdev-error' }, `· ${conflict}`)),
        ]),

    h(
      'div',
      { style: { marginTop: 14 } },
      h(
        'button',
        { type: 'button', className: 'mcdev-mini', onClick: () => loadScan({ refresh: true }) },
        h('span', { className: 'mcdev-icon' }, h(IconRefresh, { size: 12 })),
        state.loading ? '重新扫描中…' : '重新扫描',
      ),
    ),
    state.scan?.scannedAt === undefined
      ? undefined
      : h('div', { className: 'mcdev-muted mcdev-hint', style: { marginTop: 4 } }, `扫描于 ${state.scan.scannedAt}`),
  )
}

/**
 * @param {string} title
 * @param {Array<any>} children
 */
function section(title, children) {
  return h('div', { className: 'mcdev-section' }, h('h4', undefined, title), ...children)
}

/**
 * @param {string} key
 * @param {string} value
 */
function row(key, value) {
  return h('div', { className: 'mcdev-row', key }, h('span', { className: 'mcdev-key' }, key), h('span', { className: 'mcdev-code' }, value))
}
