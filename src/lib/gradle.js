/**
 * Gradle 构建脚本的静态解析。
 *
 * 只做"读得出事实"的解析，不求完整：
 *   - 注释/字符串安全的块提取（`runs { ... }` 的花括号匹配不能数错）
 *   - 插件 id、settings 的 include、run 配置、Java 等级、MC 版本字面量
 *
 * 识别引擎不执行 Gradle：本机实测 `gradlew tasks` 要 6 分半且可能失败，
 * 见 doc/调研-DSH插件机制.md §8.1。
 * @module minecraft-dev-starter/lib/gradle
 */

/**
 * 去掉 Groovy/Kotlin 注释，字符串内容原样保留（替换成等长空白，索引不变）。
 * @param {string} text
 * @returns {string}
 */
export function stripComments(text) {
  let out = ''
  let quote
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (quote !== undefined) {
      out += ch
      if (ch === '\\' && quote !== "'") {
        out += next ?? ''
        i += 1
        continue
      }
      if (ch === quote) quote = undefined
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
      continue
    }

    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' '
        i += 1
      }
      out += '\n'
      continue
    }

    if (ch === '/' && next === '*') {
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' '
        i += 1
      }
      out += '  '
      i += 1
      continue
    }

    out += ch
  }
  return out
}

/**
 * 提取 `name { ... }` 的块内容（花括号配平，已去注释）。
 * @param {string} text 已去注释的脚本
 * @param {string} name 块名，例如 `runs` / `loom`
 * @returns {string[]}
 */
export function findBlocks(text, name) {
  /** @type {string[]} */
  const bodies = []
  const pattern = new RegExp(`(^|[^\\w.])${name}\\s*\\{`, 'g')
  let match
  while ((match = pattern.exec(text)) !== null) {
    const open = text.indexOf('{', match.index + match[0].length - 1)
    if (open < 0) break
    const close = matchBrace(text, open)
    if (close < 0) break
    bodies.push(text.slice(open + 1, close))
    pattern.lastIndex = close + 1
  }
  return bodies
}

/**
 * 从 `{` 的位置找配对的 `}`。
 * @param {string} text
 * @param {number} open
 * @returns {number} 未配对时 -1
 */
