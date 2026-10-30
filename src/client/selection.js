/**
 * 目标选择的纯逻辑（不碰 React、不碰 DOM），方便单测。
 *
 * 选择结果按工程根目录记在 localStorage：同一工程下次打开还是上次那个目标。
 * @module minecraft-dev-starter/client/selection
 */

/** @type {Record<string, string>} */
const STORAGE_KEY = 'mcdev.selection'

/**
 * 一个目标的稳定 key（模块 + 任务路径）。
 * @param {Record<string, any>} target
 * @returns {string}
 */
export function targetKey(target) {
  return `${target.module ?? '.'}:${target.taskPath}`
}

/**
 * 按模块分组，保持 discovery 顺序；`common` 这类不可运行模块本来就无目标，不出现。
 * @param {Array<Record<string, any>>} targets
 * @returns {Array<{ module: string, targets: Array<Record<string, any>> }>}
 */
export function groupByModule(targets) {
  /** @type {Array<{ module: string, targets: Array<Record<string, any>> }>} */
  const groups = []
  for (const target of targets) {
    const module = String(target.module ?? '.')
    const group = groups.find((entry) => entry.module === module)
    if (group === undefined) groups.push({ module, targets: [target] })
    else group.targets.push(target)
  }
  return groups
}

/**
 * 当前选中的目标：记住的还在就用它，否则退回第一个。
 * @param {Record<string, any> | undefined} project
 * @param {Record<string, string>} selection
 * @returns {Record<string, any> | undefined}
 */
export function selectedTarget(project, selection) {
  const targets = /** @type {Array<Record<string, any>>} */ (project?.runTargets ?? [])
  if (targets.length === 0) return undefined
  const remembered = selection[String(project?.root ?? '')]
  return targets.find((target) => targetKey(target) === remembered) ?? targets[0]
}

/**
 * 胶囊上那行字：单模块只显示目标名，多模块带模块前缀。
 * @param {Record<string, any> | undefined} project
 * @param {Record<string, any> | undefined} target
 * @returns {string}
 */
export function capsuleText(project, target) {
  if (project === undefined) return '未检测到 MC 工程'
  if (target === undefined) return '无可运行目标'
  const module = String(target.module ?? '.')
  return module === '.' ? String(target.label) : `${module} · ${target.label}`
}

/**
 * 读一次记住的选择（localStorage 不可用时返回空表）。
 * @returns {Record<string, string>}
 */
export function readSelection() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (typeof raw !== 'string') return {}
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * 写回选择。
 * @param {Record<string, string>} selection
 */
export function writeSelection(selection) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(selection))
  } catch {
    /* 隐身模式等场景写不进去，忽略 */
  }
}

/**
 * 日志标签应该看哪一条实例。
 *
 * 规则（按优先级）：
 *   1. 有正在跑/启动中的实例 → 永远跟它（点 ▶ 之后最想看的就是这次）；
 *   2. 用户手动选过（pinned）→ 保持他的选择；
 *   3. 否则跟当前、再否则跟最新一条。
 *
 * 早期版本只在"没选过"时挑一次，于是新启动的实例不会顶上来——
 * 面板会一直停在旧实例（哪怕它是 0 字节的失败记录）。
 * @param {Array<Record<string, any>>} history
 * @param {string | undefined} currentId
 * @param {boolean} pinned
 * @returns {string | undefined}
 */
export function pickLogTarget(history, currentId, pinned) {
  const active = history.find((entry) => entry.status === 'starting' || entry.status === 'running')
  if (active !== undefined) return active.id
  if (pinned && currentId !== undefined) return currentId
  if (currentId !== undefined && history.some((entry) => entry.id === currentId)) return currentId
  return history[0]?.id
}

/**
 * 实例状态的中文标签。
 * @param {Record<string, any>} entry
 * @returns {string}
 */
export function launchStatusText(entry) {
  if (entry.status === 'starting') return '启动中'
  if (entry.status === 'running') return '运行中'
  if (entry.status === 'unknown') return '状态未知'
  if (entry.outcome === 'killed') return '已停止'
  if (entry.outcome === 'normal') return '已退出'
  return entry.exitCode === null || entry.exitCode === undefined ? '已退出' : `已退出(${entry.exitCode})`
}

/**
 * 胶囊的两段文案。窄的时候应该让"工程名"省略，而不是把目标名截掉——
 * 目标名才是可操作的那部分，工程名只是上下文。
 * @param {Record<string, any> | undefined} project
 * @param {Record<string, any> | undefined} target
 * @param {{ multipleProjects?: boolean }} [options]
 * @returns {{ project: string | undefined, target: string }}
 */
export function capsuleParts(project, target, options = {}) {
  const targetText = capsuleText(project, target)
  if (project === undefined || target === undefined || options.multipleProjects !== true) {
    return { project: undefined, target: targetText }
  }
  return { project: String(project.modName ?? project.name ?? project.root), target: targetText }
}

/**
 * 胶囊文案。工作区里有多个工程时把工程名带上——否则只显示 "Client" 没人知道
 * 它是哪个工程的（一个工作区里每工程都记着自己的选择）。
 * @param {Record<string, any> | undefined} project
 * @param {Record<string, any> | undefined} target
 * @param {{ multipleProjects?: boolean }} [options]
 * @returns {string}
 */
export function capsuleSummary(project, target, options = {}) {
  const parts = capsuleParts(project, target, options)
  return parts.project === undefined ? parts.target : `${parts.project} · ${parts.target}`
}
