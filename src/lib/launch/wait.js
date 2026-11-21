/**
 * 等一个实例落到目标状态。
 *
 * 两种终点：`ready` 是"跑起来了"（常驻目标），`exit` 是"跑完了"（一次性任务）。
 * 一次性任务没有就绪标记，用 ready 去等会永远等到超时，所以调用方要把 `until` 说清楚。
 *
 * 和 `api['launch.list']` 解耦：传进来的是一个"列实例"的函数，工具与插件服务共用这一份语义。
 * @module minecraft-dev-starter/lib/launch/wait
 */

/** 轮询间隔：够快让人看不出延迟，又不至于把 list 打成热点。 */
const POLL_MS = 400

/**
 * 就绪之后再观察一会儿。
 *
 * 客户端的典型翻车形态是"起来了、然后一秒内崩"——真机日志里就绪标记（`Backend library: LWJGL`）
 * 和崩溃报告在同一秒。没有这个窗口，工具会如实报"运行中"，调用方两秒后再看才发现已经崩了，
 * 白白多一轮。窗口只对 `until: 'ready'` 生效，`exit` 本来就在等结束，不需要它。
 */
export const READY_GRACE_MS = 2_000

/**
 * @param {{
 *   list: () => Promise<Array<Record<string, any>>>,
 *   id: string,
 *   until?: 'ready' | 'exit',
 *   timeoutMs: number,
 *   signal?: AbortSignal,
 *   intervalMs?: number,
 *   graceMs?: number,
 * }} options
 * @returns {Promise<{ entry: Record<string, any> | undefined, timedOut: boolean }>}
 */
export async function waitForLaunch(options) {
  const { list, id, until = 'ready', timeoutMs, signal } = options
  const interval = Number.isFinite(options.intervalMs) ? Number(options.intervalMs) : POLL_MS
  const grace = Number.isFinite(options.graceMs) ? Number(options.graceMs) : READY_GRACE_MS
  const done = until === 'exit'
    ? (status) => status === 'exited' || status === 'unknown'
    : (status) => status === 'running' || status === 'exited' || status === 'unknown'
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted === true) return { entry: undefined, timedOut: false }
    const all = await list()
    const entry = all.find((item) => item.id === id)
    if (entry === undefined) return { entry: undefined, timedOut: false }
    if (done(entry.status)) {
      // 只在"真的跑起来了"之后观察；已经 exited / unknown 的直接返回，不再多等两秒。
      if (until === 'ready' && entry.status === 'running' && grace > 0) {
        await new Promise((resolve) => setTimeout(resolve, grace))
        const again = (await list()).find((item) => item.id === id)
        return { entry: again ?? entry, timedOut: false }
      }
      return { entry, timedOut: false }
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  return { entry: undefined, timedOut: true }
}
