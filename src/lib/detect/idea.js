/**
 * 读 IntelliJ IDEA 的 `.idea` 目录：模块清单、facet 平台、工程 JDK、运行配置。
 *
 * 只作为识别引擎的辅助证据源：构建脚本优先，读不到时才用它兜底。
 * @module minecraft-dev-starter/lib/idea
 */

import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { t } from '../i18n/messages.js'
import { readText } from '../util/text.js'
import { attrOf, childOf, componentOf, findFirst, findAll, optionValue, parseXml, rootOf, textOf } from './xml.js'

/** IDE 工程目录名。 */
export const IDEA_DIR = '.idea'

const MAX_IML = 60
const MAX_RUN_CONFIGURATIONS = 80
/** 外部存储里的库表可能上千条，只留够做摘要的量。 */
const MAX_LIBRARIES = 800
/** `.idea/libraries` 目录里最多读多少个文件。 */
const MAX_LIBRARY_FILES = 200
/** 扫外部存储时最多记多少个工程的缓存目录。 */
const MAX_EXTERNAL_PROJECTS = 400

/** facet 的 `platformType` → loader。 */
const PLATFORM_LOADERS = {
  FABRIC: 'fabric',
  QUILT: 'quilt',
  NEOFORGE: 'neoforge',
  NEOFORGED: 'neoforge',
  FORGE: 'forge',
  ARCHITECTURY: 'architectury',
  ARCHITECTURY_PLUGIN: 'architectury',
  PAPER: 'paper',
  SPIGOT: 'spigot',
}

/** 运行配置里能定位 run 类型的参数文件名。 */
const RUN_MARKERS = [
  [/gameTestServerRun(?:Program|Vm)Args/i, 'gameTestServer'],
  [/clientRun(?:Program|Vm)Args/i, 'client'],
  [/serverRun(?:Program|Vm)Args/i, 'server'],
  [/dataRun(?:Program|Vm)Args/i, 'data'],
]

/** 没有参数文件时按配置名认 run 类型，顺序有意义。 */
const RUN_NAME_HINTS = [
  [/game\s*tests?/i, 'gameTestServer'],
  [/\bdata(?:gen)?\b/i, 'data'],
  [/\bclient\b/i, 'client'],
  [/\bserver\b/i, 'server'],
]

/**
 * @typedef {object} IdeaModule
 * @property {string} file
 * @property {string} name
 * @property {string[]} platforms
 * @property {string | undefined} srgType
 * @property {string | undefined} minecraftVersion MC Development 插件写进 iml 的版本
 * @property {string[]} contentRoots
 * @property {string | undefined} gradlePath 相对工程根，`.` 是根模块
 */

/**
 * @typedef {object} IdeasLibrarySummary
 * @property {'project' | 'external'} storage project = `.idea/libraries`，external = IDE 的外部存储
 * @property {string} file 库表位置（external 是文件，project 是目录）
 * @property {number} count
 * @property {number} local 指向 `$PROJECT_DIR$` 的条目数（loom 的 remap 产物）
 * @property {string[]} samples group:artifact:version，最多 5 条
 * @property {Record<string, string> | undefined} resolved group:artifact → version，最多 800 条；
 *   只有带完整坐标的条目才进索引，一条都没有时不出现
 * @property {string | undefined} syncedAt IDE 上次 Gradle 同步的时间（libraries.xml 或
 *   workspace.xml 的 mtime，ISO）；读不到时不出现
 */

/**
 * @typedef {object} IdeaRunConfiguration
 * @property {string} name
 * @property {string} type
 * @property {string | undefined} kind client / server / data / gameTestServer
 * @property {string | undefined} modulePath 相对工程根
 * @property {string | undefined} workingDirectory
 * @property {string | undefined} mainClass
 */

/**
 * @typedef {object} IdeaProject
 * @property {string} dir
 * @property {string} projectDir
 * @property {string | undefined} projectName
 * @property {string | undefined} gradleRoot
 * @property {string | undefined} gradleJvm
 * @property {string | undefined} jdkName
 * @property {number | undefined} languageLevel
 * @property {number | undefined} bytecodeTarget
 * @property {string | undefined} minecraftVersion
 * @property {string[]} gradleModules
 * @property {IdeaModule[]} modules
 * @property {IdeaRunConfiguration[]} runConfigurations
 * @property {string[]} platforms
 * @property {string[]} linkedProjects
 * @property {IdeasLibrarySummary | undefined} libraries
 * @property {string[]} files
 */

