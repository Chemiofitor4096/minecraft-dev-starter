import { defineTool } from '@deepseek-ai/dsh-tools'
import { rootArgs } from './shared.js'
import { renderProjects } from './render.js'

/**
 * `mc_projects` 的定义。
 * @param {Record<string, any>} api
 */
export function mcProjectsTool(api) {
  return defineTool({

    name: 'mc_projects',
    description: `List Minecraft projects in the workspace and their taskPaths; read-only. Call it first: an empty list means no project here, so do not invent task names.`,
    parameters: {
      root: { type: 'string', description: 'Workspace directory; defaults to the session working directory' },
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
      const scan = await api['projects.scan']({ ...rootArgs(args, exec), refresh: args.refresh === true })
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
  })
}
