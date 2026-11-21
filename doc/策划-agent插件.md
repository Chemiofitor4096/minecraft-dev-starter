# 策划：agent 插件（minecraft-dev-starter-agent）

配套文档：[拓展：MC 数据导出](./拓展-MC数据导出.md) 定义了 dump 格式、jar 契约与两包边界；
本文是**落地计划**——这个插件由哪些东西组成、按什么顺序做、怎么验。

---

## 1. 定位

**它是**一个独立的 DSH bundle（npm 包），做三件事：

1. 往游戏的 JVM 里塞一个 Java Agent，导出注册表 / 标签 / 配方索引；
2. 把导出的结果变成**模型能查的省 token 查询**（`mc_data_dump` / `mc_data_query`）；
3. 给人在面板里浏览（只读表格 + 搜索）。

**它不是**：

- 不是 starter 的一部分，也不改 starter 的代码（只消费 `ctx.mcdev`）；
- 不实现启动/停止/判活/杀树（那是 starter 的活，已经在跑了，别复制）；
- 不把整个 dump 交给模型（见拓展文档 §3.4 的 token 账）。

一句话：**starter 管"怎么把游戏跑起来"，它管"跑起来之后里面有什么"。**

---

## 2. 与 starter 的契约

```js
export const inject = ['mcdev', 'tools']      // mcdev = starter 0.3+ 提供；没有就整个插件不激活
```

用到的四个方法（starter 的 `src/lib/service.js` 是权威定义）：

| 方法 | 本插件用它做什么 |
|---|---|
| `ctx.mcdev.launch({ root, workspace, taskPath, env, wait, timeoutMs })` | 起 `runServer`，把 `JAVA_TOOL_OPTIONS=-javaagent:…` 放进 `env` |
| `ctx.mcdev.stop({ id })` | 导出超时/取消时收尾（正常情况下 Agent 自己 `stop`） |
| `ctx.mcdev.list({ root })` | 判"这个工程是不是已经在跑"（一个工程只允许一个实例） |
| `ctx.mcdev.resolveJava({ root })` | attach 模式按工程那个 JDK 起小程序（M-A3） |

启动前先握手：

```js
const caps = ctx.mcdev?.capabilities ?? []
if (!caps.includes('launch')) throw error('SERVICE_VERSION_MISMATCH', '需要 minecraft-dev-starter ≥ 0.3')
```

**边界纪律**：本插件**不 import starter 的任何文件**（两个包独立发版），也不假设 `ctx.mcdev`
之外的东西存在。反过来 starter 不知道本插件存在——所以卸载本插件，starter 一切照常。

---

## 3. 包结构

```
minecraft-dev-starter-agent/
  package.json            # dsh.bundle.patch → cordis.patch.yml；peerDependencies: minecraft-dev-starter ≥ 0.3
  cordis.patch.yml        # 一行：挂 host 入口 + client 入口
  src/index.js            # 宿主：inject: ['mcdev','tools']，注册两个工具，provide 缓存服务（可选）
  src/tools/              # mc_data_dump.js / mc_data_query.js（描述英文、render 中文）
  src/lib/                # 缓存（sourceHash）、路径、错误码、语言
  src/client/index.js     # 面板「数据」tab（React + h()，跟随 DSH 主题令牌）
  engine/                 # 查询引擎（纯函数，零依赖，Node ≥ 20）
  agent/                  # Java：Gradle 多模块
    build.gradle.kts      # 一个 fat jar，含骨架与各 adapter
    src/main/java/dev/mcdev/agent/…        # 骨架：premain/agentmain/参数/超时/序列化/写盘
    src/main/resources/adapters.properties # key = <loader>/<mappings>/<mcLine> → adapter 类名
  assets/                 # 构建产物 mcdev-agent.jar 进 npm 包（files 里显式列出）
  test/                   # Node 侧测试（engine + jar 契约 + 工具）
  README.md / README.zh_CN.md / docs/DETAIL.md
```

**jar 怎么进 npm 包**：`agent/build.gradle.kts` 产出 `build/libs/mcdev-agent.jar`，`prepack` 把它拷到
`assets/mcdev-agent.jar`；`files` 里显式列出 `assets/`。发布机需要 JDK 21（只在这个包里，不牵连 starter）。

---

## 4. Java 侧

**骨架（loader 无关，零游戏类名）**：`premain` / `agentmain` → 解析参数 → 判断"我在游戏进程里吗"
（不是就 `[mcdev-agent] inert` 后返回）→ 选 adapter → 等数据就绪 → 逐 section 取 → 写 tmp+rename →
按需 `stop` → 打标记。

**adapter（映射知识的唯一容器）**：

```java
public interface DataAdapter {
  String key();                                   // "neoforge/mojmap/1.21@1"
  String loader(); String mappings(); String mcLine();
  void awaitReady(AgentContext ctx);              // 各 loader 的启动事件
  List<RegistryView> registries(AgentContext ctx);
  Map<String, Map<String, List<String>>> tags(AgentContext ctx);
  List<RecipeView> recipes(AgentContext ctx);
}
```

首版只写 `NeoForgeMojmap1210`；Fabric 的 `Yarn1210` 到 M-A3。取不到的字段 `null` + `warnings[]`。
反射调用集中在一个工具类里（`Reflect.get/clazz/method`），失败抛带上下文的异常，绝不静默 `null`。

**构建**：Gradle 8/9 + JDK 21，`--release 21`，零运行时依赖（不打 ASM；M-A3 若要做插桩再加）。
产物一个 jar，manifest 带 `Premain-Class`、`Agent-Class`、`Implementation-Version`、`MCDEV-Schema: 1`。

