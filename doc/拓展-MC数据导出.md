# 拓展：从运行中的游戏导出注册表与配方

给 `minecraft-dev-starter` 加一层"看得见数据"的能力：不读源码猜，而是**在游戏进程里把注册表、
标签、配方取出来**，面板与模型共用同一份结果。

本文只定**接口**。实现放在另一个工作区（独立 npm 包 + 一个 Java Agent jar），本文就是两边之间的契约。

---

## 1. 要解决什么

现在模型能回答的只有"改 → 跑 → 看日志"能证明的事。它回答不了：

- 这个包里 `minecraft:stone` 到底是什么（哪个 mod 注册的、属性是什么）；
- 这个模组新增了哪些物品/方块/实体，分别进了哪个创造栏；
- 有哪些配方、产物是什么、用了什么材料（含数据包与别的 mod 加的配方）；
- 某个标签（`minecraft:planks`、`c:ingots`）里到底有谁。

这些数据**只存在于运行期**：静态分析看不出别的 mod 注册了什么，数据包配方也要游戏加载后才成立。

和现有功能同一套判据：

1. 结论带证据：每条数据要能指认"这是运行期读到的"；
2. 部分失败也有结论：没导出的段落要说明为什么，不许静默为空；
3. 人看得到、模型也看得到。

---

## 2. 为什么是 Agent，以及怎么让它不脆（决策 D15）

**已定**：主路径是 Java Agent + 反射（探针模组方案不采用）。

这条路最大的风险不是技术可行性，而是**映射分裂**：

| | NeoForge 1.21.1 开发环境 | Fabric 1.21.1 开发环境 |
|---|---|---|
| 映射 | Mojang 官方名（mojmap） | Yarn |
| 注册表根 | `net.minecraft.core.registries.BuiltInRegistries` | `net.minecraft.registry.Registries` |
| 物品类 | `net.minecraft.world.item.Item` | `net.minecraft.item.Item` |
| 服务端事件 | `ServerStartedEvent`（`net.neoforged.neoforge.event.server`） | `ServerLifecycleEvents.SERVER_STARTED` |

同一件事两套类名/方法名，反射写出来全是字符串。**所以接口设计的第一条不是"取什么数据"，
而是"把映射知识关进笼子"**：

```
Agent 骨架（loader 无关） ──调用──▶ DataAdapter（每个 loader+mappings 一个实现）
   · 生命周期等待                        · 类名 / 方法名 / 字段名全在这里
   · 参数解析、超时、写盘、日志           · 只做"取"，不做"编排"
   · 统一的 Dump 结构
```

- 骨架里**没有一处游戏类名**；所有反射都发生在 adapter 内。
- adapter 用一张表登记：`key = <loader>/<mappings>/<MC 小版本线>`，例如
  `neoforge/mojmap/1.21`、`fabric/yarn/1.21`、`forge/mojmap/1.20.1`。表随 jar 走
  （`adapters.properties`），新增支持只需加一行 + 一个类。
- **没有 adapter 就不假装能导**：直接报 `AGENT_UNSUPPORTED`，而不是导出一堆 `null`。
- 反射取不到的字段写 `null` 并在 `warnings[]` 里点名（`"item.<field> 在 mojmap-1.21.1 上未找到"`），
  绝不猜。

这样"纯反射"的脆弱性被限制在 adapter 这一层：它破了，破的是某个 `(loader, mappings, 版本线)`，
不是整个功能。

---

## 3. 三个接口

### 3.1 导出格式（线上格式，带版本）

一次导出 = 一个 JSON，tmp + rename 落盘。

```jsonc
{
  "schema": 1,                       // 格式版本；不兼容改动 +1
  "generatedAt": "2026-11-21T04:00:00.000Z",
  "env": {
    "via": "agent-boot",             // agent-boot | agent-attach
    "loader": "neoforge",            // neoforge | fabric | forge
    "loaderVersion": "21.1.80",
    "mcVersion": "1.21.1",
    "mappings": "mojmap",            // mojmap | yarn —— 读的人据此知道类名口径
    "adapter": "neoforge/mojmap/1.21@1",  // 用了哪张表、哪一版
    "side": "server",                // server | client
    "java": 21
  },
  "provenance": {
    "projectRoot": "C:\\Projects\\Test",
    "sourceHash": "sha256:…",        // 见 §5
    "durationMs": 7400
  },
  "truncated": false,
  "truncatedSections": [],
  "registries": {
    "minecraft:item": {
      "count": 1240,
      "entries": [
        { "id": "minecraft:stone", "owner": "minecraft", "class": "net.minecraft.world.item.BlockItem",
          "props": { "maxStackSize": 64, "maxDamage": null } }
      ]
    }
  },
  "tags": { "minecraft:item": { "minecraft:planks": ["minecraft:oak_planks"] } },
  "recipes": {
    "count": 812,
    "entries": [
      { "id": "minecraft:oak_planks", "type": "minecraft:crafting_shaped",
        "result": { "item": "minecraft:oak_planks", "count": 4 },
        "ingredients": [["minecraft:oak_log"]],
        "json": null }               // 索引阶段固定 null（D17）
    ]
  },
  "warnings": [],
  "errors": [ { "section": "recipes", "message": "…" } ]
}
```

