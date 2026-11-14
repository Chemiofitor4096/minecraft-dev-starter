# AGENTS.md

给在这个仓库里干活的 agent（和以后的自己）看的。用户向的说明在 [README](./README.md)。

## 这是什么

DeepSeek Harness（DSH）插件：识别工作区里的 Minecraft 模组工程，并在会话标题栏提供一个
IDEA 风格的运行控件（选中目标 → 启动 / 停止 / 看日志）。

界面不是全部。面板与工具共用同一份运行状态与同一把锁：**人**看工程状态、起停、读日志；
**模型**识别工程、启动任务、拿日志、拿结论。同一工程同时只有一个实例，两边不会互相踩。
两者的分工来自运行目标的两类生命周期：

- `daemon`（`runClient` / `runServer`）：一直跑到人关窗口，"就绪"是个有意义的状态；
- `oneshot`（`runData` / `runGameTestServer` / 自建 `runGametest`）：跑完即结束，
  结束时的 `verdict` 才是它的产出。模型的"改 → 跑 → 验"闭环靠这一类。

窗口画面是模型判断不了的部分，交给人；能断言的（构建、数据生成、gametest 结果）交给模型。

- 宿主侧：ESM、无 TypeScript、JSDoc 注解；Node ≥ 20。
- 客户端侧：React 组件用 `h()` 手写（不用 JSX），由 esbuild 打成 CJS，再包一层
  `window.__ModuleLoader__.load({ id, factory })`。
- 设计文档：[策划](./doc/策划.md)（架构、规则、里程碑）、[DSH 插件机制调研](./doc/调研-DSH插件机制.md)。

## 目录

```
src/index.js          宿主入口：inject + apply，挂 HTTP 路由与工具
src/tools.js          八个模型工具（mc_projects / mc_project_detail / mc_mod_init / mc_set_group / mc_launch / mc_launch_logs / mc_launch_list / mc_launch_stop）
src/lib/              领域层。跨层依赖单向：detect / launch 可以用 util、i18n，反过来不行
  api.js              /mcdev/api 的方法实现（scan / detail / state / launch.*），唯一聚合点
  state.js            ~/.dsh/mc-dev-starter 下的状态与日志（运行记录按 profile 分目录）
  versions.js         版本解析：调用时向上游取 (loader, MC) 的精确版本，失败退回 seed
  scaffold.js         工程脚手架：校验参数、渲染 templates/、写盘；setGroup 改包名（移动目录 + 改写引用）
  detect/             识别一个工程是什么
    detect.js         工程画像：loader、模块、run 目标、证据与警告
    scanner.js        工作区 BFS（深度 3、剪枝、上限）
    gradle.js         build.gradle / settings.gradle / gradle.properties 的解析
    metadata.js       mods.toml / fabric.mod.json / plugin.yml / archive.yml
    deps.js           声明依赖：dependencies 块、libs.versions.toml、元数据 depends
    idea.js           IntelliJ `.idea` 工程模型（模块清单 / facet / 工程 JDK / 运行配置）
    xml.js            极简 XML 解析（零依赖，只服务 .idea）
  launch/             把一个工程跑起来并拿到结论
    launches.js       启动服务：spawn、就绪判定、日志环形缓冲、停止、状态对账
    assets.js         首次运行检查：Minecraft 资源没下过时给一个提示码
    verify.js         目标分类（daemon / oneshot）与一次性任务的裁决（verdict）
    argv.js           gradlew 命令行构造（Gradle 选项在任务名之前、Windows 引号规则）
    jdks.js           每个工程的 JDK 选择（优先级、jdk.json 持久化、要不要注入）
    java.js           JDK 探测与版本匹配（读 <jdk>/release，不起进程）
  i18n/messages.js    宿主侧 zh / en 字典：证据、警告、归因、错误（语言由客户端请求带上）
  util/               text.js / toml.js 这类无依赖小工具
src/client/
  index.js            客户端入口：胶囊 slot、两个标签类型、better-sidebar 可选注册
  views/              只放 React 组件
    Capsule.js        标题栏胶囊（状态点 + 目标名 + 启停）
    Flyout.js         浮层（单工程特化 / 多工程三段结构）
    DetailTab.js      工程面板（版本、环境、模块、证据、警告）
    LogTab.js         日志标签（历史、跟随、归因）
    Skeleton.js       加载骨架
  lib/                组件之外的客户端代码
    messages.js       zh / en 字典 + 取词（跟随宿主 locale）；useLocale.js 订阅语言变化
    state.js / store.js / selection.js / runtime.js / api.js
    format.js / logFormat.js / logFilter.js / dock.js / h.js / icons.js / styles.js / debug.js
lib/client.js         构建产物（.gitignore 忽略；靠 package.json 的 files 打进 npm 包，运行时直接加载）
scripts/              构建与发布：build-client.mjs / check-pack.mjs
tools/                开发期辅助：inspect-project / scan-catalog / seed-versions / make-banner.py
test/                 233 个测试 + fixtures（真实工程形态的假仓库；fixtures-multi 是多模块聚合工程）
doc/                  策划、调研与工具描述术语表（doc/tool-vocabulary.md）
data/versions.json    只有两样：seed（抓不到上游时的离线兜底）与 verified（真跑通过的组合）
templates/            脚手架模板，按 loader 分目录；占位符用 {{name}}（Gradle 自己用 ${...}）
```

## 命令

```powershell
node --test                       # 全部测试（默认发现 test/*.test.js；Node 20 不认 glob，别写 "test/*.test.js"）
npm test                          # 同上，先重建客户端再跑
node scripts/build-client.mjs     # 构建客户端（改 src/client 后必须跑）
node scripts/build-client.mjs --watch
node scripts/check-pack.mjs       # 发布前校验 npm 包内容（缺 lib/client.js、多带 test/ 都会失败）
node tools/scan-catalog.mjs       # 扫真实工程，输出识别结果表
node tools/inspect-project.mjs <工程目录>   # 摊开一个工程的证据 / .idea 模型 / 目标来源
node tools/seed-versions.mjs <loader> <mc>  # 把当前上游版本固化进 seed（新增热门线时用，平时不需要）
```

CI 在 `.github/workflows/ci.yml`：ubuntu / windows / macOS × Node 20/22/24 跑构建与测试，
另有一个 pack 任务跑 `check:pack`。`prepack` 会在打包前自动构建，客户端漏构建发不出去；
`test/bundle.test.js` 按宿主加载协议真跑一遍产物，客户端挂掉不用等用户装完才发现。

改完客户端**必须**重新构建 `lib/client.js` 并跑测试；样式改动还要过 `test/styles.test.js`
（颜色/字号必须引用 `--dsw-*` 令牌，不许写字面色值）。

## 开发期安装

```powershell
node <npm>/@deepseek-ai/dsh/lib/bin.js plugin --profile m0test add link:C:/Projects/minecraft-dev-starter
node <npm>/@deepseek-ai/dsh/lib/bin.js --profile m0test --port 3499 --no-open
```

