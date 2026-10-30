# DSH 插件机制调研

> 目的：为 `doc/策划.md` 的架构决策提供依据。所有结论都标注了本机出处，便于复核。
> 调研时间：2026-10-30。版本基线：npm 全局 `@deepseek-ai/dsh@0.1.5-rc.1`、桌面版 `DSH NEXT`（自带 asar 运行时）。

---

## 1. 结论摘要

1. **DSH 插件就是一个 npm 包**：`package.json` 里用 `dsh.bundle.patch` 指向一份 `cordis.patch.yml`，安装后被并入 profile 的 bundle 栈，随 profile 启动挂载。
2. **插件入口是 cordis 插件模块**：导出 `name` / `inject` / `Config` / `apply(ctx, config)`；工具通过 `defineTool` 注册到 `ctx.tools`。
3. **桌面版 GUI 加载的是 `~/.dsh/profiles/desktop`**，不是 CLI 默认 profile；装插件要往这个 profile 里挂。
4. **本地开发可以用绝对路径 / `file://` URL 直接挂**，不必先发布 npm。
5. **长生命周期进程不能用 `ctx.subprocess` 或 `ctx.jobs`**：两者的生命周期都绑在服务和 agent 作用域上，作用域释放即终止/取消。
6. **界面能做**：客户端插件可以往宿主已有的 slot 里注册 React 组件（已装插件 `dsh-better-sidebar` 就是这么在会话标题栏放按钮的），宿主侧用 `ctx.webServer.register` 提供 HTTP 接口给界面调。

---

## 2. 插件包结构

以已装的两个第三方插件为样本。

### 2.1 纯服务端插件：`minecraft-dev@0.10.1`

路径：`~/.dsh/profiles/desktop/node_modules/minecraft-dev`

```jsonc
// package.json 关键字段（节选）
{
  "name": "minecraft-dev",
  "type": "module",
  "main": "skills.js",
  "exports": { "./skills": "./skills.js", "./tools": "./tools.js", "./preset": "./preset.js" },
  "dsh": { "plugin": true, "kind": "server", "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: minecraft-tools
      name: minecraft-dev/tools
      config:
        gradleTimeoutMs: 600000
        outputTailChars: 12000
```

要点：
- `name` 可以直接写成「包名/导出子路径」，不需要单独的文件路径。
- `config` 就是插件 `Config`（schemastery）的取值。
- 一个包可以挂多行，每行一个插件入口。

### 2.2 带 UI 的插件：`dsh-better-sidebar@0.28.1`

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "inject": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-slots",
               "@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-sidebar-right",
               "@deepseek-ai/dsh-client-modules"],
    "platform": "web"
  },
  "manifestVersion": 1
}
```

这个包里能直接抄的三件事：

**a) 往界面挂组件**（`src/client/context-diagnostics-ui.tsx`、`src/client/sidebar/bottom-toggle.tsx`）：

```js
ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
  name: 'conversation.session.header.utilities',
  id: 'dsh-better-sidebar:bottom-toggle',
  order: 10,
  registrant: 'dsh-better-sidebar',
}, () => <BottomDockToggle store={store} />))
```

`slots.inject` 会等目标 slot 的声明上账（插件激活可能早于声明），声明撤了再重来时回调会重跑。组件签名是 `(props, context/entry)` 形态，具体以运行时类型为准。

**b) 宿主提供接口**（`src/index.ts`）：

```js
ctx.effect(() => ctx.webServer.register({
  kind: 'prefix',
  path: '/sidebar/api',
  handler: async (req, res) => { /* 读 body → 分发到方法表 → 写 JSON */ },
}), 'dsh-better-sidebar: /sidebar/api routes')
```

**c) 客户端怎么找宿主**（`src/client/host-route-url.ts` 注释）：Electron 外壳的页面是 `dsh-app://app/`，外壳把非静态路径转发给宿主，所以客户端必须用**相对路径**；绝对 origin 会变成跨域且宿主不返回 CORS 头。

已核实的 slot 名：`conversation.session.header.utilities`、`conversation.session.header.corner`（单占用，内置侧栏占着）、`shell.overlay`、`sidebar.right.pane.tab`、`sidebar.right.pane.tab.title`、`settings.section`。

### 2.3 客户端产物的加载协议（从 `lib/client.js` 反读）

成品不是 ESM，而是自注册到模块表：

```js
window.__ModuleLoader__.load({
  id: 'dsh-better-sidebar',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    // …rolldown 打包后的 CJS 体…
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
```

