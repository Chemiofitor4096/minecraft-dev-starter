<p align="center">
  <img src="https://raw.githubusercontent.com/Chemiofitor4096/minecraft-dev-starter/main/assets/banner.png" alt="minecraft-dev-starter" width="100%">
</p>

# minecraft-dev-starter

为 DeepSeek Harness 添加 Minecraft 模组开发运行控件。

插件识别当前工作区中的 Minecraft 模组与插件工程，在会话标题栏提供运行目标的选择与启动、停止操作，并将运行日志输出到侧边栏标签页。

## 功能

- **工程识别**：支持 Fabric、Forge、NeoForge、Architectury、Paper 与 Spigot，覆盖 Minecraft 1.7.10 至 26.x。支持单模块、多模块与聚合仓库；loader 声明位于子模块时同样可以识别。
- **运行目标**：从 Gradle 配置中提取 Client、Server、Data、GameTestServer 等任务。按 loader 惯例推测的目标会标记为未验证，不影响选择与启动。
- **托管启动**：通过 Gradle Wrapper 启动任务，依据日志标记判定是否进入运行状态，而非仅依据进程存活。停止时终止 Gradle 及其全部子进程。
- **状态保持**：运行记录持久化到本地。宿主重启后按进程 ID 校验：确认存活则继续跟踪，无法确认则记为未知，不推测退出原因。
- **运行日志**：独立侧边栏标签页，按工程展示启动历史，支持跟随输出。日志按级别着色：WARN 与 ERROR 高亮，堆栈帧与 Gradle 任务行区分显示，时间、线程与 logger 弱化。异常退出时给出可能原因，覆盖依赖解析失败、JDK 版本不匹配、端口占用、认证失败等情况。
- **工作区跟随**：以当前会话的工作目录作为工作区，切换会话时自动重新扫描，无需手动刷新。
- **模型工具**（可选）：提供 `mc_projects`、`mc_launch`、`mc_launch_logs`、`mc_launch_stop` 四个工具，与面板共用同一套服务。
- **扩展集成**：安装 [dsh-better-sidebar](https://github.com/topics/dsh-better-sidebar) 后，面板与日志可在其侧边栏中作为带图标的标签页打开。

## 安装

要求 DSH 桌面版 0.2.1 或更高版本，或对应的 `dsh` CLI。

```powershell
# 从 npm 安装
dsh plugin --profile desktop add minecraft-dev-starter

# 本地仓库（修改后即时生效）
dsh plugin --profile desktop add link:C:/Projects/minecraft-dev-starter

# 使用打包文件
dsh plugin --profile desktop add file:./minecraft-dev-starter-0.1.3.tgz
```

安装完成后需重启 DSH 生效。卸载：

```powershell
dsh plugin --profile desktop remove minecraft-dev-starter
```

`dsh plugin` 是 pnpm 的封装：将插件加入 profile 的依赖，并把声明了 `dsh.bundle` 的包加入 `dsh.profile.bundles` 列表。直接编辑 profile 的 `package.json` 后执行 `pnpm install`，效果相同。

## 使用

1. 打开包含 Minecraft 工程的工作区会话。
2. 标题栏显示当前选中的运行目标。点击目标名称打开浮层，从中选择工程与任务。
3. 点击启动按钮开始构建并运行。启动后自动打开「运行日志」标签页，该行为可通过配置关闭。
4. 运行期间按钮切换为停止；点击后终止 Gradle 及其子进程。

浮层布局随工程数量变化：单工程工作区不显示工程列表，表头直接呈现工程名称、loader 与版本、路径；多工程工作区显示固定高度的列表，切换工程时仅更新下方目标区域，页面不会跳动。

## 配置

在 profile 的 `cordis.patch.yml` 中为该插件条目添加 `config` 字段：

```yaml
- id: mcdev-host
  name: minecraft-dev-starter
  config:
    autoOpenLogTab: true
    logDock: right          # right：DSH 原生右侧栏；bottom：dsh-better-sidebar 的底部工作台
    readyTimeoutMs: 90000
    logRingLines: 2000
```

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `autoOpenLogTab` | boolean | `true` | 启动后自动打开运行日志标签页 |
| `logDock` | `right` \| `bottom` | `right` | 日志打开位置。`bottom` 需要安装 dsh-better-sidebar；未安装时自动回退到右侧栏 |
| `readyTimeoutMs` | number | `90000` | 等待进入运行状态的超时时间；超时不计为失败 |
| `logRingLines` | number | `2000` | 内存中保留的日志行数；磁盘上的日志始终完整 |

`logDock` 只影响「自动打开」与面板里的「打开日志」按钮；无论配置为何，两个标签页都同时存在于原生右侧栏与 better-sidebar 的页签列表中，可随时手动打开。

## 兼容范围

| 平台 | 版本范围 | 说明 |
|---|---|---|
| Fabric | 1.14 – 26.x | loom 提供的 `runClient` 等任务 |
| Forge | 1.7.10 / 1.12.2 / 1.16.5 / 1.20.1 | 包含 legacyforge |
| NeoForge | 1.20.1 – 26.x | moddev 插件 |
| Architectury | 1.16 – 26.x | 按子模块拆分任务 |
| Paper / Spigot | 1.7.10 – 26.x | 服务端插件工程 |

JDK 版本按 Minecraft 版本推断：1.7.10 与 1.12.2 需要 Java 8，1.18 至 1.20.4 需要 Java 17，1.20.5 及以上需要 Java 21，26.x 需要 Java 25。插件将需求与已安装的 JDK 比对，缺失或版本不符时在面板中提示。

## 开发

```powershell
npm install
npm run build        # 构建客户端到 lib/client.js；修改 src/client 后必须执行
npm test             # 59 个测试
npm run build -- --watch
```

仓库结构、已知问题与历次验证结论见 [AGENTS.md](./AGENTS.md)。设计文档：[策划](./doc/策划.md)、[DSH 插件机制调研](./doc/调研-DSH插件机制.md)。

## 发布

DSH 插件以 npm 包形式分发，不需要独立注册流程。

1. **清单**：`package.json` 声明 `dsh.bundle.patch`（指向 `cordis.patch.yml`）；提供浏览器界面时同时声明 `dsh.client.platform`。宿主依据这两项识别插件。
2. **产物**：执行 `npm run build` 生成 `lib/client.js`，并将该文件提交到仓库。运行时直接读取产物，不安装依赖，也不执行构建。
3. **校验**：执行 `npm test`；使用 `npm pack --dry-run` 确认包内容（`files` 字段已限定为 `src`、`lib`、`cordis.patch.yml`、README 与 AGENTS）。
4. **发布**：`npm publish --access public`。若使用仅允许暂存的 granular token，改为以下流程：

   ```powershell
   npm stage publish                 # 提交到暂存区
   npm stage list                   # 等待状态变为 validated
   npm stage approve <stage-id>      # 人工完成 2FA 确认
   ```

   暂存后由人工批准是 npm 的设计：机器提交、人工确认，即使 token 泄露也无法直接发布正式版本。批准后 `latest` 标签自动指向新版本。
5. **兼容性**：宿主 API 会持续演进。发布前将 `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/cordis` 的版本范围对齐目标运行时；跨大版本时应分别发布版本，而非放宽范围强行兼容。
6. **安装**：用户执行 `dsh plugin --profile <name> add <包名>` 后重启，或在 Plugins 面板中安装。

在本地验证发布形态时，可先 `npm pack`，再通过 `dsh plugin add file:<tarball>` 安装；该路径与 npm 安装完全一致。

## 已知限制

- 原生右侧栏的标签类型不提供图标字段，图标仅支持 `dsh-better-sidebar` 中的标签。
- 当前仅支持 Gradle 工程；HMCL 实例库中的整合包尚不支持（见 AGENTS.md 的 M6）。
- 运行状态保存于 `~/.dsh/mc-dev-starter/`，多个 profile 共用同一份记录；日志标签按工程过滤，功能不受影响。
- 在 Windows 上首次构建需要下载 Gradle 与项目依赖，耗时可能达到数分钟；后续构建可使用 Gradle daemon。

## License

MIT
