/**
 * 模型侧工具（M5）：面板能做的事，AI 也该能做，而且是同一套服务。
 *
 * 每个工具一个文件（`<tool>.js`），纯文本渲染在 `render.js`，共享件在 `shared.js`；
 * 这里只做两件事——逐个注册、给操作类工具加上按步挂载。
 *
 * 工具 schema 每步都随请求重发（这 8 个约 1.4k token），所以只有 `mc_projects` 与
 * `mc_mod_init` 常驻，其余六个带 `register(definition, { when })`：工作区里没有能跑的工程时
 * 它们不进 schema、也不可调用（0.2.2 的接口；0.2.1 忽略第二个参数，退化成"永远可见"）。
 *
 * 工作区身份：工具只把 `{ root, workspace }` 交给 api，路径解析统一在 `api.resolveRoot`（M26）。
 * @module minecraft-dev-starter/tools
 */

import { projectToolVisible } from './shared.js'
import { mcLaunchTool } from './mc_launch.js'
import { mcLaunchListTool } from './mc_launch_list.js'
import { mcLaunchLogsTool } from './mc_launch_logs.js'
import { mcLaunchStopTool } from './mc_launch_stop.js'
import { mcModInitTool } from './mc_mod_init.js'
import { mcProjectDetailTool } from './mc_project_detail.js'
import { mcProjectsTool } from './mc_projects.js'
import { mcSetGroupTool } from './mc_set_group.js'

/**
 * 注册顺序就是模型看到的顺序，也是提示缓存的前缀：保持 M5 以来的顺序。
 *
 * `gated: true` 的六个只在工作区里真有能跑的工程时才挂上（既不进 schema 也不可调用）；
 * `mc_projects` 与 `mc_mod_init` 常驻——空目录里得先能把工程建出来，它是挂载链的起点。
 */
const TOOLS = [
  { create: mcProjectsTool },
  { create: mcLaunchTool, gated: true },
  { create: mcLaunchLogsTool, gated: true },
  { create: mcLaunchStopTool, gated: true },
  { create: mcLaunchListTool, gated: true },
  { create: mcProjectDetailTool, gated: true },
  { create: mcModInitTool },
  { create: mcSetGroupTool, gated: true },
]

/**
 * 注册八个模型工具。
 * @param {any} ctx
 * @param {{ api: Record<string, any> }} deps
 */
export function applyTools(ctx, deps) {
  const api = deps.api
  const projectGate = { when: (context) => projectToolVisible(api, context?.agent) }
  for (const tool of TOOLS) {
    const definition = tool.create(api)
    if (tool.gated === true) ctx.tools.register(definition, projectGate)
    else ctx.tools.register(definition)
  }
}
