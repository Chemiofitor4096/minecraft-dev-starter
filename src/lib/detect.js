/**
 * 工程识别：把一个目录翻译成结构化画像（loader / 版本 / 模块 / 可运行目标 / JDK / 证据）。
 *
 * 设计原则：
 *   - 一切结论附证据，读不出就报 unknown，不猜；
 *   - 任务目标来自构建脚本里的 `runs` 块，读不到时给"推测"标记；
 *   - 不执行 Gradle（代价与失败率见调研文档）。
 * @module minecraft-dev-starter/lib/detect
 */

import { basename, join } from 'node:path'
import { stat } from 'node:fs/promises'
import {
  minecraftFromNeoVersion,
  parseJavaLevel,
  parseMinecraftVersion,
  parsePluginIds,
  parseRuns,
  parseSettingsIncludes,
  parseWrapperVersion,
} from './gradle.js'
import { dependencyRanges, locateMetadata, primaryMetadata } from './metadata.js'
import { readText, resolvePlaceholders, parseProperties } from './text.js'
import { gradleSupportsJava, pickJdk, requiredJava } from './java.js'
import { modeOf } from './verify.js'

/**
 * @typedef {{ file: string, kind: string, detail: string }} Evidence
 * @typedef {{ task: string, label: string, kind: string, mode: 'daemon' | 'oneshot', guessed: boolean }} Target
 * @typedef {{ path: string, dir: string, platform: string, pluginIds: string[], targets: Target[] }} ModuleInfo
 */

/** loader 判定：插件 id 正则 → loader。顺序有意义，先命中先得。 */
const LOADER_RULES = [
  { loader: 'neoforge', ids: [/^net\.neoforged\.moddev$/, /^net\.neoforged\.gradle\.userdev$/, /^net\.neoforged\.gradle$/] },
  { loader: 'fabric', ids: [/^fabric-loom$/, /^net\.fabricmc\.fabric-loom$/] },
  { loader: 'forge', ids: [/^net\.minecraftforge\.gradle(\.userdev)?$/, /^forge$/] },
  { loader: 'paper', ids: [/^paperweight/, /^io\.papermc\.paper/] },
  { loader: 'spigot', ids: [/^spigot/] },
  { loader: 'architectury', ids: [/^architectury-plugin$/, /^architectury$/, /^dev\.architectury\.loom$/] },
]

/** 推测默认目标：只在构建脚本读不到 runs 块时使用。 */
const DEFAULT_TARGETS = {
  fabric: [
    { block: 'client', kind: 'client' },
    { block: 'server', kind: 'server' },
  ],
  forge: [
    { block: 'client', kind: 'client' },
    { block: 'server', kind: 'server' },
    { block: 'data', kind: 'data' },
  ],
  neoforge: [
    { block: 'client', kind: 'client' },
    { block: 'server', kind: 'server' },
    { block: 'data', kind: 'data' },
  ],
}

