/**
 * 模型侧工具（M5）：面板能做的事，AI 也该能做，而且是同一套服务。
 *
 * 六个工具都薄封装在 `/mcdev/api` 的方法表上，不复制业务逻辑：
 *   mc_projects / mc_project_detail / mc_launch / mc_launch_logs / mc_launch_list / mc_launch_stop
 *
 * 依赖 `@deepseek-ai/dsh-tools` 的 `defineTool`（与桌面运行时同版本 0.2.1-rc.3）。
 * @module minecraft-dev-starter/tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { isAbsolute, resolve } from 'node:path'
import { modeOf } from './lib/launch/verify.js'

/** mc_project_detail 的渲染里最多列多少个目标（其余只报数量）。 */
const TARGET_LINE_LIMIT = 12

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
 * 等实例到达目标状态。
 *
 * 两种终点：`ready` 是"跑起来了"（常驻目标），`exit` 是"跑完了"（一次性任务）。
 * 一次性任务没有就绪标记，用 ready 去等会永远等到超时，所以这里必须分开。
 * @param {{ 'launch.list': (payload?: unknown) => Promise<any> }} api
 * @param {string} launchId
 * @param {number} timeoutMs
 * @param {AbortSignal | undefined} signal
 * @param {'ready' | 'exit'} until
 * @returns {Promise<Record<string, any> | undefined>}
 */
async function waitForSettle(api, launchId, timeoutMs, signal, until = 'ready') {
  const done = until === 'exit'
    ? (status) => status === 'exited' || status === 'unknown'
    : (status) => status === 'running' || status === 'exited' || status === 'unknown'
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted === true) return undefined
    const list = await api['launch.list']({})
    const entry = list.find((item) => item.id === launchId)
    if (entry === undefined) return undefined
    if (done(entry.status)) return entry
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
    mode: record.mode ?? modeOf(record.kind),
  }
  if (typeof record.pid === 'number') value.pid = record.pid
  if (record.outcome !== null && record.outcome !== undefined) value.outcome = record.outcome
  if (typeof record.exitCode === 'number') value.exitCode = record.exitCode
  if (record.verdict !== null && record.verdict !== undefined) value.verdict = record.verdict
  if (record.summary !== null && record.summary !== undefined) value.summary = record.summary
  if (Array.isArray(record.failures) && record.failures.length > 0) value.failures = record.failures
  return value
}

/**
 * mc_launch 的渲染：常驻目标说"起来了没有"，一次性任务说"过没过"。
 * @param {Record<string, any>} value
 * @returns {string}
 */