硬性语义：

- **每个 section 独立成功**：`recipes` 失败不该让 `registries` 消失；失败的进 `errors`，
  该 section `count: 0`、`entries: []`。**不许用空数组假装"没有"**（有 `errors` 区分）。
- **截断显式**：单 section 上限（默认 20000）触发时 `truncated: true` + `truncatedSections`。
- **顺序确定**：`entries` 按 `id` 字典序，tag 成员排序——同一工程两次导出除 `generatedAt` 外逐字节相同。
- **id 一律带命名空间**；`owner` = id 的命名空间，不另猜"哪个 mod 注册的"。
- 允许**新增字段**（读方忽略未知字段）；删改语义必须 +1 `schema`。
- `props` 只放跨 loader 同义的字段，且每个都**出现**（读不到是 `null`，不省略键）。

### 3.2 Java Agent 契约（jar）

一个 jar，两个入口：

```
manifest:
  Premain-Class:  dev.mcdev.agent.Premain        # -javaagent 用（mode=boot）
  Agent-Class:    dev.mcdev.agent.AgentMain      # attach 用（mode=attach）
  Implementation-Version: 0.1.0
  MCDEV-Schema: 1

参数（-javaagent:mcdev-agent.jar=k1=v1,k2=v2）：
  out=/abs/dump.json        必填；没有它 Agent 不动作
  sections=registries,tags,recipes   默认三类全导
  stop=true                 导出后 server.stop()；默认 true
  timeout=120000            自超时：到点写出已完成部分再停
  loader=auto|neoforge|fabric|forge  默认 auto（探测）
  mappings=auto|mojmap|yarn          默认 auto
  max=20000                 单 section 上限
```

**关键约束**：Agent 的 `premain` 必须**先判断自己在什么进程里**。因为宿主是通过
`JAVA_TOOL_OPTIONS` 注入的（见下），Gradle daemon 也会加载它——那里没有游戏类，必须静默返回，
不打印、不阻塞。

为什么要 `JAVA_TOOL_OPTIONS`：`runServer` 任务由用户的 `build.gradle` 定义，我们不碰它；
而我们自己 spawn 子进程的那层（`launches.js`）控制环境变量，这是唯一"不改用户工程就能加 JVM 参数"
的位置。代价：每个 JVM 会多一行 `Picked up JAVA_TOOL_OPTIONS: …` 到 stderr（无害，日志里看得见），
以及 daemon 里多一次空转的 premain。

**日志标记**（宿主用它做进度与超时判定，也会出现在我们的日志标签里）：

```
[mcdev-agent] ready schema=1 loader=neoforge mappings=mojmap adapter=neoforge/mojmap/1.21@1
[mcdev-agent] section registries count=1240
[mcdev-agent] wrote /abs/dump.json bytes=123456
[mcdev-agent] failed section=recipes error=…
[mcdev-agent] inert reason=no-game-classes          # 在 daemon 里被加载时的唯一输出
```

前缀固定 `[mcdev-agent]`，一行一个事件，值里不带空格（便于 grep 与解析）。

**退出码**：`0` 已写出；`10` 找不到游戏类（进程不对）；`11` 无可用 adapter；`12` 写盘失败。
宿主**不单看退出码**：以 dump 文件是否存在 + `errors[]` 为准，退出码只用于归因。

### 3.3 npm 包与宿主侧工具

独立包 `minecraft-dev-starter-agent`（决策 D16），自带 jar，导出**纯函数 + 一个可选的 cordis 服务**：