`link:` 才能改完即生效；`file:` 会被 pnpm 拷贝成副本，编辑仓库不影响已装副本。

## 硬坑（都踩过，别再踩）

| 现象 | 原因 | 做法 |
|---|---|---|
| 客户端整包不加载 | 没有 `__ModuleLoader__.load` 包装、或 factory 里用了 ESM | esbuild 打 CJS，banner/footer 由 `scripts/build-client.mjs` 生成 |
| `ctx.get('x')` 拿到 undefined | cordis 要求服务先声明在 `inject` | 需要什么写进 `inject`；可选服务用 `ctx.inject([...], cb)` 或 `ctx.get(name, false)` |
| 注册 slot 报 "not declared" | 父条目还没声明该 slot | 用 `ctx.slots.inject(name, …)`，或注册失败后重试 |
| 启动后日志 0 字节 | Windows 上 `detached: true` 让子进程丢掉我们的管道（`DETACHED_PROCESS` 与 `CREATE_NO_WINDOW` 冲突） | Windows 关闭 detached，保留 `windowsHide`；POSIX 才 detached（要进程组） |
| 启动时多一个控制台窗口 | 同上：没有可继承的隐藏控制台，java 自己开一个 | 同上，关闭 detached 后消失 |
| 中文日志乱码 | `.bat` 输出按 GBK 编码 | `decodeLine`：先按 UTF-8 解，失败再按 GBK |
| 工具报 "value is not lossless JSON" | 返回值里带了 `undefined` | 只放存在的字段；测试里用 `assertLossless()` |
| 改 profile 后启动失败 | `package.json` 写入了 BOM | 用无 BOM 的 UTF-8 写；改完必须重启 DSH |
| 仓库的 `node_modules` 神秘消失 | 在某个 profile 里把 `link:` 依赖换成 `file:`/npm 包时，pnpm 解链会**删掉被链接目录的 `node_modules`**（实测：`plugin add link:` → 在 → `plugin add file:tgz` → 没了） | 别在同一 profile 里来回切换安装方式；tarball/registry 验证用独立 profile；发现消失就 `npm install --ignore-scripts` 重装 |
| 侧栏标签打不开 | `openTab` 的展开是异步的 | 打开后等一帧再断言 `isExpanded()` |
| 发版后装不到新版本 | pnpm 缓存了 registry 元数据（`%LOCALAPPDATA%\pnpm-cache\metadata-v1.3\registry.npmjs.org\<pkg>.json`），`dsh plugin add` 会报 "latest is 0.1.2"、甚至"只有 4 个版本" | 删掉那个 `<pkg>.json` 再装；同时确认 `.npmrc` 里的代理是通的 |
| 一次性任务被当成守护进程 | 用"等就绪"的语义管 `runData` / `runGameTestServer`：`BUILD SUCCESSFUL` 是**终止**信号却被当成**就绪**信号，而且跑完拿不到"过没过" | 目标带 `mode`（daemon / oneshot），oneshot 生下来就是 running、结束即算 `verdict`；见 `src/lib/launch/verify.js` |
| `runs { configureEach { } }` 变成假目标 | `runs` 是 NamedDomainObjectContainer，容器 API 的块也被当成 run 配置，产出 `runConfigureEach`（启动报 Task not found） | 容器 API 名单 + 只收顶层块 + 认 `create("name")`；见 `parseRuns` |
| 测试挂了却判通过 | 部分 GameTest 运行器失败时进程仍退 0 | 裁决先看失败特征行、再看退出码；`readVerdict` 里顺序不能调 |
| `libs.versions.toml` 解析成一整条字符串 | `parseToml` 不支持内联表，`{ module = "a:b", version = "1" }` 原样返回 | 已补 `parseInlineTable`；回归见 `test/toml.test.js` 与 `test/deps.test.js` |
| 读 `.idea` 时抛 `Cannot read properties of undefined` | 只有 `modules.xml`、没有 `misc.xml` 的工程：`componentOf(undefined)` 直接取 `.name` | `rootOf` / `componentOf` 容忍 undefined；回归见 `test/idea.test.js` |
| worktree 里的 `node_modules` 一删，主仓库的也没了 | 用 junction 指向主仓库的 `node_modules`，`git worktree remove` 递归删除时会跟着目标走 | 别在 worktree 里 junction 主仓库依赖；要跑测试就复制或用独立 `npm ci`，删之前先确认链接类型 |
| 本地全绿、CI 全红 | 测试夹具（`.idea`、图片等）被 `.gitignore` 忽略：本地有文件，干净 checkout 没有 | 夹具目录要在 `.gitignore` 里显式放行；发版前用 `git clone` 到临时目录跑一遍 |
| 生成完的工程第一次构建就失败：`requires at least Gradle 9.8.0` | 模板 wrapper 的 Gradle 版本低于 loom 的最低要求（loom 1.19.4 要 9.8+） | 模板里的 `gradle-wrapper.properties` 必须跟 `versions.js` 解析出的 loom 版本对齐；升级 loom 时一起改，并用真实 `gradlew build` 验一次 |
| 装到用户机器上 `mc_mod_init` 报找不到模板 | `templates/` 没进 `package.json` 的 `files`，npm 包里没有模板 | `files` 里带上 `templates`；`check:pack` 的文件数会变（少 10 个就是漏了） |
| 模板里的占位符被 Gradle 先展开、Java 里没法写 | 模板用了 `${...}`，和 Gradle 自己的属性语法冲突 | 模板占位符一律 `{{name}}`；`renderText` 只认这个形式，残留会抛 `TEMPLATE_LEFTOVER` |
| 用户生成的工程在 Linux/macOS 上 `./gradlew` 报 `bad interpreter` | Windows 的 `core.autocrlf` 把模板里的 `gradlew` 转成 CRLF，生成时又被原样复制 | `.gitattributes` 里 `templates/** text eol=lf`、`templates/**/*.bat text eol=crlf`、`*.jar binary`；改完用 `git check-attr eol` 核对 |
| 传了 `-Dfoo=bar` 却报 `Task '.foo=bar' not found` | Gradle 的选项必须写在任务名**之前**；写在后面会被当成任务选项 | `argv.js` 里选项排在 `<taskPath>` 前面；`test/argv.test.js` 钉住这个顺序 |

其他约定：

- 用户能看到的每个结论都必须带证据（loader 从哪个插件来、目标从哪个 run 块来）；
  `unknown` 是合法答案，不许猜成确定值。
- 推测出来的目标要标 `guessed: true`，UI 显示「未验证」，不许隐藏。
- 证据源有主次：**构建脚本是主、`.idea` 是辅**。`.idea` 只补缺（模块清单、facet 平台、工程 JDK、
  运行配置），绝不推翻构建脚本已经判定的 loader 与目标；补出来的目标标 `source: 'idea-run-config'`，
  不是 `guessed`——它在 IDE 里真的被跑过。
