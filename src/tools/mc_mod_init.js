import { defineTool } from '@deepseek-ai/dsh-tools'
import { isAbsolute, resolve } from 'node:path'
import { agentWorkspace, clearGateCache } from './shared.js'

/**
 * `mc_mod_init` 的定义。
 * @param {Record<string, any>} api
 */
export function mcModInitTool(api) {
  return defineTool({

    name: 'mc_mod_init',
    description:
      'Scaffold a new Fabric or NeoForge mod project into an empty directory: resolves loader, mappings and API versions from upstream, then writes the Gradle files and a mod entrypoint. Refuses a non-empty directory; run mc_projects afterwards to confirm it.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Target directory, relative to the session workspace' },
      modid: { type: 'string', required: true, description: 'Mod id: lowercase letters, digits, underscores' },
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
          group: { type: 'string', required: true },
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
            + `${value.loader} ${value.mcVersion} · Java ${value.java} · 包名 ${value.group} · ${value.source === 'seed' ? '上游不可用，用了内置 seed' : '版本来自上游'}\n`
            + (value.loader === 'neoforge'
              ? 'NeoForge 首次构建要反编译 Minecraft，首次 runClient 还要下载资源；网络受限时先给 Gradle 配代理。\n'
              : '')
            + '下一步：mc_projects 确认识别，mc_launch runClient 启动。',
        },
      ],
    },
    async execute(args, exec) {
      const base = agentWorkspace(exec) ?? process.cwd()
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
      // 刚长出工程：让操作类工具在下一步就挂上，别等判定缓存过期
      clearGateCache()
      return {
        ...rest,
        versions: Object.entries(versions ?? {}).map(([key, version]) => ({ key, version: String(version) })),
      }
    },
  })
}
