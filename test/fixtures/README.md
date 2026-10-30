# 测试 fixture：把这个目录当成 mock 的根

这是识别引擎的回归素材。每个子目录代表一种真实工程形态：

- `fabric/`：fabric-loom + runs 块 + 占位符化的 fabric.mod.json
- `neoforge/`：net.neoforged.moddev + 四个 run 配置 + templates 里的 neoforge.mods.toml
- `architectury/`：settings include 三个模块 + architectury 平台声明
- `unknown/`：纯 Gradle，没有任何 loader 特征 → 必须报 unknown
- `build/decoy/`、`reference/other/`：干扰项，扫描必须剪掉

断言见 `test/detect.test.js` 与 `test/scanner.test.js`。