- 多模块工程里子模块各自成工程，任务路径必须带 Gradle 模块前缀、在聚合根执行；
  「在哪个目录跑 gradlew」这件事由识别结果决定，不允许调用方指定。
- 工具描述是**英文契约**，一到两句（见 `doc/tool-vocabulary.md`）：第一句是什么与什么时候用，第二句只放
  最容易踩的那条约束；参数与返回交给 schema。工具执行结果（`render`）仍是中文，跟界面语言走。
- **工具 schema 是每步都要付的上下文**，不是免费文档：本仓库 8 个工具约 1.4k token（按 4 字符/token 估），
  整条 `tools` 数组每步随请求重发。所以除 `mc_projects` 与 `mc_mod_init` 外的工具都带
  `register(definition, { when })` 按步挂载：工作区里没有能跑的工程时它们不进 schema、也不可调用。
  `mc_mod_init` **永远在**——空目录里要先把工程建出来，它是挂载链的起点；`mc_projects` 留作探测器。
  判据是 `runTargets`（不是 loader：库工程识别得出却跑不了），判不出来时按可见处理。
  改工具描述时量一遍：`ceil(JSON.stringify(schemas).length / 4)`，别凭感觉删。
- 不做隐含的 `clean`；构建目录不碰。
- **图标**：`src/client/lib/icons.js` 里只有草方块用实色——草绿 `#87CE54`、泥土棕 `#C1885D`
  及各自的暗部，三个面**靠色差分界、不画描边**（14px 下描边会把面糊在一起）；
  其余图标一律 `currentColor`。`styles.test.js` 的色值护栏只扫 `views/`，
  所以图标的实色不受它约束——别把这个例外扩散到组件里。
- 一个工程同时只允许一个实例；跨工程可以并行。
- **目录分层是硬约束**：`src/lib/` 按 `detect` / `launch` / `i18n` / `util` 归位，跨层依赖单向；
  `src/client/` 的 React 组件只放 `views/`，其余放 `lib/`；构建脚本在 `scripts/`，
  开发期辅助在 `tools/`。新增文件先想清楚属于哪一层，别往顶层或 `src/lib` 根上放。
- **版本由上游解析，不由我们维护版本表**（`src/lib/versions.js`）：生成工程时按 `(loader, MC 版本)`
  抓 Fabric meta / NeoForge maven，取这条线当前最新；抓不到才退回 `data/versions.json` 的 `seed`。
  `data/versions.json` 只有 `seed`（离线兜底）和 `verified`（真跑通过的组合，只增不改）——
  没有"支持的版本矩阵"，也不追上游新版本；热门线的选择体现在 seed 里。
- 状态文件读写要 tmp + rename，进程探活失败记 `unknown`，不伪造结束原因。

## 验证记录

历史里程碑的验证结论。原始长文已并入这里，`doc/` 只保留设计与调研。

### M0 加载协议与槽位（2026-10-30，通过）

客户端包能在真实运行时里加载、激活、注册标题栏 slot 与右侧栏标签，并能驱动 `openTab` 展开侧栏。
产出四个后续一直沿用的结论：bundle 必须 `__ModuleLoader__.load` 包装；CSS 以 `<style>` 注入；
服务要先声明 `inject`；`openTab` 展开是异步的。

### M1 识别引擎（2026-10-31，通过）

22 个真实工程跑通，识别 loader / Minecraft 版本 / 模块 / run 目标；esbuild 构建链与面板接通。
两处修正：`net.neoforged.moddev.legacyforge` 产出的是 **Forge** 1.20.1 模组（曾误判成 NeoForge）；
聚合仓库的 loader 只写在子模块里，因此加了模块级插件回退与 `loaders[]`；推测目标按"每个具体平台一个
Client"收敛，避免一个工程刷出十几个目标。

### M2 托管启动（2026-10-31，通过）

识别出的目标可以真的启动、进入运行态、读日志、停止，且不留孤儿进程。关键决策：宿主不托管子进程句柄，
用 `taskkill /PID <pid> /T /F` 杀整棵树；就绪用日志标记（client：LWJGL/OpenAL/`[Render thread/INFO]`；
server：`Done (…s)!`）；状态落盘并做重启后对账。顺带修了 GBK 解码。

### M3 胶囊与浮层（2026-10-31，通过）

标题栏胶囊成为唯一入口：目标名、状态点、启停；浮层收敛成单选并记住每个工程的选择；
每个工程互斥、跨工程可并行；旧的 `DEV_AUTO_OPEN` 开关下线。

### M4 日志标签（2026-10-31，通过）

日志成为独立标签：按工程列历史、默认最新、可跟随、崩溃时给归因；启动后自动打开，可用
`autoOpenLogTab` 关掉。确认插件**不需要**导出 schemastery 的 `Config`——patch 行的 `config`
会原样传给 `apply(ctx, config)`。

### M5 AI 工具（2026-10-31，通过）

四个工具与面板共用同一套服务：`mc_projects` / `mc_launch` / `mc_launch_logs` / `mc_launch_stop`。
依赖 `@deepseek-ai/dsh-tools@0.2.1-rc.3`（与桌面运行时对齐）。

### M7 UI 打磨（2026-10-31，完成）

手绘 16px 图标（避免顶层 require 第三方包）、骨架空态、动效并尊重 `prefers-reduced-motion`、
文案去内部术语（"推测"→"未验证"）。样式护栏测试从此时开始。

### M8 真机验证（desktop profile，2026-10-31）

挂载方式：`dependencies` 加 `link:` + `dsh.profile.bundles` 追加，桌面自带 pnpm 安装。
首次挂载后启动 EnchatingPaper Client 成功，关闭后状态同步，四个工具在真实运行时注册成功。

三个问题：

1. **日志 0 字节**：`detached: true` 在 Windows 上丢管道（同一命令 detached 0 字节 / attached 564 字节）。
2. **多一个控制台窗口**：同源，关闭 detached 后消失（已由用户确认）。
3. **`mc_projects` 报 0 个目标**：渲染读 `runTargets`，而输出值里字段叫 `targets`。

第二轮：

4. **日志标签不跟新实例**：旧逻辑只在没选过时挑一次 → `pickLogTarget()`（有实例在跑就跟它）。
5. **工具输出 "not lossless JSON"**：返回值含 `undefined` 字段，注册器整条拒绝。

第三轮：**切会话不同步**——宿主用"最近创建的会话"当工作区，且胶囊只在挂载时扫一次。
改为胶囊按 `sessionId` 订阅 `useSessions` 的 cwd，cwd 变化时清空旧结果重扫；启动校验放宽为
"落在任一活跃会话 cwd 之内"；工具改用调用方会话的 cwd。

最终 59 个测试。

### M9 生态集成与单工程特化（2026-10-31）

- 向 `dsh-better-sidebar` 注册两个带图标页面（`ctx.betterSidebar.registerTab`，`icon` 支持
  `(size) => ReactNode`）。用 `ctx.inject(['betterSidebar'], …)` 做可选依赖，未安装则静默跳过。
