/**
 * 客户端入口（cordis 插件形状：inject + apply）。
 *
 * 挂两处：
 *   - 会话标题栏的胶囊（`conversation.session.header.utilities`）
 *   - 右侧栏的「MC 工程」标签（`ctx.sidebarRightTabs` + `sidebar.right.pane.tab`）
 *
 * @module minecraft-dev-starter/client
 */

import { Capsule } from './Capsule.js'
import { DetailTab } from './DetailTab.js'
import { report } from './debug.js'
import { runtime } from './runtime.js'
import { ensureStyles } from './styles.js'

export const name = 'mcdev-client'

/** cordis 只把 inject 里声明过的服务交给插件；三个服务都在 web 组合里。 */
export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs']

const TAB_ID = 'minecraft-dev-starter/detail'
const TAB_KIND = 'mcdev.detail'

/**
 * @param {any} ctx
 */
export function apply(ctx) {
  runtime.ctx = ctx
  ensureStyles()
  report('apply')

  // 1) 标题栏胶囊
  try {
    ctx.slots.inject('conversation.session.header.utilities', () =>
      ctx.slots.register(
        {
          name: 'conversation.session.header.utilities',
          id: 'mc-dev-starter:run-capsule',
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

  // 2) 右侧栏标签类型
  try {
    ctx.effect(() => ctx.sidebarRightTabs.register({ id: TAB_ID, kind: TAB_KIND, title: () => 'MC 工程' }), 'mcdev: detail tab type')
    report('tab.type.registered')
  } catch (error) {
    report('tab.type.failed', { message: String(error) })
  }

  // 3) 标签正文
  const registerBody = () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, DetailTab)
  try {
    registerBody()
    report('tab.body.registered')
  } catch {
    try {
      ctx.slots.inject('sidebar.right.pane.tab', registerBody)
      report('tab.body.registered.via-inject')
    } catch (error) {
      report('tab.body.failed', { message: String(error) })
    }
  }

  // 4) M1 验证期：没有会话时标题栏 slot 不存在，胶囊看不到，先自动打开一次详情标签。
  //    等 M3 接了启动入口、有了稳定的会话界面，把这个开关关掉。
  const DEV_AUTO_OPEN = true
  if (DEV_AUTO_OPEN) {
    setTimeout(() => {
      try {
        ctx.sidebarRight.openTab(TAB_KIND)
        report('dev.open-tab')
      } catch (error) {
        report('dev.open-tab.failed', { message: String(error) })
      }
    }, 600)
  }
}
