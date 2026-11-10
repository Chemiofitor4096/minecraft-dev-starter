/**
 * 展示层的纯格式化：把画像里的枚举翻成界面文案。不读时钟、不发请求。
 * @module minecraft-dev-starter/client/format
 */

import { activeLanguage, t } from './messages.js'

/**
 * 面板名。比"MC 工程"更说明用途：这是给模组开发用的运行面板。
 */
export const PANEL_TITLE = 'Mod Dev'

/**
 * 同一模块在多个配置里声明很常见（`modCompileOnly` + `modRuntimeOnly`），
 * 合并成一行，避免依赖列表看起来一堆重复。
 * @param {Array<Record<string, any>>} build
 * @returns {Array<{ module?: string, notation: string, configurations: string[], file: string, line: number }>}
 */
export function groupDependencies(build) {
  /** @type {Map<string, { module?: string, notation: string, configurations: string[], file: string, line: number }>} */
  const groups = new Map()
  for (const dependency of build) {
    const key = String(dependency.module ?? dependency.notation)
    const existing = groups.get(key)
    if (existing === undefined) {
      groups.set(key, {
        // module 留着给面板对照 IDE 解析结果：同一坐标的多个配置合并后仍要能查到
        ...(dependency.module === undefined ? {} : { module: String(dependency.module) }),
        notation: String(dependency.notation),
        configurations: [String(dependency.configuration)],
        file: String(dependency.file),
        line: Number(dependency.line),
      })
      continue
    }
    if (!existing.configurations.includes(String(dependency.configuration))) {
      existing.configurations.push(String(dependency.configuration))
    }
  }
  return [...groups.values()]
}

/**
 * 本机 JDK 的大版本列表：同一大版本装了几个只列一次。
 * @param {Record<string, any>} java
 * @returns {string}
 */
export function availableMajors(java) {
  const available = Array.isArray(java?.available) ? java.available : []
  const majors = [...new Set(available.map((jdk) => String(jdk.major)))].sort((left, right) => Number(right) - Number(left))
  return majors.length === 0 ? t('jdk.majors.none') : majors.join(' / ')
}

const LOADER_LABELS = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  paper: 'Paper',
  spigot: 'Spigot',
  architectury: 'Architectury',
}

/** @type {Record<string, string>} */
const KIND_LABEL_KEYS = {
  mod: 'kind.mod',
  'server-plugin': 'kind.serverPlugin',
  'multi-loader': 'kind.multiLoader',
  unknown: 'kind.unknown',
}

/**
 * @param {string | undefined} loader
 * @returns {string}
 */
export function loaderLabel(loader) {
  if (loader === undefined || loader === null || loader === '' || loader === 'unknown') return t('loader.unknown')
  return LOADER_LABELS[loader] ?? String(loader)
}

/**
 * @param {string | undefined} kind
 * @returns {string}
 */
export function kindLabel(kind) {
  if (kind === undefined || kind === null || kind === '') return t('kind.unknown')
  const key = KIND_LABEL_KEYS[kind]
  return key === undefined ? String(kind) : t(key)
}

/**
 * 胶囊上的短标签：单工程显示 loader + MC 版本，多工程显示数量。
 * @param {Array<Record<string, any>>} projects
 * @param {string | undefined} selectedRoot
 * @returns {string}
 */
export function capsuleLabel(projects, selectedRoot) {
  if (projects.length === 0) return t('capsule.noProjects')
  const project = projects.find((entry) => entry.root === selectedRoot) ?? projects[0]
  if (projects.length > 1) {
    return `${loaderLabel(project?.loader)} ${project?.minecraftVersion ?? ''} · ${projects.length}`.trim()
  }
  const version = project?.minecraftVersion
  const loader = loaderLabel(project?.loader)
  return version === undefined ? loader : `${loader} ${version}`
}

/**
 * 未解析的 Gradle 占位符（`${mod_name}`、`${version}`）：mods.toml 里常见，
 * 直接显示出来比显示目录名更没有信息量。
 */
