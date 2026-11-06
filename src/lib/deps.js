/**
 * 声明的依赖：只读、静态。
 *
 * 这**不是**依赖管理——改构建脚本是 agent 更擅长的事。这里要给的是一扇能核对的窗口：
 * agent 说"加好了"，人（或 agent 自己）能在面板上看见它写进了哪个配置、哪一行。
 *
 * 两个来源：
 *   - 构建脚本的 `dependencies { }` 块，配合 `gradle/libs.versions.toml` 解析 `libs.xxx` 引用；
 *   - `mods.toml` / `fabric.mod.json` 里的 `depends`（对别的模组的运行时声明）。
 *
 * 只有"声明"，没有 Gradle 解析后的传递依赖与冲突——那需要真跑一次 Gradle。
 * @module minecraft-dev-starter/lib/deps
 */

import { stripComments } from './gradle.js'
import { resolvePlaceholders } from './text.js'
import { parseToml } from './toml.js'

/**
 * @typedef {object} BuildDependency
 * @property {string} configuration 如 modImplementation / implementation
 * @property {string} notation      如 net.fabricmc:fabric-loader:0.16.9、project :common
 * @property {string} [module]      group:artifact
 * @property {string} [version]
 * @property {string} [catalogRef]  来自版本目录时的 libs.xxx
 * @property {string} file
 * @property {number} line
 */

/**
 * @typedef {object} CatalogLibrary
 * @property {string} alias
 * @property {string} notation
 * @property {string} [module]
 * @property {string} [version]
 */

/**
 * @typedef {object} ModDependency
 * @property {string} modId
 * @property {string} range
 */

/** 这些名字出现在 dependencies 块里时不是依赖声明（块、约束、排除项）。 */
const NOT_A_DEPENDENCY = new Set([
  'constraints',
  'components',
  'exclude',
  'excludes',
  'attributes',
  'capabilities',
  'artifact',
  'because',
  'transitive',
  'substitute',
  'each',
  'configureEach',
  'all',
  'matching',
  'withType',
  'add',
  'create',
  'register',
  'named',
  'if',
  'else',
  'return',
])

const QUOTED = /^["']([^"']+)["']$/
const WRAPPER = /^(platform|enforcedPlatform|testFixtures)\s*\(\s*([\s\S]+?)\s*\)$/
const PROJECT = /^project\s*\(\s*(?:path\s*:\s*)?["']([^"']+)["']\s*\)$/
const FILES = /^files?\s*\(/
const CATALOG_REF = /^libs\.([\w.]+)$/

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 只数花括号，字符串里的不算（`"${'}'}"` 这类少见但会让深度跑偏）。
 * @param {string} line
 * @returns {number}
 */
function braceDelta(line) {
  const bare = line.replace(/"[^"]*"|'[^']*'/g, '')
  const open = bare.split('{').length - 1
  const close = bare.split('}').length - 1
  return open - close
}

/**
 * 坐标拆成 module / version。
 * @param {string} notation
 * @returns {{ module?: string, version?: string }}
 */
export function splitCoordinates(notation) {
  const parts = notation.split(':')
  if (parts.length < 2 || parts[0] === '' || parts[1] === '') return {}
  /** @type {{ module?: string, version?: string }} */
  const out = { module: `${parts[0]}:${parts[1]}` }
  if (parts[2] !== undefined && parts[2] !== '') out.version = parts[2]
  return out
}

/**
 * 解析构建脚本里的 `dependencies { }` 声明。
 *
 * 行号是给人看的：改了哪一行是核对的关键。
 * @param {string} raw 原始文件内容
 * @param {string} [file] 文件名（用来填 file 字段）
 * @returns {BuildDependency[]}
 */
export function parseBuildDependencies(raw, file = 'build.gradle') {
  const text = stripComments(raw)
  const lines = text.split('\n')
  /** @type {BuildDependency[]} */
  const out = []
  let depth = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (depth === 0) {
      const open = /^\s*dependencies\s*\{/.exec(line)
      if (open === null) continue
      const delta = braceDelta(line)
      const after = line.slice(open[0].length)
      // 单行块 `dependencies { modImplementation "a:b:c" }`
      const first = parseStatement(delta === 0 ? after.replace(/\}\s*$/, '') : after, file, index + 1)
      if (first !== undefined) out.push(first)
      depth = Math.max(0, delta)
      continue
    }
    if (depth === 1) {
      const parsed = parseStatement(line, file, index + 1)
      if (parsed !== undefined) out.push(parsed)
    }
    depth = Math.max(0, depth + braceDelta(line))
  }
  return out
}

/**
 * @param {string} line
 * @param {string} file
 * @param {number} lineNumber
 * @returns {BuildDependency | undefined}
 */
