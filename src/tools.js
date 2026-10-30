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
 * @param {Record<string, any>} scan
 * @returns {string}
 */
function renderProjects(scan) {
  const projects = /** @type {Array<Record<string, any>>} */ (scan.projects ?? [])
  if (projects.length === 0) return `工作区 ${scan.root} 里没有识别到 Minecraft 工程。`
  const lines = [`工作区 ${scan.root}：${projects.length} 个工程`]
  for (const project of projects) {
    const targets = /** @type {Array<Record<string, any>>} */ (project.runTargets ?? [])
    const targetText = targets.length === 0
      ? '无可运行目标'
      : targets.map((target) => `${target.module === '.' ? '' : `${target.module}:`}${target.taskPath}${target.guessed === true ? '(推测)' : ''}`).join(', ')
    lines.push(`- ${project.name} · ${project.loader} ${project.minecraftVersion ?? '?'} · ${targets.length} 个目标：${targetText}`)
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
        + ' 只读。要构建用 mc_gradle，要真正起客户端/服务端用 mc_launch。',
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
      async execute(args) {
        const scan = await api['projects.scan']({ root: args.root, refresh: args.refresh === true })
        return {
          root: scan.root,
          truncated: scan.truncated === true,
          projects: (scan.projects ?? []).map((project) => ({
            name: project.name,
            root: project.root,
            loader: project.loader,
            minecraftVersion: project.minecraftVersion ?? '',
            targets: (project.runTargets ?? []).map((target) => target.taskPath),
          })),
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'mc_launch',
      description:
        '在后台启动一个 Minecraft 开发工程的运行目标（默认等它进入运行态再返回）。'
        + ' 同一个工程同时只能有一个实例；任务路径必须是 mc_projects 列出的那些（形如 runClient 或 :fabric:runClient）。'
        + ' 启动后可用 mc_launch_logs 看日志、mc_launch_stop 停止。',
      parameters: {
        root: { type: 'string', description: '工程根目录；省略则用当前工作区' },
        taskPath: { type: 'string', required: true, description: 'Gradle 任务路径，例如 runClient、:fabric:runClient' },
        wait: { type: 'string', enum: ['ready', 'detach'], description: 'ready（默认）等到运行态或结束；detach 立刻返回' },
        timeoutMs: { type: 'number', description: '等就绪的上限，默认 60000' },
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
        const record = await api['launch.start']({ root: args.root, taskPath: args.taskPath })
        if (args.wait === 'detach') {
          return { id: record.id, status: record.status, taskPath: record.taskPath, pid: record.pid ?? undefined, logPath: record.logPath, timedOut: false }
        }
        const timeoutMs = Number.isFinite(args.timeoutMs) ? Number(args.timeoutMs) : 60_000
        const settled = await waitForSettle(api, record.id, timeoutMs, exec.signal)
        if (settled === undefined) {
          return { id: record.id, status: record.status, taskPath: record.taskPath, pid: record.pid ?? undefined, logPath: record.logPath, timedOut: true }
        }
        return {
          id: settled.id,
          status: settled.status,
          taskPath: settled.taskPath,
          pid: settled.pid ?? undefined,
          logPath: settled.logPath,
          timedOut: false,
        }
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
            diagnosis: { type: 'string' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text:
              `${value.launchId} · ${value.status}${value.outcome === undefined ? '' : `/${value.outcome}`}`
              + `${value.diagnosis === undefined ? '' : `\n归因：${value.diagnosis}`}`
              + `\n${value.lines.slice(-40).join('\n')}`,
          },
        ],
      },
      async execute(args) {
        let id = args.id
        if (id === undefined || id === '') {
          const current = await api['launch.current']({ root: args.root })
          if (current === null || current === undefined) throw new Error('当前工程没有运行中的实例；请传 id')
          id = current.id
        }
        const result = await api['launch.logs']({
          id,
          offset: Number.isFinite(args.offset) ? Number(args.offset) : 0,
          limit: Number.isFinite(args.limit) ? Number(args.limit) : 200,
        })
        return {
          launchId: result.launchId,
          status: result.status,
          outcome: result.outcome ?? undefined,
          exitCode: result.exitCode ?? undefined,
          lines: result.lines ?? [],
          total: result.total ?? 0,
          diagnosis: result.diagnosis?.hint,
        }
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
      async execute(args) {
        let id = args.id
        if (id === undefined || id === '') {
          const current = await api['launch.current']({ root: args.root })
          if (current === null || current === undefined) throw new Error('当前工程没有运行中的实例；请传 id')
          id = current.id
        }
        const record = await api['launch.stop']({ id })
        return { id: record.id, status: record.status, outcome: record.outcome ?? undefined }
      },
    }),
  )
}
