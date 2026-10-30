# minecraft-dev-starter

一个 DeepSeek Harness（DSH）插件：在会话标题栏放一个像 IDEA 运行配置那样的控件，认出当前工作区里的 Minecraft 模组工程和它能跑的目标（Client / Server / Data …），点一下就起客户端。

当前状态：**策划阶段**，还没有可运行代码。

## 它解决什么

AI 写 MC 模组卡在验收环节：人得离开对话、开终端、等构建、进游戏看效果。这个插件把这几步压成一个按钮：

```
人：改完 → 点 ▶ → 进游戏看 → 回来提意见
AI：读代码、改代码、看日志 → 继续
```

识别与启动是地基，界面是主场。AI 侧也保留少量工具，方便它自己起一次做验证。

## 文档

- [策划](./doc/策划.md) — 界面设计、架构、识别与启动方案、里程碑、风险、待确认决策
- [DSH 插件机制调研](./doc/调研-DSH插件机制.md) — 插件契约、client slot 注入、HTTP 路由、能力边界与出处

审核意见请写在 [策划](./doc/策划.md) 第 16 节「待确认决策」对应的行上。

## 计划中的形态

```
会话标题栏
[● Client ▾] [▶]                        ← 胶囊：状态点 + 目标 + 起停
      ↓ 点开（单选一个目标）
  rationality · NeoForge 1.21.1 · JDK 21
  fabric
    ◉ Client
    ○ Server
  forge
    ○ Client

右侧栏「运行日志」标签页                 ← 启动时自动打开
  [Client · 20:31 运行中 ▾]  ← 历史切换
  [BUILD] > Task :runClient
  [MC]    Backend library: LWJGL
```

多模块（Architectury）按模块分组，任务路径用 `:fabric:runClient`。同一工程同时只跑一个实例，换工程可并存。

## 计划中的 AI 工具

| 工具 | 作用 |
|---|---|
| `mc_projects` | 列出工作区识别到的工程与可运行目标 |
| `mc_launch` | 启动某个目标（等就绪后返回） |
| `mc_launch_logs` | 增量读日志，含崩溃归因 |
| `mc_launch_stop` | 停止实例 |

## 许可证

MIT（待定，见策划 D1）。
