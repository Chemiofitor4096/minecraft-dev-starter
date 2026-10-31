# minecraft-dev-starter

在 DSH（DeepSeek Harness）的会话标题栏放一个 IDEA 风格的运行控件：认出工作区里的 Minecraft 模组工程，点一下就能起 Client，日志就在右侧栏。

给做模组的人用，不是给 AI 用的——AI 侧只是顺带留了几个工具。

## 能做什么

**识别**：Fabric、Forge、NeoForge、Architectury、Paper、Spigot，覆盖 1.7.10 到 26.x。
单模块、多模块、聚合仓库都能认；loader 写在子模块里也能认。

**启动**：Client / Server / Data / GameTestServer。自动挑 JDK（读 `<jdk>/release`，不乱起进程）；
构建完能判断"进游戏了"而不是"进程还活着"；关掉游戏后状态同步；宿主重启后按 pid 对账，不伪造结束原因。

**看日志**：右侧栏独立标签，按工程列历史、默认显示最新、可跟随尾部；
崩溃时给一句归因（依赖没解析、JDK 版本不对、端口被占、认证失败等 8 类）。

**多工程与多会话**：工作区里每个工程分别记住自己选的目标；切换对话即切换工作区，不需要手动刷新。

**AI 工具**（可选）：`mc_projects` / `mc_launch` / `mc_launch_logs` / `mc_launch_stop`，与面板共用同一套服务。

**better-sidebar**：装了 [dsh-better-sidebar](https://github.com/topics/dsh-better-sidebar)，还会多出两个带图标的侧栏页面。

## 安装

需要 DSH 桌面版（0.2.1 及以上）或 dsh CLI。

```powershell
# 本地仓库（改完即生效）
dsh plugin --profile desktop add link:C:/Projects/minecraft-dev-starter

# 打好的 tarball
dsh plugin --profile desktop add file:./minecraft-dev-starter-0.1.0.tgz

# 从 npm 安装（发布之后）
dsh plugin --profile desktop add minecraft-dev-starter
```

装完**重启 DSH** 生效。卸载：

```powershell
dsh plugin --profile desktop remove minecraft-dev-starter
```

`dsh plugin` 实际是 pnpm 的转发器：它把包装进 profile、再把声明了 `dsh.bundle` 的依赖加进
`dsh.profile.bundles` 层列表。所以手工在 profile 的 `package.json` 里加一行再用 pnpm 安装，
效果是一样的。

## 使用

1. 打开一个模组工程所在的对话。
2. 标题栏出现 `● Client ▶`。点名字展开浮层，选工程与目标；点 ▶ 开始构建并启动。
3. 启动后自动打开「运行日志」（可在配置里关掉），日志实时刷新。
4. 再点一次按钮（变成 ⏹）停止，会连同 Gradle 拉起的整个进程树一起结束。

浮层形态会自适应：工作区里只有一个工程时跳过列表，表头直接是工程名、loader/版本与路径；
有多个工程时列表固定高度，选谁只换下面的目标区，界面不会跳。

## 配置

在 profile 的 `cordis.patch.yml` 里给插件那行加 `config`：

```yaml
- id: mcdev-host
  name: minecraft-dev-starter
  config:
    autoOpenLogTab: true   # 启动后自动打开日志标签
    readyTimeoutMs: 90000  # 等"进游戏"的上限，超时不算失败
    logRingLines: 2000     # 内存里保留的日志行数（磁盘文件是完整的）
```

## 支持范围

| 平台 | 版本线 | 说明 |
|---|---|---|
| Fabric | 1.14 – 26.x | loom 的 `runClient` 一族 |
| Forge | 1.7.10 / 1.12.2 / 1.16.5 / 1.20.1 | 包括 legacyforge |
| NeoForge | 1.20.1 – 26.x | moddev 插件 |
| Architectury | 1.16 – 26.x | 按子模块拆目标 |
| Paper / Spigot | 1.7.10 – 26.x | 服务端插件工程 |

JDK 需求按版本推断（1.7.10/1.12.2 → 8，1.18–1.20.4 → 17，1.20.5+ → 21，26.x → 25），
和机器上已装的 JDK 比对，缺了会在面板里提示，不会带着错的版本硬跑。

## 开发

```powershell
npm install
npm run build        # 构建客户端到 lib/client.js（改 src/client 后必须跑）
npm test             # 59 个测试
npm run build -- --watch
```

仓库结构、硬坑清单与历史验证结论都在 [AGENTS.md](./AGENTS.md)。
设计文档：[策划](./doc/策划.md) · [DSH 插件机制调研](./doc/调研-DSH插件机制.md)。

## 发布

DSH 插件的分发就是 npm 包 + 一份清单声明，没有单独的注册流程：

1. **清单**：`package.json` 里声明 `dsh.bundle.patch`（指向 `cordis.patch.yml`）与
   `dsh.client.platform`（有客户端时）。宿主靠这两项决定"这是不是一个 DSH 插件"。
2. **产物**：`npm run build` 把客户端打进 `lib/client.js` 并**提交进仓库**——
   运行时直接读它，不装依赖也不做构建。
3. **自检**：`npm test`，`npm pack --dry-run` 看包里有没有多余文件（`files` 字段已限定
   `src`、`lib`、`cordis.patch.yml`、README、AGENTS）。
4. **发布**：`npm publish --access public`。版本号走 semver，破坏性改动升主版本。

   如果用的是 granular token（只允许暂存），会被拒为 `E_STAGE_REQUIRED`，改走两步：

   ```powershell
   npm stage publish                 # 提交到暂存区，拿到 stage-id
   npm stage list                   # 看到 status: validated 再批准
   npm stage approve <stage-id>      # 需要人工过 2FA（网页确认）
   ```

   暂存 → 人工批准是 npm 的设计：机器提交、人确认，token 泄露也发不出正式版本。
   批准后 `latest` 自动指向新版本，通常十几秒内可从 registry 拉到。

5. **兼容性**：宿主 API 会演进（本插件按 0.2.1-rc.3 的 `dsh-tools` 开发）。发布前把
   `dependencies` 里的 `@deepseek-ai/dsh-tools` 与 `peerDependencies` 的 cordis 范围对齐
   目标运行时；跨大版本时最好发两个版本而不是硬兼容。
6. **安装**：用户 `dsh plugin --profile <name> add <包名>` 后重启；也可以在 Plugins 面板里装。

本地想先验证发布形态，可以 `npm pack` 后用 `dsh plugin add file:<tarball>` 装一遍——
它会走和 npm 安装完全相同的 pnpm 路径。

## 已知限制

- 原生右侧栏的标签类型没有图标位，只有 better-sidebar 的标签能带图标。
- 只支持 Gradle 工程；HMCL 实例库里的整合包还不能直接起（见 AGENTS.md 的 M6）。
- 状态文件放在 `~/.dsh/mc-dev-starter/`，多个 profile 共用一份；日志标签按工程过滤，不影响使用。
- Windows 上第一次构建会下载 Gradle 与依赖，可能要几分钟；之后有 daemon 会快很多。

## License

MIT