/**
 * 识别一个工程。
 * @param {string} root 工程根目录（绝对路径）
 * @param {{ jdks?: import('./java.js').JdkInfo[], maxModules?: number }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function detectProject(root, options = {}) {
  /** @type {Evidence[]} */
  const evidence = []
  /** @type {string[]} */
  const warnings = []
  /** @type {string[]} */
  const conflicts = []

  const gradleFile = await pickExisting(root, ['build.gradle.kts', 'build.gradle'])
  const gradleText = gradleFile === undefined ? undefined : await readText(join(root, gradleFile))
  const settingsFile = await pickExisting(root, ['settings.gradle.kts', 'settings.gradle'])
  const settingsText = settingsFile === undefined ? undefined : await readText(join(root, settingsFile))
  const properties = parseProperties(await readText(join(root, 'gradle.properties')))
  const wrapperProperties = parseProperties(await readText(join(root, 'gradle/wrapper/gradle-wrapper.properties')))
  const gradleVersion = parseWrapperVersion(wrapperProperties)

  const pluginIds = [...parsePluginIds(gradleText ?? ''), ...parsePluginIds(settingsText ?? '')]
  const includes = parseSettingsIncludes(settingsText ?? '')

  if (gradleFile !== undefined) {
    evidence.push({ file: gradleFile, kind: 'build-script', detail: `Gradle 构建脚本（${gradleFile.endsWith('.kts') ? 'Kotlin DSL' : 'Groovy'}）` })
  }
  if (gradleVersion !== undefined) {
    evidence.push({ file: 'gradle/wrapper/gradle-wrapper.properties', kind: 'wrapper', detail: `Gradle ${gradleVersion}` })
  } else if (gradleFile !== undefined) {
    warnings.push('没有 gradle wrapper，需要本机装 Gradle 才能构建')
  }

  // ── 模块展开 ────────────────────────────────────────────────────────
  const modulePaths = includes.length > 0 ? ['.', ...includes.slice(0, options.maxModules ?? 12)] : ['.']
  /** @type {ModuleInfo[]} */
  const modules = []
  /** @type {Awaited<ReturnType<typeof locateMetadata>>} */
  let allMetadata = []
  /** @type {string[]} */
  const modulePluginIds = []
  /** @type {Array<Record<string, string>>} 模块级 gradle.properties，聚合仓库的版本常写在子模块里 */
  const moduleProperties = []
  /** @type {number[]} 模块级 Java toolchain */
  const moduleJavaLevels = []

  for (const modulePath of modulePaths) {
    const dir = modulePath === '.' ? root : join(root, modulePath)
    const moduleGradleFile = await pickExisting(dir, ['build.gradle.kts', 'build.gradle'])
    const moduleText = moduleGradleFile === undefined ? undefined : await readText(join(dir, moduleGradleFile))
    const moduleIds = parsePluginIds(moduleText ?? '')
    modulePluginIds.push(...moduleIds)
    const runs = parseRuns(moduleText ?? '')
    const metadata = await locateMetadata(dir)
    allMetadata = allMetadata.concat(metadata)
    const platform = detectPlatform(moduleIds, moduleText ?? '')
    moduleProperties.push(parseProperties(await readText(join(dir, 'gradle.properties'))))
    const javaLevel = parseJavaLevel(moduleText ?? '')
    if (javaLevel !== undefined) moduleJavaLevels.push(javaLevel)
    if (metadata.length > 0) {
      evidence.push({
        file: modulePath === '.' ? metadata[0].file : `${modulePath}/${metadata[0].file}`,
        kind: `metadata:${metadata[0].kind}`,
        detail: `${metadata[0].kind} 元数据`,
      })
    }
    modules.push({ path: modulePath, dir, platform: platform ?? 'unknown', pluginIds: moduleIds, targets: runs.map(toTarget) })
  }

  // 聚合仓库（如 AnnoCore）把版本写在子模块里：根属性优先，模块属性补齐。
  /** @type {Record<string, string>} */
  const mergedProperties = Object.assign({}, ...moduleProperties.slice().reverse(), properties)

  // ── loader ─────────────────────────────────────────────────────────
  // 先看根脚本；根脚本没声明时再看子模块（聚合仓库常见：AnnoCore 的 loader 全在子模块里）。
  const allPluginIds = [...new Set([...pluginIds, ...modulePluginIds])]
  /** @type {string | undefined} */
  let loader
  /** @type {string | undefined} */
  let loaderEvidenceId
  for (const rule of LOADER_RULES) {
    const hit = pluginIds.find((id) => rule.ids.some((pattern) => pattern.test(id)))
    if (hit !== undefined) {
      loader = rule.loader
      loaderEvidenceId = hit
      evidence.push({ file: gradleFile ?? 'build.gradle', kind: 'plugin', detail: `插件 ${hit}` })
      break
    }
  }
  if (loader === undefined) {
    for (const rule of LOADER_RULES) {
      const hit = modulePluginIds.find((id) => rule.ids.some((pattern) => pattern.test(id)))
      if (hit !== undefined) {
        loader = rule.loader
        loaderEvidenceId = hit
        evidence.push({ file: '子模块构建脚本', kind: 'plugin', detail: `插件 ${hit}（只在子模块声明）` })
        break
      }
    }
  }

  // 所有命中过的 loader（多平台工程可能同时有 fabric 与 neoforge）
  const loaders = [
    ...new Set(
      LOADER_RULES.filter((rule) => allPluginIds.some((id) => rule.ids.some((pattern) => pattern.test(id)))).map(
        (rule) => rule.loader,
      ),
    ),
  ]

  const metadataKind = primaryMetadata(allMetadata)?.kind
  if (loader === undefined && metadataKind !== undefined) {
    loader = metadataKind === 'bukkit' ? 'spigot' : metadataKind
    loaders.push(loader)
    evidence.push({ file: 'metadata', kind: 'metadata-only', detail: `只有 ${metadataKind} 元数据，没有构建脚本特征` })
  }

  // 元数据与构建脚本矛盾时记冲突，不静默选一个
  if (loader !== undefined && metadataKind !== undefined) {
    const mapped = metadataKind === 'bukkit' ? 'spigot' : metadataKind
    const compatible = loader === mapped || (loader === 'architectury' && mapped !== 'architectury')
    if (!compatible) {
      conflicts.push(`构建脚本表明 ${loader}，元数据却是 ${mapped}`)
    }
  }

  // ── 版本 ────────────────────────────────────────────────────────────
  const minecraftVersion =
    pickProperty(mergedProperties, ['minecraft_version', 'minecraftVersion', 'mc_version', 'mcVersion', 'version_minecraft']) ??
    minecraftFromNeoVersion(pickProperty(mergedProperties, ['neo_version', 'neoVersion'])) ??
    (await versionFromMetadata(allMetadata)) ??
    parseMinecraftVersion(gradleText ?? '', mergedProperties) ??
    pickProperty(mergedProperties, ['parchment_minecraft_version'])

  const loaderVersion = pickProperty(mergedProperties, [
    'neo_version',
    'neoVersion',
    'loader_version',
    'loaderVersion',
    'forge_version',
    'forgeVersion',
    'fabric_loader_version',
    'fabric_api_version',
    'paper_api_version',
    'spigot_version',
  ])

  // ── 身份 ────────────────────────────────────────────────────────────
  const identity = readIdentity(allMetadata, mergedProperties, root, warnings)

  // ── 可运行目标 ──────────────────────────────────────────────────────
  const hasDeclaredTargets = modules.some((module) => module.targets.length > 0)
  if (!hasDeclaredTargets && loader !== undefined) {
    applyGuessedTargets(modules, loader)
    if (modules.some((module) => module.targets.length > 0)) {
      warnings.push('构建脚本里没读到 runs 块，目标是按 loader 惯例推测的（未验证）')
    }
  }
  const runTargets = modules.flatMap((module) =>
    module.targets.map((target) => ({
      ...target,
      module: module.path,
      taskPath: module.path === '.' ? target.task : `:${module.path}:${target.task}`,
      platform: module.platform,
    })),
  )

  // ── JDK ────────────────────────────────────────────────────────────
  const toolchain = parseJavaLevel(gradleText ?? '') ?? (moduleJavaLevels.length > 0 ? Math.max(...moduleJavaLevels) : undefined)
  const javaRequired = toolchain ?? requiredJava(/** @type {string | undefined} */ (minecraftVersion))
  const configuredJavaHome = pickProperty(properties, ['org.gradle.java.home'])
  const jdks = options.jdks ?? []
  const picked = pickJdk(jdks, javaRequired, configuredJavaHome)
  if (picked === undefined) {
    warnings.push(`没找到可用的 JDK${javaRequired === undefined ? '' : ` ${javaRequired}`}`)
  } else if (!picked.exact && javaRequired !== undefined) {
    warnings.push(`JDK ${javaRequired} 未找到，退而使用 ${picked.home}`)
  }
  const gradleCheck = gradleSupportsJava(gradleVersion, javaRequired)
  if (!gradleCheck.ok && gradleCheck.reason !== undefined) warnings.push(gradleCheck.reason)
  if (properties['org.gradle.configuration-cache'] === 'true') {
    warnings.push('已开启 org.gradle.configuration-cache，与部分 mod 插件组合可能不兼容')
  }
  if (conflicts.length > 0) warnings.push(`识别到矛盾：${conflicts.join('；')}`)

  const kind = classify({ modules, loader, loaders, metadataKind })
  const confidence = scoreConfidence({ loader, metadataKind, configuredJavaHome })

  return {
    root,
    name: basename(root),
    kind,
    loader: loader ?? 'unknown',
    loaders,
    loaderEvidence: loaderEvidenceId,
    loaderVersion,
    minecraftVersion,
    modId: identity.modId,
    modName: identity.modName,
    modVersion: identity.modVersion,
    javaVersion: javaRequired,
    java: {
      required: javaRequired,
      toolchain,
      configured: configuredJavaHome,
      selected: picked?.home,
      exact: picked?.exact ?? false,
      available: jdks.map((jdk) => ({ home: jdk.home, major: jdk.major })),
    },
    gradleVersion,
    wrapper: gradleVersion !== undefined,
    modules: modules.map((module) => ({
      path: module.path,
      platform: module.platform,
      targets: module.targets.map((target) => ({
        ...target,
        taskPath: module.path === '.' ? target.task : `:${module.path}:${target.task}`,
      })),
    })),
    runTargets,
    evidence,
    conflicts,
    warnings,
    confidence,
  }
}

