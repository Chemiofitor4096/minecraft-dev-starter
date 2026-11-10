/**
 * 客户端文案：zh / en 两份扁平字典 + 取词函数。
 *
 * 语言顺序：
 *   1. 宿主 locale 服务的当前语言（`ctx.locale`）；
 *   2. 宿主没提供 locale 服务时看 `navigator.language`；
 *   3. 都不是就用 zh。
 *
 * `zh` 是 key 集合的基准，`en` 必须与之逐键对齐（由 `test/messages.test.js` 守护）；
 * 组件里不允许再写中文界面字面量。语言切换时的重绘由 `useLocale()`（useLocale.js）负责——
 * `t()` 只在调用时读语言，没人重绘就还是旧文案。
 *
 * @module minecraft-dev-starter/client/messages
 */

/** 向宿主 locale 注册时用的命名空间。 */
export const LOCALE_NS = 'minecraft-dev-starter'

/** 中文词典（key 集合的基准）。 */
export const zh = {
  'tab.logs': '运行日志',

  'capsule.noProject': '未检测到 MC 工程',
  'capsule.noProjects': '未发现 MC 工程',
  'capsule.noTarget': '无可运行目标',
  'capsule.noProjectTitle': '没有识别到 MC 工程\n{root}',
  'capsule.title': '{project}\n{root}\n{target}',
  'capsule.start': '启动 {target}',
  'capsule.stop': '停止 {target}',

  'common.noTarget': '没有可运行目标',
  'common.unverified': '未验证',
  'common.listSeparator': '，',

  'status.starting': '启动中',
  'status.running': '运行中',
  'status.oneshotRunning': '执行中',
  'status.unknown': '状态未知',
  'status.passed': '通过',
  'status.passedDone': '已通过',
  'status.failed': '失败',
  'status.stopped': '已停止',
  'status.exited': '已退出',
  'status.exitedCode': '已退出({code})',
  'status.notStarted': '未启动',
  'status.noVerdict': '无结论',

  'loader.unknown': '未识别',
  'kind.mod': '模组',
  'kind.serverPlugin': '服务端插件',
  'kind.multiLoader': '多平台',
  'kind.unknown': '未知',
  'jdk.majors.none': '未发现',

  'flyout.scanning': '扫描中…',
  'flyout.rescan': '重新扫描工作区',
  'flyout.projectCount': '{count} 个工程',
  'flyout.scanningHint': '正在扫描工作区…',
  'flyout.noGradleProjects': '没有找到 Gradle 工程',
  'flyout.search.placeholder': '按名字、loader 或路径过滤',
  'flyout.group.runnable': '可运行',
  'flyout.group.others': '其他',
  'flyout.group.othersTitle': '识别不出 loader 或没有可运行目标',
  'flyout.noMatches': '没有匹配的工程',
  'flyout.targets': '运行目标',
  'flyout.details': '详情',
  'flyout.targetsEmpty': '没有找到可运行目标',
  'flyout.guessedTitle': '按 loader 惯例推测，尚未验证',

  'detail.status.idle': '未运行',
  'detail.status.noWrapper': '无 gradle wrapper',
  'detail.noProject': '当前工作区没有识别到模组工程',
  'detail.noRunRecord': '这个工程还没有运行记录',
  'detail.section.run': '运行',
  'detail.section.buildEnv': '构建环境',
  'detail.gradleRoot': 'Gradle 根 {root}',

  'detail.deps.title': '依赖',
  'detail.deps.info': '构建脚本与元数据里声明的依赖，用来核对是否加进去了；有 IDE 同步结果时，每行会标出上次解析到的版本。Gradle 解析后的传递依赖不在这里。',
  'detail.deps.empty': '没有读到依赖声明',
  'detail.deps.hidden': '另有 {count} 条未显示',
  'detail.deps.mods': '模组声明：{list}',
  'detail.deps.compare.synced': '对照自 IDE 同步 · {time}',
  'detail.deps.compare.syncedUnknown': '对照自 IDE 同步',
  'detail.deps.compare.syncedTitle': '时间来自 IDE 的同步产物（libraries.xml 或 workspace.xml 的修改时间）；不执行 Gradle。',
  'detail.deps.compare.differs': '实际 {version}',
  'detail.deps.compare.differsTitle': '声明 {declared}（版本不同不一定是问题：可能是动态版本，或被别的依赖抬高）',
  'detail.deps.compare.unresolved': '未解析',
  'detail.deps.compare.unresolvedTitle': 'IDE 上次同步里没有这条，可能没同步、也可能被排除',

  'detail.evidence.title': '证据',
  'detail.evidence.info': '识别结论的依据；面板上每个判断都能在这里找到出处。',
  'detail.evidence.empty': '没有证据',

  'detail.diagnostics.title': '诊断',
  'detail.diagnostics.info': '识别引擎读到的原始结构：模块与目标表、IDE 工程模型、可信度。排查"为什么判成这样"时看这里。',
  'detail.table.module': '模块',
  'detail.table.platform': '平台',
  'detail.table.task': '任务',

  'detail.idea.jdk': '工程 JDK',
  'detail.idea.mcVersion': 'MC 版本',
  'detail.idea.java': 'languageLevel {level} · 字节码 {bytecode}',
  'detail.idea.modules': '模块',
  'detail.idea.modulesValue': '{count} 个（{imls} 个 iml）',
  'detail.idea.runConfigs': '运行配置',
  'detail.idea.count': '{count} 个',
  'detail.idea.libraries': '库表',
  'detail.idea.dir': '目录',
  'detail.confidence': '识别可信度 {percent}%',
  'detail.rescan': '重新扫描',

  'detail.target.option': '{label} · {taskPath}',
  'detail.target.optionGuessed': '{label} · {taskPath}（未验证）',
  'detail.target.locked': '有实例在跑时不能换目标',
  'detail.target.choose': '选择目标',

  'detail.jdk.auto': '自动',
  'detail.jdk.autoVersion': '自动（按 MC 版本选 {version}）',
  'detail.jdk.stale': '已失效 — {home}',
  'detail.jdk.addTitle': '添加 JDK 根目录（含 release 文件）',
  'detail.jdk.placeholder': 'JDK 根目录，例如 C:\\Program Files\\Java\\jdk-21',
  'detail.jdk.join': '加入',
  'detail.jdk.unknown': 'JDK 未知',
  'detail.jdk.requiredNotFound': 'JDK 需 {version} · 未找到',
  'detail.jdk.selected': 'JDK 已选',
  'detail.jdk.selectedExact': 'JDK {version} · 已选',
  'detail.jdk.selectedMismatch': 'JDK {version} · 不完全匹配',
  'detail.jdk.summaryNone': '没有可用的 JDK：装一个，或把路径加进来',
  'detail.jdk.summaryOverride': '生效：{home}（手动指定）',
  'detail.jdk.summaryConfigured': '生效：{home}（来自 gradle.properties）',
  'detail.jdk.summaryAuto': '生效：{home}（自动）',
  'detail.jdk.summaryAutoMismatch': '生效：{home}（自动），大版本不完全匹配',

  'detail.libraries.external': '外部存储',
  'detail.libraries.local': '，{count} 条本地 remap',
  'detail.libraries.summary': '{where} · {count} 条{local}',

  'detail.lastRun': '上次',
  'detail.lastRun.duration': '运行 {duration}',

  'action.start': '启动',
  'action.stop': '停止',
  'action.log': '日志',
  'action.add': '添加',
  'action.cancel': '取消',

  'log.empty': '还没有运行记录。用标题栏胶囊的 ▶ 启动一次。',
  'log.follow': '跟随',
  'log.levelAria': '日志级别',
  'log.hidden': '已隐藏 {count} 行',
  'log.loadingLines': '正在读取日志…',
  'log.noOutput': '（还没有输出）',
  'log.noFilteredOutput': '（当前过滤条件下没有输出，共 {count} 行）',
  'log.refresh': '刷新实例列表',
  'log.loading': '加载中…',
  'log.filter.all': '全部',

  'duration.seconds': '{n} 秒',
  'duration.minutes': '{minutes} 分 {seconds} 秒',
  'time.secondsAgo': '{n} 秒前',
  'time.minutesAgo': '{n} 分钟前',
  'time.hoursAgo': '{n} 小时前',

  'error.httpNotJson': 'HTTP {status}：返回不是 JSON',
}

