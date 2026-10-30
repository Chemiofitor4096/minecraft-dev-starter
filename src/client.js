/**
 * M0 探针（浏览器半边）。
 *
 * 目的只有一个：在真实运行时里证明三件事——
 *   1) 这个 bundle 能被 __ModuleLoader__ 收下并激活（标题栏出现胶囊）；
 *   2) 客户端能打到宿主路由（胶囊会在拿到 ping 后变绿）；
 *   3) 右侧栏能注册标签、openTab 能展开（激活后自动开一次，并把结果回传宿主）。
 *
 * 正式实现会把这里换成 TSX + esbuild 构建，见 doc/策划.md §5.4、§16 D2。
 * 为了把「加载协议」和「构建链」两个变量分开，M0 这份是手写的 CJS，不经打包器。
 */
window.__ModuleLoader__.load({
  id: 'minecraft-dev-starter',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement

    var VERSION = '0.0.1-m0'
    var TAB_ID = 'minecraft-dev-starter/logs'
    var TAB_KIND = 'mcdev.logs'

    // ── 状态：谁都能读，谁都能订阅 ──────────────────────────────────────
    var state = {
      ping: 'idle',
      pingDetail: '',
      tabType: 'idle',
      tabBody: 'idle',
      opened: 'never',
      hooks: [],
    }
    var listeners = new Set()
    function getState() {
      return state
    }
    function patch(next) {
      state = Object.assign({}, state, next)
      listeners.forEach(function (fn) {
        fn(state)
      })
    }
    function subscribe(fn) {
      listeners.add(fn)
      return function () {
        listeners.delete(fn)
      }
    }

    /** 把探针结果回传宿主，这样验证不依赖肉眼看截图。 */
    function report(payload) {
      try {
        fetch('/mcdev/api/report', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(Object.assign({ version: VERSION, at: Date.now() }, payload)),
        }).catch(function () {})
      } catch (error) {
        /* 上报失败不影响探测 */
      }
    }

    /** cordis 的 ctx.get 在服务缺失时会抛；探针里不能因为缺服务就整个挂掉。 */
    function safeGet(ctx, key) {
      try {
        return ctx.get(key)
      } catch (error) {
        return undefined
      }
    }

    function ping() {
      return fetch('/mcdev/api/ping', { cache: 'no-store' })
        .then(function (res) {
          return res.json().then(function (body) {
            return { status: res.status, body: body }
          })
        })
        .then(function (result) {
          if (result.status === 200 && result.body && result.body.ok) {
            patch({ ping: 'ok', pingDetail: 'host ' + result.body.version + ' · pid ' + result.body.pid })
          } else {
            patch({ ping: 'fail', pingDetail: 'HTTP ' + result.status })
          }
        })
        .catch(function (error) {
          patch({ ping: 'fail', pingDetail: 'fetch failed: ' + error.message })
        })
    }

    var DOT = { idle: 'rgba(139,148,158,0.9)', ok: '#3fb950', fail: '#f85149' }
    var capsuleCtx

    /** 标题栏胶囊：状态点 + 文案；点击打开右侧栏日志标签。 */
    function Capsule() {
      var [, force] = React.useState(0)
      React.useEffect(function () {
        return subscribe(function () {
          force(function (n) {
            return n + 1
          })
        })
      }, [])
      React.useEffect(function () {
        ping()
      }, [])
      var s = getState()
      var label = s.ping === 'ok' ? 'MC ' + VERSION : s.ping === 'fail' ? 'MC 未连通' : 'MC …'
      return h(
        'button',
        {
          type: 'button',
          title:
            'minecraft-dev-starter M0 探针\n' +
            'ping: ' + s.ping + ' ' + s.pingDetail + '\n' +
            'tabType: ' + s.tabType + '\n' +
            'tabBody: ' + s.tabBody + '\n' +
            'opened: ' + s.opened,
          onClick: function () {
            var sidebar = capsuleCtx.sidebarRight
            if (!sidebar) {
              patch({ opened: 'no sidebarRight service' })
              return
            }
            try {
              sidebar.openTab(TAB_KIND)
              patch({ opened: 'ok ' + new Date().toLocaleTimeString() })
              report({ phase: 'click-open', ok: true })
            } catch (error) {
              patch({ opened: 'error: ' + error.message })
              report({ phase: 'click-open', ok: false, error: error.message })
            }
            ping()
          },
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            height: '24px',
            padding: '0 8px',
            borderRadius: '999px',
            border: '1px solid rgba(139,148,158,0.35)',
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            fontSize: '12px',
            cursor: 'pointer',
          },
        },
        h('span', {
          style: { width: '7px', height: '7px', borderRadius: '50%', background: DOT[s.ping] || DOT.idle, flex: 'none' },
        }),
        h('span', null, label),
      )
    }

    /** 右侧栏日志标签的正文：把探针状态摊开。 */
    function LogBody() {
      var [, force] = React.useState(0)
      React.useEffect(function () {
        ping()
        return subscribe(function () {
          force(function (n) {
            return n + 1
          })
        })
      }, [])
      var s = getState()
      var rows = [
        ['bundle', VERSION + ' (hand-written CJS)'],
        ['host ping', s.ping + ' ' + s.pingDetail],
        ['tab type', s.tabType],
        ['tab body', s.tabBody],
        ['openTab()', s.opened],
      ]
      return h(
        'div',
        { style: { padding: '12px', fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: '1.7' } },
        h('div', { style: { marginBottom: '8px', opacity: 0.7 } }, '运行日志（M0 探针）'),
        rows.map(function (row) {
          return h(
            'div',
            { key: row[0], style: { display: 'flex', gap: '10px' } },
            h('span', { style: { width: '80px', flex: 'none', opacity: 0.6 } }, row[0]),
            h('span', null, row[1]),
          )
        }),
      )
    }

    exports.name = 'mcdev-client'
    // cordis 只把 inject 里声明过的服务交给插件（ctx.get 不算）；这三个都在 web 组合里。
    // 少了任何一个，本插件不激活，但不会影响别的插件。
    exports.inject = ['slots', 'sidebarRight', 'sidebarRightTabs']

    exports.apply = function apply(ctx) {
      capsuleCtx = ctx
      var result = { capsule: 'not-run', tabType: 'not-run', tabBody: 'not-run' }

      // 1) 标题栏胶囊
      try {
        ctx.slots.inject('conversation.session.header.utilities', function () {
          return ctx.slots.register(
            {
              name: 'conversation.session.header.utilities',
              id: 'mc-dev-starter:run-capsule',
              order: 15,
              registrant: 'minecraft-dev-starter',
            },
            Capsule,
          )
        })
        result.capsule = 'registered'
      } catch (error) {
        result.capsule = 'error: ' + error.message
      }

      // 2) 右侧栏标签类型
      var tabs = ctx.sidebarRightTabs
      if (!tabs) {
        result.tabType = 'no sidebarRightTabs service'
      } else {
        try {
          ctx.effect(
            function () {
              return tabs.register({ id: TAB_ID, kind: TAB_KIND, title: function () { return '运行日志' } })
            },
            'mcdev: log tab type',
          )
          result.tabType = 'registered'
        } catch (error) {
          result.tabType = 'error: ' + error.message
        }
      }

      // 3) 标签正文
      try {
        var registerBody = function () {
          return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, LogBody)
        }
        try {
          registerBody()
          result.tabBody = 'registered'
        } catch (error) {
          ctx.slots.inject('sidebar.right.pane.tab', registerBody)
          result.tabBody = 'registered via inject'
        }
      } catch (error) {
        result.tabBody = 'error: ' + error.message
      }

      patch({ tabType: result.tabType, tabBody: result.tabBody })
      report(Object.assign({ phase: 'activate' }, result))

      // 4) 自动开一次日志标签，验证 openTab 会展开右侧栏
      var sidebar = ctx.sidebarRight
      setTimeout(function () {
        if (!sidebar) {
          report({ phase: 'auto-open', ok: false, error: 'no sidebarRight service' })
          return
        }
        try {
          sidebar.openTab(TAB_KIND)
          patch({ opened: 'auto ok ' + new Date().toLocaleTimeString() })
          report({ phase: 'auto-open', ok: true, expanded: sidebar.isExpanded() })
          // 再等一拍复检：面板展开与活动标签可能是下一帧才生效。
          setTimeout(function () {
            var active
            try {
              active = sidebar.active()
            } catch (error) {
              active = 'error: ' + error.message
            }
            report({
              phase: 'auto-open-late',
              expanded: sidebar.isExpanded(),
              activeTab: active && typeof active === 'object'
                ? { id: active.id, kind: active.kind, title: active.title }
                : String(active),
            })
          }, 1500)
        } catch (error) {
          patch({ opened: 'auto error: ' + error.message })
          report({ phase: 'auto-open', ok: false, error: error.message })
        }
      }, 1200)
    }

    return module.exports
  },
})
