/**
 * 工程识别：把一个目录翻译成结构化画像（loader / 版本 / 模块 / 可运行目标 / JDK / 证据）。
 *
 * 设计原则：
 *   - 一切结论附证据，读不出就报 unknown，不猜；
 *   - 任务目标来自构建脚本里的 `runs` 块，读不到时给"推测"标记；
 *   - 不执行 Gradle（代价与失败率见调研文档）。
 *
 * 证据源有两个，构建脚本是主、`.idea` 是辅：
 *   - `.idea` 是 IDEA 的 Gradle 同步结果，能补上"模块清单""facet 平台""人跑过的运行配置"；
 *   - 但它只用来**补齐和兜底**，绝不推翻构建脚本读到的 loader 与目标。
 * @module minecraft-dev-starter/lib/detect
 */

import { basename, join } from 'node:path'
import { stat } from 'node:fs/promises'
import {
  minecraftFromNeoVersion,
  parseJavaLevel,
  parseMinecraftVersion,
  parsePluginIds,
  parseRootProjectName,
  parseRuns,
  parseSettingsIncludes,
  parseWrapperVersion,
} from './gradle.js'
import { dependencyRanges, locateMetadata, primaryMetadata } from './metadata.js'
import { parseBuildDependencies, parseVersionCatalog, resolveCatalogRefs, toModDependencies } from './deps.js'
import { readText, resolvePlaceholders, parseProperties } from './text.js'
import { gradleSupportsJava, pickJdk, requiredJava } from './java.js'
import { describeIdea, findOwningAggregator, loadersFromPlatforms, readIdeaProject, resolveProjectDir } from './idea.js'
import { modeOf } from './verify.js'

/**
 * @typedef {{ file: string, kind: string, detail: string }} Evidence
 * @typedef {{ task: string, label: string, kind: string, mode: 'daemon' | 'oneshot', guessed: boolean, source?: 'build-script' | 'idea-run-config' | 'guessed' }} Target
 * @typedef {{ path: string, dir: string, platform: string, pluginIds: string[], targets: Target[] }} ModuleInfo
 */

