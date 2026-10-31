/**
 * 模型侧工具（M5）：面板能做的事，AI 也该能做，而且是同一套服务。
 *
 * 四个工具都薄封装在 `/mcdev/api` 的方法表上，不复制业务逻辑：
 *   mc_projects / mc_launch / mc_launch_logs / mc_launch_stop
 *
 * 依赖 `@deepseek-ai/dsh-tools` 的 `defineTool`（与桌面运行时同版本 0.2.1-rc.3）。
 * @module minecraft-dev-starter/tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

/**
 * 工具的工作区根：调用参数优先，其次取**调用它的那个会话**的 cwd。
 *
 * 宿主里可能有多个会话、各自的 cwd 不同；用"最近一个会话"当默认会把
 * 别的会话的工程当成当前工作区。
 * @param {{ root?: string }} args
 * @param {{ agent?: any } | undefined} exec
 * @returns {string | undefined}
 */
function agentRoot(args, exec) {
  if (typeof args.root === 'string' && args.root !== '') return args.root
  const cwd = exec?.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

/**
 * 等实例进入 running 或结束。
 * @param {{ 'launch.list': (payload?: unknown) => Promise<any> }} api
 * @param {string} launchId
 * @param {number} timeoutMs
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<Record<string, any> | undefined>}
 */
async function waitForSettle(api, launchId, timeoutMs, signal) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted === true) return undefined
    const list = await api['launch.list']({})
    const entry = list.find((item) => item.id === launchId)
    if (entry === undefined) return undefined
    if (entry.status === 'running' || entry.status === 'exited' || entry.status === 'unknown') return entry
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return undefined
}

/**
 * mc_launch 的输出值：只放存在的字段（`pid` 可能是 null），保证无损 JSON。
 * @param {Record<string, any>} record
 * @param {boolean} timedOut
 */
function launchValue(record, timedOut) {
  /** @type {Record<string, any>} */
  const value = {
    id: record.id,
    status: record.status,
    taskPath: record.taskPath,
    logPath: record.logPath,
    timedOut,
  }
  if (typeof record.pid === 'number') value.pid = record.pid
  return value
}

/**
 * 注意：这里渲染的是工具的**输出值**（紧凑形状，字段是 `targets`），
 * 不是工程画像（字段是 `runTargets`）。早期版本读错字段，导致"0 个目标"。
 * @param {{ root: string, projects: Array<Record<string, any>> }} value
 * @returns {string}
 */
function renderProjects(value) {
  const projects = /** @type {Array<Record<string, any>>} */ (value.projects ?? [])
  if (projects.length === 0) return `工作区 ${value.root} 里没有识别到 Minecraft 工程。`
  const lines = [`工作区 ${value.root}：${projects.length} 个工程`]
  for (const project of projects) {
    const targets = /** @type {string[]} */ (project.targets ?? [])
    const version = project.minecraftVersion === undefined || project.minecraftVersion === '' ? '' : ` ${project.minecraftVersion}`
    lines.push(
      `- ${project.name} · ${project.loader}${version} · ${targets.length} 个目标：${targets.length === 0 ? '无可运行目标' : targets.join(', ')}`,
    )
  }
  return lines.join('\n')
}

/**
 * 注册 M5 的四个工具。
 * @param {any} ctx
 * @param {{ api: Record<string, any> }} deps
 */