/**
 * `.idea` 目录退回它的父目录（工程根）。
 * @param {string} input
 * @returns {string}
 */
export function resolveProjectDir(input) {
  const trimmed = String(input ?? '').replace(/[\\/]+$/, '')
  if (trimmed === '') return trimmed
  return basename(trimmed) === IDEA_DIR ? dirname(trimmed) : trimmed
}

/**
 * 读一个工程的 `.idea`；没有或读不到返回 undefined。
 * @param {string} input 工程根或 `.idea` 目录
 * @param {{ externalRoots?: string[] }} [options] `externalRoots` 只给测试用，默认按平台推断
 * @returns {Promise<IdeaProject | undefined>}
 */
export async function readIdeaProject(input, options = {}) {
  const projectDir = resolveProjectDir(input)
  if (projectDir === '') return undefined
  const dir = join(projectDir, IDEA_DIR)
  if (!(await isDirectory(dir))) return undefined

  /** @type {string[]} */
  const files = []
  /** @param {string} name @returns {Promise<string | undefined>} */
  const load = async (name) => {
    const text = await readText(join(dir, name))
    if (text !== undefined) files.push(name)
    return text
  }

  const [modulesXml, gradleXml, miscXml, compilerXml, workspaceXml, nameText, entries] = await Promise.all([
    load('modules.xml'),
    load('gradle.xml'),
    load('misc.xml'),
    load('compiler.xml'),
    load('workspace.xml'),
    load('.name'),
    safeReaddir(dir),
  ])
  if (files.length === 0 && entries.length === 0) return undefined

  const gradle = readGradleSettings(gradleXml === undefined ? undefined : parseXml(gradleXml), projectDir)
  const imlPaths = readImlPaths(modulesXml === undefined ? undefined : parseXml(modulesXml), projectDir).slice(0, MAX_IML)
  const modules = await readModules(imlPaths, projectDir, gradle.gradleModules)
  const misc = miscXml === undefined ? undefined : parseXml(miscXml)
  const libraries = await readLibraries(dir, projectDir, {
    ...options,
    // 开关关掉时外部存储里那份 libraries.xml 可能是旧产物，不能拿来对照
    externalStorage: readExternalStorageEnabled(misc) ?? options.externalStorage,
  })

  return {
    dir,
    projectDir,
    projectName: nameText === undefined ? undefined : nameText.trim() || undefined,
    gradleRoot: gradle.gradleRoot,
    gradleJvm: gradle.gradleJvm,
    jdkName: readJdkName(misc),
    languageLevel: readLanguageLevel(misc),
    bytecodeTarget: readBytecodeTarget(compilerXml === undefined ? undefined : parseXml(compilerXml)),
    minecraftVersion: modules.map((module) => module.minecraftVersion).find((value) => value !== undefined),
    gradleModules: gradle.gradleModules,
    modules,
    runConfigurations: readRunConfigurations(workspaceXml === undefined ? undefined : parseXml(workspaceXml), projectDir),
    platforms: [...new Set(modules.flatMap((module) => module.platforms))].sort(),
    linkedProjects: gradle.linkedProjects,
    libraries,
    files,
  }
}

/**
 * 往上找拥有这个目录的聚合工程（父工程的 `.idea` 模块清单里有它）。
 * @param {string} input 子模块目录
 * @param {number} [maxLevels] 最多往上找几层
 * @param {{ externalRoots?: string[] }} [options] 透传给 readIdeaProject（测试用）
 * @returns {Promise<{ idea: IdeaProject, modulePath: string, parentDir: string } | undefined>}
 */
export async function findOwningAggregator(input, maxLevels = 4, options = {}) {
  const origin = resolveProjectDir(input)
  if (origin === '') return undefined
  let ancestor = origin
  for (let level = 0; level < maxLevels; level += 1) {
    const parentDir = dirname(ancestor)
    if (parentDir === ancestor) return undefined
    const idea = await readIdeaProject(parentDir, options)
    if (idea !== undefined) {
      // 相对基准始终是起点目录，不是上一轮爬到的那个
      const modulePath = toProjectRelative(origin, parentDir)
      if (modulePath !== undefined && modulePath !== '.' && idea.gradleModules.includes(modulePath)) {
        return { idea, modulePath, parentDir }
      }
    }
    ancestor = parentDir
  }
  return undefined
}

