/**
 * 右侧栏「Mod Dev」页：单个工程的画像与运行控制。
 *
 * 面向的是"要动手跑"的人和 agent，所以页面按**能不能跑**排序，不按识别流水线排序：
 *
 *   头部（是谁） → 状态条（能不能跑） → 运行（跑什么、上次结果） → 构建环境
 *   → 折叠的细节（依赖 / 证据 / 诊断）
 *
 * IDE 工程模型、模块表、可信度这些是**诊断信息**，全部收进「诊断」折叠区：
 * 它们解释"为什么是这个结论"，但不该占据一屏的位置。
 * 解释性文字一律进 ⓘ，版面上只留数据。
 * @module minecraft-dev-starter/client/DetailTab
 */

import { useEffect, useState } from 'react'
import { call } from '../lib/api.js'
import { h } from '../lib/h.js'
import { formatDateTime, formatSyncTime, groupDependencies, kindLabel, loaderLabel, PANEL_TITLE, projectTitle, relativeTime, runDuration, text } from '../lib/format.js'
import { IconChevronDown, IconChevronRight, IconInfo, IconPlay, IconRefresh, IconStop, IconWarning } from '../lib/icons.js'
import { t } from '../lib/messages.js'
import { useLocale } from '../lib/useLocale.js'
import { groupByModule, selectedTarget, targetKey } from '../lib/selection.js'
import { Skeleton } from './Skeleton.js'
import { openLogTab } from '../lib/runtime.js'
import {
  loadScan,
  selectedProject,
  selectTarget,
  startTarget,
  stopLaunch,
  store,
  useLaunches,
  useStoreState,
} from '../lib/state.js'

/** 依赖列表一次最多渲染多少行（超出的只报数量）。 */
const DEP_ROW_LIMIT = 200

