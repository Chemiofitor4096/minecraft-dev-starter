# 拓展：从运行中的游戏导出注册表与配方

给 `minecraft-dev-starter` 加一层"看得见数据"的能力：不是读源码猜，而是**让游戏自己把
注册表、标签、配方导出来**，面板与模型共用同一份结果。

本文只定接口。实现见里程碑 M29–M31。

---

## 1. 要解决什么

现在模型能回答的只有"改 → 跑 → 看日志"能证明的事。它回答不了：

- 这个包里 `minecraft:stone` 到底注册成了什么（哪个 mod 注册的、属性是什么）；
- 这个模组新增了哪些物品/方块/实体，它们的 id 与所属创造栏；
- 有哪些配方，产物是什么，用了什么材料（含数据包与别的 mod 加的配方）；
- 某个标签（`minecraft:planks`、`c:ingots` 之类）里到底有谁。

这些数据**只存在于运行期**：静态分析构建脚本看不出别的 mod 注册了什么，数据包的配方也只有
游戏加载后才成立。

判据（和现有功能同一套标准）：

1. 结论必须带证据：每条数据要能指认"这是运行期读到的，不是猜的"；
2. 部分失败也要有结论：没导出的段落要说明为什么，不许静默为空；
3. 人看得到、模型也看得到：同一份结果，面板可浏览，工具可查询。

---

## 2. 为什么不是"纯 JavaAgent + 反射"

最初的设想是 Agent + 反射。可行性没问题，但**作为主路径它很脆**，原因有三条：

1. **映射分裂**。NeoForge 1.21.1 的开发环境用 Mojang 官方名（`net.minecraft.core.registries.BuiltInRegistries`），
   Fabric 用 Yarn（`net.minecraft.registry.Registries`）。同一件事两套类名、两套方法名，
   反射写出来的每一个点都是字符串，编译期零保证，版本一升就散。
2. **事件比反射更可靠**。注册表在服务端启动后才是冻结态，数据包（含配方/标签）在
   `ServerStartedEvent`（NeoForge）/ `ServerLifecycleEvents.SERVER_STARTED`（Fabric）之后才完整。
   反射能等到这个时刻，但"等"这件事本身要靠事件，绕不开。
3. **反射取不到"另一个 mod 的意图"**。想知道配方产物与材料的规范化形式，最好用游戏自己的
   codec 编码；反射只能拼出近似值。

**结论（决策 D15）**：数据由**探针模组**取，Agent 只做模组做不到的事。

| | 探针模组（每 loader 一个薄适配器） | JavaAgent（可选） |
|---|---|---|
| 取注册表 / 标签 / 配方 | ✅ 主路径 | 只在无法装模组时兜底 |
| 编译期保证 | ✅ 直接 import 游戏类 | ❌ 全是字符串 |
| 附到**别人的**进程（用户手动开的客户端） | ❌ 装不进去 | ✅ 唯一的办法 |
| 运行时拦截（记录一次合成实际返回什么） | ❌ 事件粒度不够 | ✅ 字节码插桩 |
| 代码量 | 每种 loader ~150 行 | 一个通用骨架 + 每种 loader 的类名表 |

两套都写，但**默认只走探针**；Agent 是显式开关。

---

## 3. 三个接口

### 3.1 导出格式（线上格式，带版本）

一次导出 = 一个 JSON 文件，落盘用 tmp + rename，读到一半的进程不会留下坏文件。

```jsonc
{
  "schema": 1,                       // 格式版本；不兼容的改动必须 +1
  "generatedAt": "2026-11-21T04:00:00.000Z",
  "env": {
    "loader": "neoforge",            // neoforge | fabric | forge
    "loaderVersion": "21.1.80",
    "mcVersion": "1.21.1",
    "mappings": "mojmap",            // mojmap | yarn（写清楚，读的人才知道类名口径）
    "side": "server",                // server | client
    "java": 21
  },
  "provenance": {                    // 用来判断"这份数据还算不算数"
    "projectRoot": "C:\\Projects\\Test",
    "sourceHash": "sha256:…",        // 见 §5
    "builtAt": "2026-11-21T03:58:11.000Z",
    "durationMs": 7400
  },
  "truncated": false,                // 任一 section 被上限截断就为 true
  "registries": {
    "minecraft:item": {
      "count": 1240,
      "entries": [
        { "id": "minecraft:stone", "owner": "minecraft", "class": "net.minecraft.world.item.BlockItem", "props": { "maxStackSize": 64 } }
      ]
    }
  },
  "tags": {
    "minecraft:item": { "minecraft:planks": ["minecraft:oak_planks"] }
  },
  "recipes": {
    "count": 812,
    "entries": [
      {
        "id": "minecraft:oak_planks",
        "type": "minecraft:crafting_shaped",
        "result": { "item": "minecraft:oak_planks", "count": 4 },
        "ingredients": [["minecraft:oak_log"]],
        "json": null,                // v1 只在能拿到 codec 时填；拿不到就 null + 下面的 note
        "note": null
      }
    ]
  },
  "errors": [
    { "section": "recipes", "message": "recipe codec 不可用（fabric），只导出了索引" }
  ]
}
```

