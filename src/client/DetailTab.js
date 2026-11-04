/**
 * 右侧栏「Mod Dev」页：单个工程的画像与运行控制。
 *
 * 排版原则：**一行一件事，解释性文字不占版面**。凡是要说明的（为什么这个提示、
 * 这列是什么、怎么改 JDK），一律收进 ⓘ 的 tooltip；页面只留数据。
 * 长列表（依赖、证据）折叠且各自滚动，整页本身也可滚。
 * @module minecraft-dev-starter/client/DetailTab
 */

import { useEffect, useState } from 'react'
import { call } from './api.js'
import { h } from './h.js'
import { availableMajors, groupDependencies, kindLabel, loaderLabel, PANEL_TITLE, projectTitle, text } from './format.js'
import { IconChevronDown, IconChevronRight, IconInfo, IconPlay, IconRefresh, IconStop, IconWarning } from './icons.js'
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

/** 依赖列表一次最多渲染多少行（超出的只报数量）。 */
const DEP_ROW_LIMIT = 200

export function DetailTab() {
  const state = useStoreState()
  const launches = useLaunches(1500)

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
        ? h(Skeleton, { rows: 4, hint: '正在扫描工作区…' })
        : h('div', { className: 'mcdev-muted', style: { marginTop: 8 } }, '当前工作区没有识别到模组工程'),
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

  const java = /** @type {Record<string, any>} */ (project.java ?? {})
  const idea = /** @type {Record<string, any> | undefined} */ (project.idea)
  const modules = /** @type {Array<Record<string, any>>} */ (project.modules ?? [])
  const evidence = /** @type {Array<Record<string, any>>} */ (project.evidence ?? [])
  const warnings = /** @type {string[]} */ (project.warnings ?? [])
  const conflicts = /** @type {string[]} */ (project.conflicts ?? [])
  const dependencies = /** @type {Record<string, any>} */ (project.dependencies ?? {})
  const buildDeps = groupDependencies(/** @type {Array<Record<string, any>>} */ (dependencies.build ?? []))
  const modDeps = /** @type {Array<Record<string, any>>} */ (dependencies.mods ?? [])

  return h(
    'div',
    { className: 'mcdev-detail' },

    h(
      'div',
      { className: 'mcdev-head' },
      h('div', { className: 'mcdev-title' }, projectTitle(project)),
      h(
        'div',
        { className: 'mcdev-sub' },
        `${loaderLabel(project.loader)}${project.minecraftVersion === undefined ? '' : ` · ${project.minecraftVersion}`}`,
        project.loaderVersion === undefined ? undefined : ` · loader ${project.loaderVersion}`,
        ` · ${kindLabel(project.kind)} · ${Math.round(Number(project.confidence ?? 0) * 100)}%`,
      ),
      h('div', { className: 'mcdev-path', title: String(project.root) }, String(project.root)),
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

    // ── 运行 ──────────────────────────────────────────────────────────
    h(
      'div',
      { className: 'mcdev-sec' },
      h('h4', undefined, '运行'),
      kv([
        ['目标', running === undefined ? capsuleText(project, chosen) : `${running.taskPath} · ${launchState(running)}`],
        ...(running === undefined || typeof running.javaHome !== 'string' || running.javaHome === ''
          ? []
          : [['JDK', running.javaHome]]),
      ]),
      h(
        'div',
        { className: 'mcdev-actions', style: { marginTop: 6 } },
        running === undefined
          ? h(
              'button',
              {
                type: 'button',
                className: 'mcdev-run',
                disabled: chosen === undefined || busy,
                title: chosen === undefined ? '没有可运行目标' : `启动 ${chosen.taskPath}`,
                onClick: () => {
                  if (chosen !== undefined) void startTarget(project, chosen)
                },
              },
              h('span', { className: 'mcdev-icon' }, h(IconPlay, undefined)),
              '启动',
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
                '停止',
              ),
              h(
                'button',
                { key: 'log', type: 'button', className: 'mcdev-mini', onClick: () => openLogTab(store.get().config) },
                '日志',
              ),
            ],
        hint('目标在标题栏胶囊的浮层里切换；启动后日志会自动打开，可用 autoOpenLogTab 关闭。'),
      ),
    ),

    // ── 环境 ──────────────────────────────────────────────────────────
    h(
      'div',
      { className: 'mcdev-sec' },
      h('h4', undefined, '环境'),
      kv([
        ['Gradle', `${text(project.gradleVersion)}${project.wrapper === true ? ' (wrapper)' : ' (无 wrapper)'}`],
        ...(typeof project.gradleRoot === 'string' && project.gradleRoot !== String(project.root)
          ? [['Gradle 根', project.gradleRoot]]
          : []),
        ['JDK 需要', text(java.required)],
        ['本机 JDK', availableMajors(java)],
        ...(idea === undefined ? [] : [['IDE', ideaSummary(idea)]]),
      ]),
      h(JdkPicker, { key: 'jdk', project, java }),
    ),

    // ── IDE 工程模型 ──────────────────────────────────────────────────
    // 有 .idea 才出现：它是识别引擎的第二证据源，把"读到了什么"摊开给人核对
    idea === undefined
      ? undefined
      : h(
          Fold,
          {
            key: 'idea',
            title: '.idea 工程模型',
            info: '从 IntelliJ 的 .idea 读到的已解析结果：模块清单、facet 平台、工程 JDK、人跑过的运行配置。识别只用它补漏，构建脚本优先。',
          },
          kv([
            ['工程名', text(idea.name)],
            ...(typeof idea.gradleRoot === 'string' && idea.gradleRoot !== String(project.root)
              ? [['Gradle 根', idea.gradleRoot]]
              : []),
            ['构建 JVM', text(idea.gradleJvm)],
            ['工程 JDK', text(idea.jdkName)],
            [
              'Java',
              `languageLevel ${text(idea.languageLevel)} · 字节码 ${text(idea.bytecodeTarget)}`,
            ],
            ['模块', `${text(idea.modules)} 个（${text(idea.imls)} 个 iml）`],
            ['运行配置', `${text(idea.runConfigurations)} 个`],
            ...(Array.isArray(idea.platforms) && idea.platforms.length > 0 ? [['facet 平台', idea.platforms.join(' / ')]] : []),
            ...(Array.isArray(idea.linkedProjects) && idea.linkedProjects.length > 0
              ? [['链接工程', idea.linkedProjects.join('、')]]
              : []),
            ['目录', text(idea.dir)],
          ]),
          Array.isArray(idea.files) && idea.files.length > 0
            ? h('div', { className: 'mcdev-hint', style: { marginTop: 4 } }, `读到：${idea.files.join('、')}`)
            : undefined,
        ),

    // ── 目标 ──────────────────────────────────────────────────────────
    modules.length === 0
      ? undefined
      : h(
          'div',
          { className: 'mcdev-sec' },
          h('h4', undefined, '目标', hint('带 ? 的是按 loader 惯例推测的目标，尚未真实运行验证；带 ✓ 的是 IDE 里跑过的运行配置对应的目标。')),
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
          ),
        ),

    // ── 依赖 ──────────────────────────────────────────────────────────
    h(
      Fold,
      {
        key: 'deps',
        title: '依赖',
        count: buildDeps.length,
        info: '构建脚本与元数据里声明的依赖，用来核对是否加进去了；Gradle 解析后的传递依赖不在这里。',
        open: true,
      },
      buildDeps.length === 0
        ? h('div', { className: 'mcdev-muted' }, '没有读到依赖声明')
        : h(
            'div',
            { className: 'mcdev-dep-list' },
            buildDeps.slice(0, DEP_ROW_LIMIT).map((dependency) =>
              h(
                'div',
                { className: 'mcdev-dep-row', key: `${dependency.file}:${dependency.line}:${dependency.notation}` },
                h(
                  'span',
                  { className: 'mcdev-dep-conf', title: dependency.configurations.join(', ') },
                  dependency.configurations.join(' '),
                ),
                h('span', { className: 'mcdev-dep-coord', title: dependency.notation }, dependency.notation),
                h('span', { className: 'mcdev-dep-pos', title: `${dependency.file}:${dependency.line}` }, `:${dependency.line}`),
              ),
            ),
          ),
      buildDeps.length > DEP_ROW_LIMIT
        ? h('div', { className: 'mcdev-hint', style: { marginTop: 4 } }, `另有 ${buildDeps.length - DEP_ROW_LIMIT} 条未显示`)
        : undefined,
      modDeps.length === 0
        ? undefined
        : h(
            'div',
            { className: 'mcdev-hint', style: { marginTop: 6 } },
            `模组声明：${modDeps.map((entry) => `${entry.modId} ${entry.range}`).join('，')}`,
          ),
    ),

    // ── 证据 ──────────────────────────────────────────────────────────
    h(
      Fold,
      { key: 'evidence', title: '证据', count: evidence.length, info: '识别结论的依据；面板上每个判断都能在这里找到出处。' },
      evidence.length === 0
        ? h('div', { className: 'mcdev-muted' }, '没有证据')
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

    // ── 页脚 ──────────────────────────────────────────────────────────
    h(
      'div',
      { className: 'mcdev-sec' },
      h(
        'button',
        { type: 'button', className: 'mcdev-mini', onClick: () => loadScan({ refresh: true }) },
        h('span', { className: 'mcdev-icon' }, h(IconRefresh, { size: 12 })),
        state.loading ? '扫描中…' : '重新扫描',
      ),
      state.scan?.scannedAt === undefined
        ? undefined
        : h(
            'span',
            { className: 'mcdev-hint', style: { marginLeft: 8 } },
            String(state.scan.scannedAt).replace('T', ' ').slice(0, 19),
          ),
    ),
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
    { style: { marginTop: 6 } },
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
        h('option', { value: '' }, java.required === undefined ? '自动' : `自动（按 MC 版本选 ${java.required}）`),
        ...dedupeByHome(jdks).map((jdk) =>
          h(
            'option',
            { key: jdk.home, value: jdk.home },
            `${jdk.major}${String(jdk.version) === String(jdk.major) ? '' : ` · ${jdk.version}`} — ${jdk.home}`,
          ),
        ),
        override !== '' && !known ? h('option', { key: 'missing', value: override }, `已失效 — ${override}`) : undefined,
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'mcdev-mini',
          title: '添加 JDK 根目录（含 release 文件）',
          disabled: busy,
          onClick: () => setAdding(!adding),
        },
        adding ? '取消' : '添加',
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
            placeholder: 'JDK 根目录，例如 C:\\Program Files\\Java\\jdk-21',
            disabled: busy,
            onChange: (event) => setPath(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') addFromInput()
            },
          }),
          h('button', { type: 'button', className: 'mcdev-mini', disabled: busy || path.trim() === '', onClick: addFromInput }, '加入'),
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
 * 环境区那一行 IDE 摘要：只放最有辨识度的三样，细节在 .idea 折叠区里。
 * @param {Record<string, any>} idea
 * @returns {string}
 */
function ideaSummary(idea) {
  const parts = [text(idea.name)]
  if (typeof idea.jdkName === 'string' && idea.jdkName !== '') parts.push(idea.jdkName)
  if (typeof idea.runConfigurations === 'number') parts.push(`${idea.runConfigurations} 个运行配置`)
  return parts.join(' · ')
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
  if (selected === '') return '没有可用的 JDK：装一个，或把路径加进来'
  if (java.source === 'override') return `生效：${selected}（手动指定）`
  if (java.source === 'configured') return `生效：${selected}（来自 gradle.properties）`
  return `生效：${selected}（自动）${java.exact === true ? '' : '，大版本不完全匹配'}`
}

/**
 * @param {Record<string, any>} entry
 * @returns {string}
 */
function launchState(entry) {
  if (entry.status === 'starting') return '启动中'
  if (entry.mode === 'oneshot') return entry.verdict === 'passed' ? '已通过' : '执行中'
  return '运行中'
}