- 原生右侧栏的 tab 类型定义**没有 icon 字段**，但可以用带键 seat `sidebar.right.pane.tab.title`
  接管标题渲染（内置的 schedule / plan 页签就是这么加图标的）；0.1.10 起两个标签都走这条路。
- 面板改名「MC 工程」→「Mod Dev」（功能名，不是名词描述），浮层表头/标签/详情页统一。
- 单工程工作区跳过工程列表：表头直接承担工程身份（名字 + loader/版本 + 路径）。

### M10 验证回路（2026-10-31）

把"运行目标"分成两类生命周期，并给会跑完的那类补上结论。起因是两个判断：模型无法从游戏窗口里
获得信息（它只能读日志），而它自己的命令模型装不下一个长生命周期进程（超时、单例、杀树、JDK）。

- **识别层**：`runTargets[].mode`——`client` / `server` → `daemon`；`data` / `datagen` /
  `gameTest` / `gameTestServer` → `oneshot`。认不出的 kind 一律当 daemon，不替陌生任务宣布"跑完了"。
- **生命周期**：oneshot 生下来就是 `running`（没有就绪这一步），不打 `readyTimedOut`；
  进程结束即 `exited`，同一次落盘写入 `verdict` / `summary` / `failures`。
- **裁决**：`readVerdict` 的顺序是"被停 → 起不来 → 失败特征行 → 非零退出码 → 成功特征行 → 零退出码 → unknown"。
  失败特征排在退出码之前，是为了抓住"测试挂了但进程退了 0"（部分 GameTest 运行器如此）。
- **工具**：`mc_launch` 的默认 `wait` 由 mode 决定（daemon → ready，oneshot → exit）；
  显式传 `ready` 给 oneshot 时按 exit 处理并附 `note`；输出新增 `mode` / `verdict` / `summary` / `failures`。
  `mc_project_detail`（每个目标标常驻/会跑完）、`mc_launch_list`（历史带结论）、`mc_launch_logs`（结论摘要）同步暴露。
- **面板**：状态词区分为「运行中 / 执行中」「通过 / 失败」，其余未动。

验证：

- 真机识别：EnchatingPaper、ProtectionEngineering 的 `runData` / `runGameTestServer` 判为 oneshot，
  `runClient` / `runServer` 判为 daemon。
- 真实日志回放：拿 `~/.dsh/mc-dev-starter/logs` 里的真实 Gradle 输出喂 `readVerdict`——
  成功收尾（`BUILD SUCCESSFUL in 38s`）判 passed，依赖解析崩溃判 failed 并取到 `BUILD FAILED`。
- 97 个测试；`test/verify.test.js` 覆盖分类与裁决，`test/launch.test.js` 用真子进程跑通 oneshot 的两种结局。

### M11 解析修正与 JDK 选择（2026-11-01）

两件"说了但没做到"的事收口：

- **`runs` 容器 API 不再变成目标**：`runs { configureEach { … } }` 曾产出 `runConfigureEach`。
  现在按容器 API 名单跳过、只收 `runs` 体里的顶层块（run 配置内部的嵌套块不算），
  并支持 `create("name")` / `register("name")` 这类工厂写法。真机验证：ProtectionEngineering
  从 5 个目标回到 4 个。
- **JDK 真正参与启动**：以前只识别不注入，面板说"选中 21"而实际跑的是环境里的 java。
  现在 `jdk.json` 记每个工程的指定（手动 > `gradle.properties` > 自动），启动时以
  `-Dorg.gradle.java.home` 与 `JAVA_HOME` 传给 Gradle；面板的「构建环境」可以直接选、也可以
  填路径添加。自动挑选只在"大版本完全匹配且 wrapper 的 Gradle 跑得动"时接管——宁可不接管，
  也不把一个本来能跑的工程换成不兼容的 JVM。

114 个测试；`test/jdks.test.js` 覆盖优先级与注入条件，`test/api.test.js` 走真 api 表把 JDK 选择链路串起来，
`test/gradle.test.js` 覆盖解析修正。

### M12 状态按 profile 隔离（2026-11-01）

运行记录以前所有 profile 共用一份，切 profile 会看到别的 profile 的实例。现在：

- **目录**：`~/.dsh/mc-dev-starter/profiles/<name>/`（state.json + logs/）。
- **怎么认 profile**：argv 里的 `…/.dsh/profiles/<name>`（桌面版）或 `--profile <name>`（CLI），
  都认不出才退回共用目录。**argv 优先于 `DSH_PROFILE`**——桌面版会给自己的子进程设
  `DSH_PROFILE=desktop`，从桌面里启动的 CLI 会继承到它，而 CLI 自己的 argv 才是真相
  （实测踩过：`dsh --profile m10smoke` 一开始被判成 desktop）。
- **旧记录**：第一次在某个 profile 下启动时，把拆分前的 `state.json` + `logs/` 搬进来一次；
  只有"新目录还没有 state.json、旧目录有"才动，搬不动就放弃（不影响启动）。
- **JDK 选择不跟着分**：`jdk.json` 留在根目录，它是机器级偏好——同一个工程换 profile 不该换 JDK。

验证：真机起 `dsh --profile m10smoke`，启动日志打印
`state dir: …\mc-dev-starter\profiles\m10smoke（profile: m10smoke）`；118 个测试。

### M13 胶囊空态（2026-11-02）

非 Minecraft 工作区里标题栏也挂着一个「未检测到 MC 工程」的灰胶囊，纯噪音。现在：

- 判据是 `runTargets` 而不是 loader：库工程识别得出 loader 但跑不了，同样不显示。
- 有实例在跑（`starting` / `running`）时**必须留着**，否则那个正在跑的游戏没有停止按钮。
- 扫描中不占位，避免先闪一下再消失。
- 顺带修了默认选中：以前取扫描顺序里的第一个（BFS 顺序），现在优先取第一个有 run 目标的工程。

### M14 声明依赖与双语 README（2026-11-03）

- **声明依赖**（`src/lib/detect/deps.js`）：解析 `dependencies { }` 块（行号精确到声明那一行）、
  `gradle/libs.versions.toml`（内联表 + `version.ref`）、元数据 `depends`。
  `libs.xxx` 的两种访问器写法（`libs.fabric.loader` / `libs.fabricLoader`）都能解析成真实坐标，
  解析不出来就保留原引用，不猜。面板「依赖」区块与 `mc_project_detail` 都输出这份清单。
- **TOML 补内联表**：`parseToml` 以前把 `{ module = "…", version = "…" }` 当字符串返回，
  版本目录因此整块失效；现在支持内联表（含 `version.ref` 点号键）。
- **README 默认英文**：`README.md` 英文、`README.zh_CN.md` 中文，顶部互链，npm 包跟着带两份。
- 不做「依赖管理 / 依赖编辑」与「Gradle 同步」：改构建脚本是 agent 的事，
  这里只给一个可以核对的窗口。

128 个测试。

### M15 详情页重做（2026-11-03）