export function DetailTab() {
  const state = useStoreState()
  const launches = useLaunches(1500)
  useLocale()

  useEffect(() => {
    if (state.scan === undefined) loadScan()
  }, [state.scan])

  const project = selectedProject()

  if (project === undefined) {
    return h(
      'div',
      { className: 'mcdev-detail' },
      h('div', { className: 'mcdev-title' }, PANEL_TITLE),
      state.loading
        ? h(Skeleton, { rows: 4, hint: t('flyout.scanningHint') })
        : h('div', { className: 'mcdev-muted', style: { marginTop: 8 } }, t('detail.noProject')),
      state.error === undefined ? undefined : h('div', { className: 'mcdev-error', style: { marginTop: 8 } }, state.error),
    )
  }

  const chosen = selectedTarget(project, state.selection)
  const running = launches.list.find(
    (entry) =>
      String(entry.root).toLowerCase() === String(project.root).toLowerCase() &&
      (entry.status === 'starting' || entry.status === 'running'),
  )
  const busy = launches.busy !== undefined
  const lastRun = latestRun(launches.list, project.root)

  const java = /** @type {Record<string, any>} */ (project.java ?? {})
  const idea = /** @type {Record<string, any> | undefined} */ (project.idea)
  const modules = /** @type {Array<Record<string, any>>} */ (project.modules ?? [])
  const evidence = /** @type {Array<Record<string, any>>} */ (project.evidence ?? [])
  const warnings = /** @type {string[]} */ (project.warnings ?? [])
  const conflicts = /** @type {string[]} */ (project.conflicts ?? [])
  const dependencies = /** @type {Record<string, any>} */ (project.dependencies ?? {})
  const buildDeps = groupDependencies(/** @type {Array<Record<string, any>>} */ (dependencies.build ?? []))
  const modDeps = /** @type {Array<Record<string, any>>} */ (dependencies.mods ?? [])
  const compared = /** @type {Array<Record<string, any>>} */ (dependencies.compared ?? [])
  const comparedByModule = new Map(compared.map((entry) => [String(entry.module), entry]))
  const syncedAt = typeof idea?.libraries?.syncedAt === 'string' ? idea.libraries.syncedAt : undefined
  const wrapper = project.wrapper === true

  return h(
    'div',
    { className: 'mcdev-detail' },

    // ── 头部：是谁 ────────────────────────────────────────────────────
    h(
      'div',
      { className: 'mcdev-head' },
      h('div', { className: 'mcdev-title' }, projectTitle(project)),
      h(
        'div',
        { className: 'mcdev-chips' },
        chip(loaderLabel(project.loader)),
        project.minecraftVersion === undefined ? undefined : chip(String(project.minecraftVersion)),
        chip(kindLabel(project.kind)),
        typeof project.modulePath === 'string' && project.modulePath !== '' ? chip(project.modulePath) : undefined,
      ),
      h('div', { className: 'mcdev-path', title: String(project.root) }, String(project.root)),
    ),

    // ── 状态条：能不能跑 ──────────────────────────────────────────────
    h(
      'div',
      { className: 'mcdev-status' },
      statusChip(running === undefined ? t('detail.status.idle') : launchState(running), running === undefined ? 'muted' : 'ok'),
      statusChip(wrapper ? `Gradle ${text(project.gradleVersion)}` : t('detail.status.noWrapper'), wrapper ? 'muted' : 'warn'),
      statusChip(jdkChipText(java), jdkTone(java)),
    ),

    warnings.length === 0 && conflicts.length === 0
      ? undefined
      : h(
          'div',
          { className: 'mcdev-sec' },
          ...warnings.map((warning, index) =>
            h(
              'div',
              { key: `w${index}`, className: 'mcdev-warn mcdev-icon-text' },
              h('span', { className: 'mcdev-icon' }, h(IconWarning, undefined)),
              warning,
            ),
          ),
          ...conflicts.map((conflict, index) => h('div', { key: `c${index}`, className: 'mcdev-error' }, conflict)),
        ),

    // ── 运行：跑什么、上次怎么样 ──────────────────────────────────────
    h(
      'div',
      { className: 'mcdev-sec' },
      h('h4', undefined, t('detail.section.run')),
      h(
        'div',
        { className: 'mcdev-runline' },
        h(TargetSelect, { key: 'targets', project, chosen, locked: running !== undefined }),
        running === undefined
          ? h(
              'button',
              {
                key: 'start',
                type: 'button',
                className: 'mcdev-run',
                disabled: chosen === undefined || busy,
                title: chosen === undefined ? t('common.noTarget') : t('capsule.start', { target: chosen.taskPath }),
                onClick: () => {
                  if (chosen !== undefined) void startTarget(project, chosen)
                },
              },
              h('span', { className: 'mcdev-icon' }, h(IconPlay, undefined)),
              t('action.start'),
            )
          : [
              h(
                'button',
                {
                  key: 'stop',
                  type: 'button',
                  className: 'mcdev-run',
                  'data-tone': 'stop',
                  disabled: launches.busy === running.id,
                  onClick: () => stopLaunch(running.id),
                },
                h('span', { className: 'mcdev-icon' }, h(IconStop, undefined)),
                t('action.stop'),
              ),
              h(
                'button',
                { key: 'log', type: 'button', className: 'mcdev-mini', onClick: () => openLogTab(store.get().config) },
                t('action.log'),
              ),
            ],
      ),
      lastRun === undefined
        ? h('div', { className: 'mcdev-hint', style: { marginTop: 6 } }, t('detail.noRunRecord'))
        : lastRunRow(lastRun),
    ),

    // ── 构建环境 ──────────────────────────────────────────────────────
    h(
      'div',
      { className: 'mcdev-sec' },
      h('h4', undefined, t('detail.section.buildEnv')),
      h(JdkPicker, { key: 'jdk', project, java }),
      typeof project.gradleRoot === 'string' && project.gradleRoot !== String(project.root)
        ? h(
            'div',
            { className: 'mcdev-muted mcdev-code mcdev-ellipsis', style: { marginTop: 4 }, title: project.gradleRoot },
            t('detail.gradleRoot', { root: project.gradleRoot }),
          )
        : undefined,
    ),

    // ── 依赖 ──────────────────────────────────────────────────────────
    h(
      Fold,
      {
        key: 'deps',
        title: t('detail.deps.title'),
        count: buildDeps.length,
        info: t('detail.deps.info'),
        open: buildDeps.length > 0,
      },
      buildDeps.length === 0
        ? h('div', { className: 'mcdev-muted' }, t('detail.deps.empty'))
        : h(
            'div',
            undefined,
            compared.length === 0
              ? undefined
              : h(
                  'div',
                  {
                    className: 'mcdev-dep-sync',
                    title: t('detail.deps.compare.syncedTitle'),
                  },
                  syncedAt === undefined
                    ? t('detail.deps.compare.syncedUnknown')
                    : t('detail.deps.compare.synced', { time: formatSyncTime(syncedAt) }),
                ),
            h(
              'div',
              { className: 'mcdev-dep-list' },
              buildDeps.slice(0, DEP_ROW_LIMIT).map((dependency) =>
                h(
                  'div',
                  { className: 'mcdev-dep-item', key: `${dependency.file}:${dependency.line}:${dependency.notation}` },
                  h(
                    'div',
                    { className: 'mcdev-dep-row' },
                    h(
                      'span',
                      { className: 'mcdev-dep-conf', title: dependency.configurations.join(', ') },
                      dependency.configurations.join(' '),
                    ),
                    h('span', { className: 'mcdev-dep-coord', title: dependency.notation }, dependency.notation),
                    h('span', { className: 'mcdev-dep-pos', title: `${dependency.file}:${dependency.line}` }, `:${dependency.line}`),
                  ),
                  depStatusLine(
                    dependency.module === undefined ? undefined : comparedByModule.get(String(dependency.module)),
                  ),
                ),
              ),
            ),
          ),
      buildDeps.length > DEP_ROW_LIMIT
        ? h('div', { className: 'mcdev-hint', style: { marginTop: 4 } }, t('detail.deps.hidden', { count: buildDeps.length - DEP_ROW_LIMIT }))
        : undefined,
      modDeps.length === 0
        ? undefined
        : h(
            'div',
            { className: 'mcdev-hint', style: { marginTop: 6 } },
            t('detail.deps.mods', {
              list: modDeps.map((entry) => `${entry.modId} ${entry.range}`).join(t('common.listSeparator')),
            }),
          ),
    ),

    // ── 证据 ──────────────────────────────────────────────────────────
    h(
      Fold,
      { key: 'evidence', title: t('detail.evidence.title'), count: evidence.length, info: t('detail.evidence.info') },
      evidence.length === 0
        ? h('div', { className: 'mcdev-muted' }, t('detail.evidence.empty'))
        : h(
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
    ),

    // ── 诊断：模块表 / IDE 模型 / 可信度 ──────────────────────────────
    h(
      Fold,
      {
        key: 'diagnostics',
        title: t('detail.diagnostics.title'),
        info: t('detail.diagnostics.info'),
      },
      modules.length > 1
        ? h(
            'table',
            { className: 'mcdev-table' },
            h(
              'thead',
              undefined,
              h(
                'tr',
                undefined,
                h('th', undefined, t('detail.table.module')),
                h('th', undefined, t('detail.table.platform')),
                h('th', undefined, t('detail.table.task')),
              ),
            ),
            h(
              'tbody',
              undefined,
              modules.map((module) =>
                h(
                  'tr',
                  { key: module.path },
                  h('td', undefined, module.gradlePath ?? module.path),
                  h('td', undefined, module.platform),
                  h(
                    'td',
                    { className: 'mcdev-code' },
                    module.targets?.length > 0
                      ? module.targets.map((target) => `${target.taskPath}${targetMark(target)}`).join('  ')
                      : '—',
                  ),
                ),
              ),
            ),
          )
        : undefined,
      idea === undefined
        ? undefined
        : kv([
            ['IDE', text(idea.name)],
            [t('detail.idea.jdk'), text(idea.jdkName)],
            ...(typeof idea.minecraftVersion === 'string' && idea.minecraftVersion !== ''
              ? [[t('detail.idea.mcVersion'), idea.minecraftVersion]]
              : []),
            ['Java', t('detail.idea.java', { level: text(idea.languageLevel), bytecode: text(idea.bytecodeTarget) })],
            [t('detail.idea.modules'), t('detail.idea.modulesValue', { count: text(idea.modules), imls: text(idea.imls) })],
            [t('detail.idea.runConfigs'), t('detail.idea.count', { count: text(idea.runConfigurations) })],
            ...(idea.libraries === undefined || idea.libraries === null ? [] : [[t('detail.idea.libraries'), librariesText(idea.libraries)]]),
            ...(Array.isArray(idea.platforms) && idea.platforms.length > 0 ? [['facet', idea.platforms.join(' / ')]] : []),
            [t('detail.idea.dir'), text(idea.dir)],
          ]),
      h(
        'div',
        { className: 'mcdev-hint', style: { marginTop: 6 } },
        t('detail.confidence', { percent: Math.round(Number(project.confidence ?? 0) * 100) }),
      ),
    ),

    // ── 页脚 ──────────────────────────────────────────────────────────
    h(
      'div',
      { className: 'mcdev-sec' },
      h(
        'button',
        { type: 'button', className: 'mcdev-mini', onClick: () => loadScan({ refresh: true }) },
        h('span', { className: 'mcdev-icon' }, h(IconRefresh, { size: 12 })),
        state.loading ? t('flyout.scanning') : t('detail.rescan'),
      ),
      state.scan?.scannedAt === undefined
        ? undefined
        : h(
            'span',
            { className: 'mcdev-hint', style: { marginLeft: 8 } },
            formatDateTime(state.scan.scannedAt),
          ),
    ),
  )
}

/**
 * 目标下拉：一个工程的所有目标集中在这里，多模块时按模块分组。
 * 之前"运行"里写一行目标、下面再放一张目标表，是同一件事说了两遍。
 * @param {{ project: Record<string, any>, chosen: Record<string, any> | undefined, locked: boolean }} props
 */
function TargetSelect({ project, chosen, locked }) {
  const targets = /** @type {Array<Record<string, any>>} */ (project.runTargets ?? [])
  if (targets.length === 0) return h('span', { className: 'mcdev-muted mcdev-grow' }, t('common.noTarget'))
  const groups = groupByModule(targets)
  /** @param {Record<string, any>} target */
  const optionOf = (target) =>
    h(
      'option',
      { key: targetKey(target), value: targetKey(target) },
      target.guessed === true
        ? t('detail.target.optionGuessed', { label: target.label, taskPath: target.taskPath })
        : t('detail.target.option', { label: target.label, taskPath: target.taskPath }),
    )

  return h(
    'select',
    {
      className: 'mcdev-select mcdev-grow',
      value: chosen === undefined ? '' : targetKey(chosen),
      disabled: locked,
      title: locked ? t('detail.target.locked') : t('flyout.targets'),
      onChange: (event) => selectTarget(project.root, event.target.value),
    },
    chosen === undefined ? h('option', { value: '' }, t('detail.target.choose')) : undefined,
    groups.length > 1
      ? groups.map((group) => h('optgroup', { key: group.module, label: group.module }, group.targets.map(optionOf)))
      : groups.flatMap((group) => group.targets.map(optionOf)),
  )
}

/**
 * JDK 选择：一行下拉，添加路径收在一个小按钮后面，不常驻占位。
 * @param {{ project: Record<string, any>, java: Record<string, any> }} props
 */
function JdkPicker({ project, java }) {
  const [adding, setAdding] = useState(false)
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
    { style: { marginTop: 2 } },
    h(
      'div',
      { className: 'mcdev-actions' },
      h(
        'select',
        {
          className: 'mcdev-select',
          value: override,
          disabled: busy,
          title: jdkSummary(java),
          onChange: (event) => {
            const next = event.target.value
            void apply(() => call('projects.jdk.set', { root: project.root, home: next }))
          },
        },
        h('option', { value: '' }, java.required === undefined ? t('detail.jdk.auto') : t('detail.jdk.autoVersion', { version: java.required })),
        ...dedupeByHome(jdks).map((jdk) =>
          h(
            'option',
            { key: jdk.home, value: jdk.home },
            `${jdk.major}${String(jdk.version) === String(jdk.major) ? '' : ` · ${jdk.version}`} — ${jdk.home}`,
          ),
        ),
        override !== '' && !known ? h('option', { key: 'missing', value: override }, t('detail.jdk.stale', { home: override })) : undefined,
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'mcdev-mini',
          title: t('detail.jdk.addTitle'),
          disabled: busy,
          onClick: () => setAdding(!adding),
        },
        adding ? t('action.cancel') : t('action.add'),
      ),
      hint(jdkSummary(java)),
    ),
    adding
      ? h(
          'div',
          { className: 'mcdev-jdk-add', style: { marginTop: 4 } },
          h('input', {
            className: 'mcdev-input',
            type: 'text',
            value: path,
            placeholder: t('detail.jdk.placeholder'),
            disabled: busy,
            onChange: (event) => setPath(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') addFromInput()
            },
          }),
          h('button', { type: 'button', className: 'mcdev-mini', disabled: busy || path.trim() === '', onClick: addFromInput }, t('detail.jdk.join')),
        )
      : undefined,
    error === undefined ? undefined : h('div', { className: 'mcdev-error', style: { marginTop: 4 } }, error),
  )
}