const PLACEHOLDER = /\$\{[^}]+\}/

/**
 * 工程目录名。
 * @param {string} root
 * @returns {string}
 */
export function basenameOf(root) {
  const parts = String(root ?? '').split(/[\\/]+/).filter((part) => part !== '')
  return parts.length === 0 ? String(root ?? '') : parts[parts.length - 1]
}

/**
 * @param {Record<string, any> | undefined} project
 * @returns {string}
 */
export function projectTitle(project) {
  if (project === undefined) return '—'
  const name = project.name ?? project.root
  const modName = project.modName
  // 占位符没解析出来时退回目录名——它至少是唯一的，而且能对上工作区
  if (typeof modName === 'string' && modName !== '' && !PLACEHOLDER.test(modName)) return modName
  return String(name ?? project.root ?? '—')
}

/**
 * 工程列表的显示名：聚合工程的子模块补父目录名，其余重名时补目录名。
 *
 * 重名按**整个传入列表**计数——调用方要把所有分组一起传进来，跨组（可运行 / 其他）
 * 同名时也会补后缀，不会出现一处补一处不补。同一父工程的子模块相邻排列，
 * 一眼就能看出它们属于同一个聚合工程。
 * @param {Array<Record<string, any>>} projects
 * @returns {Array<{ project: Record<string, any>, title: string, suffix: string }>}
 */
export function listRows(projects) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const project of projects) {
    const title = projectTitle(project)
    counts.set(title, (counts.get(title) ?? 0) + 1)
  }

  // 子模块按父工程归组；组落在第一次出现的位置，组内保持原顺序
  /** @type {Array<Record<string, any>>} */
  const ordered = []
  /** @type {Set<string>} */
  const grouped = new Set()
  for (const project of projects) {
    const parentRoot = parentRootOf(project)
    if (parentRoot === undefined) {
      ordered.push(project)
      continue
    }
    if (grouped.has(parentRoot)) continue
    grouped.add(parentRoot)
    for (const candidate of projects) {
      if (parentRootOf(candidate) === parentRoot) ordered.push(candidate)
    }
  }

  return ordered.map((project) => {
    const title = projectTitle(project)
    const duplicated = (counts.get(title) ?? 0) > 1
    const parentRoot = parentRootOf(project)
    return {
      project,
      title,
      // 子模块先标归属的父工程；没有父工程的，重名才补自己的目录名
      suffix:
        parentRoot === undefined
          ? duplicated
            ? basenameOf(String(project.root))
            : ''
          : basenameOf(parentRoot),
    }
  })
}

/**
 * 聚合工程子模块的父目录；顶层工程没有。
 * @param {Record<string, any>} project
 * @returns {string | undefined}
 */
function parentRootOf(project) {
  const parentRoot = project.parentRoot
  return typeof parentRoot === 'string' && parentRoot !== '' ? parentRoot : undefined
}

/**
 * 运行时长：不足一分钟按秒，否则「N 分 M 秒」。
 * 时间戳缺失或无法解析时返回 undefined，交给调用方退回结论文案。
 * @param {string | null | undefined} startedAt
 * @param {string | null | undefined} endedAt
 * @returns {string | undefined}
 */
export function runDuration(startedAt, endedAt) {
  const started = Date.parse(String(startedAt ?? ''))
  const ended = Date.parse(String(endedAt ?? ''))
  if (Number.isNaN(started) || Number.isNaN(ended)) return undefined
  const seconds = Math.max(0, Math.round((ended - started) / 1000))
  if (seconds < 60) return t('duration.seconds', { n: seconds })
  return t('duration.minutes', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 })
}

/**
 * 相对时间：几秒 / 几分钟 / 几小时前；超过一天显示 ISO 日期（UTC，与 0.1.12 一致）。
 *
 * 用 Intl.RelativeTimeFormat 取当前语言的单位与语序（复数、语序都交给 ICU）：
 *   zh → 「5 秒前」；0.1.12 的文案在数字后有一个空格，补上以保持逐字一致。
 *   en → 「5 sec ago」「12 min ago」「3 hours ago」。
 *
 * @param {string | null | undefined} iso
 * @param {number} [now]
 * @returns {string}
 */