用户实测后的三个问题：标签页没图标、依赖列表重复且溢出、满屏说明文字。改法：

- **标签图标**：注册 `sidebar.right.pane.tab.title`（key = tab 类型 id），返回"图标 + 文字"的
  span，和内置页签同一版式。之前记的"原生标签没法有图标"是错的——没有的是定义里的 icon 字段。
- **依赖去重**：同一模块的多个配置（`modCompileOnly` + `modRuntimeOnly`）合并成一行，
  配置列用空格分隔；位置列缩成 `:116`，完整 `file:line` 进 tooltip。
- **不再溢出**：`.mcdev-detail` 整页可滚，依赖列表再有 `max-height: 240px` 自己的滚动条。
- **说明文字全部收进 ⓘ**：启动提示、目标里的 `?`、依赖来源、JDK 生效来源都改成 tooltip；
  版面上只留键值、表格与列表。证据与依赖改成可折叠区块。
- 顺带：本机 JDK 大版本去重（以前会出现 `25 / 21 / 21 / 21 / 17 / 11`）。

132 个测试。

### M16 IDE 工程模型与多模块（2026-11-04）

mmyddd 的 PR #1 合进来：`.idea` 成为第二证据源，聚合工程的子模块各自成工程。

- **证据优先级**：构建脚本是主，`.idea` 只补缺。facet 的 `FORGE` 也覆盖 NeoForge，所以它绝不
  推翻已判定的 loader——真机验证：ProtectionEngineering 的 facet 是 `FORGE`，loader 仍是 `neoforge`。
- **子模块工程**：`settings.gradle` 的 include 或 `.idea` 模块清单里的模块各自成工程，任务带
  `:模块:任务` 前缀，在 wrapper 所在的聚合根执行（`gradleRoot` / `modulePath` 进画像与工具输出）。
  合成工程验证：改前把子模块列成独立工程、目标是裸 `runClient`（在模块目录里找不到 gradlew，
  根本起不来）；改后目标 `:modules/core:runClient`、gradleRoot 指回聚合根。
- **聚合根不单列**：它的目标与子模块重复；根目录自己的 runs 目前不提供（README 已知限制里写了）。
- **运行配置**：IDE 里跑过的 run 配置补成目标并标 `source: 'idea-run-config'`，优先级低于构建脚本。
- **合并后补的护栏**（不在原 PR 里）：iml 只读工程目录内的（克隆来的仓库不能借此读外部文件）；
  `rootOf` / `componentOf` 容忍 undefined（只有 modules.xml、没有 misc.xml 的工程以前会抛）；
  子模块的 `.idea` 摘要只算自己的运行配置；新增 `test/xml.test.js`、`test/idea.test.js` 与
  `test/fixtures-multi`。

156 个测试。

### M17 IDE 工程模型的两处补读（2026-11-05）

- **MC 版本**：iml 的 `McpModuleSettings.minecraftVersion` 是构建脚本之外唯一的独立佐证。
  只在整个版本链都读不出来时兜底，证据标 `idea-mc`；能读出来时它只进 `.idea` 折叠区，不参与判定。
- **外部存储库表**：`ExternalStorageConfigurationManager enabled="true"` 时 `.idea` 里没有
  `libraries/`，库表在 `%LOCALAPPDATA%\JetBrains\<产品>\projects\<名字>.<hash>\external_build_system\project\libraries.xml`。
  用同目录 `cache-state.xml` 里 `projectData.GRADLE` 的键（工程绝对路径）定位——**匹配不到就不读**，
  宁可少读，也不能拿别的工程的库表顶上。摘要只报条数与"工程内 remap 产物"条数：loom 把 remap 后的
  jar 放在 `.gradle/loom-cache/`，那些不在 `~/.gradle` 里，是"声明 → 真正编译用"之间唯一可查的对应。
- 两条都是辅证：格式是 IDE 私有实现、按产品版本分目录、只反映最后一次 Gradle 同步。开关关掉时退回
  `.idea/libraries/`，两个位置都读，读不到就放弃。
- **`gradleJvm` 不进 JDK 选择**：它是构建 JVM，而且值是名字（`jbr-21`、`#JAVA_HOME`）不是路径；
  解析成 home 还得读 IDEA 全局的 `jdk.table.xml`，收益不抵成本。面板只展示，不参与 `resolveJdk`。
- 外部存储的测试用临时目录造 `cache-state.xml` + `libraries.xml`，不提交夹具——省掉"夹具被
  `.gitignore` 吃掉"那类事故。

158 个测试。

### M18 面板重排（2026-11-05）

- **Mod Dev 页按"能不能跑"排序**：头部标签（loader / 版本 / 类型）→ 状态条（状态 / wrapper / JDK）
  → 运行（目标下拉 + 上次结论）→ 构建环境 → 折叠（依赖 / 证据 / 诊断）。
  IDE 模型、模块表、可信度进「诊断」——它们是排查用的，不该占首屏。
  目标只在一处出现：旧的"运行里一行目标 + 下面再一张目标表"是同一件事说了两遍，删掉。
- **浮层按可运行性分组**：可运行在上，「其他」默认折叠；工程超过 8 个给搜索框；
  同名工程补目录名（`Burst Door Open` 出现两次时靠它区分）。
- **占位符不显示**：`${mod_name}` 这类未解析的 Gradle 占位符退回目录名——它至少唯一、能对上工作区。
- 字号仍然只有 11/12 两档 token，层级靠间距、留白和状态色做，不新造尺寸。

160 个测试。

### M19 声明版本的 IDE 对照（2026-11-06）

- **索引与同步时间**：`readIdeaProject` 从库表补一份 `group:artifact → version` 索引（≤800 条，
  只收带完整坐标的条目），同步时间取 `libraries.xml`（外部存储）或 `.idea/workspace.xml` 的 mtime。
  外部存储开关明确关掉时不再读旧产物；读不到就不出现字段。
- **对照**：`dependencies.compared` 只列声明项（传递依赖不列），状态为 `same` / `differs` /
  `unresolved`。Gradle 脚本里的 `${property}` 先用 gradle.properties 解析；loom 的
  `loom_mappings_….<group>` 做一次有边界的别名匹配，不按 artifact 乱猜。
- **面板**：same 不显示；differs 用琥珀色「实际 x.y.z」（tooltip 给出声明值并说明版本不同不等于错）；
  unresolved 用灰色「未解析」。依赖区块顶部标「对照自 IDE 同步 · 时间」。
- 外部库表的测试全部在临时目录造 `cache-state.xml` + `libraries.xml` 并删除，不提交夹具；
  覆盖三种状态、无 `.idea`、开关关闭、从未同步与 800 条上限。真机 BurstDoorOpen 的
  fabric-loader 与 fabric-api 均对上（`com.mojang:minecraft` 被 loom 改写成
  `net.minecraft:minecraft-merged-*`，保持 unresolved）。

### M20 双语与语言通道（2026-11-06）