function describeLaunch(value) {
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
function renderProjects(value) {
  const projects = /** @type {Array<Record<string, any>>} */ (value.projects ?? [])
  if (projects.length === 0) return `工作区 ${value.root} 里没有识别到 Minecraft 工程。`
  const lines = [`工作区 ${value.root}：${projects.length} 个工程`]
  for (const project of projects) {
    const targets = /** @type {string[]} */ (project.targets ?? [])
    const version = project.minecraftVersion === undefined || project.minecraftVersion === '' ? '' : ` ${project.minecraftVersion}`
    lines.push(
      `- ${project.name} · ${project.loader}${version} · ${targets.length} 个目标：${targets.length === 0 ? '无可运行目标' : targets.join(', ').replaceAll(' (guessed)', '（未验证）')}`,
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
      description: `List the Minecraft projects in the workspace and their taskPaths; read-only. Call it first — an empty list means there is no project here, so do not invent task names.`,
      parameters: {
        root: { type: 'string', description: 'Workspace directory; defaults to the current session working directory' },
        refresh: { type: 'boolean', description: 'Bypass the 5-second scan cache' },
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
            targets: (project.runTargets ?? []).map((target) => `${target.taskPath}${target.guessed === true ? ' (guessed)' : ''}`),
          })),
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'mc_launch',
      description: `Run a target from mc_projects: daemon targets return once up, one-shot targets return when finished with a verdict (passed/failed/aborted/error). It builds and writes files, one instance per project (a second launch errors, it does not queue) — do not run gradlew yourself.`,
      parameters: {
        root: { type: 'string', description: 'Project directory; defaults to the current workspace' },
        taskPath: { type: 'string', required: true, description: 'Gradle task path, e.g. runClient, :fabric:runClient, :modules:core:runClient' },
        wait: {
          type: 'string',
          enum: ['ready', 'exit', 'detach'],
          description: 'ready waits for the target to be up; exit waits for it to finish and return a verdict; detach returns immediately. When omitted it follows the target mode: daemon → ready, one-shot → exit',
        },
        timeoutMs: { type: 'number', description: 'Upper bound for ready/exit in ms; default 600000 (10 min)' },
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
            mode: { type: 'string', required: true, enum: ['daemon', 'oneshot'] },
            outcome: { type: 'string' },
            exitCode: { type: 'integer' },
            verdict: { type: 'string', enum: ['passed', 'failed', 'aborted', 'error', 'unknown'] },
            summary: { type: 'string' },
            failures: { type: 'array', items: { type: 'string' } },
            note: { type: 'string' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: `${describeLaunch(value)}${value.note === undefined ? '' : `\n（${value.note}）`}`,
          },
        ],
      },
      async execute(args, exec) {
        const record = await api['launch.start']({ root: agentRoot(args, exec), taskPath: args.taskPath })
        const mode = record.mode ?? modeOf(record.kind)
        if (args.wait === 'detach') {
          return launchValue(record, false)
        }
        // 会跑完的目标默认等到结束：它唯一的产出就是结论
        const until = args.wait === 'exit' || mode === 'oneshot' ? 'exit' : 'ready'
        const timeoutMs = Number.isFinite(args.timeoutMs) ? Number(args.timeoutMs) : 600_000
        const settled = await waitForSettle(api, record.id, timeoutMs, exec.signal, until)
        const value = launchValue(settled ?? record, settled === undefined)
        if (mode === 'oneshot' && args.wait === 'ready') {
          value.note = 'This is a one-shot target (it exits when done); wait=ready was treated as exit'
        }
        return value
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'mc_launch_logs',
      description: `Read one instance's log, defaulting to the active instance of this project. Abnormal exits carry a diagnosis; raise limit for stack traces.`,
      parameters: {
        id: { type: 'string', description: 'Instance id (launch-N); omit to use the active instance of the session workspace' },
        root: { type: 'string', description: 'Project directory; only used when id is omitted' },
        offset: { type: 'number', description: '0-based line offset; default 0' },
        limit: { type: 'number', description: 'How many lines to return; default 200' },
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
            verdict: { type: 'string', enum: ['passed', 'failed', 'aborted', 'error', 'unknown'] },
            summary: { type: 'string' },
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
              + `${value.verdict === undefined ? '' : ` · 结论 ${value.verdict}${value.summary === undefined ? '' : `（${value.summary}）`}`}`
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
          if (current === null || current === undefined) throw new Error('No active instance in this project; pass id')
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
        if (result.verdict !== null && result.verdict !== undefined) value.verdict = result.verdict
        if (result.summary !== null && result.summary !== undefined) value.summary = result.summary
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
      description: `Stop an instance and its process tree. Only daemon targets need this — a one-shot target has already exited by itself.`,
      parameters: {
        id: { type: 'string', description: 'Instance id; omit to use the active instance of the session workspace' },
        root: { type: 'string', description: 'Project directory; only used when id is omitted' },
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
          if (current === null || current === undefined) throw new Error('No active instance in this project; pass id')
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
      description: `List this project's instances, newest first. status is the process state, verdict is the conclusion.`,
      parameters: {
        root: { type: 'string', description: 'Project directory; defaults to the session workspace' },
        limit: { type: 'number', description: 'Max records; default 10' },
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
                  mode: { type: 'string', enum: ['daemon', 'oneshot'] },
                  verdict: { type: 'string', enum: ['passed', 'failed', 'aborted', 'error', 'unknown'] },
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
          if (record.mode !== null && record.mode !== undefined) value.mode = record.mode
          if (record.verdict !== null && record.verdict !== undefined) value.verdict = record.verdict
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
      description: `Profile one project: loader evidence, targets with mode and source, JDK, dependencies, warnings. Cheap and read-only — check it before launching, and do not run a guessed target without confirming it.`,
      parameters: {
        root: { type: 'string', description: 'Project directory; defaults to the session workspace' },
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
            gradleRoot: { type: 'string', description: 'Directory where Gradle actually runs; for a subproject this is its aggregator root' },
            modulePath: { type: 'string', description: 'Module path of this subproject inside the aggregator root' },
            targets: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  taskPath: { type: 'string', required: true },
                  label: { type: 'string', required: true },
                  mode: { type: 'string', required: true, enum: ['daemon', 'oneshot'] },
                  guessed: { type: 'boolean', required: true },
                  source: {
                    type: 'string',
                    enum: ['build-script', 'idea-run-config', 'guessed'],
                    description: 'Where the target came from: a runs block in the build script, a configuration run in the IDE, or a loader convention (guessed)',
                  },
                },
              },
            },
            idea: {
              type: 'object',
              additionalProperties: false,
              description: 'IntelliJ IDEA project model read from .idea; absent when there is no .idea',
              properties: {
                name: { type: 'string', required: true },
                dir: { type: 'string', required: true },
                gradleRoot: { type: 'string' },
                gradleJvm: { type: 'string' },
                jdkName: { type: 'string' },
                minecraftVersion: { type: 'string', description: 'Minecraft version written into the iml by the MC Development plugin; corroborating evidence only' },
                languageLevel: { type: 'integer' },
                bytecodeTarget: { type: 'integer' },
                modules: { type: 'integer', description: 'Number of Gradle-linked modules, including the root' },
                imls: { type: 'integer', description: 'Number of iml module files' },
                runConfigurations: { type: 'integer', description: 'Number of run configurations in the IDE' },
                platforms: { type: 'array', items: { type: 'string' }, description: 'Union of platformType values from minecraft facets in the iml files' },
                linkedProjects: { type: 'array', items: { type: 'string' }, description: 'Other Gradle projects linked into this composite build' },
                libraries: {
                  type: 'object',
                  additionalProperties: false,
                  description: 'Library table from the Gradle sync (.idea/libraries or the IDE external storage)',
                  properties: {
                    storage: { type: 'string', enum: ['project', 'external'], required: true },
                    count: { type: 'integer', required: true },
                    local: { type: 'integer', required: true, description: 'Entries pointing at in-project remap artifacts' },
                  },
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
                source: { type: 'string', enum: ['override', 'configured', 'auto', 'none'] },
                override: { type: 'string' },
                available: { type: 'array', items: { type: 'number' } },
              },
            },
            dependencies: {
              type: 'object',
              additionalProperties: false,
              properties: {
                catalogFile: { type: 'string' },
                build: {
                  type: 'array',
                  required: true,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      configuration: { type: 'string', required: true },
                      notation: { type: 'string', required: true },
                      file: { type: 'string', required: true },
                      line: { type: 'integer', required: true },
                      catalogRef: { type: 'string' },
                    },
                  },
                },
                mods: {
                  type: 'array',
                  required: true,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      modId: { type: 'string', required: true },
                      range: { type: 'string', required: true },
                    },
                  },
                },
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
              + (value.targets === undefined ? '' : `\n目标：${renderTargets(value.targets)}`)
              + `\nJDK：需要 ${value.java?.required ?? '?'}，选中 ${value.java?.selected ?? '无'}${javaSourceText(value.java?.source)}`
              + (value.idea === undefined ? '' : `\nIDE：${ideaText(value.idea)}`)
              + (value.dependencies === undefined
                ? ''
                : `\n依赖：构建 ${value.dependencies.build.length} 条、模组声明 ${value.dependencies.mods.length} 条`)
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
            path: module.gradlePath ?? module.path,
            platform: module.platform,
            targets: (module.targets ?? []).map((target) => target.taskPath),
          })),
          evidence: (profile.evidence ?? []).map((entry) => `${entry.file} — ${entry.detail}`),
          warnings: profile.warnings ?? [],
          conflicts: profile.conflicts ?? [],
        }
        if (Array.isArray(profile.loaders) && profile.loaders.length > 0) value.loaders = profile.loaders
        const runTargets = (profile.runTargets ?? []).map((target) => ({
          taskPath: target.taskPath,
          label: target.label ?? target.taskPath,
          mode: target.mode ?? modeOf(target.kind),
          guessed: target.guessed === true,
          ...(target.source === undefined ? {} : { source: target.source }),
        }))
        if (runTargets.length > 0) value.targets = runTargets
        if (profile.idea !== undefined && profile.idea !== null) {
          const idea = /** @type {Record<string, any>} */ (profile.idea)
          /** @type {Record<string, any>} */
          const compact = { name: String(idea.name ?? ''), dir: String(idea.dir ?? '') }
          for (const key of ['gradleRoot', 'gradleJvm', 'jdkName', 'minecraftVersion']) {
            if (typeof idea[key] === 'string' && idea[key] !== '') compact[key] = idea[key]
          }
          for (const key of ['languageLevel', 'bytecodeTarget', 'modules', 'imls', 'runConfigurations']) {
            if (typeof idea[key] === 'number') compact[key] = idea[key]
          }
          if (Array.isArray(idea.platforms) && idea.platforms.length > 0) compact.platforms = idea.platforms
          if (Array.isArray(idea.linkedProjects) && idea.linkedProjects.length > 0) compact.linkedProjects = idea.linkedProjects
          if (idea.libraries !== null && typeof idea.libraries === 'object') {
            compact.libraries = {
              storage: idea.libraries.storage,
              count: idea.libraries.count,
              local: idea.libraries.local,
            }
          }
          value.idea = compact
        }
        if (profile.minecraftVersion !== undefined && profile.minecraftVersion !== '') value.minecraftVersion = profile.minecraftVersion
        if (typeof profile.gradleRoot === 'string' && profile.gradleRoot !== profile.root) value.gradleRoot = profile.gradleRoot
        if (typeof profile.modulePath === 'string' && profile.modulePath !== '') value.modulePath = profile.modulePath
        if (profile.java !== undefined) {
          value.java = { required: profile.java.required, exact: profile.java.exact === true }
          if (profile.java.selected !== undefined) value.java.selected = profile.java.selected
          if (profile.java.source !== undefined) value.java.source = profile.java.source
          if (profile.java.override !== undefined) value.java.override = profile.java.override
          value.java.available = (profile.java.available ?? []).map((jdk) => jdk.major)
        }
        if (profile.dependencies !== undefined) {
          const decl = /** @type {Record<string, any>} */ (profile.dependencies)
          /** @type {{ build: Array<Record<string, any>>, mods: Array<Record<string, any>>, catalogFile?: string }} */
          const dependencies = { build: [], mods: [] }
          for (const entry of (decl.build ?? []).slice(0, 60)) {
            /** @type {Record<string, any>} */
            const item = {
              configuration: entry.configuration,
              notation: entry.notation,
              file: entry.file,
              line: entry.line,
            }
            if (entry.catalogRef !== undefined) item.catalogRef = entry.catalogRef
            dependencies.build.push(item)
          }
          for (const entry of (decl.mods ?? []).slice(0, 30)) {
            dependencies.mods.push({ modId: entry.modId, range: entry.range })
          }
          if (typeof decl.catalogFile === 'string' && decl.catalogFile !== '') dependencies.catalogFile = decl.catalogFile
          value.dependencies = dependencies
        }
        return value
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'mc_mod_init',
      description:
        'Scaffold a new Minecraft mod project (Fabric or NeoForge) into an empty directory: resolves loader, mappings, plugin and API versions from upstream, then writes the Gradle files and a mod entrypoint. It refuses a non-empty directory; run mc_projects afterwards to confirm the workspace detects it.',
      parameters: {
        dir: { type: 'string', required: true, description: 'Target directory; relative paths resolve against the session workspace' },
        modid: { type: 'string', required: true, description: 'Mod id: lowercase letters, digits and underscores, e.g. my_mod' },
        name: { type: 'string', required: true, description: 'Display name, e.g. My Mod' },
        group: { type: 'string', description: 'Java package; default com.example.<modid>' },
        version: { type: 'string', description: 'Mod version; default 0.1.0' },
        loader: { type: 'string', enum: ['fabric', 'neoforge'], description: 'Mod loader' },
        mcVersion: { type: 'string', description: 'Minecraft version; default 1.21.1' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            dir: { type: 'string', required: true },
            files: { type: 'array', required: true, items: { type: 'string' } },
            loader: { type: 'string', required: true },
            mcVersion: { type: 'string', required: true },
            java: { type: 'integer', required: true },
            source: { type: 'string', required: true, enum: ['upstream', 'seed'] },
            versions: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  key: { type: 'string', required: true },
                  version: { type: 'string', required: true },
                },
              },
            },
            note: { type: 'string' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text:
              `已生成 ${value.files.length} 个文件 → ${value.dir}\n`
              + `${value.loader} ${value.mcVersion} · Java ${value.java} · ${value.source === 'seed' ? '上游不可用，用了内置 seed' : '版本来自上游'}\n`
              + (value.note === undefined ? '' : `${value.note}\n`)
              + '下一步：mc_projects 确认识别，mc_launch runClient 启动。',
          },
        ],
      },
      async execute(args, exec) {
        const base = agentRoot(args, exec) ?? process.cwd()
        const dir = isAbsolute(args.dir) ? args.dir : resolve(base, args.dir)
        const created = await api['projects.create']({
          dir,
          modid: args.modid,
          name: args.name,
          group: args.group,
          version: args.version,
          loader: args.loader,
          mcVersion: args.mcVersion,
        })
        // 输出 schema 不支持"字符串到字符串"的映射，转成 [{ key, version }]
        const { versions, ...rest } = created
        return {
          ...rest,
          versions: Object.entries(versions ?? {}).map(([key, version]) => ({ key, version: String(version) })),
        }
      },
    }),
  )
}

/**
 * 目标列表的渲染。聚合仓库一个工程能列出二三十个目标，全铺出来是一堵墙，
 * 截断后告诉模型"还有多少"，要看全部就按模块读 `modules[].targets`。
 * @param {Array<Record<string, any>>} targets
 * @returns {string}
 */
function renderTargets(targets) {
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
function targetSourceText(target) {
  if (target.guessed === true) return '，未验证'
  if (target.source === 'idea-run-config') return '，来自 IDE 运行配置'
  return ''
}

/**
 * IDE 工程模型的一行摘要。
 * @param {Record<string, any>} idea
 * @returns {string}
 */
function ideaText(idea) {
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
function javaSourceText(source) {
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
function statusText(entry) {
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
function clock(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