/**
 * 英文词典。
 *
 * 写的时候按 **300px 侧栏** 的宽度取舍：折叠标题、胶囊、按钮这些一行放不下的，
 * 宁可缩成 Not running / Build / Target 也不改布局。完整说法放 tooltip（也在这份词典里）。
 *
 * 路径、loader 名、Gradle 任务路径不翻译——它们本来就该原样显示。
 * key 集合与中文侧一致，值里不许留中文，都由测试守护。
 */
export const en = {
  'tab.logs': 'Logs',

  'capsule.noProject': 'No MC project',
  'capsule.noProjects': 'No MC projects',
  'capsule.noTarget': 'No target',
  'capsule.noProjectTitle': 'No MC project detected\n{root}',
  'capsule.title': '{project}\n{root}\n{target}',
  'capsule.start': 'Start {target}',
  'capsule.stop': 'Stop {target}',

  'common.noTarget': 'No runnable target',
  'common.unverified': 'Unverified',
  'common.listSeparator': ', ',

  'status.starting': 'Starting',
  'status.running': 'Running',
  'status.oneshotRunning': 'Running',
  'status.unknown': 'Unknown',
  'status.passed': 'Passed',
  'status.passedDone': 'Passed',
  'status.failed': 'Failed',
  'status.stopped': 'Stopped',
  'status.exited': 'Exited',
  'status.exitedCode': 'Exited ({code})',
  'status.notStarted': 'Not started',
  'status.noVerdict': 'No verdict',

  'loader.unknown': 'Unknown',
  'kind.mod': 'Mod',
  'kind.serverPlugin': 'Server plugin',
  'kind.multiLoader': 'Multi-loader',
  'kind.unknown': 'Unknown',
  'jdk.majors.none': 'None',

  'flyout.scanning': 'Scanning…',
  'flyout.rescan': 'Rescan workspace',
  'flyout.projectCount': '{count} projects',
  'flyout.scanningHint': 'Scanning workspace…',
  'flyout.noGradleProjects': 'No Gradle projects found',
  'flyout.search.placeholder': 'Filter by name, loader or path',
  'flyout.group.runnable': 'Runnable',
  'flyout.group.others': 'Others',
  'flyout.group.othersTitle': 'No loader detected, or no runnable target',
  'flyout.noMatches': 'No matching projects',
  'flyout.targets': 'Target',
  'flyout.details': 'Details',
  'flyout.targetsEmpty': 'No runnable targets',
  'flyout.guessedTitle': 'Guessed from loader convention, not verified',

  'detail.status.idle': 'Not running',
  'detail.status.noWrapper': 'No gradle wrapper',
  'detail.noProject': 'No mod project in this workspace',
  'detail.noRunRecord': 'No runs yet for this project',
  'detail.section.run': 'Run',
  'detail.section.buildEnv': 'Build',
  'detail.gradleRoot': 'Gradle root {root}',

  'detail.deps.title': 'Dependencies',
  'detail.deps.info': 'Dependencies declared in build scripts and metadata, shown so you can confirm they were added. When the IDE has synced, each row also shows the version it last resolved to. Gradle\'s resolved transitive graph is not listed here.',
  'detail.deps.empty': 'No dependency declarations found',
  'detail.deps.hidden': '{count} more not shown',
  'detail.deps.mods': 'Mod deps: {list}',
  'detail.deps.compare.synced': 'Compared with IDE sync · {time}',
  'detail.deps.compare.syncedUnknown': 'Compared with IDE sync',
  'detail.deps.compare.syncedTitle': 'Time comes from the IDE\'s sync output (mtime of libraries.xml or workspace.xml); Gradle is not run.',
  'detail.deps.compare.differs': 'Actual {version}',
  'detail.deps.compare.differsTitle': 'Declared {declared} (a different version is not necessarily a problem: it may be a dynamic version, or raised by another dependency)',
  'detail.deps.compare.unresolved': 'Unresolved',
  'detail.deps.compare.unresolvedTitle': 'Not in the IDE\'s last sync; it may not have synced, or this entry may be excluded',

  'detail.evidence.title': 'Evidence',
  'detail.evidence.info': 'What each detection is based on; every judgement on this panel can be traced here.',
  'detail.evidence.empty': 'No evidence',

  'detail.diagnostics.title': 'Diagnostics',
  'detail.diagnostics.info': 'Raw structures read by the detector: module and target tables, IDE project model, confidence. Look here to find out why something was judged the way it was.',
  'detail.table.module': 'Module',
  'detail.table.platform': 'Platform',
  'detail.table.task': 'Task',

  'detail.idea.jdk': 'Project JDK',
  'detail.idea.mcVersion': 'MC version',
  'detail.idea.java': 'languageLevel {level} · bytecode {bytecode}',
  'detail.idea.modules': 'Modules',
  'detail.idea.modulesValue': '{count} ({imls} iml)',
  'detail.idea.runConfigs': 'Run configs',
  'detail.idea.count': '{count}',
  'detail.idea.libraries': 'Libraries',
  'detail.idea.dir': 'Directory',
  'detail.confidence': 'Confidence {percent}%',
  'detail.rescan': 'Rescan',

  'detail.target.option': '{label} · {taskPath}',
  'detail.target.optionGuessed': '{label} · {taskPath} (unverified)',
  'detail.target.locked': 'Can\'t switch targets while an instance is running',
  'detail.target.choose': 'Choose target',

  'detail.jdk.auto': 'Auto',
  'detail.jdk.autoVersion': 'Auto (by MC version {version})',
  'detail.jdk.stale': 'Stale — {home}',
  'detail.jdk.addTitle': 'Add a JDK home directory (the one containing the release file)',
  'detail.jdk.placeholder': 'JDK home, e.g. C:\\Program Files\\Java\\jdk-21',
  'detail.jdk.join': 'Add',
  'detail.jdk.unknown': 'JDK unknown',
  'detail.jdk.requiredNotFound': 'Needs JDK {version} · none found',
  'detail.jdk.selected': 'JDK selected',
  'detail.jdk.selectedExact': 'JDK {version} · selected',
  'detail.jdk.selectedMismatch': 'JDK {version} · not an exact match',
  'detail.jdk.summaryNone': 'No JDK available: install one, or add a path',
  'detail.jdk.summaryOverride': 'Using {home} (manual)',
  'detail.jdk.summaryConfigured': 'Using {home} (from gradle.properties)',
  'detail.jdk.summaryAuto': 'Using {home} (auto)',
  'detail.jdk.summaryAutoMismatch': 'Using {home} (auto), major version differs',

  'detail.libraries.external': 'External storage',
  'detail.libraries.local': ', {count} local remap',
  'detail.libraries.summary': '{where} · {count} entries{local}',

  'detail.lastRun': 'Last',
  'detail.lastRun.duration': 'ran {duration}',

  'action.start': 'Start',
  'action.stop': 'Stop',
  'action.log': 'Logs',
  'action.add': 'Add',
  'action.cancel': 'Cancel',

  'log.empty': 'No runs yet. Start one with ▶ in the title bar capsule.',
  'log.follow': 'Follow',
  'log.levelAria': 'Log level',
  'log.hidden': '{count} hidden',
  'log.loadingLines': 'Reading log…',
  'log.noOutput': '(no output yet)',
  'log.noFilteredOutput': '(nothing matches the current filter; {count} lines total)',
  'log.refresh': 'Refresh instance list',
  'log.loading': 'Loading…',
  'log.filter.all': 'All',

  'duration.seconds': '{n}s',
  'duration.minutes': '{minutes}m {seconds}s',
  'time.secondsAgo': '{n}s ago',
  'time.minutesAgo': '{n} min ago',
  'time.hoursAgo': '{n} hours ago',

  'error.httpNotJson': 'HTTP {status}: response was not JSON',
}

