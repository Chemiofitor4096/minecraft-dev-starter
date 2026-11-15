import { defineTool } from '@deepseek-ai/dsh-tools'
import { rootArgs } from './shared.js'

/**
 * `mc_launch_logs` 的定义。
 * @param {Record<string, any>} api
 */
export function mcLaunchLogsTool(api) {
  return defineTool({

    name: 'mc_launch_logs',
    description: `Read one instance's log, defaulting to this project's active instance. Abnormal exits carry a diagnosis; raise limit for stack traces.`,
    parameters: {
      id: { type: 'string', description: "Instance id (launch-N); omit for this project's active instance" },
      root: { type: 'string', description: 'Project directory; only used when id is omitted' },
      offset: { type: 'number', description: '0-based line offset; default 0' },
      limit: { type: 'number', description: 'Lines to return; default 200' },
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
        const current = await api['launch.current']({ ...rootArgs(args, exec) })
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
  })
}