/**
 * facet 平台 → loader 列表，具体 loader 在前。
 * @param {string[]} platforms
 * @returns {string[]}
 */
export function loadersFromPlatforms(platforms) {
  /** @type {string[]} */
  const concrete = []
  /** @type {string[]} */
  const abstract = []
  for (const platform of platforms) {
    const loader = PLATFORM_LOADERS[String(platform).toUpperCase()]
    if (loader === undefined) continue
    if (loader === 'architectury') abstract.push(loader)
    else if (!concrete.includes(loader)) concrete.push(loader)
  }
  return [...new Set([...concrete, ...abstract])]
}

/**
 * 运行配置属于哪种 run，认不出返回 undefined。
 * @param {{ name?: string, type?: string, programParameters?: string, vmParameters?: string, mainClass?: string }} config
 * @returns {string | undefined}
 */
export function runKindOf(config) {
  const command = `${config.programParameters ?? ''} ${config.vmParameters ?? ''} ${config.mainClass ?? ''}`
  for (const [pattern, kind] of RUN_MARKERS) {
    if (pattern.test(command)) return kind
  }
  for (const [pattern, kind] of RUN_NAME_HINTS) {
    if (pattern.test(config.name ?? '')) return kind
  }
  return undefined
}

/**
 * iml 文件名 → Gradle 模块路径。
 * @param {string} imlName
 * @param {string | undefined} projectName
 * @param {string[]} gradleModules
 * @returns {string | undefined}
 */
export function matchGradleModule(imlName, projectName, gradleModules) {
  let rest = imlName
  if (projectName !== undefined && rest.startsWith(`${projectName}.`)) rest = rest.slice(projectName.length + 1)
  const candidates = gradleModules
    .map((module) => ({ module, dotted: module === '.' ? '' : module.replace(/[\\/]+/g, '.') }))
    .filter((entry) => entry.dotted !== '')
    .sort((left, right) => right.dotted.length - left.dotted.length)
  for (const entry of candidates) {
    if (rest === entry.dotted || rest.startsWith(`${entry.dotted}.`)) return entry.module
  }
  if (rest === '' || gradleModules.includes('.')) return '.'
  return undefined
}

/**
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
async function isDirectory(dir) {
  try {
    return (await stat(dir)).isDirectory()
  } catch {
    return false
  }
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function safeReaddir(dir) {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

/**
 * 展开 `$PROJECT_DIR$` / `$MODULE_DIR$` / `$USER_HOME$` 与 `file://`。
 * @param {string | undefined} value
 * @param {{ projectDir: string, moduleDir?: string }} context
 * @returns {string | undefined}
 */
export function expandIdeaPath(value, context) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  let path = value.trim()
  if (path.startsWith('file://')) {
    path = path.slice('file://'.length)
    try {
      path = decodeURIComponent(path)
    } catch {
      /* 解不开按原样用 */
    }
  }
  const expanded = path
    .replace(/\$PROJECT_DIR\$/g, context.projectDir)
    .replace(/\$MODULE_DIR\$/g, context.moduleDir ?? context.projectDir)
    .replace(/\$USER_HOME\$/g, process.env.USERPROFILE ?? process.env.HOME ?? '')
  return expanded.includes('$') ? expanded : normalize(expanded)
}

/**
 * 绝对路径 → 相对工程根；落在工程外返回 undefined。
 * @param {string | undefined} path
 * @param {string} projectDir
 * @returns {string | undefined}
 */
function toProjectRelative(path, projectDir) {
  if (path === undefined) return undefined
  const rel = relative(projectDir, path)
  if (rel === '') return '.'
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('../') || isAbsolute(rel)) return undefined
  return rel.replace(/\\/g, '/')
}

/**
 * `gradle.xml` → 工程根、构建 JVM、模块清单。
 * @param {import('./xml.js').XmlNode | undefined} doc
 * @param {string} projectDir
 */