/** loader 判定：插件 id 正则 → loader。顺序有意义，先命中先得。 */
const LOADER_RULES = [
  // NeoForge 团队写的 legacyforge 插件产出的是 **Forge 1.20.1** 模组，
  // 必须排在 neoforge 前面，否则按组织名会被判成 NeoForge（见 doc/策划.md §识别修正）。
  { loader: 'forge', ids: [/^net\.neoforged\.moddev\.legacyforge$/] },
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
 * @param {{ jdks?: import('./java.js').JdkInfo[], maxModules?: number, overrideJavaHome?: string }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function detectProject(root, options = {}) {
  // 传进来的可能是 `.idea` 目录（从 IDE 里复制路径很常见）：退回工程根再识别
  root = resolveProjectDir(root)
  /** @type {Evidence[]} */
  const evidence = []
  /** @type {string[]} */
  const warnings = []
  /** @type {string[]} */
  const conflicts = []

  // 自己目录里的 .idea；没有就往上找聚合根（子模块工程）
  const ownIdea = await readIdeaProject(root)
  const aggregator = ownIdea === undefined ? await findOwningAggregator(root) : undefined
  const idea = ownIdea ?? aggregator?.idea
  /** 本工程在父工程里的模块路径，只有子模块工程才有 */
  const modulePath = aggregator?.modulePath
  /** 任务路径前缀：子模块工程要跑 `:modules/X:runClient` */
  const taskPrefix = modulePath === undefined ? '' : `:${modulePath}`
  /**
   * 模块在 Gradle 里的位置：子模块工程是 `modules/X`，聚合根工程是模块自身路径
   * @param {string} path
   * @returns {string}
   */
  const gradlePathOf = (path) => (modulePath === undefined ? path : path === '.' ? modulePath : `${modulePath}/${path}`)

  /**
   * @param {string} path 模块路径，`.` 是根模块
   * @param {string} task
   * @returns {string}
   */
  const taskPathOf = (path, task) => {
    const scope = `${taskPrefix}${path === '.' ? '' : `:${path}`}`
    return scope === '' ? task : `${scope}:${task}`
  }

  const gradleFile = await pickExisting(root, ['build.gradle.kts', 'build.gradle'])
  const gradleText = gradleFile === undefined ? undefined : await readText(join(root, gradleFile))
  const settingsFile = await pickExisting(root, ['settings.gradle.kts', 'settings.gradle'])
  const settingsText = settingsFile === undefined ? undefined : await readText(join(root, settingsFile))

  // 子模块工程：构建脚本、wrapper、属性都在父工程里
  const parentRoot = aggregator?.parentDir
  const parentGradleFile = parentRoot === undefined ? undefined : await pickExisting(parentRoot, ['build.gradle.kts', 'build.gradle'])
  const parentGradleText =
    parentRoot === undefined || parentGradleFile === undefined ? undefined : await readText(join(parentRoot, parentGradleFile))

  const ownProperties = parseProperties(await readText(join(root, 'gradle.properties')))
  const parentProperties = parentRoot === undefined ? {} : parseProperties(await readText(join(parentRoot, 'gradle.properties')))
  const properties = { ...parentProperties, ...ownProperties }
  const wrapperProperties = parseProperties(await readText(join(root, 'gradle/wrapper/gradle-wrapper.properties')))
  const parentWrapper =
    parentRoot === undefined ? {} : parseProperties(await readText(join(parentRoot, 'gradle/wrapper/gradle-wrapper.properties')))
  const ownWrapperVersion = parseWrapperVersion(wrapperProperties)
  const gradleVersion = ownWrapperVersion ?? parseWrapperVersion(parentWrapper)
  const catalogFile = await pickExisting(root, ['gradle/libs.versions.toml', 'libs.versions.toml'])
  const catalogText = catalogFile === undefined ? undefined : await readText(join(root, catalogFile))

  const pluginIds = [
    ...parsePluginIds(gradleText ?? ''),
    ...parsePluginIds(settingsText ?? ''),
    ...parsePluginIds(parentGradleText ?? ''),
  ]
  const includes = parseSettingsIncludes(settingsText ?? '')

  if (gradleFile !== undefined) {
    evidence.push({ file: gradleFile, kind: 'build-script', detail: `Gradle 构建脚本（${gradleFile.endsWith('.kts') ? 'Kotlin DSL' : 'Groovy'}）` })
  }
  if (gradleVersion !== undefined) {
    const inherited = ownWrapperVersion === undefined
    evidence.push({
      file: inherited ? '父工程 gradle/wrapper/gradle-wrapper.properties' : 'gradle/wrapper/gradle-wrapper.properties',
      kind: 'wrapper',
      detail: `Gradle ${gradleVersion}${inherited ? '（继承自父工程）' : ''}`,
    })
  } else if (gradleFile !== undefined) {
    warnings.push('没有 gradle wrapper，需要本机装 Gradle 才能构建')
  }
  if (aggregator !== undefined && modulePath !== undefined) {
    evidence.push({
      file: '.idea/gradle.xml',
      kind: 'subproject',
      detail: `子模块工程：父工程 ${aggregator.parentDir}，任务前缀 ${taskPrefix}`,
    })
  }
  if (ownIdea !== undefined) {
    evidence.push({ file: '.idea', kind: 'idea-model', detail: `IDEA 工程模型：${describeIdea(ownIdea)}` })
    if (ownIdea.gradleRoot !== undefined && ownIdea.gradleRoot.toLowerCase() !== root.toLowerCase()) {
      evidence.push({ file: '.idea/gradle.xml', kind: 'idea-gradle', detail: `Gradle 工程根是 ${ownIdea.gradleRoot}` })
    }
    if (ownIdea.libraries !== undefined) {
      const { count, local } = ownIdea.libraries
      evidence.push({
        file: ownIdea.libraries.file,
        kind: 'idea-libraries',
        detail: `Gradle 同步的库表：${count} 条${local === 0 ? '' : `，其中 ${local} 条是工程内 remap 产物`}`,
      })
    }
  }

  // ── 模块展开 ────────────────────────────────────────────────────────
  // settings.gradle 的 include 是主，自己 `.idea` 的模块清单兜底
  const maxModules = options.maxModules ?? 12
  const declaredModules = [...includes, ...(ownIdea?.gradleModules ?? [])]
  /** @type {string[]} */
  const modulePaths = ['.']
  /** @type {string[]} */
  const ideaOnlyModules = []
  const includeSet = new Set(includes.map(normalizeModulePath))
  for (const candidate of declaredModules) {
    const candidatePath = normalizeModulePath(candidate)
    if (candidatePath === '' || candidatePath === '.' || modulePaths.includes(candidatePath)) continue
    if (modulePaths.length - 1 >= maxModules) break
    const dir = join(root, candidatePath)
    if (!(await isDirectory(dir))) continue
    // 只用来分组的目录（如 `modules/`）没有构建脚本，不算模块
    if (await pickExisting(dir, ['build.gradle.kts', 'build.gradle']) === undefined) continue
    modulePaths.push(candidatePath)
    if (!includeSet.has(candidatePath)) ideaOnlyModules.push(candidatePath)
  }
  if (ideaOnlyModules.length > 0) {
    evidence.push({
      file: '.idea/gradle.xml',
      kind: 'idea-modules',
      detail: `${ideaOnlyModules.length} 个模块只在 IDE 的 Gradle 模块清单里：${ideaOnlyModules.slice(0, 6).join('、')}`,
    })
  }
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
  /** 根模块自己有没有元数据：聚合工程没有，元数据全在子模块里 */
  let rootHasMetadata = false

  for (const modulePath of modulePaths) {
    const dir = modulePath === '.' ? root : join(root, modulePath)
    const moduleGradleFile = await pickExisting(dir, ['build.gradle.kts', 'build.gradle'])
    const moduleText = moduleGradleFile === undefined ? undefined : await readText(join(dir, moduleGradleFile))
    const moduleIds = parsePluginIds(moduleText ?? '')
    modulePluginIds.push(...moduleIds)
    const runs = parseRuns(moduleText ?? '')
    const metadata = await locateMetadata(dir)
    if (modulePath === '.' && metadata.length > 0) rootHasMetadata = true
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

  // 构建脚本读不出 loader 时用 IDE 的 facet 兜底：
  // facet 的 FORGE 也覆盖 NeoForge 工程，所以它只能补缺，不能纠正已判定的 loader
  /** @type {boolean} */
  let loaderFromFacet = false
  if (loader === undefined && idea !== undefined) {
    const facetLoader = loadersFromPlatforms(idea.platforms)[0]
    if (facetLoader !== undefined) {
      loader = facetLoader
      loaderFromFacet = true
      evidence.push({
        file: '.idea',
        kind: 'idea-facet',
        detail: `构建脚本没读出 loader，按 minecraft facet 平台 ${idea.platforms.join(' / ')} 判定`,
      })
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
  if (loaderFromFacet && loader !== undefined && !loaders.includes(loader)) loaders.push(loader)

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
  let minecraftVersion =
    pickProperty(mergedProperties, ['minecraft_version', 'minecraftVersion', 'mc_version', 'mcVersion', 'version_minecraft']) ??
    minecraftFromNeoVersion(pickProperty(mergedProperties, ['neo_version', 'neoVersion'])) ??
    (await versionFromMetadata(allMetadata)) ??
    parseMinecraftVersion(gradleText ?? '', mergedProperties) ??
    pickProperty(mergedProperties, ['parchment_minecraft_version'])

  // 构建脚本一个版本都读不出来时，用 IDE 工程模型的 McpModuleSettings.minecraftVersion 兜底。
  // 它是 MC Development 插件同步进来的结果，只是佐证，不参与纠正。
  if (minecraftVersion === undefined && idea?.minecraftVersion !== undefined) {
    minecraftVersion = idea.minecraftVersion
    evidence.push({
      file: '.idea',
      kind: 'idea-mc',
      detail: `构建脚本没读出 MC 版本，按 IDE 工程模型里的 ${idea.minecraftVersion} 判定`,
    })
  }

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

  // 聚合工程：根目录没有自己的元数据，元数据全在子模块里。
  // 这时**不能**把第一个子模块的身份当成整个工程的——否则 CTNH-Modules 会顶着
  // 子模块的 "CTNH Bio" 出现在胶囊和面板标题上，看起来"所有东西都归了 bio"。
  const aggregatorName = parseRootProjectName(settingsText ?? '') ?? idea?.projectName
  const isAggregator = !rootHasMetadata && modules.length > 1 && allMetadata.length > 0
  if (isAggregator) {
    identity.modName = aggregatorName ?? basename(root)
    identity.modId = undefined
    identity.modVersion = undefined
    evidence.push({
      file: settingsFile ?? '.idea',
      kind: 'aggregator',
      detail: `根目录没有元数据（是多模块聚合工程），工程名取 ${aggregatorName === undefined ? '目录名' : `rootProject.name「${aggregatorName}」`}；各子模块的 mods.toml 属于模块本身`,
    })
  }

  // ── 模块平台与运行目标 ──────────────────────────────────────────────
  // 模块平台：构建脚本没写平台时用 IDE 的 facet 补（不纠正已判定的 loader）
  for (const module of modules) {
    if (module.platform !== 'unknown') continue
    const facetPlatform = aggregator === undefined
      ? platformOfModule(idea, module.path)
      : platformOfModule(aggregator.idea, modulePath)
    if (facetPlatform === undefined) continue
    if (facetPlatform === 'forge' && loader === 'neoforge') continue
    module.platform = facetPlatform
    evidence.push({ file: '.idea', kind: 'idea-facet', detail: `${module.path} 的 minecraft facet 平台是 ${facetPlatform}` })
  }

  // 子模块工程：只继承父工程里属于这个模块的运行配置
  if (aggregator !== undefined && modulePath !== undefined) {
    mergeIdeaTargets(
      modules,
      {
        ...aggregator.idea,
        runConfigurations: aggregator.idea.runConfigurations
          .filter((config) => config.modulePath === modulePath)
          .map((config) => ({ ...config, modulePath: '.' })),
      },
      evidence,
    )
  } else {
    mergeIdeaTargets(modules, idea, evidence)
  }

  const hasDeclaredTargets = modules.some((module) => module.targets.length > 0)
  if (!hasDeclaredTargets && loader !== undefined) {
    applyGuessedTargets(modules, loader)
    if (modules.some((module) => module.targets.length > 0)) {
      warnings.push('构建脚本与 IDE 里都没读到运行目标，目标是按 loader 惯例推测的（未验证）')
    }
  }
  const runTargets = modules.flatMap((module) =>
    module.targets.map((target) => ({
      ...target,
      module: gradlePathOf(module.path),
      taskPath: taskPathOf(module.path, target.task),
      platform: module.platform,
    })),
  )

  // ── JDK ────────────────────────────────────────────────────────────
  const toolchain = parseJavaLevel(gradleText ?? '')
    ?? parseJavaLevel(parentGradleText ?? '')
    ?? (moduleJavaLevels.length > 0 ? Math.max(...moduleJavaLevels) : undefined)
  // 构建脚本没写 toolchain 时退到 IDE 的字节码目标
  const ideaJava = idea === undefined ? undefined : (idea.bytecodeTarget ?? idea.languageLevel)
  const javaRequired = toolchain ?? ideaJava ?? requiredJava(/** @type {string | undefined} */ (minecraftVersion))
  if (toolchain === undefined && ideaJava !== undefined && idea !== undefined) {
    evidence.push({
      file: idea.bytecodeTarget === undefined ? '.idea/misc.xml' : '.idea/compiler.xml',
      kind: 'idea-jdk',
      detail: `构建脚本没写 toolchain，按 IDE 的 Java ${ideaJava} 定需求`,
    })
  }
  if (idea?.jdkName !== undefined) {
    evidence.push({
      file: '.idea/misc.xml',
      kind: 'idea-jdk',
      detail: `工程 JDK ${idea.jdkName}${idea.languageLevel === undefined ? '' : ` · languageLevel ${idea.languageLevel}`}`,
    })
  }
  const configuredJavaHome = pickProperty(properties, ['org.gradle.java.home'])
  const overrideJavaHome = typeof options.overrideJavaHome === 'string' && options.overrideJavaHome !== ''
    ? options.overrideJavaHome
    : undefined
  const jdks = options.jdks ?? []
  const picked = pickJdk(jdks, javaRequired, overrideJavaHome ?? configuredJavaHome)
  /** @type {'override' | 'configured' | 'auto' | 'none'} */
  const javaSource = overrideJavaHome !== undefined
    ? 'override'
    : configuredJavaHome !== undefined
      ? 'configured'
      : picked === undefined
        ? 'none'
        : 'auto'
  if (overrideJavaHome !== undefined) {
    const installed = jdks.some((jdk) => jdk.home.toLowerCase() === overrideJavaHome.toLowerCase())
    if (!installed) warnings.push(`手动指定的 JDK 不在已探测列表里：${overrideJavaHome}（启动时仍会使用它）`)
  } else if (picked === undefined) {
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
  // 子模块工程的 .idea 摘要只算属于这个模块的运行配置；聚合根照旧看全部
  const ideaForProfile = idea === undefined || modulePath === undefined
    ? idea
    : { ...idea, runConfigurations: idea.runConfigurations.filter((config) => config.modulePath === modulePath) }
  // 声明的依赖：只读窗口，用来核对"agent 说加好了"到底写进去没有
  const catalog = catalogText === undefined ? [] : parseVersionCatalog(catalogText)
  const buildDependencies = resolveCatalogRefs(parseBuildDependencies(gradleText ?? '', gradleFile ?? 'build.gradle'), catalog)
  const modDependencies = toModDependencies(dependencyRanges(primaryMetadata(allMetadata)))

  return {
    root,
    name: basename(root),
    kind,
    // 子模块工程：真正的 Gradle 根与模块路径（启动要在 gradleRoot 里跑）
    gradleRoot: parentRoot ?? root,
    ...(modulePath === undefined ? {} : { modulePath, parentRoot }),
    loader: loader ?? 'unknown',
    loaders,
    loaderEvidence: loaderEvidenceId,
    loaderVersion,
    minecraftVersion,
    modId: identity.modId,
    modName: identity.modName,
    modVersion: identity.modVersion,
    javaVersion: javaRequired,
    dependencies: {
      build: buildDependencies,
      mods: modDependencies,
      catalogFile: catalogFile ?? null,
      catalogSize: catalog.length,
    },
    java: {
      required: javaRequired,
      toolchain,
      configured: configuredJavaHome,
      override: overrideJavaHome,
      source: javaSource,
      selected: picked?.home,
      exact: picked?.exact ?? false,
      available: jdks.map((jdk) => ({ home: jdk.home, major: jdk.major, version: jdk.version })),
    },
    gradleVersion,
    wrapper: gradleVersion !== undefined,
    // IDE 工程模型：只给"读到了什么"的摘要，原始内容不往外传（面板与工具都用不上）
    idea: ideaForProfile === undefined ? undefined : {
      dir: ideaForProfile.dir,
      name: ideaForProfile.projectName ?? basename(root),
      gradleRoot: ideaForProfile.gradleRoot ?? root,
      gradleJvm: ideaForProfile.gradleJvm,
      jdkName: ideaForProfile.jdkName,
      languageLevel: ideaForProfile.languageLevel,
      bytecodeTarget: ideaForProfile.bytecodeTarget,
      modules: ideaForProfile.gradleModules.length,
      imls: ideaForProfile.modules.length,
      runConfigurations: ideaForProfile.runConfigurations.length,
      platforms: ideaForProfile.platforms,
      linkedProjects: ideaForProfile.linkedProjects,
      ...(ideaForProfile.minecraftVersion === undefined ? {} : { minecraftVersion: ideaForProfile.minecraftVersion }),
      ...(ideaForProfile.libraries === undefined ? {} : { libraries: ideaForProfile.libraries }),
      files: ideaForProfile.files,
    },
    modules: modules.map((module) => ({
      path: module.path,
      gradlePath: gradlePathOf(module.path),
      platform: module.platform,
      targets: module.targets.map((target) => ({ ...target, taskPath: taskPathOf(module.path, target.task) })),
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
  // legacyforge 先判：它是 NeoForge 团队的插件，产物却是 Forge 模组
  if (pluginIds.some((id) => /legacyforge/.test(id))) return 'forge'
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
  return { task: run.task, label: run.label, kind: run.kind, mode: modeOf(run.kind), guessed: false, source: 'build-script' }
}

/** run 类型 → Gradle 任务名（Gradle 的 RunConfig 约定）。 */
const TASK_BY_KIND = {
  client: 'runClient',
  server: 'runServer',
  data: 'runData',
  datagen: 'runData',
  gameTestServer: 'runGameTestServer',
  gameTest: 'runGameTestServer',
}

/** run 类型 → 界面标签。 */
const LABEL_BY_KIND = {
  client: 'Client',
  server: 'Server',
  data: 'Data',
  datagen: 'Data',
  gameTestServer: 'GameTestServer',
  gameTest: 'GameTestServer',
}

/**
 * IDE 运行配置 → 模块目标。
 *
 * 只在"该模块还没有这种 run"时补，不覆盖构建脚本读到的目标；
 * 补出来的目标标 `source: 'idea-run-config'`（不是 `guessed`）——
 * 配置存在说明这条 Gradle 任务真的被 IDE 生成过、跑过。
 * @param {ModuleInfo[]} modules
 * @param {import('./idea.js').IdeaProject | undefined} idea
 * @param {Evidence[]} evidence
 */
function mergeIdeaTargets(modules, idea, evidence) {
  if (idea === undefined) return
  /** @type {Map<string, Array<{ kind: string, name: string }>>} */
  const byModule = new Map()
  for (const config of idea.runConfigurations) {
    if (config.kind === undefined || config.modulePath === undefined) continue
    const list = byModule.get(config.modulePath) ?? []
    if (list.some((entry) => entry.kind === config.kind)) continue
    list.push({ kind: config.kind, name: config.name })
    byModule.set(config.modulePath, list)
  }

  for (const module of modules) {
    for (const config of byModule.get(module.path) ?? []) {
      if (module.targets.some((target) => target.kind === config.kind)) continue
      const task = TASK_BY_KIND[config.kind]
      if (task === undefined) continue
      module.targets.push({
        task,
        label: LABEL_BY_KIND[config.kind] ?? config.kind,
        kind: config.kind,
        mode: modeOf(config.kind),
        guessed: false,
        source: 'idea-run-config',
      })
      evidence.push({
        file: '.idea/workspace.xml',
        kind: 'idea-run-config',
        detail: `${module.path} 有过运行配置「${config.name}」，对应 ${module.path === '.' ? task : `:${module.path}:${task}`}`,
      })
    }
  }
}

/**
 * 某个模块在 IDE 里的平台（来自 iml 的 minecraft facet）。
 * @param {import('./idea.js').IdeaProject | undefined} idea
 * @param {string} modulePath
 * @returns {string | undefined}
 */
function platformOfModule(idea, modulePath) {
  if (idea === undefined) return undefined
  for (const iml of idea.modules) {
    if (iml.gradlePath !== modulePath) continue
    const loader = loadersFromPlatforms(iml.platforms).find((entry) => entry !== 'architectury')
    if (loader !== undefined) return loader
  }
  return undefined
}

/**
 * settings.gradle 的 include 用冒号分隔（`modules:CTNH-Core`），
 * IDEA 的模块清单是文件系统路径（`modules/CTNH-Core`）。统一成后者。
 * @param {string} path
 * @returns {string}
 */
function normalizeModulePath(path) {
  return String(path ?? '')
    .trim()
    .replace(/^:+/, '')
    .replace(/[:\\]+/g, '/')
    .replace(/\/+$/, '')
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
      source: 'guessed',
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