硬性语义：

- **每个 section 独立成功**。`recipes` 失败不该让 `registries` 消失；失败的进 `errors`，
  且该 section 的 `count` 为 0、`entries` 为空——**不许用空数组假装"没有"**。
- **截断要显式**：单 section 上限（默认 20000 条）触发时 `truncated: true`，并给
  `truncatedSections: ['recipes']`。
- **顺序确定**：`entries` 按 `id` 字典序，`tags` 的成员也排序——同一工程两次导出应当逐字节相同
  （除了 `generatedAt`）。这条让 diff 有意义。
- **id 一律带命名空间**：`minecraft:` / `c:` / 模组自己的。`owner` 是 id 的命名空间，
  不额外猜"哪个 mod 注册的"。
- 允许新增字段（读的人忽略未知字段）；删改语义必须 +1 `schema`。

### 3.2 宿主侧工具（模型面）

两个工具，**一个负责跑，一个负责查**：跑一次代价高（要起服务端），查是纯读。

```jsonc
// mc_data_dump：起一次 headless 服务端，导出一份
{
  "root": "C:\\Projects\\Test",              // 可选，默认会话工作区
  "sections": ["registries", "tags", "recipes"],  // 可选，默认三类全导
  "timeoutMs": 180000,                       // 可选，默认 3 分钟
  "refresh": false                           // false 时命中缓存直接返回（按 sourceHash 判）
}
// → { "path": "...\\dump.json", "cached": false, "env": {...}, "counts": { "minecraft:item": 1240, ... }, "errors": [], "launch": { "id": "launch-31", "verdict": "passed" } }

// mc_data_query：只读，不启动任何东西
{
  "root": "C:\\Projects\\Test",
  "kind": "registry",           // registry | tag | recipe
  "registry": "minecraft:item", // kind=registry 时必填
  "tag": "minecraft:planks",    // kind=tag 时必填
  "filter": "coal",             // 可选，id 子串（不区分大小写）
  "limit": 200                  // 可选，默认 200，超过时 truncated: true
}
// → { "matched": 12, "items": [...], "truncated": false, "stale": false }
```

约定（与现有工具一致）：

- 工具描述英文一到两句；`render` 中文；值里不放 `undefined`。
- 没有导出结果时 `mc_data_query` 报 `NO_DATA`，并提示"先 `mc_data_dump`"——不自动替调用方起服务端。
- `stale: true` 表示 `sourceHash` 与当前工程不符（用户改了源码）；查询仍然返回旧数据，但要说清楚。
- 两个工具都**不属于**"操作类按步挂载"（见 M25）：纯查询在任何工作区都无害，但 `mc_data_dump`
  会起进程，按 `runTargets` 非空挂载。

### 3.3 探针与 Agent 的契约

探针是一个**真模组**（每种 loader 一份 `fabric.mod.json` / `neoforge.mods.toml`），由我们的启动层
塞进 `run/mods/`，服务端启动后按参数决定做什么、做完是否自杀。

系统属性（都由我们的启动层通过 `JAVA_TOOL_OPTIONS` 注入，**不改用户的 build.gradle**）：

| 属性 | 含义 | 默认 |
|---|---|---|
| `mcdev.probe.dump` | 导出文件绝对路径（必填，否则探针不动作） | — |
| `mcdev.probe.sections` | 逗号分隔，`registries,tags,recipes` | 三类全导 |
| `mcdev.probe.stop` | 导出后调用 `server.stop()` | `true` |
| `mcdev.probe.max` | 单 section 上限 | `20000` |
| `mcdev.probe.owner` | 预留：只导某个命名空间 | 全部 |

为什么走 `JAVA_TOOL_OPTIONS`：Gradle 的 `runServer` 任务由用户的构建脚本定义，我们不碰它；
而我们自己 spawn 的那层（`launches.js`）控制子进程环境，这是唯一"不改用户工程就能传参"的位置。
代价：Gradle daemon 也会看到这个属性——它不认识，忽略即可。

Agent（`mode=boot` 与 `mode=attach`）：

```
-javaagent:mcdev-agent.jar=out=/abs/dump.json,mode=boot,sections=registries,loader=auto
```

- `mode=boot`：与探针等价的启动期插桩，用于"没有探针 mod 的工程"；
- `mode=attach`：`com.sun.tools.attach` 挂到已在跑的 JVM（`jdk.attach` 模块）——这是唯一能读
  **用户手动开的客户端**的办法，也是将来做"运行时行为记录"的入口；
- Agent 与探针**写同一个格式**，读的人不需要知道是哪条路来的（`env` 里加 `via: "probe" | "agent"`）。

---

## 4. v1 导什么

