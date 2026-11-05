/**
 * 展示层的纯格式化：把画像里的枚举翻成界面文案。不读时钟、不发请求。
 * @module minecraft-dev-starter/client/format
 */

/**
 * 面板名。比"MC 工程"更说明用途：这是给模组开发用的运行面板。
 */
export const PANEL_TITLE = 'Mod Dev'

/**
 * 同一模块在多个配置里声明很常见（`modCompileOnly` + `modRuntimeOnly`），
 * 合并成一行，避免依赖列表看起来一堆重复。
 * @param {Array<Record<string, any>>} build
 * @returns {Array<{ notation: string, configurations: string[], file: string, line: number }>}
 */
export function groupDependencies(build) {
  /** @type {Map<string, { notation: string, configurations: string[], file: string, line: number }>} */
  const groups = new Map()
  for (const dependency of build) {
    const key = String(dependency.module ?? dependency.notation)
    const existing = groups.get(key)
    if (existing === undefined) {
      groups.set(key, {
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
  return majors.length === 0 ? '未发现' : majors.join(' / ')
}

const LOADER_LABELS = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  paper: 'Paper',
  spigot: 'Spigot',
  architectury: 'Architectury',
  unknown: '未识别',
}

const KIND_LABELS = {
  mod: '模组',
  'server-plugin': '服务端插件',
  'multi-loader': '多平台',
  unknown: '未知',
}

/**
 * @param {string | undefined} loader
 * @returns {string}
 */
export function loaderLabel(loader) {
  return LOADER_LABELS[loader ?? 'unknown'] ?? loader ?? '未识别'
}

/**
 * @param {string | undefined} kind
 * @returns {string}
 */
export function kindLabel(kind) {
  return KIND_LABELS[kind ?? 'unknown'] ?? kind ?? '未知'
}

/**
 * 胶囊上的短标签：单工程显示 loader + MC 版本，多工程显示数量。
 * @param {Array<Record<string, any>>} projects
 * @param {string | undefined} selectedRoot
 * @returns {string}
 */
export function capsuleLabel(projects, selectedRoot) {
  if (projects.length === 0) return '未发现 MC 工程'
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
 * 工程列表的显示名：同名时补上目录名，否则两行 "Burst Door Open" 无法区分。
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
  return projects.map((project) => {
    const title = projectTitle(project)
    const duplicated = (counts.get(title) ?? 0) > 1
    return {
      project,
      title,
      // 重名的才补目录名，其余保持干净
      suffix: duplicated ? basenameOf(String(project.root)) : '',
    }
  })
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
