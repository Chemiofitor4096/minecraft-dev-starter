/**
 * 读 IntelliJ IDEA 的 `.idea` 目录：模块清单、facet 平台、工程 JDK、运行配置。
 *
 * 只作为识别引擎的辅助证据源：构建脚本优先，读不到时才用它兜底。
 * @module minecraft-dev-starter/lib/idea
 */

import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { readText } from './text.js'
import { attrOf, componentOf, findFirst, findAll, optionValue, parseXml, rootOf, textOf } from './xml.js'

/** IDE 工程目录名。 */
export const IDEA_DIR = '.idea'

const MAX_IML = 60
const MAX_RUN_CONFIGURATIONS = 80

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
 * @property {string[]} contentRoots
 * @property {string | undefined} gradlePath 相对工程根，`.` 是根模块
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
 * @property {string[]} gradleModules
 * @property {IdeaModule[]} modules
 * @property {IdeaRunConfiguration[]} runConfigurations
 * @property {string[]} platforms
 * @property {string[]} linkedProjects
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
 * @returns {Promise<IdeaProject | undefined>}
 */
export async function readIdeaProject(input) {
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

  return {
    dir,
    projectDir,
    projectName: nameText === undefined ? undefined : nameText.trim() || undefined,
    gradleRoot: gradle.gradleRoot,
    gradleJvm: gradle.gradleJvm,
    jdkName: readJdkName(miscXml === undefined ? undefined : parseXml(miscXml)),
    languageLevel: readLanguageLevel(miscXml === undefined ? undefined : parseXml(miscXml)),
    bytecodeTarget: readBytecodeTarget(compilerXml === undefined ? undefined : parseXml(compilerXml)),
    gradleModules: gradle.gradleModules,
    modules,
    runConfigurations: readRunConfigurations(workspaceXml === undefined ? undefined : parseXml(workspaceXml), projectDir),
    platforms: [...new Set(modules.flatMap((module) => module.platforms))].sort(),
    linkedProjects: gradle.linkedProjects,
    files,
  }
}

/**
 * 往上找拥有这个目录的聚合工程（父工程的 `.idea` 模块清单里有它）。
 * @param {string} input 子模块目录
 * @param {number} [maxLevels] 最多往上找几层
 * @returns {Promise<{ idea: IdeaProject, modulePath: string, parentDir: string } | undefined>}
 */
export async function findOwningAggregator(input, maxLevels = 4) {
  const origin = resolveProjectDir(input)
  if (origin === '') return undefined
  let ancestor = origin
  for (let level = 0; level < maxLevels; level += 1) {
    const parentDir = dirname(ancestor)
    if (parentDir === ancestor) return undefined
    const idea = await readIdeaProject(parentDir)
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
    if (path !== undefined && !paths.includes(path)) paths.push(path)
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
    const srgType = optionValue(componentOf(doc, 'McpModuleSettings'), 'srgType')
    if (srgType !== undefined) module.srgType = srgType
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
 * 一行摘要，给证据用。
 * @param {IdeaProject} idea
 * @returns {string}
 */
export function describeIdea(idea) {
  const parts = []
  if (idea.projectName !== undefined) parts.push(idea.projectName)
  if (idea.gradleModules.length > 0) parts.push(`${idea.gradleModules.length} 个模块`)
  if (idea.runConfigurations.length > 0) parts.push(`${idea.runConfigurations.length} 个运行配置`)
  return parts.join(' · ')
}