```js
// 纯函数（可在测试里直接用，不碰进程）
AGENT_SCHEMA                          // 1
AGENT_CAPABILITIES                    // ['dump', 'attach', 'sections:registries', ...]
javaAgentOption({ out, sections, timeoutMs, loader, mappings, stop })  // → '-javaagent:…=out=…'
parseDump(text)                       // → Dump；schema 不匹配抛 AGENT_SCHEMA_MISMATCH
readLogMarkers(line)                  // → { kind: 'ready'|'section'|'wrote'|'failed'|'inert', … }

// 服务（主包可选注入；没装就明确报错，不静默降级）
ctx.mcdevAgent = {
  version: '0.1.0',
  schema: 1,
  capabilities: [...],
  jarPath,                             // 绝对路径，供 attach 用
  attach({ pid, out, sections, timeoutMs }): Promise<DumpSummary>,
}
```

主包**只依赖这个服务与纯函数**，不自己拼 `-javaagent` 字符串、不知道 jar 在哪。版本耦合靠：

- `peerDependencies`：`minecraft-dev-starter-agent >= 0.1`；
- 握手：`schema === 1` 且 `capabilities` 含所需项，否则 `AGENT_VERSION_MISMATCH`（要求升级探针包，
  不是"凑合用"）。

宿主侧两个工具：

```jsonc
// mc_data_dump：起一次 headless 服务端（带 Agent），导出一份
{ "root": "…", "sections": ["registries","tags","recipes"], "timeoutMs": 180000, "refresh": false }
// → { path, cached, env, counts, warnings, errors, launch: { id, verdict } }

// mc_data_query：只读，不启动任何东西
{ "root": "…", "kind": "registry|tag|recipe", "registry": "minecraft:item",
  "tag": "minecraft:planks", "filter": "coal", "limit": 200 }
// → { matched, items, truncated, stale }
```

约定与现有工具一致：描述英文一到两句、`render` 中文、值里不放 `undefined`；没有数据时
`mc_data_query` 报 `NO_DATA` 并提示先 `mc_data_dump`（不替调用方起进程）；`stale: true` 表示
`sourceHash` 与当前工程不符（仍返回旧数据，但要说清楚）。

---

### 3.4 查询接口与 token 预算

**dump 永远不进上下文。** 先算一笔账（1.21.1 原版量级，模组会更多）：

| 数据 | 条数 | JSON 体积 | 折合 token（约 4 字符/token） |
|---|---|---|---|
| item + block + entity_type + effect + enchantment + fluid | ~2700 | ~380 KB | ~95k |
| 配方索引 | ~1200 | ~260 KB | ~65k |
| 标签（item/block/fluid，含成员） | ~5600 成员 | ~200 KB | ~50k |
| **合计** | | **~0.85–1 MB** | **~210k** |

也就是说，**整份 dump 比整个上下文窗口还大两倍**。任何"把 dump 塞给模型/让模型自己 grep"的做法
都会立刻爆掉。所以查询必须满足三条：

1. **先摘要再钻取**。`kind: 'digest'` 返回按 `owner` 分组的一行一条：
   `minecraft 1400 · coalcraft 12 · c 8`（约 250 token），模型据此决定看哪一段。
2. **硬上限 + 分页**。`limit` 默认 50、上限 200；返回 `truncated` 与 `nextOffset`。
   单行渲染成"id · owner · 关键属性"（约 60 字符），200 条 ≈ 3k token，默认 50 条 ≈ 750 token。
3. **只读工具不启动进程**。`mc_data_query` 只读缓存文件；要新数据是 `mc_data_dump` 的事，
   两者分开，模型不会为了查一条物品把服务端再起一遍。

面板不受这条限制：它是本地文件 + 本地索引，浏览 2700 条物品不花一个模型 token。**同一个文件，
人自由翻，模型只拿摘要与命中行。**

分工也据此确定（回答"要不要给 agent 插件也提供查询工具"）：

| 层 | 谁拥有 | 内容 |
|---|---|---|
| 查询**引擎** | Agent 包 | `indexDump(dump)` / `query(index, { kind, … })` / `digest(index)` 纯函数，零依赖 |
| 查询**工具面** | 主包（本仓库） | `mc_data_query` 的 schema、描述、中文渲染、错误码、挂载条件 |

工具面必须只有一处：工具的 schema 与描述是模型契约（要过 M25 那套 token 预算），
不能两个包各注册一套。Agent 包只提供引擎，主包只做tool，两边都不复制查询逻辑。

### 3.5 attach 模式：能做什么、不能做什么

先说两种模式的分工：

