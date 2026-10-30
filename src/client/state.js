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
