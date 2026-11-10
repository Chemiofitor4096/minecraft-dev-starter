/**
 * 宿主侧文案：zh / en 两份扁平字典 + 取词函数。
 *
 * 客户端那份（`src/client/messages.js`）管界面骨架；这一份管**识别与运行产生的内容**——
 * 证据、警告、冲突、归因、错误。它们出现在详情页与日志页，所以同样要跟着语言走。
 *
 * 语言从哪来：宿主插件的 ctx 里**没有** locale 服务（那是网页客户端那一层的），
 * 所以由客户端每次请求带上 `lang`，HTTP 入口收到后调 `setLanguage`。
 * 拿不到就用 zh——与 0.1.12 的行为一致。
 *
 * 语言是进程级的：DSH 同时只有一个界面语言，并发请求不会各说各话。
 *
 * @module minecraft-dev-starter/lib/messages
 */

/** 中文词典（key 集合的基准，也是 0.1.12 原文案的出处）。 */
export const zh = {
  'list.separator': '、',
  'list.clauseSeparator': '；',

  'evidence.buildScript': 'Gradle 构建脚本（{dsl}）',
  'evidence.parentWrapperFile': '父工程 gradle/wrapper/gradle-wrapper.properties',
  'evidence.wrapperInherited': 'Gradle {version}（继承自父工程）',
  'evidence.subproject': '子模块工程：父工程 {parent}，任务前缀 {prefix}',
  'evidence.ideaModel': 'IDEA 工程模型：{summary}',
  'evidence.ideaGradleRoot': 'Gradle 工程根是 {root}',
  'evidence.ideaLibraries': 'Gradle 同步的库表：{count} 条',
  'evidence.ideaLibrariesLocal': '，其中 {count} 条是工程内 remap 产物',
  'evidence.ideaOnlyModules': '{count} 个模块只在 IDE 的 Gradle 模块清单里：{list}',
  'evidence.subprojectFile': '子模块构建脚本',
  'evidence.metadata': '{kind} 元数据',
  'evidence.plugin': '插件 {id}',
  'evidence.pluginSubmodule': '插件 {id}（只在子模块声明）',
  'evidence.loaderFromFacet': '构建脚本没读出 loader，按 minecraft facet 平台 {platforms} 判定',
  'evidence.metadataOnly': '只有 {kind} 元数据，没有构建脚本特征',
  'evidence.mcVersionFromIdea': '构建脚本没读出 MC 版本，按 IDE 工程模型里的 {version} 判定',
  'evidence.aggregatorName': '根目录没有元数据（是多模块聚合工程），工程名取 {source}；各子模块的 mods.toml 属于模块本身',
  'evidence.aggregatorNameDir': '目录名',
  'evidence.aggregatorNameRoot': 'rootProject.name「{name}」',
  'evidence.moduleFacet': '{module} 的 minecraft facet 平台是 {platform}',
  'evidence.toolchainFromIdea': '构建脚本没写 toolchain，按 IDE 的 Java {version} 定需求',
  'evidence.projectJdk': '工程 JDK {name}',
  'evidence.projectJdkLevel': '工程 JDK {name} · languageLevel {level}',
  'evidence.runConfigTarget': '{module} 有过运行配置「{name}」，对应 {task}',

  'warning.noWrapper': '没有 gradle wrapper，需要本机装 Gradle 才能构建',
  'warning.guessedTargets': '构建脚本与 IDE 里都没读到运行目标，目标是按 loader 惯例推测的（未验证）',
  'warning.jdkOverrideNotDetected': '手动指定的 JDK 不在已探测列表里：{home}（启动时仍会使用它）',
  'warning.jdkNotFound': '没找到可用的 JDK',
  'warning.jdkNotFoundVersion': '没找到可用的 JDK {version}',
  'warning.jdkFallback': 'JDK {version} 未找到，退而使用 {home}',
  'warning.configurationCache': '已开启 org.gradle.configuration-cache，与部分 mod 插件组合可能不兼容',
  'warning.conflicts': '识别到矛盾：{list}',
  'warning.unresolvedPlaceholders': '元数据里有未解析的占位符：{list}',

  'conflict.loaderMetadata': '构建脚本表明 {loader}，元数据却是 {metadata}',

  'idea.modules': '{count} 个模块',
  'idea.runConfigs': '{count} 个运行配置',

  'java.gradleTooOld': 'wrapper 是 Gradle {wrapper}，JDK {major} 需要 Gradle {floor} 以上',

  'diagnosis.DEPENDENCY_UNRESOLVED.hint': '依赖解析失败：检查网络或 Gradle 离线缓存',
  'diagnosis.DEPENDENCY_UNRESOLVED.suggestion': '确认仓库可访问（代理/镜像），或先跑一次能联网的构建再重试',
  'diagnosis.JDK_VERSION_MISMATCH.hint': 'JDK 版本不匹配：换成工程要求的 JDK',
  'diagnosis.JDK_VERSION_MISMATCH.suggestion': '检查面板里的「JDK 需求」与已选 JDK，或在 gradle.properties 设 org.gradle.java.home',
  'diagnosis.JDK_TOOLCHAIN_MISSING.hint': '缺少所需版本的 JDK：装一个或用已有版本覆盖',
  'diagnosis.JDK_TOOLCHAIN_MISSING.suggestion': '安装对应大版本的 JDK，或用 toolchain 覆盖指向已装版本',
  'diagnosis.PORT_IN_USE.hint': '端口被占用：先关掉占用的进程',
  'diagnosis.PORT_IN_USE.suggestion': '结束占用 25565 端口的进程，或在 server.properties 改端口',
  'diagnosis.MIXIN_APPLY_FAILED.hint': 'Mixin 注入失败：看日志里点名的 mixin 配置',
  'diagnosis.MIXIN_APPLY_FAILED.suggestion': '核对日志中点名的 mixin 类与 JSON 配置是否匹配当前游戏版本',
  'diagnosis.OUT_OF_MEMORY.hint': '内存不足：调 gradle.properties 的 org.gradle.jvmargs',
  'diagnosis.OUT_OF_MEMORY.suggestion': '提高 org.gradle.jvmargs（例如 -Xmx4G），并确认机器可用内存',
  'diagnosis.GAME_CRASH_REPORT.hint': '游戏生成了 crash report：工程目录下的 crash-reports/',
  'diagnosis.GAME_CRASH_REPORT.suggestion': '打开最新 crash-report，第一条 Caused by 通常是根因',
  'diagnosis.GRADLE_BUILD_FAILED.hint': 'Gradle 构建失败：往上翻第一条 error',
  'diagnosis.GRADLE_BUILD_FAILED.suggestion': '从 BUILD FAILED 往上找第一条 "What went wrong"',

  'error.noWorkspace': '找不到工作区目录：请求里没带 root，宿主也没有活跃会话',
  'error.badJdkDir': '这个目录不像 JDK：{home}',
  'error.missingJdkDir': '缺少 JDK 目录',
  'error.badJdkDirDetail': '这个目录不像 JDK（没有 release 文件，目录名里也没有版本号）：{path}',
  'error.outsideWorkspace': '工程不在当前工作区内：{root}',
  'error.missingTaskPath': '缺少 taskPath',
  'error.unknownTarget': '工程里没有这个可运行目标：{taskPath}',
  'error.missingLaunchId': '缺少实例 id',
  'error.unknownTask': '不认识的 Gradle 任务：{task}',
  'error.alreadyRunning': '{root} 已有运行中的实例：{task}',
  'error.spawnFailed': '启动失败：{message}',
  'error.unknownLaunch': '没有这个实例：{id}',

  'summary.notStarted': '进程没能启动',
  'summary.exitCode': '退出码 {code}',
}