function parseStatement(line, file, lineNumber) {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('}') || trimmed.startsWith('//')) return undefined
  // 去掉行尾开块：`implementation("x") {`
  const body = trimmed.replace(/\s*\{\s*$/, '')

  let configuration
  let rest
  const paren = /^([A-Za-z_][\w]*)\s*\(([\s\S]*)\)$/.exec(body)
  if (paren !== null) {
    configuration = paren[1]
    rest = paren[2].trim()
  } else {
    const space = /^([A-Za-z_][\w]*)\s+([\s\S]+)$/.exec(body)
    if (space === null) return undefined
    configuration = space[1]
    rest = space[2].trim()
  }
  if (NOT_A_DEPENDENCY.has(configuration) || rest === '' || rest.startsWith('{')) return undefined

  // 括号里只包一层的写法：platform("…") / project("…") / files(…)
  const wrapper = WRAPPER.exec(rest)
  if (wrapper !== null) rest = wrapper[2].trim()
  if (FILES.test(rest)) return undefined
  const project = PROJECT.exec(rest)
  if (project !== null) {
    return { configuration, notation: `project ${project[1]}`, file, line: lineNumber }
  }

  const quoted = QUOTED.exec(rest)
  if (quoted !== null) {
    const notation = quoted[1]
    return { configuration, notation, ...splitCoordinates(notation), file, line: lineNumber }
  }

  const catalog = CATALOG_REF.exec(rest)
  if (catalog !== null) {
    return { configuration, notation: rest, catalogRef: rest, file, line: lineNumber }
  }

  // 其余（变量、拼接表达式）原样留一条，至少让人看见"这里有一行声明"
  if (/^[A-Za-z_$]/.test(rest)) {
    return { configuration, notation: rest, file, line: lineNumber }
  }
  return undefined
}

/**
 * 解析 `gradle/libs.versions.toml`。
 * @param {string} raw
 * @returns {CatalogLibrary[]}
 */
export function parseVersionCatalog(raw) {
  const parsed = parseToml(raw)
  if (!isRecord(parsed)) return []
  const versions = isRecord(parsed.versions) ? parsed.versions : {}
  const libraries = isRecord(parsed.libraries) ? parsed.libraries : {}
  /** @type {CatalogLibrary[]} */
  const out = []
  for (const [alias, value] of Object.entries(libraries)) {
    const library = normalizeLibrary(alias, value, versions)
    if (library !== undefined) out.push(library)
  }
  return out
}

/**
 * @param {string} alias
 * @param {unknown} value
 * @param {Record<string, any>} versions
 * @returns {CatalogLibrary | undefined}
 */
function normalizeLibrary(alias, value, versions) {
  if (typeof value === 'string') {
    const coordinates = splitCoordinates(value)
    return { alias, notation: value, ...coordinates }
  }
  if (!isRecord(value)) return undefined
  const module = typeof value.module === 'string'
    ? value.module
    : typeof value.group === 'string' && typeof value.name === 'string'
      ? `${value.group}:${value.name}`
      : undefined
  if (module === undefined) return undefined
  let version
  if (typeof value.version === 'string') version = value.version
  else if (isRecord(value.version) && typeof value.version.ref === 'string') {
    const resolved = versions[value.version.ref]
    if (typeof resolved === 'string') version = resolved
  }
  const notation = version === undefined ? module : `${module}:${version}`
  return { alias, module, version, notation }
}

/**
 * `libs.foo.bar` → 候选 alias。Gradle 把 `foo-bar` 生成成 `libs.foo.bar`，
 * 也支持驼峰写法 `libs.fooBar`，所以两种都试。
 * @param {string} ref
 * @returns {string[]}
 */
function catalogAliasCandidates(ref) {
  const path = ref.replace(/^libs\./, '')
  const segments = path.split('.')
  const kebab = segments.join('-')
  const camel = segments.map((segment, index) => (index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1))).join('')
  // `libs.fabricApi` → `fabric-api`（Gradle 也接受驼峰访问器）
  const decamelized = segments.map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()).join('-')
  return [...new Set([kebab, camel, decamelized, path])]
}

/**
 * 把 `libs.xxx` 引用换成版本目录里的真实坐标；解析不出来就保留原样（不猜）。
 * @param {BuildDependency[]} dependencies
 * @param {CatalogLibrary[]} catalog
 * @returns {BuildDependency[]}
 */
