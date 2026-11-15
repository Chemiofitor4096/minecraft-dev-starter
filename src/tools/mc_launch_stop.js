import { defineTool } from '@deepseek-ai/dsh-tools'
import { rootArgs } from './shared.js'

/**
 * `mc_launch_stop` 的定义。
 * @param {Record<string, any>} api
 */
export function mcLaunchStopTool(api) {
  return defineTool({

    name: 'mc_launch_stop',
    description: `Stop an instance and its process tree. Only daemon targets need this; a one-shot target has already exited.`,
    parameters: {
      id: { type: 'string', description: "Instance id; omit for this project's active instance" },
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
        const current = await api['launch.current']({ ...rootArgs(args, exec) })
        if (current === null || current === undefined) throw new Error('No active instance in this project; pass id')
        id = current.id
      }
      const record = await api['launch.stop']({ id })
      /** @type {Record<string, any>} */
      const value = { id: record.id, status: record.status }
      if (record.outcome !== null && record.outcome !== undefined) value.outcome = record.outcome
      return value
    },
  })
}
