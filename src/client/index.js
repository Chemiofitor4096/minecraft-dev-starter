/**
 * 客户端入口（cordis 插件形状：inject + apply）。
 *
 * 挂四处：
 *   - 会话标题栏的胶囊（`conversation.session.header.utilities`）
 *   - 右侧栏「Mod Dev」工程标签
 *   - 右侧栏「运行日志」标签
 *   - 装了 `dsh-better-sidebar` 时，再向它的侧栏注册同样两个页面（带图标）
 *
 * @module minecraft-dev-starter/client
 */

import { Capsule } from './views/Capsule.js'
import { DetailTab } from './views/DetailTab.js'
import { PANEL_TITLE } from './lib/format.js'
import { LogTab } from './views/LogTab.js'
import { attachLocale, t } from './lib/messages.js'
import { report } from './lib/debug.js'
import { h } from './lib/h.js'
import { IconCube, IconTerminal } from './lib/icons.js'
import { BETTER_DETAIL_ID, BETTER_LOG_ID, DETAIL_KIND, LOG_KIND, runtime } from './lib/runtime.js'
import { ensureStyles } from './lib/styles.js'

export const name = 'mcdev-client'

/** cordis 只把 inject 里声明过的服务交给插件；三个服务都在 web 组合里。 */
export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs']

const DETAIL_ID = 'minecraft-dev-starter/detail'
const LOG_ID = 'minecraft-dev-starter/logs'

/**
 * @param {any} ctx
 */
export function apply(ctx) {
  runtime.ctx = ctx
  ensureStyles()
  report('apply')

  // 0) 文案：优先跟随宿主 locale；没有这个服务就退回浏览器语言，再退回中文。
  //    注册失败只影响翻译，不影响插件挂载。
  try {
    if (!attachLocale(ctx) && typeof ctx.inject === 'function') {
      ctx.inject(['locale'], (scoped) => {
        attachLocale(scoped)
      })
    }
  } catch (error) {
    report('locale.failed', { message: String(error) })
  }

  // 1) 标题栏胶囊：放右侧工具簇（utilities）。
  //    语义上"启动"确实算 actions，但 actions 紧贴会话标题，而胶囊宽度随工程名/目标名变化，
  //    窄窗口下会挤到标题；实测放 utilities 更稳。要改回去只动这两处。
  try {
    ctx.slots.inject('conversation.session.header.utilities', () =>
      ctx.slots.register(
        {
          name: 'conversation.session.header.utilities',
          id: 'mc-dev-starter:run-capsule',
          // utilities 区里 open-in-app 是 -10，我们排在它右边
          order: 15,
          registrant: 'minecraft-dev-starter',
        },
        Capsule,
      ),
    )
    report('capsule.registered')
  } catch (error) {
    report('capsule.failed', { message: String(error) })
  }

  // 2) 右侧栏两个标签类型：工程面板 + 运行日志
  try {
    ctx.effect(
      () => ctx.sidebarRightTabs.register({ id: DETAIL_ID, kind: DETAIL_KIND, title: () => PANEL_TITLE }),
      'mcdev: detail tab type',
    )
    ctx.effect(
      () => ctx.sidebarRightTabs.register({ id: LOG_ID, kind: LOG_KIND, title: () => t('tab.logs') }),
      'mcdev: log tab type',
    )
    report('tab.type.registered')
  } catch (error) {
    report('tab.type.failed', { message: String(error) })
  }

  // 3) 标签正文
  registerBody(DETAIL_ID, DetailTab, 'detail')
  registerBody(LOG_ID, LogTab, 'logs')

  // 3.5) 原生标签条的标题 chip：图标 + 文字。
  //      tab 类型定义本身没有 icon 字段，但 `sidebar.right.pane.tab.title` 这个带键 seat
  //      可以接管标题渲染（内置的 schedule / plan 页就是这么加图标的）。
  try {
    ctx.slots.inject('sidebar.right.pane.tab.title', () =>
      ctx.slots.register(
        { name: 'sidebar.right.pane.tab.title', key: DETAIL_ID },
        tabTitleChip(IconCube, PANEL_TITLE),
      ),
    )
    ctx.slots.inject('sidebar.right.pane.tab.title', () =>
      ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: LOG_ID }, tabTitleChip(IconTerminal, () => t('tab.logs'))),
    )
    report('tab.title.registered')
  } catch (error) {
    report('tab.title.failed', { message: String(error) })
  }

  // 4) 装了 dsh-better-sidebar 时，把同样的两个页面挂到它的侧栏（它支持标签图标）
  ctx.effect(() => registerBetterSidebarTabs(ctx), 'mcdev: better-sidebar tabs')
}