- 外部依赖（走 `require`）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/dsh-client-ui-primitives`。
- CSS 不是独立文件：构建期内联，运行时 `document.createElement('style')` + `appendChild` 注入。
- 导出的是 cordis 插件形状：`inject` + `apply`。
- 结论：客户端构建链只要能产出一段 CJS 并包上这层 wrapper 就行，不需要框架级模板。

### 2.4 右侧栏的正式接口（`dsh-client-ui-sidebar-right` README）

不是 DOM hack，有服务：

```js
// 注册一种标签类型
ctx.sidebarRightTabs.register({ id, kind, patterns?, priority?, canOpen?, title, guide? })
// 注册该类型的正文；Body 内用 useTabInfo() 取 { sidebar, panel, tab }
ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body)
// 打开：会自动展开面板（"the panel expands, because content the user cannot see is not opened"）
ctx.sidebarRight.openTab(kind, options?)
ctx.sidebarRight.isExpanded() / toggleExpanded() / close(tabId) / active()
```

这决定了日志可以做成右侧栏的一个标签页，并且能做到"启动即打开"。

---

## 3. 插件入口契约

样本：`~/.dsh/profiles/desktop/node_modules/minecraft-dev/tools.js`

```js
// 节选：只保留入口契约相关的部分
import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'

export const name = 'minecraft-tools'
export const inject = ['tools']                                  // 依赖的 service
export const Config = Schema.object({ gradleTimeoutMs: Schema.number().default(600_000) })

export function apply(ctx, config) {
  ctx.tools.register(defineTool({
    name: 'mc_gradle',
    description: '...',                                          // 模型看到的能力说明
    parameters: { projectDir: { type: 'string', required: true }, ... },
    output: { schema: {...}, render: (_args, value) => [{ type: 'text', text: ... }] },
    execute(args, exec) { /* exec.signal, exec.agent */ },
    presentCall: (args) => ({ card: 'terminal', title: ..., cwd: ... }),
  }))
}
```

`@deepseek-ai/dsh-tools` 的 README 明确了参数 DSL、输出 schema、`presentCall`/`presentResult` 的用途，以及执行流水线（`tools/pre-execute` → guards → `tools/execute` → `tools/post-execute`）。工具描述与 schema 会进系统提示，所以描述必须写清"什么时候用"。

---

## 4. 安装通道

| 通道 | 做法 | 适用 |
|---|---|---|
| CLI | `dsh plugin --profile <name> add <package>`（转发给 profile 目录里的 pnpm，并调和 `dsh.profile.bundles`） | 发布后 |
| profile patch 行 | 在 `~/.dsh/profiles/<name>/cordis.patch.yml` 加 `insert` | 改 profile 行为 |
| 用户级 patch | `~/.dsh/cordis.patch.yml`，对所有 profile 生效，**优先级高于** profile 自己的 patch 文件 | 全局开关 |
| 路径挂载 | `insert` 行的 `name` 可以写绝对路径、`file://` URL 或包名 | 本地开发迭代 |

桌面版的 profile 在 `~/.dsh/profiles/desktop`，其 `package.json` 的 `dsh.profile.bundles` 已包含 base、web-app、dshmarket、桥接、两个第三方 UI 插件与 `minecraft-dev`。

证据：host 进程命令行

```
"DSH NEXT.exe" --expose-internals "...\app.asar\lib\host.js" "...\app.asar" C:\Users\hualo\.dsh\profiles\desktop "...\runtime\x64\primary-runtime"
```

`--dump-config` 可以打印组合后的插件树，安装完排查"到底挂上没有"用它。

---

## 5. 可用的宿主能力

| Service | 提供什么 | 对本项目的用处 |
|---|---|---|
| `ctx.tools` | 注册模型可见工具 | 4 个工具（次要能力） |
| `ctx.webServer` | `register({ kind, path, handler })` 挂 HTTP 路由 | **界面的数据通道**（`/mcdev/api`） |
| `ctx.slots`（客户端上下文） | `inject(name, cb)` / `register(options, Component)` | **标题栏胶囊** |
| `ctx.systemPrompt` | `section()` / `variable()`，可加系统提示段 | 可选：注入"工作区有 N 个 MC 工程" |
| `ctx.workspaceRegistry` | 用户级工程记录（路径、标题、会话） | 不作为检测来源：它是"用户加进来的项目"，不是"磁盘上的 MC 工程" |
| `ctx.subprocess` | 托管子进程、输出收集、进程树终止 | **不用于启动游戏**（见 6.1） |
| `ctx.jobs` | 后台任务注册、状态、完成通知 | **不用于启动游戏**（见 6.2） |
| `ctx.settings` / storage | 设置与持久化 | 状态落盘用它或直接写 JSON 文件 |

工作区根：工具执行时的 `exec.agent.session.header.cwd`（系统提示里的 `cwd` 变量就是这么取的）。

---

## 6. 两条否定结论

### 6.1 为什么不用 `ctx.subprocess`

`@deepseek-ai/dsh-subprocess` README：*"Disposal of the service terminates every still-running managed process and awaits its exit, so process lifetime survives consumer reloads."*