function readGradleSettings(doc, projectDir) {
  /** @type {{ gradleRoot?: string, gradleJvm?: string, gradleModules: string[], linkedProjects: string[] }} */
  const result = { gradleModules: [], linkedProjects: [] }
  if (doc === undefined) return result

  const linked = findFirst(rootOf(doc) ?? doc, (node) => node.name === 'option' && node.attrs.name === 'linkedExternalProjectsSettings')
  const scopes = findAll(linked ?? componentOf(doc, 'GradleSettings'), 'GradleProjectSettings')
  if (scopes.length === 0) return result

  for (const scope of scopes) {
    const externalPath = expandIdeaPath(optionValue(scope, 'externalProjectPath'), { projectDir })
    const rel = toProjectRelative(externalPath, projectDir)
    if (externalPath !== undefined && rel === undefined) result.linkedProjects.push(externalPath)
    if (result.gradleRoot === undefined && externalPath !== undefined && rel !== undefined) {
      result.gradleRoot = externalPath
      result.gradleJvm = optionValue(scope, 'gradleJvm')
    }
    for (const entry of findAll(findFirst(scope, (node) => node.name === 'set'), 'option')) {
      const modulePath = toProjectRelative(expandIdeaPath(attrOf(entry, 'value'), { projectDir }), projectDir)
      if (modulePath === undefined || result.gradleModules.includes(modulePath)) continue
      result.gradleModules.push(modulePath)
    }
  }

  if (!result.gradleModules.includes('.')) result.gradleModules.unshift('.')
  if (result.gradleRoot === undefined) result.gradleRoot = projectDir
  return result
}

/**
 * `modules.xml` 里登记的 iml 路径。
 * @param {import('./xml.js').XmlNode | undefined} doc
 * @param {string} projectDir
 * @returns {string[]}
 */
function readImlPaths(doc, projectDir) {
  if (doc === undefined) return []
  /** @type {string[]} */
  const paths = []
  for (const entry of findAll(componentOf(doc, 'ProjectModuleManager'), 'module')) {
    const path = expandIdeaPath(attrOf(entry, 'filepath') ?? attrOf(entry, 'fileurl'), { projectDir })
    if (path === undefined || paths.includes(path)) continue
    // iml 必须在工程目录内。`.idea/modules.xml` 是仓库里的文件，克隆来的工程
    // 可以写任意绝对路径（含 $USER_HOME$），越界的直接丢，连读都不读。
    if (toProjectRelative(path, projectDir) === undefined) continue
    paths.push(path)
  }
  return paths
}

/**
 * 读 iml：minecraft facet 的 platformType 与 srgType。
 * @param {string[]} paths
 * @param {string} projectDir
 * @param {string[]} gradleModules
 * @returns {Promise<IdeaModule[]>}
 */
async function readModules(paths, projectDir, gradleModules) {
  /** @type {IdeaModule[]} */
  const modules = []
  let projectName
  for (const path of paths) {
    const text = await readText(path)
    if (text === undefined) continue
    const doc = parseXml(text)
    const imlName = basename(path).replace(/\.iml$/i, '')
    projectName ??= imlName.includes('.') ? imlName.slice(0, imlName.indexOf('.')) : undefined

    /** @type {IdeaModule} */
    const module = {
      file: path,
      name: imlName,
      platforms: [],
      srgType: undefined,
      minecraftVersion: undefined,
      contentRoots: [],
      gradlePath: matchGradleModule(imlName, projectName, gradleModules),
    }
    for (const facet of findAll(doc, 'facet')) {
      if (String(attrOf(facet, 'type') ?? '').toLowerCase() !== 'minecraft') continue
      for (const platform of findAll(facet, 'platformType')) {
        const value = textOf(platform)
        if (value !== '' && !module.platforms.includes(value)) module.platforms.push(value)
      }
    }
    const mcp = componentOf(doc, 'McpModuleSettings')
    const srgType = optionValue(mcp, 'srgType')
    if (srgType !== undefined) module.srgType = srgType
    // MC Development 插件把当前同步的 MC 版本写在这里，是构建脚本之外唯一的独立佐证
    const minecraftVersion = optionValue(mcp, 'minecraftVersion')
    if (minecraftVersion !== undefined) module.minecraftVersion = minecraftVersion
    for (const content of findAll(doc, 'content')) {
      const url = expandIdeaPath(attrOf(content, 'url'), { projectDir, moduleDir: dirname(path) })
      if (url !== undefined && !module.contentRoots.includes(url)) module.contentRoots.push(url)
    }
    modules.push(module)
  }
  return modules
}