export function resolveCatalogRefs(dependencies, catalog) {
  if (catalog.length === 0) return dependencies
  /** @type {Map<string, CatalogLibrary>} */
  const byAlias = new Map(catalog.map((entry) => [entry.alias, entry]))
  return dependencies.map((dependency) => {
    if (dependency.catalogRef === undefined) return dependency
    const hit = catalogAliasCandidates(dependency.catalogRef)
      .map((alias) => byAlias.get(alias))
      .find((entry) => entry !== undefined)
    if (hit === undefined) return dependency
    /** @type {BuildDependency} */
    const resolved = {
      configuration: dependency.configuration,
      notation: hit.notation,
      catalogRef: dependency.catalogRef,
      file: dependency.file,
      line: dependency.line,
    }
    if (hit.module !== undefined) resolved.module = hit.module
    if (hit.version !== undefined) resolved.version = hit.version
    return resolved
  })
}

/**
 * 把声明里的 `${property}` 换成 `gradle.properties` 的值。
 *
 * Gradle 脚本里 `"net.fabricmc:fabric-loader:${fabric_loader_version}"` 是常态；
 * 不解析就会拿字面量去和 IDE 解析出的版本比，结果每一条都是"版本不同"。
 * @param {BuildDependency[]} dependencies
 * @param {Record<string, string>} properties
 * @returns {BuildDependency[]}
 */
export function resolveDependencyPlaceholders(dependencies, properties) {
  return dependencies.map((dependency) => {
    const { value } = resolvePlaceholders(dependency.notation, properties)
    if (value === undefined || value === dependency.notation) return dependency
    /** @type {BuildDependency} */
    const next = { ...dependency, notation: value }
    // 坐标位置可能跟着占位符变了，重新拆一次；旧的 module/version 不能留
    delete next.module
    delete next.version
    return Object.assign(next, splitCoordinates(value))
  })
}

/**
 * @typedef {object} ComparedDependency
 * @property {string} module group:artifact
 * @property {string} declared 构建脚本里声明的版本
 * @property {string | null} resolved IDE 上次同步解析出的版本；未解析时是 null
 * @property {'same' | 'differs' | 'unresolved'} status
 */

/**
 * 声明的版本 vs IDE 上次 Gradle 同步解析出的版本。
 *
 * 只对照**声明项**：库表里多出来的传递依赖不列——它们不是"你写了什么"，
 * 一个普通 Fabric 工程就能有 130 多条。同一模块在多个配置里声明时只对照第一次。
 * 版本不同不一定是错：动态版本、被别的依赖抬高都会这样，所以 status 只描述事实。
 * @param {BuildDependency[]} dependencies
 * @param {Record<string, string>} resolved
 * @returns {ComparedDependency[]}
 */
export function compareDependencies(dependencies, resolved) {
  /** @type {ComparedDependency[]} */
  const compared = []
  /** @type {Set<string>} */
  const seen = new Set()
  const remapped = remappedCoordinates(resolved)
  for (const dependency of dependencies) {
    const module = dependency.module
    const declared = dependency.version
    // 没有坐标（project 依赖）或没有版本（交给平台统一管理）时无可对照
    if (module === undefined || declared === undefined || seen.has(module)) continue
    seen.add(module)
    const actual = Object.hasOwn(resolved, module) ? resolved[module] : remapped.get(module)
    if (actual === undefined) {
      compared.push({ module, declared, resolved: null, status: 'unresolved' })
      continue
    }
    compared.push({
      module,
      declared,
      resolved: actual,
      status: actual === declared ? 'same' : 'differs',
    })
  }
  return compared
}

/**
 * Loom 把 remap 后的坐标写成 `<mappings-id>.<原 group>:artifact`，直接按 group:artifact
 * 永远对不上。这里只剥这一种有明确前缀的写法，不做宽泛的"按 artifact 猜"。
 * 精确坐标优先：索引里已经有同名的真实条目时，别名不覆盖它。
 * @param {Record<string, string>} resolved
 * @returns {Map<string, string>}
 */
function remappedCoordinates(resolved) {
  /** @type {Map<string, string>} */
  const aliases = new Map()
  for (const [key, version] of Object.entries(resolved)) {
    const colon = key.indexOf(':')
    if (colon <= 0) continue
    const match = /^loom_mappings_[^.]+\.(.+)$/.exec(key.slice(0, colon))
    if (match === null) continue
    const alias = `${match[1]}:${key.slice(colon + 1)}`
    if (!Object.hasOwn(resolved, alias) && !aliases.has(alias)) aliases.set(alias, version)
  }
  return aliases
}

/**
 * 把元数据的 `depends` 拉成列表。
 * @param {Record<string, string>} ranges `modId → 版本范围`
 * @returns {ModDependency[]}
 */
export function toModDependencies(ranges) {
  return Object.entries(ranges)
    .filter(([modId]) => modId !== '')
    .map(([modId, range]) => ({ modId, range: typeof range === 'string' ? range : String(range) }))
}