- **客户端字典**（`src/client/lib/messages.js`，C3a 抽出，127 个 key）：`en` 按 **300px 侧栏**取舍，
  换行/截断的地方缩成 `Build` / `Target` / `Unverified` / `Logs` / `Not running`，完整说法进 tooltip。
  `运行中` 与 `执行中` 在英文里都是 `Running`，`通过` 与 `已通过` 都是 `Passed`（oneshot 的差别由结论词承担）。
- **相对时间**用 `Intl.RelativeTimeFormat`，不改手写文案：zh 的 short 是「5秒前」，补空格对齐 0.1.12 的
  「5 秒前」；en 的 short 带缩写点（`12 min. ago`），秒/分取 short 再去点、小时取 long，得到
  `5 sec ago` / `12 min ago` / `3 hours ago`。单复数仍由 ICU 负责。
- **宿主字典**（`src/lib/i18n/messages.js`，约 70 个 key）：证据、警告、冲突、崩溃归因、错误消息、结论摘要。
  归因规则的 `hint` / `suggestion` 不再是常量，按 `code` 从词典取，读日志时才定语言。
- **语言通道**：宿主插件的 ctx 里**没有** locale 服务（整个 DSH 只有一处 `ctx.provide("locale")`，
  在网页客户端那层，邻居是 `slots`）。所以**客户端每次请求带上 `lang`**，`/mcdev/api` 入口调
  `setLanguage`；`projects.scan` 的缓存 key 必须带语言，否则切语言后会拿到旧语言那份缓存。
  语言是进程级的——同时只有一个界面语言，并发请求不会各说各话。
- **不翻译**：loader 名、工程与 `.idea` 路径、Gradle 任务路径、日志正文。
- **切换语言时重绘**：`t()` 只在调用时读语言，组件自己不会重绘。`src/client/lib/useLocale.js` 用
  `useSyncExternalStore(ctx.locale.subscribe, () => getSnapshot().active)` 订阅当前语言，胶囊 / 浮层 /
  详情 / 日志四个组件各调一次；订阅源是模块级常量，每次渲染新建对象会让 React 反复重订阅。
- **工具输出（`src/tools.js`）的渲染文案仍是中文**（`mc_launch` 的结论行等是写死的）。但工具值里的
  证据 / 警告文本来自 detect / launches，走宿主词典；宿主语言又是进程级的（由最近一次界面请求设置），
  所以界面为英文时工具输出会出现「中文渲染 + 英文证据」的混排。要彻底解决得把 `lang` 变成调用参数
  穿透 detect / launches，而不是模块级状态；见「还没做的事」。
- 验证：195 个测试。`test/host-messages.test.js` 覆盖双语 key 对齐、八条归因规则的两种语言、
  英文下识别结果零中文、缓存按语言分开；`test/messages.test.js` 覆盖客户端侧的同类护栏、相对时间与
  语言订阅源（引用稳定、转发订阅）。

### M21 工程脚手架（2026-11-10）

- **`mc_mod_init`**：把空目录变成可构建的 Fabric / NeoForge 工程。`src/lib/scaffold.js` 校验参数 → 调
  `versions.js` 解析版本 → 渲染 `templates/<loader>/` → 写盘；不跑 Gradle，拒绝非空目录，模板占位符
  用 `{{name}}`（Gradle 自己用 `${...}`），残留会抛 `TEMPLATE_LEFTOVER`。
- **模板**：Fabric 与 NeoForge 两套，各 10 个文件，结构对称：
  - `templates/fabric/`：loom 插件、yarn 映射、`fabric.mod.json`、Gradle wrapper 9.8.1；
  - `templates/neoforge/`：NeoGradle `userdev` 插件、`neoforge.mods.toml`、`@Mod(MODID)` 入口类、
    Gradle wrapper 9.2.1（官方 1.21.1 MDK 用的就是 9.2.1），`runs` 里显式声明 client / server /
    gameTestServer。
  两套的 `gradle.properties` 都带 `mod_id` / `mod_name` / `mod_version` / `mod_group_id`。
  `templates` 已进 `package.json` 的 `files`，否则装到用户机器上找不到模板。
- **三个真机踩出来的修正**：
  1. loom 不能取最新：loom 1.19 自己要求 JVM 25，而 1.21.1 的模组要 Java 21 → 按 Java 大版本钉
     loom（17/21 → 1.10.5），只有 Java 25 才放开取最新；
  2. `fabric.mod.json` 的 `"version": "${version}"` 会被识别引擎报「未解析占位符」→ 改成
     `${mod_version}`，`processResources` 展开它，gradle.properties 里有同名键，识别直接可解析；
  3. 不显式写 `loom { runs { client(); server() } }` 时目标只能按惯例推测（`guessed`）→ 模板里显式
     声明，目标变成 `build-script`。
- **验证**：
  - Fabric：生成 `demo_mod`（Fabric 1.21.1）→ `gradlew build` **BUILD SUCCESSFUL**（Gradle 9.8.1、
    loom 1.10.5、Java 21，22s）→ 识别出 `runClient`+`runServer`（build-script）、JDK 21 精确匹配、零警告。
  - NeoForge：生成 `demo_mod`（NeoForge 1.21.1）→ `gradlew build` **BUILD SUCCESSFUL**（Gradle 9.2.1、
    NeoGradle 7.1.39、Java 21）；识别出 `runClient`/`runServer`（daemon）+ `runGameTestServer`（oneshot）、
    **零警告**。
  - NeoGradle 首次构建会反编译 Minecraft 并下载资源；`neoForm…DownloadAssets` 只服务 `runClient`，
    构建本身不需要它。本次验证里该任务因 `resources.download.minecraft.net` 的 SSL 握手失败，
    用 `-x neoFormJoined<...>DownloadAssets` 跳过——记录清楚，别把它当成模板缺陷。
  - 两个组合都已写进 `data/versions.json` 的 `verified`。
- 211 个测试；`test/scaffold.test.js` 覆盖两个 loader 的参数校验、渲染、目录保护、seed 回退与二进制 wrapper 不被破坏。

### M22 真机会话回放（2026-11-13）

拿用户分享的真实会话（`C:\Projects\Damascus's Blacksmith`，NeoForge 1.21.1）复盘，全链路是通的：
`mc_projects` 空 → `mc_mod_init` 生成 10 个文件（当时上游取不到，退回 seed）→ `mc_projects` 认出 1 个工程
3 个目标 → `mc_project_detail` 置信度 95%、JDK 21 自动选中 → 构建通过 → `mc_launch runClient`
**真的把游戏拉起来了**（Mod 列表里有 `Damascus's Blacksmith 0.1.0 (damasmith)`）→ `mc_launch_stop` 正常。

三个从会话里读出来的问题，已修：

1. **所有格把类名拆坏**：`Damascus's Blacksmith` → `DamascusSBlacksmith`（`'s` 被当成一个单词），
   会话里的 agent 只能手动改名。`classNameFor` 现在先去掉 `'s` / `’s` / 尾部 `'`，得到
   `DamascusBlacksmith`；回归在 `test/scaffold.test.js`。