/** 英文词典。与 zh 同 key；值里不许留中文，由测试守护。 */
export const en = {
  'list.separator': ', ',
  'list.clauseSeparator': '; ',

  'evidence.buildScript': 'Gradle build script ({dsl})',
  'evidence.parentWrapperFile': 'parent gradle/wrapper/gradle-wrapper.properties',
  'evidence.wrapperInherited': 'Gradle {version} (inherited from the parent project)',
  'evidence.subproject': 'Subproject: parent {parent}, task prefix {prefix}',
  'evidence.ideaModel': 'IDEA project model: {summary}',
  'evidence.ideaGradleRoot': 'Gradle project root is {root}',
  'evidence.ideaLibraries': 'Library table from Gradle sync: {count} entries',
  'evidence.ideaLibrariesLocal': ', {count} of them in-project remap artifacts',
  'evidence.ideaOnlyModules': '{count} modules exist only in the IDE\'s Gradle module list: {list}',
  'evidence.subprojectFile': 'subproject build script',
  'evidence.metadata': '{kind} metadata',
  'evidence.plugin': 'Plugin {id}',
  'evidence.pluginSubmodule': 'Plugin {id} (declared only in the subproject)',
  'evidence.loaderFromFacet': 'No loader in the build script; decided by the minecraft facet platform {platforms}',
  'evidence.metadataOnly': 'Only {kind} metadata, no build-script signal',
  'evidence.mcVersionFromIdea': 'No MC version in the build script; using {version} from the IDE project model',
  'evidence.aggregatorName': 'No metadata at the root (multi-module aggregate project), so the name comes from {source}; each submodule\'s mods.toml belongs to that module',
  'evidence.aggregatorNameDir': 'the directory name',
  'evidence.aggregatorNameRoot': 'rootProject.name "{name}"',
  'evidence.moduleFacet': '{module}: minecraft facet platform is {platform}',
  'evidence.toolchainFromIdea': 'No toolchain in the build script; the requirement comes from the IDE\'s Java {version}',
  'evidence.projectJdk': 'Project JDK {name}',
  'evidence.projectJdkLevel': 'Project JDK {name} · languageLevel {level}',
  'evidence.runConfigTarget': '{module} has run configuration "{name}", mapped to {task}',

  'warning.noWrapper': 'No gradle wrapper; a local Gradle install is required to build',
  'warning.guessedTargets': 'No run target in the build script or the IDE; targets are guessed from loader convention (unverified)',
  'warning.jdkOverrideNotDetected': 'The manually set JDK is not in the detected list: {home} (it is still used to launch)',
  'warning.jdkNotFound': 'No usable JDK found',
  'warning.jdkNotFoundVersion': 'No usable JDK {version} found',
  'warning.jdkFallback': 'JDK {version} not found; falling back to {home}',
  'warning.configurationCache': 'org.gradle.configuration-cache is enabled; it can be incompatible with some mod plugin combinations',
  'warning.conflicts': 'Conflicts detected: {list}',
  'warning.unresolvedPlaceholders': 'Unresolved placeholders in metadata: {list}',

  'conflict.loaderMetadata': 'The build script says {loader}, but the metadata says {metadata}',

  'idea.modules': '{count} modules',
  'idea.runConfigs': '{count} run configurations',

  'java.gradleTooOld': 'The wrapper is Gradle {wrapper}, but JDK {major} needs Gradle {floor} or newer',

  'diagnosis.DEPENDENCY_UNRESOLVED.hint': 'Dependency resolution failed: check the network or the Gradle offline cache',
  'diagnosis.DEPENDENCY_UNRESOLVED.suggestion': 'Make sure the repositories are reachable (proxy/mirror), or run a networked build once and retry',
  'diagnosis.JDK_VERSION_MISMATCH.hint': 'JDK version mismatch: switch to the JDK the project requires',
  'diagnosis.JDK_VERSION_MISMATCH.suggestion': 'Check the JDK requirement and the selected JDK in the panel, or set org.gradle.java.home in gradle.properties',
  'diagnosis.JDK_TOOLCHAIN_MISSING.hint': 'The required JDK is missing: install one, or override with an installed version',
  'diagnosis.JDK_TOOLCHAIN_MISSING.suggestion': 'Install that major version, or point the toolchain override at an installed JDK',
  'diagnosis.PORT_IN_USE.hint': 'Port already in use: stop the process holding it',
  'diagnosis.PORT_IN_USE.suggestion': 'Kill the process on port 25565, or change the port in server.properties',
  'diagnosis.MIXIN_APPLY_FAILED.hint': 'Mixin injection failed: look at the mixin config named in the log',
  'diagnosis.MIXIN_APPLY_FAILED.suggestion': 'Check that the mixin class and JSON config named in the log match the current game version',
  'diagnosis.OUT_OF_MEMORY.hint': 'Out of memory: adjust org.gradle.jvmargs in gradle.properties',
  'diagnosis.OUT_OF_MEMORY.suggestion': 'Raise org.gradle.jvmargs (e.g. -Xmx4G) and check the machine has that much memory',
  'diagnosis.GAME_CRASH_REPORT.hint': 'The game wrote a crash report: crash-reports/ in the project directory',
  'diagnosis.GAME_CRASH_REPORT.suggestion': 'Open the newest crash report; the first "Caused by" is usually the root cause',
  'diagnosis.GRADLE_BUILD_FAILED.hint': 'Gradle build failed: scroll up to the first error',
  'diagnosis.GRADLE_BUILD_FAILED.suggestion': 'Work up from BUILD FAILED to the first "What went wrong"',

  'error.noWorkspace': 'Cannot find a workspace directory: the request has no root and the host has no active session',
  'error.badJdkDir': 'This directory does not look like a JDK: {home}',
  'error.missingJdkDir': 'Missing JDK directory',
  'error.badJdkDirDetail': 'This directory does not look like a JDK (no release file, and no version in the directory name): {path}',
  'error.outsideWorkspace': 'The project is outside the current workspace: {root}',
  'error.missingTaskPath': 'Missing taskPath',
  'error.unknownTarget': 'The project has no such run target: {taskPath}',
  'error.missingLaunchId': 'Missing instance id',
  'error.unknownTask': 'Unknown Gradle task: {task}',
  'error.alreadyRunning': '{root} already has a running instance: {task}',
  'error.spawnFailed': 'Failed to start: {message}',
  'error.unknownLaunch': 'No such instance: {id}',

  'summary.notStarted': 'The process failed to start',
  'summary.exitCode': 'exit code {code}',
}