/**
 * 折叠区块：标题一行，内容按需展开。
 * @param {{ title: string, count?: number, info?: string, open?: boolean, children?: any }} props
 */
function Fold({ title, count, info, open: initiallyOpen = false, children }) {
  const [open, setOpen] = useState(initiallyOpen)

  return h(
    'div',
    { className: 'mcdev-fold' },
    h(
      'button',
      { type: 'button', className: 'mcdev-fold-head', onClick: () => setOpen(!open) },
      h('span', { className: 'mcdev-icon' }, h(open ? IconChevronDown : IconChevronRight, { size: 12 })),
      h('span', undefined, title),
      count === undefined ? undefined : h('span', { className: 'mcdev-count' }, String(count)),
      info === undefined ? undefined : hint(info, false),
    ),
    open ? h('div', { className: 'mcdev-fold-body' }, children) : undefined,
  )
}

/**
 * 排列成"标签 值"的两列网格。
 * @param {Array<[string, string]>} entries
 */
function kv(entries) {
  return h(
    'div',
    { className: 'mcdev-kv' },
    ...entries.flatMap(([key, value]) => [
      h('span', { key: `k-${key}`, className: 'k' }, key),
      h('span', { key: `v-${key}`, className: 'v', title: value }, value),
    ]),
  )
}