/**
 * 宿主 locale 服务（attach 后才有）；t 按它读当前语言。
 */
let localeService

/**
 * 给 React 用的稳定订阅源：语言变化时通知重绘。
 *
 * 对象是模块级常量——`useSyncExternalStore` 的 subscribe/getSnapshot 必须保持引用稳定，
 * 每次渲染新建一个对象会让 React 不断重订阅。内层每次调用时现读 `localeService`，
 * 所以后挂上的 locale 服务也能生效。
 */
const localeRevisionSource = {
  /**
   * @param {() => void} callback
   * @returns {() => void}
   */
  subscribe(callback) {
    const service = localeService
    if (service === undefined || typeof service.subscribe !== 'function') return () => {}
    try {
      const dispose = service.subscribe(callback)
      return typeof dispose === 'function' ? dispose : () => {}
    } catch {
      return () => {}
    }
  },
  /** @returns {string} */
  snapshot() {
    try {
      return String(localeService?.getSnapshot?.().active ?? 'none')
    } catch {
      return 'none'
    }
  },
}

/**
 * 供 `useLocale()` 订阅的稳定源。
 * @returns {{ subscribe: (callback: () => void) => () => void, snapshot: () => string }}
 */
export function localeSource() {
  return localeRevisionSource
}

/** `ctx.locale.bind(NS)` 返回的翻译函数；没有宿主 locale 时为 undefined。 */
let translate