2. **首次 runClient 的资产下载失败没有归因**：NeoForge/Forge 要从 `resources.download.minecraft.net`
   取 assets，网络受限时报的是 `Failed to download the file` / `DownloadAssets ... FAILED`，以前只会落到
   `GRADLE_BUILD_FAILED`。新增 `ASSET_DOWNLOAD_FAILED` 规则（排在 Gradle 那条之前）与中英提示，
   顺带进 `CRASH_MARKERS`。
3. **生成物里带中文注释**：NeoForge 入口类里的 `// 在这里注册内容` 改成英文——生成的是用户的工程，
   不是我们的界面。

另外：`mc_mod_init` 的 `render` 不再重复打印英文 `note`（值里保留，给模型看），对 neoforge 多一行
「首次构建要反编译 MC、首次 runClient 要下载资源，网络受限先配代理」的提示。

211 个测试。

### M23 Gradle 选项与首次资源提示（2026-11-13）

- **`mc_launch` 的 Gradle 参数**：只收三种结构化选项——`offline`（`--offline`）、
  `refreshDependencies`（`--refresh-dependencies`）、`gradleProperties`（`-Dkey=value`）。
  **不收自由参数**：`-p` / `-x` / `--project-dir` 之类会推翻"在哪个目录跑、跑哪个任务"的判定，
  而那两件事必须由识别结果决定。`org.gradle.java.home` 也拒绝转发（JDK 由 jdk.json / 面板管）。
- **位置是硬要求**：选项必须排在任务名之前。`gradle build -Dfoo=bar` 会被 Gradle 当成任务选项
  （实测报 `Task '.foo=bar' not found`），所以 `argv.js` 的顺序是
  `gradlew [javaHome] [选项...] <taskPath>`，两侧平台一致。
- **首次资源提示**：`src/lib/launch/assets.js` 只判断 `<GRADLE_USER_HOME>/caches/minecraft/assets/objects`
  存不存在、空不空；NeoForge/Forge 的客户端目标在资源没下过时返回提示码 `first-run-assets`，
  由工具渲染成中文（值保持语言中立）。
- 测试：`test/argv.test.js` 覆盖展开顺序、校验与任务名位置（Windows 那层引号也在内）；
  `test/assets.test.js` 用临时目录覆盖缺失/为空/有内容；`test/tools.test.js` 覆盖工具把选项结构化传给
  api、并带出提示。

221 个测试。

### M24 改包名工具（2026-11-14）

第二个真机会话（`C:\Projects\Test`，NeoForge 1.21.1，modid `coalcraft`）只花了 0.05 元就把工程建好、
`runServer` 起起来、再停掉。但当时没给 `group`，于是落成默认的 `com.example.coalcraft`——要改只能手动
挪目录、改 `package`、改 `gradle.properties`、改 `fabric.mod.json` 的入口串，四件事里漏一件就编译不过。

- **`mc_set_group`**：`{ root?, group }`。移动每个 source set 的 `src/<set>/java/<old>` 目录，
  把 `.java` 里的 `package` 行与旧包前缀（import、全限定名）换掉，再改 `src/main/resources/**/*.json`
  里的入口类（Fabric 的 `"<group>.<Class>"`），最后写回 `mod_group_id`。
- **只认 `mod_group_id`**：读不到就报 `NO_GROUP`，不猜"可能是哪个包"；目标包目录已存在则报
  `GROUP_DIR_EXISTS`，不做合并。
- **不留空壳**：搬走 `com/example/coalcraft` 之后，`com/example` 这类变空的父目录会被删到 java 根为止
  （第一次真机改包名时它留了下来，agent 只能手动清）。
- **文档与构建脚本不碰**：全仓的文本引用是 grep 的活。只扫根目录会给出"没有残留"的假信号，
  比不查更糟，所以工具不做这件事；描述里写明 `leaves docs and build scripts alone`。
- **让默认值可见**：`mc_mod_init` 返回值新增 `group`，渲染里直接写「包名 com.example.coalcraft」——
  这样模型和人都能立刻看到用的是默认包，而不是回头去读文件才发现。
- 测试：`test/scaffold.test.js` 覆盖 Fabric（目录移动 + JSON 入口）与 NeoForge（只有 package 行）、
  没有 `mod_group_id` 时不动文件、非法包名；`test/tools.test.js` 的工具名单加上 `mc_set_group`。

226 个测试。

### M25 工具 schema 的上下文预算（2026-11-14）

起因是 dsh-context 的面板：一次会话里"工具定义"占了 1.1 万 token。先把口径查清楚，再动刀。

- **量法**：`@deepseek-ai/dsh-token-meter` 对工具部分只做一件事——
  `ceil(JSON.stringify(tools).length / 4) + 4`（`estimate.ts` 的 `estimateToolsTokens`）。
  把会话日志里的 epoch header 解出来直接算：那次会话 **52 个工具 / 45,508 字符 / 11,381 token**，
  其中我们 8 个 1,376（12%）、autocad MCP 6 个 1,120、`schedule_*` 4 个 1,199、
  内置其余的 34 个 7,686。**大头不在我们这儿**，但 1.4k 也不算小。
- **`output.schema` 不进上下文**：`projectToolSchema` 只白名单 `name / description / parameters`
  （`dsh-tools/src/schema.ts`），`tools.js` 里那份 3.9k 字符的 `mc_project_detail` 返回结构一个
  token 都不占——它只有 101。所以"文件很长"不等于"很贵"，贵的是描述与参数文本。
- **按步挂载**：`mc_projects` 与 `mc_mod_init` 之外的工具都带 `register(definition, { when })`。
  `when` 返回 false 时既不进 schema 也不可调用；判据是**工作区里有 `runTargets` 非空的工程**
  （库工程识别得出 loader 却跑不了，不算）。判定按会话 cwd 缓存 60 秒，`mc_mod_init` 成功后
  清空缓存——建完工程下一步就能用 `mc_launch`。判不出来（没有 cwd、扫描抛错）按可见处理：
  宁可多花 token，也不让模型在真需要时手里没工具。
- **描述瘦身**：删重复的"第二句"，把参数说明里能由 schema 表达的收回去。8 个工具 1,493 → 1,398
  （-6%）；常驻那 2 个 383。
- **旧宿主退化**：0.2.1 的 `register` 只收 definition，第二个参数被忽略——工具永远可见，
  只是省不下上下文。peer 范围补上 `^0.2.2-rc.1`。
- 233 个测试；`test/tools.test.js` 覆盖"只有 projects/init 常驻"、无工程/库工程不挂载、
  缓存不重复扫、判不出来按可见、`mc_mod_init` 后立刻挂上。

## 架构边界（2026-11-14 复核）

量过的数字（行数）：`tools.js` 952、`detect/detect.js` 771、`detect/idea.js` 654、
`client/views/DetailTab.js` 690、`launch/launches.js` 480、`lib/api.js` 377、`scaffold.js` 341。