/**
 * ⓘ 提示：说明文字不进版面，进 tooltip。
 * @param {string} title
 * @param {boolean} [leading] 是否留一点左间距
 */
function hint(title, leading = true) {
  return h(
    'span',
    {
      key: `hint-${title}`,
      className: 'mcdev-info',
      title,
      'aria-label': title,
      style: leading ? { marginLeft: 4 } : undefined,
    },
    h(IconInfo, { size: 12 }),
  )
}

/**
 * 头部一行小标签：loader / MC 版本 / 类型 / 模块路径。
 * @param {string} label
 */
function chip(label) {
  return h('span', { key: `chip-${label}`, className: 'mcdev-chip' }, label)
}

/**
 * 状态条上的一格：状态点 + 文字。
 * @param {string} label
 * @param {'ok' | 'warn' | 'muted'} tone
 */
function statusChip(label, tone) {
  return h(
    'span',
    { key: `status-${label}`, className: 'mcdev-chip', 'data-tone': tone },
    h('span', { className: 'mcdev-dot', 'data-state': tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : undefined }),
    label,
  )
}

/**
 * "上次"一行：跑的是哪个目标、结论如何、多久以前。
 * daemon 的"结论"没有意义，改成实际运行了多久；oneshot 仍然只报通过 / 失败。
 * @param {Record<string, any>} entry
 */
