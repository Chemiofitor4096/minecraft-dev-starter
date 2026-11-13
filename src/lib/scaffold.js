/**
 * 工程脚手架：把一个空目录变成能构建的 Minecraft 模组工程。
 *
 * 模板是**文件**（`templates/<loader>/`），版本是**数据**（调用时向上游解析，见 versions.js）。
 * 这里只做三件事：校验参数、渲染模板、写盘；不跑 Gradle，也不改写用户已有的文件。
 *
 * 模板里的占位符用 `{{name}}`，不用 `${...}`——Gradle 文件自己大量使用 `${...}`，混用会互相打架。
 *
 * @module minecraft-dev-starter/lib/scaffold
 */

import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { javaForMc, resolveVersions } from './versions.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 模板根目录（`templates/`）。 */
export const TEMPLATE_ROOT = join(ROOT, 'templates')

/** modid：小写字母开头，只允许小写字母、数字、下划线。 */
export const MOD_ID_PATTERN = /^[a-z][a-z0-9_]{1,63}$/
/** Java 包名。 */
export const GROUP_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/
/** 语义化版本（够用即可，不追求完整 semver）。 */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/

/** 直接按二进制复制的文件后缀。 */
const BINARY = /\.(jar|png|ogg|zip|ico)$/

/** 目前支持 Fabric 与 NeoForge（NeoForge 走 NeoGradle 的 userdev 插件）。 */
const SUPPORTED_LOADERS = ['fabric', 'neoforge']

/**
 * 从显示名推导 Java 类名：`My Cool Mod` → `MyCoolMod`。
 * 先去掉所有格（`Damascus's` / `Players'`），否则 `'s` 会被拆成一个单词，得到 `DamascusS`。
 * @param {string} name
 * @returns {string}
 */
export function classNameFor(name) {
  const normalized = String(name)
    .replace(/['’]s\b/gi, '')
    .replace(/['’]/g, '')
  const words = normalized
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '')
  const joined = words.map((word) => word[0].toUpperCase() + word.slice(1)).join('')
  const cleaned = joined.replace(/^[^A-Za-z]+/, '')
  return cleaned === '' ? 'ExampleMod' : cleaned
}

/**
 * 校验并归一化参数，失败时抛带 code 的错误（工具层直接把它转成提示）。
 * @param {{ modid?: string, name?: string, group?: string, version?: string, loader?: string, mcVersion?: string }} input
 * @returns {{ modid: string, name: string, group: string, version: string, loader: string, mcVersion: string }}
 */
export function normalizeParams(input) {
  const modid = String(input.modid ?? '').trim()
  if (!MOD_ID_PATTERN.test(modid)) {
    throw Object.assign(new Error(`invalid mod id: ${modid || '(empty)'}`), { code: 'BAD_MODID' })
  }
  const name = String(input.name ?? '').trim()
  if (name === '') throw Object.assign(new Error('mod name is required'), { code: 'BAD_NAME' })

  const group = String(input.group ?? `com.example.${modid}`).trim()
  if (!GROUP_PATTERN.test(group)) {
    throw Object.assign(new Error(`invalid Java package: ${group}`), { code: 'BAD_GROUP' })
  }

  const version = String(input.version ?? '0.1.0').trim()
  if (!VERSION_PATTERN.test(version)) {
    throw Object.assign(new Error(`invalid version: ${version}`), { code: 'BAD_VERSION' })
  }

  const loader = String(input.loader ?? 'fabric').trim()
  if (!SUPPORTED_LOADERS.includes(loader)) {
    throw Object.assign(new Error(`loader not supported yet: ${loader}`), { code: 'UNSUPPORTED_LOADER' })
  }

  const mcVersion = String(input.mcVersion ?? '1.21.1').trim()
  if (!/^\d+\.\d+(\.\d+)?$/.test(mcVersion)) {
    throw Object.assign(new Error(`invalid Minecraft version: ${mcVersion}`), { code: 'BAD_MC_VERSION' })
  }

  return { modid, name, group, version, loader, mcVersion }
}

/**
 * 递归列出一个模板目录里的文件。
 * @param {string} dir
 * @returns {Promise<string[]>} 相对模板根、以 `/` 分隔的路径
 */
async function listFiles(dir) {
  /** @type {string[]} */
  const out = []
  /** @param {string} current */
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      out.push(relative(dir, full).replaceAll('\\', '/'))
    }
  }
  await walk(dir)
  return out.sort()
}

/**
 * 把 `{{token}}` 换成参数值。未知 token 原样保留，由调用方检查残留。
 * @param {string} text
 * @param {Record<string, string | number>} params
 * @returns {string}
 */
export function renderText(text, params) {
  return String(text).replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (whole, key) =>
    Object.hasOwn(params, key) ? String(params[key]) : whole,
  )
}

