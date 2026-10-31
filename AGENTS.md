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
src/tools.js          六个模型工具（mc_projects / mc_project_detail / mc_launch / mc_launch_logs / mc_launch_list / mc_launch_stop）
src/lib/
  api.js              /mcdev/api 的方法实现（scan / detail / state / launch.*）
  detect.js           工程画像：loader、模块、run 目标、证据与警告
  scanner.js          工作区 BFS（深度 3、剪枝、上限）
  gradle.js           build.gradle / settings.gradle / gradle.properties 的解析
  metadata.js         mods.toml / fabric.mod.json / plugin.yml / archive.yml
  java.js             JDK 探测与版本匹配（读 <jdk>/release，不起进程）
  verify.js           目标分类（daemon / oneshot）与一次性任务的裁决（verdict）
  launches.js         启动服务：spawn、就绪判定、日志环形缓冲、停止、状态对账
  state.js            ~/.dsh/mc-dev-starter 下的状态与日志文件
  argv.js             gradlew 命令行构造（含 Windows 引号规则）
  text.js / toml.js   小工具
src/client/
  index.js            客户端入口：胶囊 slot、两个标签类型、better-sidebar 可选注册
  Capsule.js          标题栏胶囊（状态点 + 目标名 + 启停）
  Flyout.js           浮层（单工程特化 / 多工程三段结构）
  DetailTab.js        工程面板（版本、环境、模块、证据、警告）
  LogTab.js           日志标签（历史、跟随、归因）
  state.js / selection.js / format.js / icons.js / styles.js / runtime.js
lib/client.js         构建产物（.gitignore 忽略；靠 package.json 的 files 打进 npm 包，运行时直接加载）
test/                 97 个测试 + fixtures（真实工程形态的假仓库）
doc/                  策划与调研
```

## 命令

```powershell
node --test "test/*.test.js"      # 全部测试
node scripts/build-client.mjs     # 构建客户端（改 src/client 后必须跑）
node scripts/build-client.mjs --watch
node scripts/scan-catalog.mjs     # 扫真实工程，输出识别结果表
```

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
| 一次性任务被当成守护进程 | 用"等就绪"的语义管 `runData` / `runGameTestServer`：`BUILD SUCCESSFUL` 是**终止**信号却被当成**就绪**信号，而且跑完拿不到"过没过" | 目标带 `mode`（daemon / oneshot），oneshot 生下来就是 running、结束即算 `verdict`；见 `src/lib/verify.js` |
| 测试挂了却判通过 | 部分 GameTest 运行器失败时进程仍退 0 | 裁决先看失败特征行、再看退出码；`readVerdict` 里顺序不能调 |

其他约定：

- 用户能看到的每个结论都必须带证据（loader 从哪个插件来、目标从哪个 run 块来）；
  `unknown` 是合法答案，不许猜成确定值。
- 推测出来的目标要标 `guessed: true`，UI 显示「未验证」，不许隐藏。
- 不做隐含的 `clean`；构建目录不碰。
- 一个工程同时只允许一个实例；跨工程可以并行。
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
- 原生右侧栏标签**没有 icon 字段**，只能文字；图标只出现在 better-sidebar。
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
- `0.1.7`（已提交暂存，等人工批准）→ 验证回路：目标分类 daemon / oneshot、一次性任务的 `verdict`、
  `mc_launch` 的 `wait: exit`、面板状态词；顺带修 `.gitignore` 误伤 `src/lib` 并补入引擎源码。

发版注意：

- 账号用的是 **granular token（只允许暂存）**，直接 `npm publish` 会被拒为 `E_STAGE_REQUIRED`。
  流程是 `npm stage publish` → `npm stage list`（等 `validating` 结束）→
  `npm stage approve <stage-id>`（人工过 2FA）。token 不能批准，批准必须是人。
- 发布前必须 `npm run build`：`lib/client.js` 被 `.gitignore` 忽略，只通过 `package.json` 的 `files` 进包；
  忘了构建就会发出旧客户端。同理，**新 clone 下来要先构建**，否则 `link:` 安装拿不到客户端。
- 新版本发出去后，用干净 profile 装一次并看启动日志里的 `host ready (x.y.z)`，
  这条同时验证了「版本号读对了」与「包结构完整」。
- 每个发布版本打 annotated tag `vX.Y.Z`，指向 `package.json` 已是该版本的那个提交。
  补历史 tag 时按版本号定位提交，别按日期猜：`git show <sha>:package.json` 逐个核对。

## 安全告警（npm / Socket）

npm 包页面上会出现两条告警，都来自 peer 依赖图，不是本包代码：

- **High CVE**：`zod@<4.6.6`（GHSA-mrhx-c7xc-m3w5），经 `@deepseek-ai/dsh-llm` 传导，
  属于官方运行时 `@deepseek-ai/dsh-tools` 的树。本包 `dependencies` 为空，改不了；只能等上游升 zod。
- **Uses eval**：**误报**。`@deepseek-ai/dsh-ptc-runtime/lib/index.js` 里有一张保留字表，
  其中一项就是字符串 `"eval"`，静态扫描按字符串命中了。本仓库与产物里 `\beval\b` 零命中（可复查）。

结论：不要为了这两条去改依赖声明（把 peer 改成 optional 也挡不住 CVE，因为它是真实的传递依赖）。
需要清除误报就往 Socket 的 false positive 通道提；需要修 CVE 就等官方升 `zod`。

## 还没做的事

- **M6 通用启动器**：HMCL 实例库 + 直启 java，让面板也能起非 Gradle 工程（估 5–8 天）。
  优先级下调：它服务"人想玩"，与模型的验证回路无关，排在 oneshot 结论之后。
- 跨 profile 共用 `~/.dsh/mc-dev-starter/state.json`：不同 profile 的实例记录会混在一起，
  日志标签已按工程过滤，暂不影响使用，但值得按 profile 分目录。
- 桌面版目前仍用 `link:` 安装（改代码即时生效）；切到 npm 版本需要每次改完都发版。