| | `boot`（M29） | `attach`（M31） |
|---|---|---|
| 谁启动 JVM | 我们（`mc_launch` spawn 的 Gradle 任务） | **用户**（IDEA、面板、命令行，早就在跑了） |
| `-javaagent` 怎么进 | 启动时就在 argv 里（经 `JAVA_TOOL_OPTIONS`） | 事后注入（下面讲） |
| 确定性 | 高：从 `premain` 到退出全程可见 | 中：只在 `agentmain` 那一刻起可见 |
| 代价 | 必须新起一个服务端（~30–60s） | 无需重启，但目标必须是**开发期、未混淆**的运行时 |
| 用在哪 | 默认路径、可复现的导出 | 用户已经在客户端里、临时想看一眼 |

**attach 的机制**（JDK Attach API，Arthas / JFR / JProfiler 都走这条路）：

1. 宿主发现目标进程的 `pid`；
2. 跑 `java -jar mcdev-agent.jar attach --pid <pid> --out <dump> --sections …`；
3. 这个小程序（不是 Agent）调用 `VirtualMachine.attach("<pid>")` → `loadAgent(jarPath, options)`；
4. 目标 JVM 载入 jar 里的 `Agent-Class`，调用 `agentmain(args, inst)`；
5. `agentmain` 里做的和 `premain` 一样：等数据就绪 → 序列化 → 写盘 → 回复。

`attach` 模式必须遵守的约束：

- **同 JDK 大版本**：Attach API 要求发起方与目标的 JVM 兼容（一般同版本最稳），所以要按工程
  实际使用的 JDK 去起那个小程序（我们有 `jdks.js`，已经知道每个工程用哪个）。
- **JDK 21 起动态加载有告警**：JEP 451 之后 attach 加载 Agent 会打警告，未来版本默认关闭；
  需要时给目标加 `-XX:+EnableDynamicAgentLoading`——而"给目标加参数"又要求重启它，于是
  attach 的价值就没了。所以 **attach 只当兜底**，不作为默认路径。
- **只支持开发期运行**：adapter 的类名表是按 mojmap / yarn 写的；对着混淆过的生产客户端 attach
  只会拿到 `AGENT_UNSUPPORTED`，不猜。
- **客户端上配方可能不全**：注册表在 bootstrap 之后就有，但配方/标签是数据包加载后才齐的——
  客户端停在主菜单时 `recipes` 基本是空的。**attach 到客户端时默认只导 `registries`**，
  要配方得先进世界，或 `sections` 显式要求并接受"可能为空"。
- **绝不默认停游戏**：`stop` 在 attach 模式下默认 `false`——把用户正在玩的客户端关掉不是我们的权力。
- **谁来选 pid**：这是 D20。建议：面板列出候选 JVM（命令行里含 `devlaunchinjector` / `neoforge`
  / 工程 `run/` 目录的 java 进程）让**人**点选；模型侧只能读这份列表，不能自己对任意 pid 发起 attach。
  这条不是洁癖：attach 等于往别人的进程里注入代码，模型不该有这种能力。

## 4. v1 导什么（D17：先索引）

| 段落 | v1 | 说明 |
|---|---|---|
| `registries` | item / block / entity_type / fluid / mob_effect / enchantment | 只导这几个根，不遍历全部 |
| `tags` | item / block / fluid | 游戏实际加载的（含数据包） |
| `recipes` | id / type / result / ingredients | `json` 固定 `null`，M31 再补 |
| 不导 | 战利品表、进度、世界生成、方块状态与模型 | 数据量大且离"改模组"远 |

---

## 5. 缓存与失效

- 落点：`~/.dsh/mc-dev-starter/profiles/<profile>/data/<projectKey>/dump.json`（与运行记录同源，
  按 profile 分，不进用户工程）。
- `sourceHash`：`build.gradle(.kts)`、`settings.gradle(.kts)`、`gradle.properties`、
  `gradle/libs.versions.toml`、`src/**` 的**文件名 + 大小 + mtime**（不读内容；够用时就这样，
  不够再加内容哈希作为开关）。
- `mc_data_dump` 默认 `refresh: false`：`sourceHash` 相同直接返回缓存并标 `cached: true`
  （< 100ms）；不同就重导。

### 5.1 要不要上数据库：不（决策 D21）

同一份数据 0.85–1 MB，查询只有四类：按 id 子串、按 `owner`、按 tag 成员、按配方产物。
这些用"一个 JSON + 内存索引"就够：

| 方案 | 结论 | 理由 |
|---|---|---|
| SQLite（`better-sqlite3`） | ✗ | 原生模块，要跨平台预编译；主包的 `dependencies: []` 是硬卖的（见 SECURITY），装不上就整包挂 |
| `node:sqlite` | ✗ | Node 22.5+ 才有且仍是实验特性；本插件要求 Node ≥ 20 |
| DuckDB / LevelDB | ✗ | 更重的依赖，收益为零 |
| **JSON + 内存索引** | ✓ | 解析 1 MB 约 30–50 ms；`Map<id, entry>` / `Map<tag, Set>` / `Map<result, recipes[]>` 建成后查询是 O(1)–O(n) 过滤，常驻内存几 MB |

