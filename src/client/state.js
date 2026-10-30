/**
 * 客户端共享状态与数据加载。
 *
 * 一次 `projects.scan` 结果给三个地方用：标题栏胶囊、浮层、右侧栏详情；
 * 所以放在模块级 store 里，而不是每个组件各拉一次。
 * @module minecraft-dev-starter/client/state
 */

import { useEffect, useState } from 'react'
import { call } from './api.js'
import { createStore } from './store.js'

/** @typedef {{ store: ReturnType<typeof createStore> }} Never */

export const store = createStore({
  loading: false,
  /** @type {string | undefined} */
  error: undefined,
  /** @type {{ root: string, projects: Array<Record<string, any>>, truncated: boolean, scannedAt: string } | undefined} */
  scan: undefined,
  /** @type {string | undefined} */
  selectedRoot: undefined,
  flyoutOpen: false,
})

/** @type {Promise<unknown> | undefined} */
let inFlight

/**
 * 拉一次扫描结果。并发调用会复用在途请求。
 * @param {{ refresh?: boolean }} [options]
 * @returns {Promise<void>}
 */
export async function loadScan(options = {}) {
  if (inFlight !== undefined) return inFlight
  store.set({ loading: true, error: undefined })
  inFlight = call('projects.scan', options.refresh === true ? { refresh: true } : {})
    .then((result) => {
      const scan = /** @type {NonNullable<ReturnType<typeof store.get>['scan']>} */ (result)
      const current = store.get().selectedRoot
      const stillThere = scan.projects.some((project) => project.root === current)
      store.set({
        loading: false,
        scan,
        error: undefined,
        selectedRoot: stillThere ? current : scan.projects[0]?.root,
      })
    })
    .catch((error) => {
      store.set({ loading: false, error: error instanceof Error ? error.message : String(error) })
    })
    .finally(() => {
      inFlight = undefined
    })
  return inFlight
}

/** 当前选中的工程（默认第一个）。 */
export function selectedProject() {
  const state = store.get()
  const projects = state.scan?.projects ?? []
  return projects.find((project) => project.root === state.selectedRoot) ?? projects[0]
}

/**
 * React 绑定：订阅 store 并在变化时重渲染。
 * @returns {ReturnType<typeof store.get>}
 */
export function useStoreState() {
  const [state, setState] = useState(store.get())
  useEffect(() => store.subscribe(setState), [])
  return state
}

// ── 运行实例 ──────────────────────────────────────────────────────────

/** 实例列表单独一个 store：轮询频率比扫描高，别互相拖累。 */
export const launchStore = createStore({
  /** @type {Array<Record<string, any>>} */
  list: [],
  /** @type {string | undefined} */
  error: undefined,
  /** @type {string | undefined} 正在启停的目标 key，用来禁用按钮 */
  busy: undefined,
  /** @type {number} 每次拉取递增，供 tail 刷新用 */
  rev: 0,
})

/**
 * 拉一次实例列表。
 * @param {string | undefined} [root]
 */
export async function loadLaunches(root) {
  try {
    const list = await call('launch.list', root === undefined ? {} : { root })
    launchStore.set({ list: /** @type {Array<Record<string, any>>} */ (list), error: undefined, rev: Date.now() })
  } catch (error) {
    launchStore.set({ error: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * @param {string} root
 * @returns {Record<string, any> | undefined}
 */
export function activeLaunchFor(root) {
  return launchStore.get().list.find(
    (entry) => String(entry.root).toLowerCase() === root.toLowerCase() && (entry.status === 'starting' || entry.status === 'running'),
  )
}

/**
 * 启动一个目标。
 * @param {Record<string, any>} project
 * @param {Record<string, any>} target
 */
export async function startTarget(project, target) {
  const key = `${project.root}:${target.taskPath}`
  launchStore.set({ busy: key, error: undefined })
  try {
    await call('launch.start', {
      root: project.root,
      taskPath: target.taskPath,
      label: target.label,
      kind: target.kind,
      module: target.module,
    })
  } catch (error) {
    launchStore.set({ error: error instanceof Error ? error.message : String(error) })
  } finally {
    launchStore.set({ busy: undefined })
    await loadLaunches()
  }
}

/**
 * 停止一个实例。
 * @param {string} id
 */
export async function stopLaunch(id) {
  launchStore.set({ busy: id, error: undefined })
  try {
    await call('launch.stop', { id })
  } catch (error) {
    launchStore.set({ error: error instanceof Error ? error.message : String(error) })
  } finally {
    launchStore.set({ busy: undefined })
    await loadLaunches()
  }
}

/**
 * React 绑定 + 轮询（页面不可见时停轮询）。
 * @param {number} [intervalMs]
 * @returns {ReturnType<typeof launchStore.get>}
 */
export function useLaunches(intervalMs = 1500) {
  const [state, setState] = useState(launchStore.get())
  useEffect(() => {
    const unsubscribe = launchStore.subscribe(setState)
    void loadLaunches()
    let timer
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void loadLaunches()
    }
    timer = setInterval(tick, intervalMs)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [intervalMs])
  return state
}

/**
 * 拉一次某个实例的日志尾部。
 * @param {string} id
 * @param {number} limit
 * @returns {Promise<string[]>}
 */
export async function fetchLogTail(id, limit = 40) {
  const result = await call('launch.logs', { id, offset: 0, limit })
  return /** @type {string[]} */ (result.lines ?? [])
}
