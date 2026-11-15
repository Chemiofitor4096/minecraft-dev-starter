import { defineTool } from '@deepseek-ai/dsh-tools'
import { modeOf } from '../lib/launch/verify.js'
import { rootArgs, agentWorkspace, waitForSettle, launchValue } from './shared.js'
import { NOTICE_TEXT, describeLaunch } from './render.js'

/**
 * `mc_launch` 的定义。
 * @param {Record<string, any>} api
 */
export function mcLaunchTool(api) {
  return defineTool({

    name: 'mc_launch',
    description: `Run a target from mc_projects. Daemon targets return once up; one-shot targets return when finished with a verdict. Builds and writes files, one instance per project — a second launch errors instead of queueing, so do not run gradlew yourself.`,
    parameters: {
      root: { type: 'string', description: 'Project directory; defaults to the current workspace' },
      taskPath: { type: 'string', required: true, description: 'Gradle task path, e.g. runClient or :modules:core:runClient' },
      wait: {
        type: 'string',
        enum: ['ready', 'exit', 'detach'],
        description: 'ready: until up; exit: until done, with a verdict; detach: return now. Default follows the target mode: daemon → ready, one-shot → exit',
      },
      timeoutMs: { type: 'number', description: 'Cap for ready/exit in ms; default 600000 (10 min)' },
      offline: { type: 'boolean', description: 'Gradle --offline: fail fast instead of downloading' },
      refreshDependencies: { type: 'boolean', description: 'Gradle --refresh-dependencies: re-check upstream versions' },
      gradleProperties: {
        type: 'array',
        description: 'Extra -Dkey=value Gradle properties, e.g. https.proxyHost when asset downloads are blocked',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', required: true },
            value: { type: 'string', required: true },
          },
        },
      },
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
          notice: { type: 'string' },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text:
            `${describeLaunch(value)}${value.note === undefined ? '' : `\n（${value.note}）`}`
            + (value.notice === undefined ? '' : `\n提示：${NOTICE_TEXT[value.notice] ?? value.notice}`),
        },
      ],
    },
    async execute(args, exec) {
      /** @type {Record<string, any>} */
      const gradle = {}
      if (args.offline === true) gradle.offline = true
      if (args.refreshDependencies === true) gradle.refreshDependencies = true
      if (Array.isArray(args.gradleProperties) && args.gradleProperties.length > 0) {
        /** @type {Record<string, string>} */
        const properties = {}
        for (const entry of args.gradleProperties) {
          if (typeof entry?.key === 'string' && entry.key !== '') properties[entry.key] = String(entry.value ?? '')
        }
        if (Object.keys(properties).length > 0) gradle.properties = properties
      }
      const workspace = agentWorkspace(exec)
      const record = await api['launch.start']({
        ...rootArgs(args, exec),
        // 把"我在哪个工作区里"一起交过去：宿主的会话列表不能当作判据
        ...(workspace === undefined ? {} : { workspace }),
        taskPath: args.taskPath,
        ...(Object.keys(gradle).length === 0 ? {} : { gradle }),
      })
      const notice = record.notice
      const mode = record.mode ?? modeOf(record.kind)
      if (args.wait === 'detach') {
        const value = launchValue(record, false)
        if (notice !== undefined) value.notice = notice
        return value
      }
      // 会跑完的目标默认等到结束：它唯一的产出就是结论
      const until = args.wait === 'exit' || mode === 'oneshot' ? 'exit' : 'ready'
      const timeoutMs = Number.isFinite(args.timeoutMs) ? Number(args.timeoutMs) : 600_000
      const settled = await waitForSettle(api, record.id, timeoutMs, exec.signal, until)
      const value = launchValue(settled ?? record, settled === undefined)
      if (notice !== undefined) value.notice = notice
      if (mode === 'oneshot' && args.wait === 'ready') {
        value.note = 'This is a one-shot target (it exits when done); wait=ready was treated as exit'
      }
      return value
    },
  })
}