function lastRunRow(entry) {
  const duration = runDuration(entry.startedAt, entry.endedAt)
  const outcome =
    entry.mode === 'oneshot' || duration === undefined
      ? verdictText(entry)
      : t('detail.lastRun.duration', { duration })
  return h(
    'div',
    { className: 'mcdev-lastrun' },
    h('span', { className: 'mcdev-muted' }, t('detail.lastRun')),
    h(
      'span',
      { className: 'mcdev-verdict', 'data-tone': verdictTone(entry), title: entry.taskPath },
      `${entry.label ?? entry.taskPath} · ${outcome}`,
    ),
    h('span', { className: 'mcdev-muted' }, ` · ${relativeTime(entry.endedAt ?? entry.startedAt)}`),
  )
}

/**
 * @param {Array<Record<string, any>>} launches
 * @param {string} root
 * @returns {Record<string, any> | undefined}
 */
function latestRun(launches, root) {
  const mine = launches
    .filter((entry) => String(entry.root).toLowerCase() === String(root).toLowerCase())
    .filter((entry) => entry.status === 'exited' || entry.status === 'failed')
    .sort((left, right) => Date.parse(right.endedAt ?? right.startedAt ?? '') - Date.parse(left.endedAt ?? left.startedAt ?? ''))
  return mine[0]
}

/**
 * @param {Record<string, any>} entry
 * @returns {string}
 */
function verdictText(entry) {
  if (entry.verdict === 'passed') return t('status.passed')
  if (entry.verdict === 'failed') return t('status.failed')
  if (entry.verdict === 'aborted') return t('status.stopped')
  if (entry.verdict === 'error') return t('status.notStarted')
  if (entry.mode === 'oneshot') return t('status.noVerdict')
  return t('status.exited')
}

