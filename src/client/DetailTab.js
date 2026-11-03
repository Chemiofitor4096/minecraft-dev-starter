/**
 * 右侧栏「MC 工程」标签：单个工程的完整画像——版本、环境、模块与目标、证据、警告。
 *
 * 这是给人核对"你凭什么说它是 Forge 1.20.1"的地方，所以证据永远展开显示。
 * @module minecraft-dev-starter/client/DetailTab
 */

import { useEffect, useState } from 'react'
import { call } from './api.js'
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
  store,
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
  const dependencies = /** @type {Record<string, any>} */ (project.dependencies ?? {})
  const buildDeps = /** @type {Array<Record<string, any>>} */ (dependencies.build ?? [])
  const modDeps = /** @type {Array<Record<string, any>>} */ (dependencies.mods ?? [])

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
      h(JdkPicker, { key: 'jdk', project, java }),
      row('本机 JDK', java.available?.length > 0 ? java.available.map((jdk) => `${jdk.major}`).join(' / ') : '未发现'),
      h('div', { key: 'jdk-note', className: 'mcdev-hint' }, '手动指定只影响本机，不写进 gradle.properties；启动时会以 -Dorg.gradle.java.home 与 JAVA_HOME 传给 Gradle。'),
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
            ...(typeof running.javaHome === 'string' && running.javaHome !== '' ? [row('JDK', running.javaHome)] : []),
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
                { type: 'button', className: 'mcdev-run', onClick: () => openLogTab(store.get().config) },
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

    section('依赖', [
      h(
        'div',
        { className: 'mcdev-hint' },
        '只显示构建脚本与元数据里声明的依赖，用来核对「加进去了没有」；Gradle 解析后的传递依赖不在这里。',
      ),
      ...(buildDeps.length === 0
        ? [h('div', { className: 'mcdev-muted' }, '构建脚本里没有读到 dependencies 块')]
        : [
            h(
              'table',
              { className: 'mcdev-table' },
              h('thead', undefined, h('tr', undefined, h('th', undefined, '配置'), h('th', undefined, '坐标'), h('th', undefined, '位置'))),
              h(
                'tbody',
                undefined,
                buildDeps.slice(0, 40).map((dependency, index) =>
                  h(
                    'tr',
                    { key: `${dependency.file}:${dependency.line}:${index}` },
                    h('td', undefined, String(dependency.configuration)),
                    h('td', { className: 'mcdev-code' }, String(dependency.notation)),
                    h('td', { className: 'mcdev-code mcdev-muted' }, `${dependency.file}:${dependency.line}`),
                  ),
                ),
              ),
            ),
            buildDeps.length > 40
              ? h('div', { className: 'mcdev-hint', style: { marginTop: 4 } }, `还有 ${buildDeps.length - 40} 条未显示`)
              : undefined,
          ]),
      dependencies.catalogSize > 0
        ? h('div', { className: 'mcdev-hint', style: { marginTop: 4 } }, `版本目录 ${dependencies.catalogFile}（${dependencies.catalogSize} 条），libs.xxx 已解析成坐标`)
        : undefined,
      ...(modDeps.length === 0
        ? []
        : [
            h('div', { className: 'mcdev-hint', style: { marginTop: 8 } }, '模组声明（mods.toml / fabric.mod.json 的 depends）'),
            h(
              'div',
              { className: 'mcdev-stack' },
              modDeps.slice(0, 24).map((dependency, index) =>
                h(
                  'div',
                  { key: `m${index}` },
                  h('span', { className: 'mcdev-code' }, String(dependency.modId)),
                  h('span', { className: 'mcdev-muted' }, `  ${dependency.range}`),
                ),
              ),
            ),
          ]),
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
 * JDK 选择：下拉 + 手动添加路径。
 *
 * 选择存在宿主侧（`jdk.json`），改完重扫一次，面板与下一次启动都拿到新值。
 * 没有本地 state 缓存"选中项"——真相只有宿主那一份，避免两处不一致。
 * @param {{ project: Record<string, any>, java: Record<string, any> }} props
 */
function JdkPicker({ project, java }) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(undefined)
  const jdks = Array.isArray(java.available) ? java.available : []
  const override = typeof java.override === 'string' ? java.override : ''
  const known = jdks.some((jdk) => String(jdk.home).toLowerCase() === override.toLowerCase())

  async function apply(action) {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      await loadScan({ refresh: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function addFromInput() {
    const trimmed = path.trim()
    if (trimmed === '') return
    void apply(() => call('projects.jdk.add', { path: trimmed }))
  }

  return h(
    'div',
    { className: 'mcdev-row' },
    h('span', { className: 'mcdev-key' }, 'JDK'),
    h(
      'div',
      { className: 'mcdev-jdk' },
      h(
        'select',
        {
          className: 'mcdev-select',
          value: override,
          disabled: busy,
          onChange: (event) => {
            const next = event.target.value
            void apply(() => call('projects.jdk.set', { root: project.root, home: next }))
          },
        },
        h('option', { value: '' }, java.required === undefined ? '自动' : `自动（按 MC 版本选 ${java.required}）`),
        ...jdks.map((jdk) =>
          h(
            'option',
            { key: jdk.home, value: jdk.home },
            `${jdk.major}${String(jdk.version) === String(jdk.major) ? '' : ` · ${jdk.version}`} — ${jdk.home}`,
          ),
        ),
        override !== '' && !known ? h('option', { key: 'missing', value: override }, `已失效 — ${override}`) : undefined,
      ),
      h('div', { className: 'mcdev-hint' }, jdkSummary(java)),
      h(
        'div',
        { className: 'mcdev-jdk-add' },
        h('input', {
          className: 'mcdev-input',
          type: 'text',
          value: path,
          placeholder: 'JDK 根目录（含 release 文件），例如 C:\\Program Files\\Java\\jdk-21',
          disabled: busy,
          onChange: (event) => setPath(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter') addFromInput()
          },
        }),
        h('button', { type: 'button', className: 'mcdev-mini', disabled: busy || path.trim() === '', onClick: addFromInput }, busy ? '处理中…' : '添加'),
      ),
      error === undefined ? undefined : h('div', { className: 'mcdev-error' }, error),
    ),
  )
}

/**
 * 一句话说明当前生效的是哪个 JDK、依据是什么。
 * @param {Record<string, any>} java
 * @returns {string}
 */
function jdkSummary(java) {
  const selected = typeof java.selected === 'string' ? java.selected : ''
  if (selected === '') return '没有可用的 JDK：装一个，或把路径加进来'
  if (java.source === 'override') return `生效：${selected}（手动指定）`
  if (java.source === 'configured') return `生效：${selected}（来自 gradle.properties）`
  return `生效：${selected}（自动）${java.exact === true ? '' : '（大版本不完全匹配）'}`
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