而且数据库会**多一个写方**：agent 包要么也写 SQLite（耦合两个包的文件格式），要么主包负责导入
（多一步、没有收益）。dump 是"某个 sourceHash 的快照"，不是可变库，天然适合一个文件。

只有一种情况值得回头再议：将来要做**跨版本 / 跨时间的 diff 历史**（这次导出 vs 上周），
那时用**追加式**的 sidecar 文件（`history/<hash>.json`）也比数据库简单；真要 SQL，也放在 agent 包
那一侧（它有 JDK，不怕原生依赖），主包不引入。

---

## 6. 失败语义

| 情况 | 结果 |
|---|---|
| 服务端没起来（构建失败、端口占用） | 不产出 dump；`LAUNCH_FAILED` + 日志尾巴 |
| 起来了但 Agent 没生效 | `AGENT_NOT_LOADED`（日志里找不到 `[mcdev-agent] ready`，通常能看到 `inert`） |
| 无可用 adapter | `AGENT_UNSUPPORTED`，值里带 `env.loader/mappings/mcVersion`，方便补表 |
| 导到一半异常 | 已完成 section 有效，失败的进 `errors`；整体 `partial` |
| 超时 | 已写出的部分保留（tmp + rename 保证不半截），`verdict: 'aborted'` |
| 不是 Gradle 工程 / 没有 runServer | `NO_RUN_TARGET`，不猜 |

和现有 `verdict` 同一套：说不出来就说 `unknown`，不替它宣布成功。

---

## 7. 两个包的边界

| 归属 | 内容 |
|---|---|
| **本仓库**（`minecraft-dev-starter`） | dump 的**消费侧**：`mc_data_dump` / `mc_data_query` 两个工具、缓存、面板「数据」区块、`parseDump` 的用法、失败码与文案 |
| **新工作区**（`minecraft-dev-starter-agent`） | Agent jar（骨架 + adapter 表 + NeoForge/Fabric/Forge 适配器）、attach 入口、`javaAgentOption` / `parseDump` / `readLogMarkers`、jar 的构建与发布 |

本仓库**不**包含任何 Java 源码，也不在 `prepack` 里构建 jar——这是选独立包的目的（主包照发，
Agent 自己用 Gradle + 自己的 CI）。两边的唯一耦合是：`schema=1` + `capabilities` + 本文。

---

## 8. 里程碑

| | 内容 | 判据 |
|---|---|---|
| M29 | Agent `boot` 骨架 + NeoForge/mojmap adapter + `mc_data_dump`（消费侧） | 真机 `C:\Projects\Test` 导出 item/block/tags/recipe 索引，条数与游戏内 `/give` 对得上 |
| M30 | 缓存 + `mc_data_query` + 面板「数据」区块（只读表格 + 搜索） | 第二次调用 `cached: true` 且 < 100ms |
| M31 | `attach` 模式 + Fabric/yarn adapter + 配方完整 JSON | attach 到手动启动的客户端能产出同格式 dump |

先 NeoForge 是因为本机验证工程就是 NeoForge 1.21.1；接口不因 loader 而变。

---

## 9. 已定 / 待定

| # | 决策 | 结论 |
|---|---|---|
| D15 | 主路径 | **纯 JavaAgent + 反射**；映射知识关进 adapter，无 adapter 就报不支持 |
| D16 | 包与构建 | **独立 npm 包**，本仓库只做消费侧 |
| D17 | v1 配方范围 | **先索引**（id/type/result/ingredients），完整 JSON 留 M31 |
| D18 | 运行环境 | 默认 headless 服务端；客户端只在 `attach` 时用 |
| D19 | 数据落点 | 插件 state 目录（按 profile + sourceHash） |
| D20 | attach 的目标怎么选 | **面板列候选 JVM + 人点选**；模型只能读列表，不能对任意 pid 发起 attach（M31 落） |
| D21 | 要不要数据库 | **不要**：JSON + 内存索引；1 MB、30–50ms、零依赖（见 §5.1） |
| D22 | 查询工具归属 | 引擎在 agent 包（纯函数），工具面只在主包（一份 schema/描述/渲染，见 §3.4） |
| D23 | 待定 | 要不要做跨版本 diff 历史？建议先不做，真的需要时用追加式 sidecar，不引入数据库 |