/**
 * @param {Record<string, any>} entry
 * @returns {'ok' | 'error' | 'muted'}
 */
function verdictTone(entry) {
  if (entry.verdict === 'passed') return 'ok'
  if (entry.verdict === 'failed' || entry.verdict === 'error') return 'error'
  return 'muted'
}

/**
 * @param {Record<string, any>} java
 * @returns {string}
 */
function jdkChipText(java) {
  const required = java.required
  const selected = java.selected
  if (selected === undefined || selected === null || selected === '') {
    return required === undefined ? t('detail.jdk.unknown') : t('detail.jdk.requiredNotFound', { version: required })
  }
  if (required === undefined) return t('detail.jdk.selected')
  return java.exact === true
    ? t('detail.jdk.selectedExact', { version: required })
    : t('detail.jdk.selectedMismatch', { version: required })
}

/**
 * @param {Record<string, any>} java
 * @returns {'ok' | 'warn' | 'muted'}
 */
function jdkTone(java) {
  const selected = java.selected
  if (selected === undefined || selected === null || selected === '') {
    return java.required === undefined ? 'muted' : 'warn'
  }
  return java.exact === true ? 'ok' : 'warn'
}

/**
 * 目标来源标记：推测的 `?`、IDE 里跑过的 `✓`，构建脚本里直接读到的什么也不加。
 * @param {Record<string, any>} target
 * @returns {string}
 */
function targetMark(target) {
  if (target.guessed === true) return ' ?'
  if (target.source === 'idea-run-config') return ' ✓'
  return ''
}

/**
 * 库表一行摘要：位置 + 条数 + 有多少是工程内的 remap 产物。
 * @param {Record<string, any>} libraries
 * @returns {string}
 */
function librariesText(libraries) {
  const where = libraries.storage === 'external' ? t('detail.libraries.external') : '.idea/libraries'
  const count = typeof libraries.count === 'number' ? libraries.count : 0
  const local = typeof libraries.local === 'number' && libraries.local > 0 ? t('detail.libraries.local', { count: libraries.local }) : ''
  return t('detail.libraries.summary', { where, count, local })
}

/**
 * 声明行下面的对照结果：一致时不占版面，只有不一致 / 未解析才各给一行。
 * 版本不同不等于写错了——可能是动态版本，也可能被别的依赖抬高，所以用提示色而不是错误色。
 * @param {Record<string, any> | undefined} compared
 */
function depStatusLine(compared) {
  if (compared === undefined || compared.status === 'same') return undefined
  if (compared.status === 'differs') {
    return h(
      'div',
      {
        className: 'mcdev-dep-status',
        'data-tone': 'warn',
        title: t('detail.deps.compare.differsTitle', { declared: compared.declared }),
      },
      t('detail.deps.compare.differs', { version: compared.resolved }),
    )
  }
  return h(
    'div',
    {
      className: 'mcdev-dep-status',
      'data-tone': 'muted',
      title: t('detail.deps.compare.unresolvedTitle'),
    },
    t('detail.deps.compare.unresolved'),
  )
}

/**
 * @param {Array<Record<string, any>>} jdks
 */
function dedupeByHome(jdks) {
  /** @type {Map<string, Record<string, any>>} */
  const seen = new Map()
  for (const jdk of jdks) {
    const home = String(jdk.home)
    if (!seen.has(home)) seen.set(home, jdk)
  }
  return [...seen.values()]
}

/**
 * @param {Record<string, any>} java
 * @returns {string}
 */
function jdkSummary(java) {
  const selected = typeof java.selected === 'string' ? java.selected : ''
  if (selected === '') return t('detail.jdk.summaryNone')
  if (java.source === 'override') return t('detail.jdk.summaryOverride', { home: selected })
  if (java.source === 'configured') return t('detail.jdk.summaryConfigured', { home: selected })
  return java.exact === true
    ? t('detail.jdk.summaryAuto', { home: selected })
    : t('detail.jdk.summaryAutoMismatch', { home: selected })
}

/**
 * @param {Record<string, any>} entry
 * @returns {string}
 */
function launchState(entry) {
  if (entry.status === 'starting') return t('status.starting')
  if (entry.mode === 'oneshot') return entry.verdict === 'passed' ? t('status.passedDone') : t('status.oneshotRunning')
  return t('status.running')
}
