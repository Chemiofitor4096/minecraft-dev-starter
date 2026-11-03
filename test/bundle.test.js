/**
 * 客户端产物守卫。
 *
 * `lib/client.js` 在 .gitignore 里，只有发布时才通过 package.json 的 files 进包——
 * 也就是说"忘了构建"这个错，本地测试全绿也发现不了，只有用户装完才暴露。
 * 这里按宿主的加载协议在 VM 里真跑一遍：外壳形状、factory 能不能执行、
 * cordis 插件导出是否完整、apply 有没有把该注册的东西注册上去。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const BUNDLE = new URL('../lib/client.js', import.meta.url)

/** react 在运行时由宿主的模块表提供，包里没有；测试给一份够用的替身。 */
function reactStub() {
  const createElement = (type, props, ...children) => ({ type, props, children })
  return {
    createElement,
    Fragment: Symbol.for('react.fragment'),
    memo: (component) => component,
    forwardRef: (component) => component,
    createContext: (value) => ({ Provider: component(), Consumer: component(), value }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    useRef: (value) => ({ current: value }),
    useContext: () => ({}),
  }
}

function component() {
  return function Stub() {
    return null
  }
}

const MODULES = {
  react: reactStub(),
  'react-dom': { createPortal: () => null, render: () => {}, unmountComponentAtNode: () => {} },
  'react-dom/client': { createRoot: () => ({ render() {}, unmount() {} }) },
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: Symbol.for('react.fragment') },
}

function createSandbox() {
  const loads = []
  const style = { textContent: '', setAttribute() {}, appendChild() {} }
  const document = {
    getElementById: () => null,
    createElement: () => ({ ...style }),
    head: { appendChild() {} },
    body: { appendChild() {} },
  }
  const window = { __ModuleLoader__: { load: (definition) => loads.push(definition) } }
  window.document = document
  const sandbox = {
    window,
    document,
    fetch: () => Promise.resolve({ ok: true }),
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    URL,
  }
  return { sandbox, loads }
}

/**
 * 一个够用的 cordis ctx：slots.inject 立即回调，effect 立即执行并返回 disposer。
 * 真实运行时里 inject 可能延后到槽位声明，这里按"声明已存在"的常见路径走。
 */
function createCtx() {
  const slots = []
  const tabTypes = []
  const disposers = []
  const ctx = {
    slots: {
      inject(name, callback) {
        const dispose = callback()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      register(entry, slotComponent) {
        slots.push({ entry, component: slotComponent })
        return () => {}
      },
    },
    effect(factory) {
      const dispose = factory()
      disposers.push(dispose)
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
    sidebarRightTabs: {
      register(definition) {
        tabTypes.push(definition)
        return () => {}
      },
    },
    inject() {
      return () => {}
    },
    get() {
      return undefined
    },
  }
  return { ctx, slots, tabTypes }
}

async function loadBundle() {
  const source = await readFile(BUNDLE, 'utf8')
  const { sandbox, loads } = createSandbox()
  vm.runInNewContext(source, sandbox, { filename: 'lib/client.js' })
  assert.equal(loads.length, 1, 'lib/client.js 应当只调用一次 __ModuleLoader__.load')
  return loads[0]
}

test('产物外壳符合宿主加载协议', async () => {
  const definition = await loadBundle()
  assert.equal(definition.id, 'minecraft-dev-starter')
  assert.equal(typeof definition.factory, 'function')
})

test('factory 导出 cordis 插件形状', async () => {
  const definition = await loadBundle()
  const plugin = definition.factory((id) => {
    const mod = MODULES[id]
    assert.ok(mod !== undefined, `未知的外部模块: ${id}`)
    return mod
  })
  assert.equal(plugin.name, 'mcdev-client')
  assert.ok(Array.isArray(plugin.inject), 'inject 必须是数组')
  assert.equal(typeof plugin.apply, 'function')
})

test('apply 注册胶囊、两个标签类型、两个标题与两段正文', async () => {
  const definition = await loadBundle()
  const plugin = definition.factory((id) => MODULES[id])
  const { ctx, slots, tabTypes } = createCtx()
  plugin.apply(ctx)

  const capsule = slots.find((slot) => slot.entry.name === 'conversation.session.header.utilities')
  assert.ok(capsule !== undefined, '没有注册标题栏胶囊')
  assert.equal(capsule.entry.id, 'mc-dev-starter:run-capsule')
  assert.equal(capsule.entry.order, 15)
  assert.equal(typeof capsule.component, 'function')

  assert.deepEqual(
    tabTypes.map((tab) => tab.id),
    ['minecraft-dev-starter/detail', 'minecraft-dev-starter/logs'],
  )
  for (const tab of tabTypes) {
    assert.equal(typeof tab.title, 'function', `${tab.id} 缺少 title`)
  }

  const bodies = slots.filter((slot) => slot.entry.name === 'sidebar.right.pane.tab')
  assert.deepEqual(
    bodies.map((slot) => slot.entry.key),
    ['minecraft-dev-starter/detail', 'minecraft-dev-starter/logs'],
  )

  const titles = slots.filter((slot) => slot.entry.name === 'sidebar.right.pane.tab.title')
  assert.deepEqual(
    titles.map((slot) => slot.entry.key),
    ['minecraft-dev-starter/detail', 'minecraft-dev-starter/logs'],
  )
  for (const slot of titles) {
    const chip = slot.component()
    assert.equal(typeof chip, 'object', '标题 chip 应当返回元素')
  }
})
