# 工具描述术语表

六个模型工具（`src/tools.js`）的描述是**英文**，正文里只用下表这套词。术语不统一时模型会把
"目标"和"任务"当成两件事，进而猜错参数。

| 术语 | 英文 | 含义 | 不要写成 |
|---|---|---|---|
| 工程 | project | 含 `build.gradle` 的目录；多模块工程里子模块各自算一个 | 项目、仓库、workspace |
| 目标 | target | 一个可运行的 Gradle 任务 | 任务、run、配置 |
| taskPath | taskPath | 目标的 Gradle 路径；子模块带冒号前缀（`:modules:core:runClient`） | 任务名、task、路径 |
| 实例 | instance | 一次启动留下的进程记录（`launch-N`） | 运行、进程、session |
| 常驻 | daemon | 起来后一直跑（`runClient` / `runServer`） | 长任务、server |
| 会跑完 | one-shot | 跑完即退出，产出 verdict（`runData` / gametest） | 一次性、batch、short |
| mode | mode | 目标的生命周期：`daemon` / `oneshot` | 类型、kind |
| source | source | 目标从哪来：`build-script` / `idea-run-config` / `guessed` | 来源、origin |
| verdict | verdict | 会跑完的目标的结论：`passed` / `failed` / `aborted` / `error` / `unknown` | 结果、result、状态 |
| status | status | 实例的进程状态：`starting` / `running` / `exited` / `unknown` | 状态、state |
| outcome | outcome | 进程怎么结束：`normal` / `crashed` / `killed` / `failed` | 退出原因、reason |

容易混的两组：

- **status ≠ verdict**。`status=exited` 只说明进程没了；过没过看 `verdict`。
- **目标 ≠ 实例**。目标是"可以跑什么"（构建脚本里的一条），实例是"跑过一次"（`launch-N`）。
  同一个目标可以有很多实例，但同一时刻只有一个活跃实例。

## 描述的结构

一到两句。第一句「做什么 + 什么时候用」，第二句只放这条工具最容易踩的那条约束
（不排队 / 只对常驻有意义 / 别自己跑 gradlew）。不要写成分节的清单。

规则：

- 参数与返回交给 schema，描述里不重复；只在有歧义时点一个关键枚举值（如 verdict 的 passed/failed）。
- 每条"不要做 X"尽量带替代做法（"do not run gradlew yourself" 隐含"用 mc_launch"）。
- 职责只在自己的描述里定义，**不要互相定义**（例如 `mc_launch` 不解释 `mc_project_detail` 的字段）。
- 模型看到的错误信息是本地化后的文本，不是错误码：描述里说"already-running error"，不要写 `ALREADY_RUNNING`。
- 长度上限：长句不超过 120 个字符左右；超过就说明有内容该搬进 schema 或术语表。

## 语言分层

| 层 | 语言 | 理由 |
|---|---|---|
| 工具描述、参数、返回字段说明 | 英文 | 模型契约，和生态里的工具文档一致 |
| 工具执行结果（`render`） | 中文 | 跟界面语言走，给人看 |
| 面板 / 浮层 / 胶囊 | 跟随宿主 locale | 中文 / English |