/**
 * @param {string} root
 * @param {string[]} names
 * @returns {Promise<string | undefined>}
 */
async function pickExisting(root, names) {
  for (const name of names) {
    try {
      const info = await stat(join(root, name))
      if (info.isFile()) return name
    } catch {
      /* 继续找下一个 */
    }
  }
  return undefined
}

/**
 * @param {string[]} pluginIds
 * @param {string} moduleText
 * @returns {string | undefined} fabric / forge / neoforge / common / undefined
 */
function detectPlatform(pluginIds, moduleText) {
  if (pluginIds.some((id) => /fabric-loom/.test(id))) return 'fabric'
  if (pluginIds.some((id) => /neoforged/.test(id))) return 'neoforge'
  if (pluginIds.some((id) => /minecraftforge/.test(id))) return 'forge'
  // Architectury 的平台由 architectury { fabric() } / { forge() } 声明
  if (/\barchitectury\s*\{[^}]*\bfabric\s*\(/.test(moduleText)) return 'fabric'
  if (/\barchitectury\s*\{[^}]*\bforge\s*\(/.test(moduleText)) return 'forge'
  if (/\bmedialib\s*\(|\bcommon\s*\(\s*\)/.test(moduleText)) return 'common'
  return undefined
}

/**
 * @param {{ block: string, kind: string, task: string, label: string }} run
 * @returns {Target}
 */
function toTarget(run) {
  return { task: run.task, label: run.label, kind: run.kind, mode: modeOf(run.kind), guessed: false }
}

/**
 * 读不到 runs 时，按多少给候选：
 *   - 单模块工程：给完整的默认集（Client/Server[/Data]），因为只有一个入口；
 *   - 多模块工程：每个平台模块只给一个 Client，避免聚合仓库列出十几行噪音。
 * architectury 的 common 模块不猜（它通常没有客户端）。
 * @param {ModuleInfo[]} modules
 * @param {string} loader
 */
function applyGuessedTargets(modules, loader) {
  const concrete = modules.filter(
    (module) => module.targets.length === 0 && module.platform !== 'unknown' && module.platform !== 'common',
  )
  if (concrete.length === 0) return
  const singleRoot = concrete.length === 1 && concrete[0].path === '.'

  for (const module of concrete) {
    const defaults = DEFAULT_TARGETS[/** @type {keyof typeof DEFAULT_TARGETS} */ (module.platform)]
    if (defaults === undefined) continue
    const chosen = singleRoot ? defaults : defaults.filter((entry) => entry.kind === 'client')
    module.targets = chosen.map((entry) => ({
      task: `run${entry.block[0].toUpperCase()}${entry.block.slice(1)}`,
      label: entry.kind === 'gameTestServer' ? 'GameTestServer' : entry.kind[0].toUpperCase() + entry.kind.slice(1),
      kind: entry.kind,
      mode: modeOf(entry.kind),
      guessed: true,
    }))
  }
  void loader
}

/**
 * @param {Record<string, string>} properties
 * @param {string[]} keys
 * @returns {string | undefined}
 */
function pickProperty(properties, keys) {
  for (const key of keys) {
    const value = properties[key]
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

/**
 * @param {Awaited<ReturnType<typeof locateMetadata>>} hits
 * @returns {Promise<string | undefined>}
 */
async function versionFromMetadata(hits) {
  const primary = primaryMetadata(hits)
  if (primary === undefined) return undefined
  const ranges = dependencyRanges(primary)
  const range = ranges.minecraft
  if (range !== undefined) {
    const match = /(\d+\.\d+(?:\.\d+)?)/.exec(range)
    if (match) return match[1]
  }
  if (primary.kind === 'mcmod' && typeof primary.data.mcversion === 'string') {
    return primary.data.mcversion
  }
  return undefined
}

/**
 * @param {Awaited<ReturnType<typeof locateMetadata>>} hits
 * @param {Record<string, string>} properties
 * @param {string} root
 * @param {string[]} warnings
 */
function readIdentity(hits, properties, root, warnings) {
  const primary = primaryMetadata(hits)
  const data = primary?.data ?? {}
  /** @type {string[]} */
  const unresolved = []

  const raw = {
    modId: asString(data.id) ?? asString(data.modId) ?? asString(data.modid) ?? asString(data.name),
    modName: asString(data.name) ?? asString(data.displayName),
    modVersion: asString(data.version),
  }

  const resolve = (value) => {
    if (value === undefined) return undefined
    const result = resolvePlaceholders(value, properties)
    if (result.unresolved.length > 0) unresolved.push(...result.unresolved)
    return result.value
  }

  const modId = resolve(raw.modId) ?? properties.mod_id ?? properties.modid
  const modName = resolve(raw.modName) ?? properties.mod_name ?? modId ?? basename(root)
  const modVersion = resolve(raw.modVersion) ?? properties.mod_version ?? properties.version

  if (unresolved.length > 0) {
    warnings.push(`元数据里有未解析的占位符：${[...new Set(unresolved)].join(', ')}`)
  }
  return { modId, modName, modVersion }
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function asString(value) {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * 工程种类。判 multi-loader 要求"至少认出一种 loader"——什么都没认出来时
 * 只能说 unknown，不能因为模块平台标签不一致就升级成多平台。
 * @param {{ modules: ModuleInfo[], loader?: string, loaders: string[], metadataKind?: string }} input
 * @returns {string}
 */
function classify(input) {
  if (input.metadataKind === 'bukkit' || input.metadataKind === 'paper') return 'server-plugin'
  if (input.loader === undefined) return 'unknown'
  if (input.loader === 'architectury') return 'multi-loader'
  const concrete = input.loaders.filter((loader) => loader !== 'architectury')
  if (concrete.length > 1) return 'multi-loader'
  const platforms = new Set(
    input.modules.map((module) => module.platform).filter((platform) => platform !== 'unknown' && platform !== 'common'),
  )
  if (platforms.size > 1) return 'multi-loader'
  return 'mod'
}

/**
 * @param {{ loader?: string, metadataKind?: string, configuredJavaHome?: string }} input
 * @returns {number}
 */
function scoreConfidence(input) {
  if (input.loader === undefined) return 0.2
  if (input.metadataKind !== undefined) return 0.95
  return input.loader === 'architectury' ? 0.7 : 0.8
}