也就是说，插件的服务被 dispose（重载、profile 重组合、宿主退出）时，托管进程一律被杀。启动器的核心诉求恰好相反：游戏要能活在 DSH 会话之外。所以用 `node:child_process` 自己 spawn + `detached` + 自建 supervisor。

### 6.2 为什么不用 `ctx.jobs`

`@deepseek-ai/dsh-jobs` README：*"Owner and service disposal cancel live work"*，且状态模型是 `running → completed/killed/failed`，语义是"agent 派出去的后台任务"。

游戏实例不是任务：它可能跑几小时、可能被用户手动关窗、可能比会话活得久，还要能被下一个会话接手。用 jobs 会被会话生命周期绑死。

---

## 7. 呈现层

v0.2 之后界面是主场，工具卡片是次要的。

- **界面**：客户端插件（React）注入 `conversation.session.header.utilities` 等 slot，数据走 `/mcdev/api/*`。
- **工具卡片**：`presentCall` / `presentResult` 返回 `card` 结构（`terminal`、`generic` 等），Web 客户端据此渲染。纯函数约束：不能读时间、不能 IO，因为回放时也会调用。
- 两者共用同一份服务状态，不做两套逻辑。

---

## 8. 待实测项（M0 清单）

| # | 待验证 | 验证方式 |
|---|---|---|
| V1 | 本地路径挂载能挂上，宿主入口生效 | desktop profile 的 patch 加一行指向本地入口，重启后调工具或打路由 |
| V2 | 桌面版实际运行的 `@deepseek-ai/dsh-tools` / client 包版本 | 读 `app.asar` 里的 `node_modules/@deepseek-ai/*/package.json` |
| V3 | **客户端包能不能被桌面版加载**：`__ModuleLoader__` wrapper 是否被认 | 最小 `lib/client.js`（只注册一个按钮）+ `dsh.client.inject`，重启后看标题栏 |
| V3b | 右侧栏标签类型能注册并自动展开 | 注册一个空 `mcdev.logs` 标签，调用 `ctx.sidebarRight.openTab` |
| V4 | `--dump-config` 是否可用来确认挂载 | `node <dsh>/lib/bin.js --profile desktop --dump-config` |
| V5 | 宿主重启后 PID 探活是否可靠（Windows） | 起假进程 → 重启 → 列实例 |
| V6 | 相对路径请求宿主是否通（Electron 外壳） | 客户端 `fetch('/mcdev/api/ping')`，看是否 200 |
| V7 | slot / tab body 拿到的 props 形状 | 打印一次 `useTabInfo()`，确认能拿到 `tab` 与本次 launch 的关联方式 |

V3 / V3b 是主界面方案的关键闸门：任一不通过就退回独立网页面板。

### 8.1 Gradle 任务探测的实测代价

在 `C:\Projects\Custom-Machinery-1.20.1` 上跑 `gradlew tasks --all`：

- 耗时 **6 分 37 秒**；
- 最终失败：`Could not find dev.latvian.mods:kubejs:2001.6.4-build.121`（工程自身的依赖缺失，与我们的命令无关）。

结论：**不把 Gradle 探测放在扫描路径上**。静态解析读 runs 块，探测只做用户手动触发的一次性验证，结果按 mtime 缓存，失败原样展示。

---

## 9. 参考路径

```
~/.dsh/profiles/desktop/                       桌面版 profile（改这里）
~/.dsh/profiles/desktop/package.json           bundle 栈
~/.dsh/profiles/desktop/cordis.patch.yml       profile 用户层
~/.dsh/cordis.patch.yml                        全局用户层（当前挂着两个 MCP）
~/.dsh/profiles/desktop/node_modules/minecraft-dev/     插件样本（服务端）
~/.dsh/profiles/desktop/node_modules/dsh-better-sidebar/ 插件样本（含 client：
                                                 src/client/context-diagnostics-ui.tsx  标题栏 slot
                                                 src/client/sidebar/bottom-toggle.tsx   按钮示例
                                                 src/client/host-route-url.ts           同源踩坑
                                                 src/index.ts                           路由注册）
~/.dsh/profiles/web/node_modules/@tt-a1i/archify-dsh/    最小 bundle 样本
~/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/
                                               各服务端包的 README 就是 API 文档；
                                               dsh-client-ui-sidebar-right 的 README 是右侧栏
                                               tab 注册与 ctx.sidebarRight 的权威说明
<DSH NEXT>/resources/app.asar                  桌面版运行时，内含 313 个 @deepseek-ai 包
                                               其中 client 侧：dsh-client-ui-slots / -conversation /
                                               -primitives / -layout / -modules / -locale / -store
```

桌面版包里没有 README（只有编译产物），client 侧 API 的权威样本是 `dsh-better-sidebar` 的源码。