- **边界成立**：客户端只 import `client/lib`；`tools.js` 通过 `deps.api` 拿服务，不 import `api.js`；
  领域层（detect / launch）不 import 门面。
- **`api.js` 是门面，不是上帝对象**：14 个方法、每个 5–20 行，只做"解析 root → 校验工作区 →
  调领域服务 → 拼返回"。策略已全部下沉（JDK 选择在 `launch/jdks.js`，资源提示在 `launch/assets.js`）。
- **真正在长的是 `tools.js`**：八个工具 ×（schema + execute + render）加十来个渲染辅助挤在一个文件里。
- **拆分触发条件**（不到就别拆，拆了只是"更多文件"）：
  - `tools.js` > 1000 行，或再加第九个工具 → 按工具拆 `src/tools/<name>.js`，
    渲染辅助进 `src/tools/render.js`，`index.js` 只留 `applyTools` 循环；
  - `api.js` > 500 行，或出现第二个入口（CLI / MCP / 独立 route）→ `src/lib/api/` 按
    `projects.*` / `launch.*` / `shared` 拆；
  - `DetailTab.js` > 800 行 → 再拆子组件（现在还是一个组件的自然长度）。

## 发布记录

- `0.1.0` → 首版。
- `0.1.1` → 修「最小 profile 起不来」：`webServer` 从 `inject` 里拿掉，改用
  `ctx.inject(['webServer'], …)` 可选等待。原来在没有 web 层的 profile（只有 `dsh-base`）里会
  `pending (waiting for service: webServer)`，整个 plugin tree 加载失败。
- `0.1.2` → 修「装 0.1.1 却打印 0.1.0」：`VERSION` 改为启动时读 `package.json`。
- `0.1.3` → peer 依赖、仓库元数据、截图与 README 重写；详情页去掉过期文案。
- `0.1.4` → 运行日志按级别着色（`src/client/logFormat.js`）。
- `0.1.5` → `logDock` 配置：日志可落原生右侧栏或 better-sidebar 底部工作台。
- `0.1.6` → 装 better-sidebar 时默认落底部（`chooseLogDock` 默认 bottom）、
  日志级别过滤、六个工具与结构化归因、`mc_launch` 默认超时 10 分钟、描述与格式修正。
- `0.1.7` → 验证回路：目标分类 daemon / oneshot、一次性任务的 `verdict`、
  `mc_launch` 的 `wait: exit`、面板状态词；顺带修 `.gitignore` 误伤 `src/lib` 并补入引擎源码。
- `0.1.8` → M11 + M12：`runs` 容器 API 修正、JDK 选择与注入（面板可选可加）、
  运行记录按 profile 分目录、范围只保留 Gradle 工程。
- `0.1.9` → M13：没有可运行工程时不显示胶囊（0.1.8 打包后才发现的空态噪音）。
- `0.1.10` → M14 + M15：声明依赖视图、README 默认英文并保留中文、详情页重做（标签图标 / 依赖去重 / 全文 tooltip 化）。
- `0.1.11` → M16：`.idea` 工程模型（模块清单 / facet / 工程 JDK / 运行配置）、多模块工程子模块各自成工程、
  任务带模块前缀并在聚合根执行、目标带 `source`、详情页展示 IDE 模型；同时带上 CI/打包守卫、
  CHANGELOG 与 SECURITY.md（46 个文件，451 KiB）。
- `0.1.12` → M17 + M18：iml 的 `McpModuleSettings.minecraftVersion` 与 IDE 外部存储的库表；
  面板按「能不能跑」重排（状态条 / 目标下拉 / 上次结论），浮层分组、搜索与同名补目录名
  （46 个文件，487 KiB）。

发版注意：

- 账号用的是 **granular token（只允许暂存）**，直接 `npm publish` 会被拒为 `E_STAGE_REQUIRED`。
  流程是 `npm stage publish` → `npm stage list`（等 `validating` 结束）→
  `npm stage approve <stage-id>`（人工过 2FA）。token 不能批准，批准必须是人。
- `lib/client.js` 被 `.gitignore` 忽略，只通过 `package.json` 的 `files` 进包。`prepack` 会在
  打包前自动构建，所以「忘了构建就发布」已经不可能；`npm run check:pack` 再确认包里真的带上了
  客户端与其余必需文件（多带 `test/`、`.github/` 也会被判失败）。改代码时仍要手动 `npm run build`，
  否则本机 `link:` 装的还是旧产物。**新 clone 下来要先构建**，否则 `link:` 安装拿不到客户端。
- 新版本发出去后，用干净 profile 装一次并看启动日志里的 `host ready (x.y.z)`，
  这条同时验证了「版本号读对了」与「包结构完整」。
- 每个发布版本打 annotated tag `vX.Y.Z`，指向 `package.json` 已是该版本的那个提交。
  补历史 tag 时按版本号定位提交，别按日期猜：`git show <sha>:package.json` 逐个核对。
- **git 推送和 npm 发布是两件事**：`git push` 随时可以推（包括 tag），发布必须走"暂存 → 用户检查 → 批准"。
  批准即发布，包内容之后不可再改。
- **暂存之后、批准之前是唯一的检查窗口**。正文、README、截图的修改要在 `stage publish` 之前做完；
  暂存之后再改就得让用户撤销那条暂存（npm 网页操作，需 2FA），然后重新 `stage publish`。
  撤销很便宜，别怕重发；但同一版本只能有一条暂存，撤销前重发会报
  `Cannot stage previously published version`（措辞误导，实际是暂存冲突，不是真的发布过）。

## 安全告警（npm / Socket）

npm 包页面上会出现两条告警，都来自 peer 依赖图，不是本包代码：

- **High CVE**：`zod@<4.6.6`（GHSA-mrhx-c7xc-m3w5），经 `@deepseek-ai/dsh-llm` 传导，
  属于官方运行时 `@deepseek-ai/dsh-tools` 的树。本包 `dependencies` 为空，改不了；只能等上游升 zod。
- **Uses eval**：**误报**。`@deepseek-ai/dsh-ptc-runtime/lib/index.js` 里有一张保留字表，
  其中一项就是字符串 `"eval"`，静态扫描按字符串命中了。本仓库与产物里 `\beval\b` 零命中（可复查）。

结论：不要为了这两条去改依赖声明（把 peer 改成 optional 也挡不住 CVE，因为它是真实的传递依赖）。
需要清除误报就往 Socket 的 false positive 通道提；需要修 CVE 就等官方升 `zod`。

## 还没做的事

- 桌面版目前仍用 `link:` 安装（改代码即时生效）；切到 npm 版本需要每次改完都发版。
- 宿主语言还是进程级的（`src/lib/i18n/messages.js` 的 `setLanguage`）：界面请求会改全局，工具输出跟着变，
  两个语言不同的并发请求理论上会串；`src/tools.js` 的渲染文案也还没进词典。要干净解决，得把 `lang`
  做成 detect / launches 的调用参数，而不是模块级状态。