export function relativeTime(iso, now = Date.now()) {
  const at = Date.parse(String(iso ?? ''))
  if (Number.isNaN(at)) return '—'
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return relativeUnit(-seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return relativeUnit(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return relativeUnit(-hours, 'hour')
  return isoDate(at)
}

/**
 * 英文下各单位的样式：秒 / 分取缩写（侧栏一行放不下 "12 minutes ago"），
 * 小时用全称（"3 hours ago"，比 "3 hr ago" 顺口，长度也还撑得住）。
 */
const EN_RELATIVE_STYLE = { second: 'short', minute: 'short', hour: 'long' }

/**
 * @param {number} value
 * @param {'second' | 'minute' | 'hour'} unit
 * @returns {string}
 */
function relativeUnit(value, unit) {
  const language = activeLanguage()
  try {
    const style = language === 'en' ? EN_RELATIVE_STYLE[unit] : 'short'
    const format = new Intl.RelativeTimeFormat(language, { numeric: 'always', style })
    const text = format.format(value, unit)
    // zh 的 short 样式是「5秒前」，而 0.1.12 的文案是「5 秒前」，补一个空格保持逐字一致
    if (language === 'zh') return text.replace(/^(\d+)/, '$1 ')
    // en 的 short 样式会带缩写点（"12 min. ago"）；面板上不要那个点
    return text.replace(/\b(sec|min|hr)\./g, '$1')
  } catch {
    const key = unit === 'second' ? 'time.secondsAgo' : unit === 'minute' ? 'time.minutesAgo' : 'time.hoursAgo'
    return t(key, { n: Math.abs(value) })
  }
}

/**
 * UTC 日期，格式与 0.1.12 的 `toISOString().slice(0, 10)` 一致。
 * @param {number} at
 * @returns {string}
 */
function isoDate(at) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(at))
    const part = (type) => parts.find((entry) => entry.type === type)?.value ?? ''
    return `${part('year')}-${part('month')}-${part('day')}`
  } catch {
    return new Date(at).toISOString().slice(0, 10)
  }
}

/**
 * 只显示时:分（本地时间），日志实例下拉里用。
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatClock(iso) {
  const at = new Date(String(iso ?? ''))
  if (Number.isNaN(at.getTime())) return '--:--'
  try {
    return new Intl.DateTimeFormat(activeLanguage(), {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(at)
  } catch {
    return '--:--'
  }
}

/**
 * 扫描时间：`YYYY-MM-DD HH:mm:ss`（UTC，沿用 0.1.12 的显示）。
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatDateTime(iso) {
  const at = new Date(String(iso ?? ''))
  if (Number.isNaN(at.getTime())) return String(iso ?? '')
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(at)
    const part = (type) => parts.find((entry) => entry.type === type)?.value ?? ''
    return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`
  } catch {
    return String(iso ?? '')
  }
}

/**
 * IDE 同步时间：本地时区的 `YYYY-MM-DD HH:mm`（不显示秒）。
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatSyncTime(iso) {
  const at = new Date(String(iso ?? ''))
  if (Number.isNaN(at.getTime())) return String(iso ?? '')
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(at)
    const part = (type) => parts.find((entry) => entry.type === type)?.value ?? ''
    return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
  } catch {
    return String(iso ?? '')
  }
}

/**
 * @param {Record<string, any> | undefined} project
 * @returns {string}
 */
export function projectSubtitle(project) {
  if (project === undefined) return ''
  const parts = [loaderLabel(project.loader)]
  if (project.minecraftVersion !== undefined) parts.push(String(project.minecraftVersion))
  if (project.loaderVersion !== undefined) parts.push(`loader ${project.loaderVersion}`)
  return parts.join(' · ')
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function text(value) {
  if (value === undefined || value === null || value === '') return '—'
  return String(value)
}