/**
 * 接上宿主的 locale 服务：注册词典、拿 bind 出来的 t。
 *
 * 注册失败绝不能拦住插件加载：这里每步都单独兜住，失败就退回本地词典。
 * 同一个 ctx 重复调用是安全的——注册抛错（例如热重载重复注册）也会继续 bind。
 *
 * @param {any} ctx
 * @returns {boolean} 是否拿到了 locale 服务
 */
export function attachLocale(ctx) {
  let service
  try {
    service = ctx?.locale
  } catch {
    service = undefined
  }
  if (service === undefined || service === null) {
    try {
      service = typeof ctx?.get === 'function' ? ctx.get('locale', false) : undefined
    } catch {
      service = undefined
    }
  }
  if (service === undefined || service === null) return false

  localeService = service
  try {
    if (typeof service.register === 'function') service.register(LOCALE_NS, { zh, en })
  } catch {
    /* 注册失败不影响加载；t 会用本地词典兜底 */
  }
  try {
    translate = typeof service.bind === 'function' ? service.bind(LOCALE_NS) : undefined
  } catch {
    translate = undefined
  }
  return true
}

/**
 * 当前词典语言：'zh' 或 'en'。
 *
 * 宿主 locale 的 active 优先；没有宿主的浏览器看 navigator.language；
 * 最后回退 zh。Node 里没有 window，固定回退 zh，避免测试跟着机器语言漂。
 *
 * @returns {'zh' | 'en'}
 */
