/**
 * 工具的纯文本渲染：中文、只依赖传入的值，不碰 api、不碰宿主。
 *
 * 放在一处的原因是"同一件事别说两遍"：结论、目标、IDE 摘要、状态词都在这里定义。
 * @module minecraft-dev-starter/tools/render
 */

/** mc_project_detail 的渲染里最多列多少个目标（其余只报数量）。 */
export const TARGET_LINE_LIMIT = 12

/** 启动前提示码 → 中文说明（值是语言中立的 code，这里才翻）。 */
export const NOTICE_TEXT = {
  'first-run-assets':
    '首次 runClient 要下载 Minecraft 资源（几百 MB）；网络受限时用 gradleProperties 传 https.proxyHost / https.proxyPort，或先联网跑一次构建。',
}

/**
 * mc_launch 的渲染：常驻目标说"起来了没有"，一次性任务说"过没过"。
 * @param {Record<string, any>} value
 * @returns {string}
 */
export function describeLaunch(value) {
  const target = value.taskPath
  if (value.mode === 'oneshot') {
    const head = `${target} 已完成（${value.id}）：`
    if (value.verdict === 'passed') return `${head}通过${value.summary === undefined ? '' : `（${value.summary}）`}。`
    if (value.verdict === 'failed') {
      const lines = [`${head}失败${value.exitCode === undefined ? '' : `（退出码 ${value.exitCode}）`}。`]
      if (value.summary !== undefined) lines.push(`第一处失败：${value.summary}`)
      if (Array.isArray(value.failures) && value.failures.length > 1) {
        lines.push(`另有 ${value.failures.length - 1} 行失败特征，用 mc_launch_logs 看全文。`)
      }
      return lines.join('\n')
    }
    if (value.verdict === 'aborted') return `${target} 被停止（${value.id}），没有结论。`
    if (value.verdict === 'error') return `${target} 没能启动（${value.id}），用 mc_launch_logs 看原因。`
    if (value.verdict === 'unknown') return `${target} 结束方式未知（${value.id}），用 mc_launch_logs 看日志。`
    if (value.timedOut) return `${target} 还没跑完（${value.id}），等满了超时；用 mc_launch_logs 看进展，或调大 timeoutMs 重跑。`
    return `${target} 已开始（${value.id}）；用 mc_launch_logs 看进展，mc_launch_list 看是否结束。`
  }
  if (value.timedOut) {
    return `已启动 ${target}（${value.id}），但在超时前没看到就绪标记；用 mc_launch_logs 看进展，可能还在构建。`
  }
  return `启动 ${target}：状态 ${value.status}，实例 ${value.id}${value.pid === undefined ? '' : `，pid ${value.pid}`}。日志在 ${value.logPath}。`
}

/**
 * 注意：这里渲染的是工具的**输出值**（紧凑形状，字段是 `targets`），
 * 不是工程画像（字段是 `runTargets`）。早期版本读错字段，导致"0 个目标"。
 * @param {{ root: string, projects: Array<Record<string, any>> }} value
 * @returns {string}
 */
export function renderProjects(value) {
  const projects = /** @type {Array<Record<string, any>>} */ (value.projects ?? [])
  if (projects.length === 0) return `工作区 ${value.root} 里没有识别到 Minecraft 工程。`
  const lines = [`工作区 ${value.root}：${projects.length} 个工程`]
  for (const project of projects) {
    if (typeof project.error === 'string') {
      lines.push(`- ${project.name} · 识别失败：${project.error}`)
      continue
    }
    const targets = /** @type {string[]} */ (project.targets ?? [])
    const version = project.minecraftVersion === undefined || project.minecraftVersion === '' ? '' : ` ${project.minecraftVersion}`
    lines.push(
      `- ${project.name} · ${project.loader}${version} · ${targets.length} 个目标：${targets.length === 0 ? '无可运行目标' : targets.join(', ').replaceAll(' (guessed)', '（未验证）')}`,
    )
  }
  return lines.join('\n')
}



/**
 * 目标列表的渲染。聚合仓库一个工程能列出二三十个目标，全铺出来是一堵墙，
 * 截断后告诉模型"还有多少"，要看全部就按模块读 `modules[].targets`。
 * @param {Array<Record<string, any>>} targets
 * @returns {string}
 */
export function renderTargets(targets) {
  const shown = targets.slice(0, TARGET_LINE_LIMIT)
  const line = shown
    .map((target) => `${target.taskPath}（${target.mode === 'oneshot' ? '会跑完' : '常驻'}${targetSourceText(target)}）`)
    .join('、')
  return targets.length > TARGET_LINE_LIMIT ? `${line}…另有 ${targets.length - TARGET_LINE_LIMIT} 个` : line
}

/**
 * 目标的来源说明：模型据此判断"这个目标敢不敢直接跑"。
 * @param {{ guessed?: boolean, source?: string }} target
 * @returns {string}
 */
export function targetSourceText(target) {
  if (target.guessed === true) return '，未验证'
  if (target.source === 'idea-run-config') return '，来自 IDE 运行配置'
  return ''
}

/**
 * IDE 工程模型的一行摘要。
 * @param {Record<string, any>} idea
 * @returns {string}
 */
export function ideaText(idea) {
  const parts = [String(idea.name ?? ''), String(idea.dir ?? '')]
  if (typeof idea.jdkName === 'string' && idea.jdkName !== '') parts.push(`JDK ${idea.jdkName}`)
  if (typeof idea.minecraftVersion === 'string' && idea.minecraftVersion !== '') parts.push(`MC ${idea.minecraftVersion}`)
  if (typeof idea.languageLevel === 'number') parts.push(`languageLevel ${idea.languageLevel}`)
  if (typeof idea.modules === 'number') parts.push(`${idea.modules} 个模块`)
  if (typeof idea.runConfigurations === 'number') parts.push(`${idea.runConfigurations} 个运行配置`)
  if (Array.isArray(idea.platforms) && idea.platforms.length > 0) parts.push(`facet ${idea.platforms.join('/')}`)
  if (Array.isArray(idea.linkedProjects) && idea.linkedProjects.length > 0) {
    parts.push(`链接工程 ${idea.linkedProjects.join('、')}`)
  }
  return parts.filter((part) => part !== '').join(' · ')
}

/**
 * JDK 从哪来的：模型据此判断"是不是人在面板里指定过"。
 * @param {string | undefined} source
 * @returns {string}
 */
export function javaSourceText(source) {
  if (source === 'override') return '（手动指定）'
  if (source === 'configured') return '（来自 gradle.properties）'
  if (source === 'auto') return '（自动）'
  return ''
}

/**
 * 实例状态的中文短标签。
 * @param {{ status?: string, outcome?: string, exitCode?: number, mode?: string, verdict?: string }} entry
 * @returns {string}
 */
export function statusText(entry) {
  if (entry.status === 'starting') return '启动中'
  if (entry.status === 'running') return entry.mode === 'oneshot' ? '执行中' : '运行中'
  if (entry.status === 'unknown') return '状态未知'
  if (entry.verdict === 'passed') return '通过'
  if (entry.verdict === 'failed') return '失败'
  if (entry.verdict === 'aborted' || entry.outcome === 'killed') return '已停止'
  if (entry.outcome === 'normal') return '已退出'
  return entry.exitCode === undefined ? '已退出' : `已退出(${entry.exitCode})`
}

/**
 * @param {string} iso
 * @returns {string}
 */
export function clock(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

