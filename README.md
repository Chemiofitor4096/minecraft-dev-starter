# minecraft-dev-starter

一个 DeepSeek Harness（DSH）插件：识别工作区里的 Minecraft 模组开发工程，并把它们托管起来启动。

当前状态：**策划阶段**，还没有可运行代码。

## 它要解决什么

- 打开一个新工程，不用人肉读 `build.gradle` 才知道这是 Fabric 还是 NeoForge、跑哪个 JDK。
- `runClient` 不必塞进一次工具调用里占死回合：后台启动、可查状态、可看日志、可停止，退出后自动归因。
- 为后续接入 HMCL / PCL2 / Prism 这类启动器的实例库留出适配器位置。

## 文档

- [策划](./doc/策划.md) — 需求、架构、工具设计、里程碑、风险、待确认决策
- [DSH 插件机制调研](./doc/调研-DSH插件机制.md) — 插件契约、安装通道、能力边界与出处

审核意见请直接写在 [策划](./doc/策划.md) 第 15 节「待确认决策」对应的行上。

## 计划中的能力

| 工具 | 作用 |
|---|---|
| `mc_project_scan` | 列出工作区里的 MC 工程 |
| `mc_project_show` | 单个工程的完整画像（loader / 版本 / Java / 风险 / 证据） |
| `mc_launch` | 托管启动客户端或服务端 |
| `mc_launch_list` | 列实例及其状态 |
| `mc_launch_logs` | 增量读日志 |
| `mc_launch_stop` | 停止实例（含进程树） |

## 许可证

MIT（待定，见策划 D1）。