---

## 5. DSH 侧

- **两个工具**，都带 `register(def, { when })`：
  - `mc_data_dump`：按 `runTargets` 非空挂载（要起进程）；
  - `mc_data_query`：只要工作区有工程就挂载（纯读，不起进程）。
- **挂载后每步多 ~700 token**：所以插件的工具描述要按 M25 的量法量一遍再提交。
- **缓存**：`~/.dsh/mc-dev-starter/profiles/<profile>/data/<projectKey>/dump.json`（复用 starter 的
  state 目录约定；本插件自己建子目录）。`sourceHash` 见拓展文档 §5。
- **面板**：「数据」tab，只读表格 + 搜索 + 「导出」按钮（走同一套工具/服务，不重复实现）。
  搜索是本地过滤，不花模型 token。
- **语言**：`render` 中文（与 starter 工具一致）；面板文字进本插件自己的 `messages.js`。

---

## 6. 一次导出的时序

```
工具 mc_data_dump
  → 缓存命中？ (sourceHash 相同) → 直接返回
  → ctx.mcdev.launch({ taskPath: 'runServer', env: { JAVA_TOOL_OPTIONS: '-javaagent:…=out=…' }, wait: 'exit' })
      → starter 起 Gradle → 服务端 JVM → premain → 等 ServerStarted
      → 取数据 → 写 dump.json → server.stop()
  → 读日志标记：ready / section / wrote / failed / inert
  → 读 dump.json → 校验 schema → 建索引 → 写缓存元数据
  → 返回 { path, env, counts, errors, launch: { verdict } }
```

失败一律带上 `launch.verdict` 与日志尾部（starter 的 `mc_launch_logs` 已经能读同一份日志，
两边的 `launchId` 是同一个——这是复用 starter 的红利）。

---

## 7. 测试

| 层 | 测什么 | 怎么测 |
|---|---|---|
| engine | `parseDump` 校验、`query` 过滤/分页/截断、`digest` 分组 | 纯单测，样例 dump 夹具 |
| jar 契约 | `javaAgentOption` 生成的字符串、`readLogMarkers` 解析 | 纯单测（字符串→结构） |
| Java | adapter 在真工程上取数、缺字段进 warnings | `./gradlew test`（M-A1 只做 NeoForge） |
| 工具 | schema、`when` 挂载、错误码、渲染 | 假 ctx + 假 api（同 starter 的 `test/tools.test.js` 风格） |
| E2E | 真机 `C:\Projects\Test` 导出→查询→面板 | 手动 + 一次脚本化（可选进 CI，需要启动游戏，默认不进） |

**不做的测试**：不 mock 游戏类（反射的 mock 没有意义）；E2E 不放进 CI（要下载/启动 MC，太贵）。

---

## 8. 版本与发版

- 本插件 `0.1.x` 起步；`peerDependencies: minecraft-dev-starter >= 0.3`（要 `ctx.mcdev`）。
- **jar 与 npm 包同版本**：`Implementation-Version` 与 `package.json.version` 必须相等，`prepack` 里校验，
  不一致直接失败（否则会出现"包升级了、jar 还是旧的"这种最难查的问题）。
- 发版流程复用 starter 那套（`check:release`：工作树干净 / 版本与 CHANGELOG 一致 / 没发过 / CI 绿 →
  `stage publish` → 人工 2FA 批准）。
- 兼容矩阵写进 README：本插件 0.1 × starter ≥ 0.3 × MC 1.21.1 × NeoForge 21.1.x（首版只有这一格）。

---

## 9. 里程碑

| | 内容 | 判据 |
|---|---|---|
| M-A1 | jar 骨架 + NeoForge adapter（registries/tags/recipe 索引）+ `mc_data_dump` + 缓存读 | `C:\Projects\Test` 导出成功；item 条数与游戏内一致；errors 为空 |
| M-A2 | `mc_data_query` + `digest` + 面板「数据」tab | 第二次导出 `cached: true` < 100ms；查询 50 条 < 1k token |
| M-A3（可选） | attach + Fabric/yarn adapter + 配方完整 JSON | 见拓展文档 §3.5 |

---

## 10. 风险

| 风险 | 影响 | 对策 |
|---|---|---|
| 映射漂移（MC 小版本升级） | 某个 section 静默空 | adapter 表按 `mcLine` 分；无表即 `AGENT_UNSUPPORTED`；`warnings[]` 点名缺字段 |
| 服务端启动慢（30–60s） | 每次导出都等 | 缓存 + `refresh` 才重导；面板显示"导出中" |
| `JAVA_TOOL_OPTIONS` 污染 daemon | 日志噪音、daemon 里空转 | `premain` 先判断；只打一行 `inert` |
| 两个包版本错位 | 契约不符 | 启动时握手 `capabilities`；jar 版本 == npm 版本 |
| 反射在混淆环境失效 | 生产客户端用不了 | 明确只支持开发期（mojmap/yarn），不做混淆适配 |
| 数据量超预期（大整合包） | 内存/体积 | 单 section 上限 + `truncated` 显式标记 |

---

## 11. 待定

| # | 问题 | 建议 |
|---|---|---|
| A1 | 面板「数据」是独立 tab 还是挂在 starter 的 Mod Dev 里？ | 独立 tab（本插件自己的生命周期），M-A2 定 |
| A2 | 导出要不要顺手导 `tags` 之外的数据包内容（战利品表等）？ | 先不做 |
| A3 | 要不要把 dump 暴露成 HTTP 给别的工具用？ | 不；面板走本插件自己的 api 路由 |