/**
 * 目标目录必须不存在，或者存在但为空——绝不覆盖用户已有的工程。
 * @param {string} dir
 */
async function requireEmptyDir(dir) {
  try {
    const info = await stat(dir)
    if (!info.isDirectory()) {
      throw Object.assign(new Error(`target is not a directory: ${dir}`), { code: 'TARGET_NOT_DIR' })
    }
    const entries = await readdir(dir)
    if (entries.length > 0) {
      throw Object.assign(new Error(`target directory is not empty: ${dir}`), { code: 'TARGET_NOT_EMPTY' })
    }
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
}

/**
 * 生成一个工程。
 *
 * @param {{
 *   dir: string,
 *   modid: string,
 *   name: string,
 *   group?: string,
 *   version?: string,
 *   loader?: string,
 *   mcVersion?: string,
 *   templateRoot?: string,
 *   fetchImpl?: typeof fetch,
 *   cache?: Map<string, any>
 * }} request
 * @returns {Promise<{
 *   dir: string,
 *   files: string[],
 *   loader: string,
 *   mcVersion: string,
 *   java: number,
 *   versions: Record<string, string>,
 *   source: 'upstream' | 'seed'
 * }>}
 */
export async function createProject(request) {
  const params = normalizeParams(request)
  // resolve 同时处理相对路径与 Windows 的正斜杠；不 normalize 的话后面的 startsWith 会被分隔符骗到
  const dir = resolve(String(request.dir))
  await requireEmptyDir(dir)

  const resolved = await resolveVersions({
    loader: params.loader,
    mcVersion: params.mcVersion,
    fetchImpl: request.fetchImpl,
    cache: request.cache,
  })

  const templateDir = join(request.templateRoot ?? TEMPLATE_ROOT, params.loader)
  const java = javaForMc(params.mcVersion)
  const resolvedVersions = resolved.versions
  /** @type {Record<string, string | number>} */
  const values = {
    modid: params.modid,
    name: params.name,
    group: params.group,
    groupPath: params.group.replaceAll('.', '/'),
    class: classNameFor(params.name),
    version: params.version,
    mc: params.mcVersion,
    java,
    loader: resolvedVersions.loaderVersion,
    yarn: resolvedVersions.yarn,
    loom: resolvedVersions.loom,
    api: resolvedVersions.api,
    neoforge: resolvedVersions.neoforge,
    gradlePlugin: resolvedVersions.gradlePlugin,
  }
  // 另一种 loader 的字段不存在时直接删掉：模板里若误用，会在残留检查时抛错，
  // 而不是把 "undefined" 写进工程
  for (const key of Object.keys(values)) {
    if (values[key] === undefined) delete values[key]
  }

  /** @type {string[]} */
  const written = []
  for (const rel of await listFiles(templateDir)) {
    const renderedRel = renderText(rel, values)
    const target = join(dir, ...renderedRel.split('/'))
    const inside = relative(dir, target)
    if (inside.startsWith('..') || isAbsolute(inside)) {
      throw Object.assign(new Error(`template path escapes target: ${renderedRel}`), { code: 'BAD_TEMPLATE_PATH' })
    }
    await mkdir(dirname(target), { recursive: true })
    const source = join(templateDir, ...rel.split('/'))
    if (BINARY.test(rel)) {
      await copyFile(source, target)
    } else {
      const text = renderText(await readFile(source, 'utf8'), values)
      if (/\{\{[a-zA-Z]/.test(text)) {
        throw Object.assign(new Error(`template has an unknown placeholder: ${rel}`), { code: 'TEMPLATE_LEFTOVER' })
      }
      await writeFile(target, text, 'utf8')
    }
    written.push(renderedRel)
  }

  /** @type {Record<string, any>} */
  const result = {
    dir,
    files: written.sort(),
    loader: params.loader,
    mcVersion: params.mcVersion,
    group: params.group,
    java,
    versions: resolved.versions,
    source: resolved.source,
  }
  if (resolved.reason !== undefined) {
    result.note = `upstream unavailable (${resolved.reason}); used the bundled seed`
  }
  return result
}

/**
 * 改包名（`group`）：移动 `src/<set>/java/<old>` 目录，并把 Java 源码与元数据里的旧前缀换掉。
 *
 * 只认 `gradle.properties` 里的 `mod_group_id`——模板生成的工程都有它；读不到就报错，
 * 不猜"可能是哪个包"，因为改错文件的代价比让调用方先确认一次高。
 *
 * @param {{ root: string, group: string }} request
 * @returns {Promise<{ root: string, group: string, from: string, moved: Array<{ from: string, to: string }>, files: string[] }>}
 */
export async function setGroup(request) {
  const root = resolve(String(request.root))
  const next = String(request.group ?? '').trim()
  /** 对外一律用 `/`：工具输出与测试都按 POSIX 分隔符比对。 */
  const posix = (value) => value.replaceAll('\\', '/')
  if (!GROUP_PATTERN.test(next)) {
    throw Object.assign(new Error(`invalid Java package: ${next || '(empty)'}`), { code: 'BAD_GROUP' })
  }

  const propertiesPath = join(root, 'gradle.properties')
  let properties
  try {
    properties = await readFile(propertiesPath, 'utf8')
  } catch {
    throw Object.assign(new Error(`gradle.properties not found under ${root}`), { code: 'NO_GRADLE_PROPERTIES' })
  }
  const groupLine = properties.match(/^mod_group_id=(.*)$/m)
  if (groupLine === null) {
    throw Object.assign(new Error('mod_group_id not found in gradle.properties; set the group by hand'), {
      code: 'NO_GROUP',
    })
  }
  const previous = groupLine[1].trim()
  if (previous === next) {
    return { root, group: next, from: previous, moved: [], files: [] }
  }

  /** @type {Array<{ from: string, to: string }>} */
  const moved = []
  /** @type {Set<string>} */
  const files = new Set()

  // 1. 移动 Java 包目录（每个 source set 各一份）
  const sourceSetRoot = join(root, 'src')
  /** @type {string[]} */
  const javaRoots = []
  try {
    for (const entry of await readdir(sourceSetRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const javaRoot = join(sourceSetRoot, entry.name, 'java')
      try {
        if ((await stat(javaRoot)).isDirectory()) javaRoots.push(javaRoot)
      } catch {
        // 没有 java 目录的 source set 跳过
      }
    }
  } catch {
    // 连 src 都没有：只改属性与元数据
  }

  for (const javaRoot of javaRoots) {
    const fromDir = join(javaRoot, ...previous.split('.'))
    const toDir = join(javaRoot, ...next.split('.'))
    try {
      await stat(fromDir)
    } catch {
      continue
    }
    try {
      await stat(toDir)
      throw Object.assign(new Error(`target package already exists: ${posix(relative(root, toDir))}`), { code: 'GROUP_DIR_EXISTS' })
    } catch (error) {
      if (error?.code === 'GROUP_DIR_EXISTS') throw error
      // ENOENT 才是我们期望的
    }
    await mkdir(dirname(toDir), { recursive: true })
    await rename(fromDir, toDir)
    moved.push({ from: posix(relative(root, fromDir)), to: posix(relative(root, toDir)) })
  }

  // 2. 重写 Java 源码：package 行 + 旧包前缀（import 与全限定名）
  const escaped = previous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const packagePattern = new RegExp(`(^|\\s)package\\s+${escaped}\\s*;`, 'g')
  const prefixPattern = new RegExp(`\\b${escaped}\\.`, 'g')
  for (const javaRoot of javaRoots) {
    /** @type {string[]} */
    let sources = []
    try {
      sources = await listFiles(javaRoot)
    } catch {
      continue
    }
    for (const rel of sources) {
      if (!rel.endsWith('.java')) continue
      const file = join(javaRoot, ...rel.split('/'))
      const text = await readFile(file, 'utf8')
      const updated = text.replace(packagePattern, `$1package ${next};`).replace(prefixPattern, `${next}.`)
      if (updated !== text) {
        await writeFile(file, updated, 'utf8')
        files.add(posix(relative(root, file)))
      }
    }
  }

  // 3. 元数据里的入口类：fabric.mod.json 的 `"<group>.<Class>"` 之类
  try {
    const resources = join(root, 'src', 'main', 'resources')
    for (const rel of await listFiles(resources)) {
      if (!rel.endsWith('.json')) continue
      const file = join(resources, ...rel.split('/'))
      const text = await readFile(file, 'utf8')
      const updated = text.replaceAll(`${previous}.`, `${next}.`)
      if (updated !== text) {
        await writeFile(file, updated, 'utf8')
        files.add(posix(relative(root, file)))
      }
    }
  } catch {
    // 没有 resources 目录就跳过
  }

  // 4. 属性文件
  const updatedProperties = properties.replace(/^mod_group_id=.*$/m, `mod_group_id=${next}`)
  await writeFile(propertiesPath, updatedProperties, 'utf8')
  files.add('gradle.properties')

  return { root, group: next, from: previous, moved, files: [...files].sort() }
}