| 段落 | v1 | 说明 |
|---|---|---|
| `registries` | item / block / entity_type / fluid / mob_effect / enchantment | 用各 loader 的注册表根；不遍历所有注册表（有些是空的） |
| `tags` | item / block / fluid 三类标签 | 只导游戏实际加载的（含数据包） |
| `recipes` | id / type / result / ingredients | `json` 能取 codec 就填（NeoForge），否则 `null` + `note` |
| 不导 | 战利品表、进度、世界生成、方块状态与模型 | 数据量大且与"改模组"关系远，需要时再议 |

`props` 只放**跨 loader 同义**的字段（`maxStackSize`、`maxDamage`、`hardness`、`burnTime`…），
且每个字段都要有 `null` 语义（读不到就是 `null`，不省略键）。

---

## 5. 缓存与失效

- 落点：`~/.dsh/mc-dev-starter/profiles/<profile>/data/<projectKey>/dump.json`（与运行记录同源，
  按 profile 分；不进用户工程）。
- `sourceHash`：对工程里"会改变导出结果"的文件算摘要——`build.gradle(.kts)`、`settings.gradle(.kts)`、
  `gradle.properties`、`gradle/libs.versions.toml`、`src/**` 的文件名 + 大小 + mtime（**不读文件内容**，
  免得为了缓存把源码全读一遍；mtime 不够精确时可以升到内容哈希，作为开关）。
- `mc_data_dump` 默认 `refresh: false`：`sourceHash` 相同就直接返回缓存并标 `cached: true`。
- `mc_data_query` 永远读缓存，标 `stale` 但不阻塞。

---

## 6. 失败语义

| 情况 | 结果 |
|---|---|
| 服务端没起来（构建失败、端口占用） | 不产出 dump；返回 `launch` 的 `verdict` + 日志尾巴，错误码 `LAUNCH_FAILED` |
| 起来了但导到一半异常 | 已完成的 section 有效；失败 section 进 `errors`；整体仍算 `partial` |
| 超时（`timeoutMs`） | 同上：已写出的部分保留（tmp + rename 保证不半截），`verdict: 'aborted'` |
| 工程不是 Gradle 工程 / 没有 runServer | `NO_RUN_TARGET`，不猜 |
| 探针没有执行（mods 没加载） | `PROBE_NOT_LOADED`，日志尾巴里通常有 FML 的 mod 列表 |

这条和现有 `verdict` 是同一套：**说不出结论就是 unknown，不替它宣布成功**。

---

## 7. 包与构建

探针与 Agent 是 Java，需要各自的 loader 编译期依赖。两个放法：

| | A. 塞进主包 | B. 独立包 `minecraft-dev-starter-probe` |
|---|---|---|
| 安装 | 一次 | 两次（或主包把它列为可选依赖） |
| 发布 | 主包要在发布机上有 JDK 21 + 各 loader 仓库，`prepack` 变重 | 独立 CI 用 Gradle 构建，产物（jar）进 npm 包 |
| 版本耦合 | 天然同步 | 需要 `peer` 约定（探针 ≥ 0.1 支持 schema 1） |
| 失败半径 | 探针构建失败会挡住整个发版 | 主包照发，探针自己修 |

**建议 B**（决策 D16）：独立包，主包通过 `dctx.inject(['mcdevProbe'])` 之类的可选服务接它；
没装时 `mc_data_dump` 明确报"需要安装 minecraft-dev-starter-probe"，而不是静默失败。

---

## 8. 里程碑

| | 内容 | 判据 |
|---|---|---|
| M29 | 探针（NeoForge 先行）+ dump 格式 + `mc_data_dump` | 真机：`C:\Projects\Test` 导出 item/block/tags/recipes，条数与游戏内 `/give` 对得上 |
| M30 | 缓存 + `mc_data_query` + 面板「数据」区块（只读表格 + 搜索） | 同一工程第二次调用 `cached: true` 且 < 100ms |
| M31 | Agent `mode=boot`；Fabric 探针；`mode=attach` | attach 到手动启动的客户端能产出同格式 dump |

先做 NeoForge 是因为本机验证工程就是 NeoForge 1.21.1；Fabric 的适配器在 M31 补，接口不变。

---

## 9. 待定（需要拍板）

| # | 决策 | 建议 | 备选 |
|---|---|---|---|
| D15 | 主路径是探针还是 Agent | 探针为主，Agent 只做 attach/拦截 | 纯 Agent（反射 + 类名表） |
| D16 | 探针与 Agent 放哪 | 独立 npm 包 | 塞进主包 |
| D17 | v1 是否要完整配方 JSON | 不要，先 id/type/result/ingredients；JSON 留给 M31 | 一开始就要求完整 JSON（Fabric 上拿不到，会变成两套语义） |
| D18 | 运行环境 | 默认 headless 服务端；客户端只在 attach 时用 | 一律客户端（有窗口、慢） |
| D19 | 数据落点 | 插件 state 目录（按 profile + sourceHash） | 工程内 `build/mcdev/`（会进 git 视野） |