/** 当前语言：'zh' | 'en'。默认 zh，与 0.1.12 一致。 */
let language = 'zh'

/**
 * @param {unknown} value
 * @returns {'zh' | 'en'}
 */
export function normalizeLanguage(value) {
  const text = typeof value === 'string' ? value.toLowerCase() : ''
  if (text.startsWith('en')) return 'en'
  return 'zh'
}

/**
 * 设置进程语言。传 undefined / 认不出的值都退回 zh。
 * @param {unknown} value
 * @returns {'zh' | 'en'}
 */
export function setLanguage(value) {
  language = normalizeLanguage(value)
  return language
}

/** @returns {'zh' | 'en'} */
export function currentLanguage() {
  return language
}

/** @returns {Record<string, string>} */
export function dictionary() {
  return language === 'en' ? en : zh
}

/**
 * 取词。
 * @param {string} key
 * @param {Record<string, string | number | undefined | null>} [params]
 * @returns {string}
 */
export function t(key, params) {
  const text = dictionary()[key] ?? zh[key] ?? key
  return interpolate(text, params)
}

/**
 * 把 `{name}` 占位符换成参数值；没给的占位符原样保留。
 * @param {string} text
 * @param {Record<string, string | number | undefined | null>} [params]
 * @returns {string}
 */
export function interpolate(text, params) {
  if (typeof text !== 'string') return ''
  if (params === undefined || params === null) return text
  let out = text
  for (const [name, value] of Object.entries(params)) {
    const replacement = value === undefined || value === null ? '' : String(value)
    out = out.split(`{${name}}`).join(replacement)
  }
  return out
}