/**
 * @param {import('./xml.js').XmlNode | undefined} doc
 * @returns {string | undefined}
 */
function readJdkName(doc) {
  return attrOf(componentOf(doc, 'ProjectRootManager'), 'project-jdk-name')
}

/**
 * `JDK_17` / `JDK_1_8` → 大版本号。
 * @param {import('./xml.js').XmlNode | undefined} doc
 * @returns {number | undefined}
 */
function readLanguageLevel(doc) {
  const value = attrOf(componentOf(doc, 'ProjectRootManager'), 'languageLevel')
  if (value === undefined) return undefined
  const legacy = /^JDK_1_(\d+)$/.exec(value)
  if (legacy) return Number(legacy[1])
  const modern = /^JDK_(\d+)$/.exec(value)
  return modern ? Number(modern[1]) : undefined
}

/**
 * @param {import('./xml.js').XmlNode | undefined} doc
 * @returns {number | undefined}
 */
function readBytecodeTarget(doc) {
  if (doc === undefined) return undefined
  const level = findFirst(componentOf(doc, 'CompilerConfiguration'), (node) => node.name === 'bytecodeTargetLevel')
  const target = attrOf(level, 'target')
  if (target === undefined) return undefined
  const parsed = Number(target)
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * `workspace.xml` 的 RunManager（该文件常被 git 忽略，读不到是常态）。
 * @param {import('./xml.js').XmlNode | undefined} doc
 * @param {string} projectDir
 * @returns {IdeaRunConfiguration[]}
 */
function readRunConfigurations(doc, projectDir) {
  if (doc === undefined) return []
  /** @type {IdeaRunConfiguration[]} */
  const configurations = []
  /** @type {Set<string>} */
  const seen = new Set()

  for (const node of findAll(componentOf(doc, 'RunManager'), 'configuration')) {
    if (node.attrs.default === 'true') continue
    const name = attrOf(node, 'name') ?? ''
    const type = attrOf(node, 'type') ?? ''
    const mainClass = optionValue(node, 'MAIN_CLASS_NAME')
    const kind = runKindOf({
      name,
      type,
      programParameters: optionValue(node, 'PROGRAM_PARAMETERS'),
      vmParameters: optionValue(node, 'VM_PARAMETERS'),
      mainClass,
    })
    if (kind === undefined) continue

    const workingDirectory = expandIdeaPath(optionValue(node, 'WORKING_DIRECTORY'), { projectDir })
    const modulePath = toProjectRelative(stripRunDir(workingDirectory), projectDir)
    const key = `${kind}|${modulePath ?? '?'}`
    if (seen.has(key)) continue
    seen.add(key)

    /** @type {IdeaRunConfiguration} */
    const configuration = { name, type, kind }
    if (modulePath !== undefined) configuration.modulePath = modulePath
    if (workingDirectory !== undefined) configuration.workingDirectory = workingDirectory
    if (mainClass !== undefined) configuration.mainClass = mainClass
    configurations.push(configuration)
    if (configurations.length >= MAX_RUN_CONFIGURATIONS) break
  }
  return configurations
}

/**
 * 去掉工作目录末尾的 `run` / `run/<子目录>`，得到模块目录。
 * @param {string | undefined} path
 * @returns {string | undefined}
 */
function stripRunDir(path) {
  if (path === undefined) return undefined
  const trimmed = path.replace(/[\\/]+$/, '')
  const match = /^(.*)[\\/]runs?(?:[\\/].*)?$/i.exec(trimmed)
  if (match !== null && match[1] !== '') return match[1]
  return trimmed
}

/**
 * 库表：`.idea/libraries` 优先，没有就查 IDE 的外部存储。
 *
 * 外部存储（`ExternalStorageConfigurationManager enabled="true"`）把库表放到用户目录下，
 * 按 IDE 产品版本分目录、按 `<工程名>.<hash>` 命名。它比 `.idea` 更可信——内容是 IDE
 * 按工程绝对路径生成的，克隆来的仓库伪造不了；但格式是私有实现，只作辅证，读不到就算了。
 * @param {string} ideaDir
 * @param {string} projectDir
 * @param {{ externalRoots?: string[], externalStorage?: boolean }} options
 * @returns {Promise<IdeasLibrarySummary | undefined>}
 */
async function readLibraries(ideaDir, projectDir, options) {
  const localDir = join(ideaDir, 'libraries')
  /** @type {LibraryEntry[]} */
  const entries = []
  if (await isDirectory(localDir)) {
    for (const name of (await safeReaddir(localDir)).slice(0, MAX_LIBRARY_FILES)) {
      if (!name.toLowerCase().endsWith('.xml')) continue
      const text = await readText(join(localDir, name))
      if (text === undefined) continue
      entries.push(...parseLibraries(text))
    }
  }
  if (entries.length > 0) {
    // 本地库表没有单个 libraries.xml，用 workspace.xml 的 mtime 近似同步时间
    return summarizeLibraries('project', localDir, entries, await mtimeOf(join(ideaDir, 'workspace.xml')))
  }

  // 开关明确关掉时不再看外部存储：那份 libraries.xml 可能是开关打开时的旧产物
  if (options.externalStorage === false) return undefined
  const roots = options.externalRoots ?? defaultExternalRoots()
  if (roots.length === 0) return undefined
  const index = await externalLibraryIndex(roots)
  const hit = index.get(normalizeFsPath(projectDir))
  if (hit === undefined) return undefined
  const file = join(hit.dir, 'external_build_system', 'project', 'libraries.xml')
  const text = await readText(file)
  if (text === undefined) return undefined
  const syncedAt = (await mtimeOf(file)) ?? (await mtimeOf(join(ideaDir, 'workspace.xml')))
  return summarizeLibraries('external', file, parseLibraries(text), syncedAt)
}

/**
 * `misc.xml` 的 ExternalStorageConfigurationManager enabled 开关。
 * 没有这个组件时返回 undefined（按"未知，照常尝试"处理）：老工程与部分 IDE 版本不写它。
 * @param {import('./xml.js').XmlNode | undefined} doc
 * @returns {boolean | undefined}
 */
function readExternalStorageEnabled(doc) {
  const value = attrOf(componentOf(doc, 'ExternalStorageConfigurationManager'), 'enabled')
  if (value === undefined) return undefined
  return value === 'true'
}

/**
 * 文件的修改时间（ISO）；读不到返回 undefined。
 * @param {string} path
 * @returns {Promise<string | undefined>}
 */
async function mtimeOf(path) {
  try {
    return (await stat(path)).mtime.toISOString()
  } catch {
    return undefined
  }
}

/**
 * @typedef {{ group?: string, artifact?: string, version?: string, local: boolean }} LibraryEntry
 */

/**
 * 各平台 JetBrains 外部存储的根。
 * @param {NodeJS.ProcessEnv} [env]
 * @param {NodeJS.Platform} [platform]
 * @returns {string[]}
 */
export function defaultExternalRoots(env = process.env, platform = process.platform) {
  if (platform === 'win32') return env.LOCALAPPDATA === undefined ? [] : [join(env.LOCALAPPDATA, 'JetBrains')]
  if (platform === 'darwin') {
    return env.HOME === undefined ? [] : [join(env.HOME, 'Library', 'Application Support', 'JetBrains')]
  }
  return env.HOME === undefined ? [] : [join(env.HOME, '.local', 'share', 'JetBrains')]
}

/** @type {Map<string, Promise<Map<string, { dir: string, product: string }>>>} */
const externalIndexes = new Map()

/**
 * 工程绝对路径 → IDE 的缓存目录。一次扫描后缓存：扫工作区时每个工程都会问一次。
 * @param {string[]} roots
 * @returns {Promise<Map<string, { dir: string, product: string }>>}
 */
function externalLibraryIndex(roots) {
  const key = roots.join('|')
  const cached = externalIndexes.get(key)
  if (cached !== undefined) return cached
  const pending = buildExternalIndex(roots)
  externalIndexes.set(key, pending)
  return pending
}

/**
 * @param {string[]} roots
 * @returns {Promise<Map<string, { dir: string, product: string }>>}
 */
async function buildExternalIndex(roots) {
  /** @type {Map<string, { dir: string, product: string }>} */
  const index = new Map()
  for (const root of roots) {
    for (const product of await safeReaddir(root)) {
      const projectsDir = join(root, product, 'projects')
      if (!(await isDirectory(projectsDir))) continue
      for (const entry of await safeReaddir(projectsDir)) {
        if (index.size >= MAX_EXTERNAL_PROJECTS) return index
        const dir = join(projectsDir, entry)
        const state = await readText(join(dir, 'cache-state.xml'))
        if (state === undefined) continue
        for (const projectPath of gradleProjectPaths(state)) {
          const key = normalizeFsPath(projectPath)
          if (key !== '' && !index.has(key)) index.set(key, { dir, product })
        }
      }
    }
  }
  return index
}

/**
 * `cache-state.xml` 里 `projectData.GRADLE` 的键就是这个缓存属于哪个工程。
 * 匹配不到就返回空——宁可少读，也不能拿别的工程的库表顶上。
 * @param {string} text
 * @returns {string[]}
 */
function gradleProjectPaths(text) {
  const payload = textOf(componentOf(parseXml(text), 'ExternalSystemProjectTracker'))
  if (payload === '') return []
  try {
    const parsed = JSON.parse(payload)
    const gradle = parsed?.projectData?.GRADLE
    return gradle !== null && typeof gradle === 'object' ? Object.keys(gradle) : []
  } catch {
    return []
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeFsPath(value) {
  const normalized = String(value ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/**
 * @param {string} text
 * @returns {LibraryEntry[]}
 */
function parseLibraries(text) {
  /** @type {LibraryEntry[]} */
  const entries = []
  for (const library of findAll(parseXml(text), 'library')) {
    if (entries.length >= MAX_LIBRARIES) break
    const properties = childOf(library, 'properties')
    const classes = findAll(childOf(library, 'CLASSES'), 'root').map((node) => attrOf(node, 'url') ?? '')
    entries.push({
      group: attrOf(properties, 'groupId'),
      artifact: attrOf(properties, 'artifactId'),
      version: attrOf(properties, 'version'),
      // loom 把 remap 产物放在工程内，这类 jar 不在 ~/.gradle 缓存里
      local: classes.some((url) => url.includes('$PROJECT_DIR$')),
    })
  }
  return entries
}

/**
 * @param {'project' | 'external'} storage
 * @param {string} file
 * @param {LibraryEntry[]} entries
 * @param {string | undefined} syncedAt
 * @returns {IdeasLibrarySummary}
 */
function summarizeLibraries(storage, file, entries, syncedAt) {
  /** @type {string[]} */
  const samples = []
  /** @type {Record<string, string>} */
  const resolved = {}
  let mapped = 0
  for (const entry of entries) {
    if (entry.group === undefined || entry.artifact === undefined || entry.version === undefined) continue
    const key = `${entry.group}:${entry.artifact}`
    if (samples.length < 5) samples.push(`${key}:${entry.version}`)
    // 同一坐标出现多次时保留第一条（例如同一库的不同 classifier）；上限 800 条
    if (mapped < MAX_LIBRARIES && !Object.hasOwn(resolved, key)) {
      resolved[key] = entry.version
      mapped += 1
    }
  }
  /** @type {IdeasLibrarySummary} */
  const summary = {
    storage,
    file,
    count: entries.length,
    local: entries.filter((entry) => entry.local).length,
    samples,
  }
  // 一条完整坐标都没有时不给索引：否则所有声明都会被误报成"未解析"
  if (mapped > 0) summary.resolved = resolved
  if (syncedAt !== undefined) summary.syncedAt = syncedAt
  return summary
}

/**
 * 一行摘要，给证据用。
 * @param {IdeaProject} idea
 * @returns {string}
 */
export function describeIdea(idea) {
  const parts = []
  if (idea.projectName !== undefined) parts.push(idea.projectName)
  if (idea.gradleModules.length > 0) parts.push(t('idea.modules', { count: idea.gradleModules.length }))
  if (idea.runConfigurations.length > 0) parts.push(t('idea.runConfigs', { count: idea.runConfigurations.length }))
  return parts.join(' · ')
}
