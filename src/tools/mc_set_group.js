import { defineTool } from '@deepseek-ai/dsh-tools'
import { rootArgs } from './shared.js'

/**
 * `mc_set_group` 的定义。
 * @param {Record<string, any>} api
 */
export function mcSetGroupTool(api) {
  return defineTool({

    name: 'mc_set_group',
    description:
      'Change the Java package (group) of a scaffolded project: moves the package directory under src/*/java and rewrites package/import lines plus metadata references. Edits files on disk but leaves docs and build scripts alone; refuses when gradle.properties has no mod_group_id, since the current package is then unknown.',
    parameters: {
      root: { type: 'string', description: 'Project directory; defaults to the session workspace' },
      group: { type: 'string', required: true, description: 'New Java package, e.g. com.acme.coalcraft' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          group: { type: 'string', required: true },
          from: { type: 'string', required: true },
          moved: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                from: { type: 'string', required: true },
                to: { type: 'string', required: true },
              },
            },
          },
          files: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text:
            `包名：${value.from} → ${value.group}\n`
            + (value.moved.length === 0
              ? '没有移动目录（源码里没有这个包）'
              : `移动 ${value.moved.length} 个目录：${value.moved.map((entry) => entry.to).join('、')}`)
            + `\n改写 ${value.files.length} 个文件：${value.files.join('、')}`,
        },
      ],
    },
    async execute(args, exec) {
      return await api['projects.setGroup']({
        ...rootArgs(args, exec),
        group: args.group,
      })
    },
  })
}