export function applyTools(ctx, deps) {
  const api = deps.api

  ctx.tools.register(
    defineTool({
      name: 'mc_projects',
      description:
        '列出当前工作区里识别到的 Minecraft 工程（Fabric/Forge/NeoForge/Paper/Architectury）以及每个工程可运行的目标（runClient、runServer…）。'
        + ' 只读。要看某个工程的证据与警告用 mc_project_detail；要启动用 mc_launch。',
      parameters: {
        root: { type: 'string', description: '工作区目录；省略则用当前会话的工作区' },
        refresh: { type: 'boolean', description: '跳过 5 秒缓存重新扫描' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            root: { type: 'string', required: true },
            projects: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  name: { type: 'string' },
                  root: { type: 'string' },
                  loader: { type: 'string' },
                  minecraftVersion: { type: 'string' },
                  targets: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            truncated: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: renderProjects(value) }],
      },
      async execute(args, exec) {
        const scan = await api['projects.scan']({ root: agentRoot(args, exec), refresh: args.refresh === true })
        return {
          root: scan.root,
          truncated: scan.truncated === true,
          projects: (scan.projects ?? []).map((project) => ({
            name: project.name,
            root: project.root,
            loader: project.loader,
            minecraftVersion: project.minecraftVersion ?? '',
            targets: (project.runTargets ?? []).map((target) => `${target.taskPath}${target.guessed === true ? ' (推测)' : ''}`),
          })),
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'mc_launch',
      description:
        '在后台启动一个 Minecraft 开发工程的运行目标（默认等它进入运行态再返回，最长 10 分钟）。'
        + ' 同一个工程同时只能有一个实例；任务路径必须是 mc_projects 列出的那些（形如 runClient 或 :fabric:runClient）。'
        + ' 首次构建需要下载依赖，耗时可能数分钟；超时只代表还没看到就绪标记，不代表失败。'
        + ' 启动后可用 mc_launch_logs 看日志、mc_launch_stop 停止。',
      parameters: {
        root: { type: 'string', description: '工程根目录；省略则用当前工作区' },
        taskPath: { type: 'string', required: true, description: 'Gradle 任务路径，例如 runClient、:fabric:runClient' },
        wait: { type: 'string', enum: ['ready', 'detach'], description: 'ready（默认）等到运行态或结束；detach 立刻返回' },
        timeoutMs: { type: 'number', description: '等就绪的上限，默认 600000（10 分钟）' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            status: { type: 'string', required: true },
            taskPath: { type: 'string', required: true },
            pid: { type: 'integer' },
            logPath: { type: 'string', required: true },
            timedOut: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: value.timedOut
              ? `已启动 ${value.taskPath}（${value.id}），但在超时前没看到就绪标记；用 mc_launch_logs 看进展，可能还在构建。`
              : `启动 ${value.taskPath}：状态 ${value.status}，实例 ${value.id}${value.pid === undefined ? '' : `，pid ${value.pid}`}。日志在 ${value.logPath}。`,
          },
        ],
      },
      async execute(args, exec) {
        const record = await api['launch.start']({ root: agentRoot(args, exec), taskPath: args.taskPath })
        if (args.wait === 'detach') {
          return launchValue(record, false)
        }
        const timeoutMs = Number.isFinite(args.timeoutMs) ? Number(args.timeoutMs) : 600_000
        const settled = await waitForSettle(api, record.id, timeoutMs, exec.signal)
        return launchValue(settled ?? record, settled === undefined)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'mc_launch_logs',
      description: '读某个运行实例的日志（默认当前工程正在跑的那个）。异常退出时附带一句归因。',
      parameters: {
        id: { type: 'string', description: '实例 id（launch-N）；省略则用当前工程活跃实例' },
        root: { type: 'string', description: '工程根目录；配合 id 省略时使用' },
        offset: { type: 'number', description: '起始行号，默认 0' },
        limit: { type: 'number', description: '最多返回多少行，默认 200' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            launchId: { type: 'string', required: true },
            status: { type: 'string', required: true },
            outcome: { type: 'string' },
            exitCode: { type: 'integer' },
            lines: { type: 'array', required: true, items: { type: 'string' } },
            total: { type: 'integer', required: true },
            diagnosis: {
              type: 'object',
              additionalProperties: false,
              properties: {
                code: { type: 'string' },
                hint: { type: 'string', required: true },
                suggestion: { type: 'string' },
              },
            },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text:
              `${value.launchId} · ${value.status}${value.outcome === undefined ? '' : `/${value.outcome}`}`
              + `${value.diagnosis === undefined ? '' : `\n归因：${value.diagnosis.hint}`}`
              + `${value.diagnosis?.suggestion === undefined ? '' : `\n建议：${value.diagnosis.suggestion}`}`
              + `\n${value.lines.slice(-40).join('\n')}`,
          },
        ],
      },
      async execute(args, exec) {
        let id = args.id
        if (id === undefined || id === '') {
          const current = await api['launch.current']({ root: agentRoot(args, exec) })
          if (current === null || current === undefined) throw new Error('当前工程没有运行中的实例；请传 id')
          id = current.id
        }
        const result = await api['launch.logs']({
          id,
          offset: Number.isFinite(args.offset) ? Number(args.offset) : 0,
          limit: Number.isFinite(args.limit) ? Number(args.limit) : 200,
        })
        // 只放存在字段：工具结果必须是"无损 JSON"，带 undefined 会被注册器整条拒掉
        /** @type {Record<string, any>} */
        const value = {
          launchId: result.launchId,
          status: result.status,
          lines: result.lines ?? [],
          total: result.total ?? 0,
        }
        if (result.outcome !== null && result.outcome !== undefined) value.outcome = result.outcome
        if (typeof result.exitCode === 'number') value.exitCode = result.exitCode
        if (result.diagnosis !== undefined) {
          // 结构化：模型不用解析中文就能决定下一步
          /** @type {Record<string, any>} */
          const diagnosis = { hint: result.diagnosis.hint }
          if (result.diagnosis.code !== undefined) diagnosis.code = result.diagnosis.code
          if (result.diagnosis.suggestion !== undefined) diagnosis.suggestion = result.diagnosis.suggestion
          value.diagnosis = diagnosis
        }
        return value
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'mc_launch_stop',
      description: '停止一个运行实例（连同它拉起的整个进程树）。省略 id 时停当前工程的活跃实例。',
      parameters: {
        id: { type: 'string', description: '实例 id；省略则用当前工程活跃实例' },
        root: { type: 'string', description: '工程根目录；配合 id 省略时使用' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            status: { type: 'string', required: true },
            outcome: { type: 'string' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: `已停止 ${value.id}：${value.status}${value.outcome === undefined ? '' : `/${value.outcome}`}` }],
      },
      async execute(args, exec) {
        let id = args.id
        if (id === undefined || id === '') {
          const current = await api['launch.current']({ root: agentRoot(args, exec) })
          if (current === null || current === undefined) throw new Error('当前工程没有运行中的实例；请传 id')
          id = current.id
        }
        const record = await api['launch.stop']({ id })
        /** @type {Record<string, any>} */
        const value = { id: record.id, status: record.status }
        if (record.outcome !== null && record.outcome !== undefined) value.outcome = record.outcome
        return value
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'mc_launch_list',
      description:
        '列出运行实例（默认当前工程，最近在前）。用于查历史：某个实例为什么退出、上次跑的是哪个目标。只读。',
      parameters: {
        root: { type: 'string', description: '工程根目录；省略则用当前会话的工作区' },
        limit: { type: 'number', description: '最多返回多少条，默认 10' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            root: { type: 'string', required: true },
            launches: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  taskPath: { type: 'string', required: true },
                  label: { type: 'string', required: true },
                  status: { type: 'string', required: true },
                  outcome: { type: 'string' },
                  exitCode: { type: 'integer' },
                  startedAt: { type: 'string', required: true },
                  endedAt: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text:
              `工作区 ${value.root} 的实例（${value.launches.length} 条）`
              + (value.launches.length === 0
                ? ''
                : `\n${value.launches
                    .map((entry) => `- ${entry.id} · ${entry.label} · ${statusText(entry)} · ${clock(entry.startedAt)}`)
                    .join('\n')}`),
          },
        ],
      },
      async execute(args, exec) {
        const root = await api['projects.scan']({ root: agentRoot(args, exec) }).then((scan) => scan.root)
        const all = await api['launch.list']({ root })
        const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 10
        const launches = all.slice(0, limit).map((record) => {
          /** @type {Record<string, any>} */
          const value = {
            id: record.id,
            taskPath: record.taskPath,
            label: record.label,
            status: record.status,
            startedAt: record.startedAt,
          }
          if (record.outcome !== null && record.outcome !== undefined) value.outcome = record.outcome
          if (typeof record.exitCode === 'number') value.exitCode = record.exitCode
          if (record.endedAt !== null && record.endedAt !== undefined) value.endedAt = record.endedAt
          return value
        })
        return { root, launches }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'mc_project_detail',
      description:
        '查看单个工程的完整画像：loader 判定依据、模块与目标、JDK 需求与选择、证据、冲突与警告。只读。'
        + ' 用于回答"为什么判成这个 loader""为什么启动不了""缺哪个 JDK"。',
      parameters: {
        root: { type: 'string', description: '工程根目录；省略则用当前会话的工作区' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            root: { type: 'string', required: true },
            name: { type: 'string', required: true },
            loader: { type: 'string', required: true },
            loaders: { type: 'array', items: { type: 'string' } },
            minecraftVersion: { type: 'string' },
            kind: { type: 'string', required: true },
            confidence: { type: 'number', required: true },
            modules: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string', required: true },
                  platform: { type: 'string', required: true },
                  targets: { type: 'array', required: true, items: { type: 'string' } },
                },
              },
            },
            java: {
              type: 'object',
              additionalProperties: false,
              properties: {
                required: { type: 'number' },
                selected: { type: 'string' },
                exact: { type: 'boolean' },
                available: { type: 'array', items: { type: 'number' } },
              },
            },
            evidence: { type: 'array', required: true, items: { type: 'string' } },
            warnings: { type: 'array', required: true, items: { type: 'string' } },
            conflicts: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text:
              `${value.name} · ${value.loader}${value.minecraftVersion === undefined ? '' : ` ${value.minecraftVersion}`} · 置信度 ${Math.round(value.confidence * 100)}%`
              + `\n模块：${value.modules.map((module) => `${module.path}(${module.platform})`).join('、')}`
              + `\nJDK：需要 ${value.java?.required ?? '?'}，选中 ${value.java?.selected ?? '无'}`
              + (value.warnings.length === 0 ? '' : `\n警告：${value.warnings.join('；')}`),
          },
        ],
      },
      async execute(args, exec) {
        const root = args.root ?? (await api['projects.scan']({ root: agentRoot(args, exec) }).then((scan) => scan.root))
        const profile = await api['projects.detail']({ root })
        /** @type {Record<string, any>} */
        const value = {
          root: profile.root,
          name: profile.modName ?? profile.name,
          loader: profile.loader,
          kind: profile.kind,
          confidence: profile.confidence,
          modules: (profile.modules ?? []).map((module) => ({
            path: module.path,
            platform: module.platform,
            targets: (module.targets ?? []).map((target) => target.taskPath),
          })),
          evidence: (profile.evidence ?? []).map((entry) => `${entry.file} — ${entry.detail}`),
          warnings: profile.warnings ?? [],
          conflicts: profile.conflicts ?? [],
        }
        if (Array.isArray(profile.loaders) && profile.loaders.length > 0) value.loaders = profile.loaders
        if (profile.minecraftVersion !== undefined && profile.minecraftVersion !== '') value.minecraftVersion = profile.minecraftVersion
        if (profile.java !== undefined) {
          value.java = { required: profile.java.required, exact: profile.java.exact === true }
          if (profile.java.selected !== undefined) value.java.selected = profile.java.selected
          value.java.available = (profile.java.available ?? []).map((jdk) => jdk.major)
        }
        return value
      },
    }),
  )
}

/**
 * 实例状态的中文短标签。
 * @param {{ status?: string, outcome?: string, exitCode?: number }} entry
 * @returns {string}
 */
function statusText(entry) {
  if (entry.status === 'starting') return '启动中'
  if (entry.status === 'running') return '运行中'
  if (entry.status === 'unknown') return '状态未知'
  if (entry.outcome === 'killed') return '已停止'
  if (entry.outcome === 'normal') return '已退出'
  return entry.exitCode === undefined ? '已退出' : `已退出(${entry.exitCode})`
}

/**
 * @param {string} iso
 * @returns {string}
 */
function clock(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