/**
 * 原生标签条的标题：图标 + 文字，和内置页签同一套版式。
 * @param {any} Icon
 * @param {string | (() => string)} label 传函数时每次渲染取当前语言
 * @returns {() => any}
 */
function tabTitleChip(Icon, label) {
  return () =>
    h(
      'span',
      { className: 'mcdev-icon-text' },
      h('span', { className: 'mcdev-icon' }, h(Icon, { size: 14 })),
      typeof label === 'function' ? label() : label,
    )
}

/**
 * 向 `dsh-better-sidebar` 注册两个带图标的标签。
 *
 * 它是可选的第三方插件：可能没装、也可能比我们晚加载，所以轮询取服务，
 * 拿到就注册，拿不到就安静退出（不报错、不影响别的功能）。
 * @param {any} ctx
 * @returns {() => void} disposer
 */
function registerBetterSidebarTabs(ctx) {
  /** @type {Array<() => void>} */
  const disposers = []
  /** @type {(() => void) | undefined} */
  let injectHandle

  /**
   * @param {any} sidebar
   */
  const register = (sidebar) => {
    if (sidebar === undefined || typeof sidebar.registerTab !== 'function') return
    try {
      disposers.push(
        sidebar.registerTab({
          id: BETTER_DETAIL_ID,
          title: PANEL_TITLE,
          icon: (size) => h(IconCube, { size }),
          component: () => h(DetailTab),
        }),
      )
      disposers.push(
        sidebar.registerTab({
          id: BETTER_LOG_ID,
          title: () => t('tab.logs'),
          icon: (size) => h(IconTerminal, { size }),
          component: () => h(LogTab),
        }),
      )
      report('betterSidebar.registered')
    } catch (error) {
      report('betterSidebar.failed', { message: String(error) })
    }
  }

  // 首选 cordis 的作用域注入：等服务出现再注册，插件不在也不会报错。
  if (typeof ctx.inject === 'function') {
    try {
      injectHandle = ctx.inject(['betterSidebar'], (scoped) => {
        register(scoped.get('betterSidebar', false))
      })
      report('betterSidebar.waiting')
      return () => {
        try {
          injectHandle?.()
        } catch {
          /* ignore */
        }
        for (const dispose of disposers.splice(0)) {
          try {
            dispose()
          } catch {
            /* ignore */
          }
        }
      }
    } catch (error) {
      report('betterSidebar.inject.failed', { message: String(error) })
    }
  }

  // 兜底：轮询 get（strict=false 不抛），30 秒找不到就放弃
  let stopped = false
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const startedAt = Date.now()
  const attempt = () => {
    if (stopped) return
    let sidebar
    try {
      sidebar = typeof ctx.get === 'function' ? ctx.get('betterSidebar', false) : undefined
    } catch {
      sidebar = undefined
    }
    if (sidebar === undefined || typeof sidebar.registerTab !== 'function') {
      if (Date.now() - startedAt > 30_000) {
        report('betterSidebar.absent')
        return
      }
      timer = setTimeout(attempt, 700)
      return
    }
    register(sidebar)
  }
  attempt()
  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 注册标签正文；某些版本要求先等 slot 声明上账，所以失败后走 inject 再试一次。
 * @param {string} id
 * @param {any} component
 * @param {string} tag 诊断上报里的名字
 */
function registerBody(id, component, tag) {
  const ctx = runtime.ctx
  const register = () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, component)
  try {
    register()
    report(`${tag}.body.registered`)
  } catch {
    try {
      ctx.slots.inject('sidebar.right.pane.tab', register)
      report(`${tag}.body.registered.via-inject`)
    } catch (error) {
      report(`${tag}.body.failed`, { message: String(error) })
    }
  }
}