function matchBrace(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 收集插件 id：`id 'x'` / `id("x")` / `apply plugin: 'x'`。
 * @param {string} raw 原始脚本
 * @returns {string[]}
 */
export function parsePluginIds(raw) {
  const text = stripComments(raw)
  /** @type {Set<string>} */
  const ids = new Set()
  for (const match of text.matchAll(/\bid\s*\(?\s*["']([\w.\-]+)["']/g)) ids.add(match[1])
  for (const match of text.matchAll(/apply\s+plugin\s*:\s*["']([\w.\-]+)["']/g)) ids.add(match[1])
  for (const match of text.matchAll(/kotlin\(\s*["']([\w.\-]+)["']\s*\)/g)) ids.add(match[1])
  return [...ids]
}

/**
 * settings.gradle(.kts) 里的 include 列表。
 * @param {string} raw
 * @returns {string[]} 形如 `fabric`、`common`（去掉前导冒号）
 */
export function parseSettingsIncludes(raw) {
  const text = stripComments(raw)
  /** @type {string[]} */
  const modules = []
  for (const match of text.matchAll(/include\s*\(([^)]*)\)/g)) {
    pushIncludes(modules, match[1])
  }
  for (const match of text.matchAll(/include\s+((?:["'][^"']+["']\s*,?\s*)+)/g)) {
    pushIncludes(modules, match[1])
  }
  return [...new Set(modules)]
}

/**
 * @param {string[]} modules
 * @param {string} raw
 */
function pushIncludes(modules, raw) {
  for (const match of raw.matchAll(/["']([^"']+)["']/g)) {
    const name = match[1].trim().replace(/^:/, '')
    if (name !== '') modules.push(name)
  }
}

/**
 * @typedef {object} RunTarget
 * @property {string} block   runs 块名，如 `client`
 * @property {string} kind    块里调用的类型，如 `client`
 * @property {string} task    Gradle 任务名，如 `runClient`
 * @property {string} label   界面上显示的名字，如 `Client`
 */

const LABELS = {
  client: 'Client',
  server: 'Server',
  data: 'Data',
  gameTestServer: 'GameTestServer',
  gameTest: 'GameTestServer',
  datagen: 'Data',
}

/** 认得的运行类型；用来判断块体里"这个 run 是什么"。 */
const RUN_TYPES = new Set(['client', 'server', 'data', 'datagen', 'gameTest', 'gameTestServer', 'junit'])

/**
 * `runs` 是个 NamedDomainObjectContainer，块里合法出现的**容器 API** 不是运行目标。
 * `runs { configureEach { systemProperty … } }` 曾因此被识别成 `runConfigureEach`，
 * 选中启动会得到 "Task not found"。
 */
const CONTAINER_API = new Set([
  'all',
  'each',
  'configure',
  'configureEach',
  'matching',
  'withType',
  'whenObjectAdded',
  'whenObjectRemoved',
  'add',
  'addAll',
  'remove',
  'clear',
  'filter',
  'findAll',
  'forEach',
  'collect',
  'sort',
  'where',
])

/** 显式工厂：`create("benchmark") { … }` / `register("x") { … }` / `named("x") { … }`。 */
const FACTORY = /(?:^|[^\w.])(?:create|register|named)\s*\(\s*["']([^"']+)["']\s*\)\s*\{/g

/**
 * 每个字符处的花括号深度。用来只收集 `runs` 体里**顶层**的块——
 * run 配置内部也可能有块（`runs { client { mods { … } } }`），那不是运行目标。
 * @param {string} text
 * @returns {number[]}
 */
function braceDepths(text) {
  const depths = new Array(text.length)
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    depths[i] = depth
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') depth = Math.max(0, depth - 1)
  }
  return depths
}

/**
 * 块体里的运行类型：优先认得的类型，认不出就用块名（不再拿"第一个调用"兜底，
 * 否则 `systemProperty(` 这种会被当成类型）。
 * @param {string} inner
 * @param {string} fallback
 * @returns {string}
 */
function runKind(inner, fallback) {
  for (const match of inner.matchAll(/(?:^|[^\w.])([A-Za-z_][\w]*)\s*\(/g)) {
    if (RUN_TYPES.has(match[1])) return match[1]
  }
  return fallback
}

/**
 * 解析 `runs { client { client() } ... }`，得到可运行目标。
 * 任务名规则：`runs` 块名首字母大写后拼到 `run` 后面（Gradle 的 RunConfig 约定）。
 * @param {string} raw
 * @returns {RunTarget[]}
 */
export function parseRuns(raw) {
  const text = stripComments(raw)
  /** @type {RunTarget[]} */
  const targets = []

  /**
   * @param {string} name 运行名（块名或工厂参数）
   * @param {string} inner 块体
   */
  function add(name, inner) {
    if (!/^[A-Za-z_][\w]*$/.test(name)) return
    const kind = runKind(inner, name)
    targets.push({
      block: name,
      kind,
      task: `run${name[0].toUpperCase()}${name.slice(1)}`,
      label: LABELS[kind] ?? LABELS[name] ?? `${kind}`,
    })
  }

  for (const body of findBlocks(text, 'runs')) {
    const depths = braceDepths(body)
    for (const match of body.matchAll(/([A-Za-z_][\w]*)\s*\{/g)) {
      const name = match[1]
      if (match.index > 0 && /[\w.]/.test(body[match.index - 1])) continue
      if (depths[match.index] !== 0) continue
      if (CONTAINER_API.has(name)) continue
      const open = body.indexOf('{', match.index)
      const close = open < 0 ? -1 : matchBrace(body, open)
      if (close < 0) continue
      add(name, body.slice(open + 1, close))
    }
    for (const match of body.matchAll(FACTORY)) {
      if (depths[match.index] !== 0) continue
      const open = body.indexOf('{', match.index + match[0].length - 1)
      const close = open < 0 ? -1 : matchBrace(body, open)
      if (close < 0) continue
      add(match[1], body.slice(open + 1, close))
    }
  }
  // 同名任务去重（多模块时由调用方按模块分组）
  const seen = new Set()
  return targets.filter((target) => {
    if (seen.has(target.task)) return false
    seen.add(target.task)
    return true
  })
}

/**
 * Java toolchain / 兼容等级。
 * @param {string} raw
 * @returns {number | undefined}
 */
export function parseJavaLevel(raw) {
  const text = stripComments(raw)
  const patterns = [
    /JavaLanguageVersion\.of\(\s*(\d+)\s*\)/,
    /jvmToolchain\(\s*(\d+)\s*\)/,
    /sourceCompatibility\s*=\s*(?:JavaVersion\.VERSION_)?(\d+)/,
    /targetCompatibility\s*=\s*(?:JavaVersion\.VERSION_)?(\d+)/,
    /languageVersion\s*=\s*JavaLanguageVersion\.of\(\s*(\d+)\s*\)/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match) return Number(match[1])
  }
  return undefined
}

/**
 * 从构建脚本里找 MC 版本字面量。
 * @param {string} raw
 * @param {Record<string, string>} properties
 * @returns {string | undefined}
 */
export function parseMinecraftVersion(raw, properties) {
  const text = stripComments(raw)

  // loom: minecraft "com.mojang:minecraft:1.20.1"
  const dependency = /minecraft\s*\(?\s*["'][^"']*minecraft:(\d+\.\d+(?:\.\d+)?)["']/.exec(text)
  if (dependency) return dependency[1]

  // forge: minecraft { version = "1.20.1-47.2.0" }
  const forgeBlock = /minecraft\s*\{[^}]*?version\s*=\s*["'](\d+\.\d+(?:\.\d+)?)/.exec(text)
  if (forgeBlock) return forgeBlock[1]

  // 直接写死：minecraft_version = "1.21.1" / minecraftVersion = '1.21.1'
  const literal = /(?:minecraft_version|minecraftVersion|mc_version|mcVersion)\s*[=:]\s*["']?(\d+\.\d+(?:\.\d+)?)["']?/.exec(
    `${text}\n${renderProperties(properties)}`,
  )
  if (literal) return literal[1]

  return undefined
}

/**
 * @param {Record<string, string>} properties
 * @returns {string}
 */
function renderProperties(properties) {
  return Object.entries(properties)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

/**
 * wrapper 里的 Gradle 版本。
 * @param {Record<string, string>} wrapperProperties
 * @returns {string | undefined}
 */
export function parseWrapperVersion(wrapperProperties) {
  const url = wrapperProperties.distributionUrl
  if (!url) return undefined
  const match = /gradle-(\d+\.\d+(?:\.\d+)?)-(?:bin|all)\.zip/.exec(url)
  return match?.[1]
}

/**
 * NeoForge 版本 → MC 版本。`21.1.251 → 1.21.1`、`20.4.237 → 1.20.4`、`20.2.x → 1.20.2`。
 * 只映射到小版本（1.20.x 线），映射不到返回 undefined，不猜。
 * @param {string | undefined} neoVersion
 * @returns {string | undefined}
 */
export function minecraftFromNeoVersion(neoVersion) {
  if (!neoVersion) return undefined
  const match = /^(\d+)\.(\d+)\./.exec(neoVersion.trim())
  if (!match) return undefined
  const major = Number(match[1])
  const minor = Number(match[2])
  if (major === 20) {
    // 20.2 → 1.20.2、20.4 → 1.20.4、20.6 → 1.20.6
    if (minor >= 2) return `1.20.${minor}`
    return '1.20.1'
  }
  if (major === 21 || major === 22 || major === 23 || major >= 24) {
    // 21.1 → 1.21.1；未来大版本按同样规律，但只在小版本 >0 时给三位
    return minor > 0 ? `1.${major}.${minor}` : `1.${major}`
  }
  return undefined
}
