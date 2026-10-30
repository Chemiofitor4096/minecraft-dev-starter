/**
 * 客户端入口（cordis 插件形状：inject + apply）。
 *
 * 挂三处：
 *   - 会话标题栏的胶囊（`conversation.session.header.utilities`）
 *   - 右侧栏「MC 工程」详情标签
 *   - 右侧栏「运行日志」标签
 *
 * @module minecraft-dev-starter/client
 */

import { Capsule } from './Capsule.js'
import { DetailTab } from './DetailTab.js'
import { LogTab } from './LogTab.js'
import { report } from './debug.js'
import { DETAIL_KIND, LOG_KIND, runtime } from './runtime.js'
import { ensureStyles } from './styles.js'

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

  // 2) 右侧栏两个标签类型：工程详情 + 运行日志
  try {
    ctx.effect(
      () => ctx.sidebarRightTabs.register({ id: DETAIL_ID, kind: DETAIL_KIND, title: () => 'MC 工程' }),
      'mcdev: detail tab type',
    )
    ctx.effect(
      () => ctx.sidebarRightTabs.register({ id: LOG_ID, kind: LOG_KIND, title: () => '运行日志' }),
      'mcdev: log tab type',
    )
    report('tab.type.registered')
  } catch (error) {
    report('tab.type.failed', { message: String(error) })
  }

  // 3) 标签正文
  registerBody(DETAIL_ID, DetailTab, 'detail')
  registerBody(LOG_ID, LogTab, 'logs')

  // 4) 不再自动打开任何标签：入口是标题栏胶囊，面板只在需要时出现。
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
