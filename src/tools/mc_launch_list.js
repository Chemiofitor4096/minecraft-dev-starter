import { defineTool } from '@deepseek-ai/dsh-tools'
import { rootArgs } from './shared.js'
import { statusText, clock } from './render.js'

/**
 * `mc_launch_list` 的定义。
 * @param {Record<string, any>} api
 */
export function mcLaunchListTool(api) {
  return defineTool({

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
        const root = await api['projects.scan']({ ...rootArgs(args, exec) }).then((scan) => scan.root)
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
  })
}