export function activeLanguage() {
  try {
    const active = localeService?.getSnapshot?.().active
    if (typeof active === 'string' && active !== '') return normalizeLanguage(active)
  } catch {
    /* 服务异常就继续往下回退 */
  }
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    return normalizeLanguage(String(navigator.language ?? ''))
  }
  return 'zh'
}

/**
 * @param {string} language
 * @returns {'zh' | 'en'}
 */
function normalizeLanguage(language) {
  const value = language.toLowerCase()
  if (value.startsWith('zh')) return 'zh'
  if (value.startsWith('en')) return 'en'
  return 'zh'
}

/**
 * 取当前语言的词典。
 * @returns {Record<string, string>}
 */
export function dictionary() {
  return activeLanguage() === 'en' ? en : zh
}

/**
 * 取词：优先宿主翻译，缺失时退回本地词典。
 *
 * @param {string} key
 * @param {Record<string, string | number | undefined | null>} [params]
 * @returns {string}
 */
export function t(key, params) {
  let text
  if (translate !== undefined) {
    try {
      const translated = translate(key, params)
      if (typeof translated === 'string' && translated !== '' && translated !== key) text = translated
    } catch {
      text = undefined
    }
  }
  if (text === undefined) {
    const dict = dictionary()
    text = dict[key] ?? zh[key] ?? key
  }
  return interpolate(text, params)
}

/**
 * 把 `{name}` 占位符换成参数值；没给的占位符原样保留。
 *
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
