/**
 * 极简可订阅状态。客户端不需要状态库：一个扫描结果 + 一个选中项就够。
 * @module minecraft-dev-starter/client/store
 */

/**
 * @template {Record<string, unknown>} T
 * @param {T} initial
 */
export function createStore(initial) {
  /** @type {T} */
  let value = initial
  const listeners = new Set()

  return {
    /** @returns {T} */
    get() {
      return value
    },
    /** @param {Partial<T>} next */
    set(next) {
      value = { ...value, ...next }
      for (const listener of listeners) listener(value)
    },
    /**
     * @param {(value: T) => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
