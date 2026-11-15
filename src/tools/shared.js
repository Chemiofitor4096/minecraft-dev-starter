/**
 * 工具之间的共享件：工作区身份、按步挂载判定、启动等待与输出值整形。
 *
 * 工具定义在 `<tool>.js` 里，纯文本渲染在 `render.js` 里；这里只放"要跟宿主打交道"的那部分。
 * @module minecraft-dev-starter/tools/shared
 */

import { modeOf } from '../lib/launch/verify.js'

/**
 * 调用方会话的工作区（就是它的 cwd）。
 *
 * 它是"这个模型正在哪个文件夹里干活"的唯一可信来源：宿主的会话列表在重启后可能只列出
 * 一部分会话，拿它当工作区会让真实工程被判成越界（2026-11-14 的事故）。
 * @param {{ agent?: any } | undefined} exec
 * @returns {string | undefined}
 */
export function agentWorkspace(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
}

/**
 * 交给 api 的工作区信息：调用方要的 `root`（可能是相对路径）+ 它自己的会话 cwd。
 *
 * 相对路径**不在工具里解析**：`api.resolveRoot()` 是唯一入口，工具只负责把"我是谁"
 * （会话 cwd）交上去。两处各拼一次路径，正是 M26 那类 bug 的土壤。
 * @param {{ root?: string }} args
 * @param {{ agent?: any } | undefined} exec
 * @returns {{ root?: string, workspace?: string }}
 */
export function rootArgs(args, exec) {
  const workspace = agentWorkspace(exec)
  /** @type {{ root?: string, workspace?: string }} */
  const payload = {}
  if (typeof args.root === 'string' && args.root !== '') payload.root = args.root
  if (workspace !== undefined) payload.workspace = workspace
  return payload
}

/** 按步挂载判定的缓存时长：每步都要问一次，别每步都扫工作区。 */
const GATE_TTL_MS = 60_000

/** @type {Map<string, { at: number, visible: boolean }>} cwd → 判定结果 */
const gateCache = new Map()

/**
 * 清掉按步挂载的判定缓存：工程刚建出来时调一次，下一步就能用上操作类工具。
 */
export function clearGateCache() {
  gateCache.clear()
}

/**
 * 操作类工具这一步该不该挂上：只有工作区里真有**能跑**的工程时才挂。
 *
 * 判据是识别结果里的 runTargets，不是 loader——库工程识别得出 loader 却跑不了，
 * 挂上只会让模型多读一份用不上的 schema。判不出来（没有 cwd、扫描抛错）时按可见处理：
 * 宁可多占几百 token，也不让模型在真需要时手里没工具。
 * @param {Record<string, any>} api
 * @param {{ session?: { header?: { cwd?: string } } } | undefined} agent
 * @returns {Promise<boolean>}
 */
export async function projectToolVisible(api, agent) {
  const cwd = agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') return true
  const cached = gateCache.get(cwd)
  if (cached !== undefined && Date.now() - cached.at < GATE_TTL_MS) return cached.visible
  let visible = true
  try {
    const scan = await api['projects.scan']({ root: cwd })
    visible = (scan.projects ?? []).some((project) => (project.runTargets ?? []).length > 0)
  } catch {
    visible = true
  }
  gateCache.set(cwd, { at: Date.now(), visible })
  return visible
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
export async function waitForSettle(api, launchId, timeoutMs, signal, until = 'ready') {
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
export function launchValue(record, timedOut) {
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
