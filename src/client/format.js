/**
 * 展示层的纯格式化：把画像里的枚举翻成界面文案。不读时钟、不发请求。
 * @module minecraft-dev-starter/client/format
 */

/**
 * 面板名。比"MC 工程"更说明用途：这是给模组开发用的运行面板。
 */
export const PANEL_TITLE = 'Mod Dev'

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
 * @param {Record<string, any> | undefined} project
 * @returns {string}
 */
export function projectTitle(project) {
  if (project === undefined) return '—'
  return project.modName ?? project.name ?? project.root
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
