/**
 * 首次运行的游戏资源检查。
 *
 * NeoForge / Forge 的 `runClient` 会把 Minecraft 资源下载到 Gradle 用户目录
 * （`<GRADLE_USER_HOME>/caches/minecraft/assets`）。资源还没下过时，第一次启动
 * 会先跑 `DownloadAssets`：网络受限的机器就卡在这一步，日志里只报下载失败。
 * 启动前先看一眼，能提前把话说清楚，而不是等三十分钟后归因。
 *
 * @module minecraft-dev-starter/lib/assets
 */

import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function gradleUserHome(env = process.env) {
  const configured = env.GRADLE_USER_HOME
  return typeof configured === 'string' && configured !== '' ? configured : join(homedir(), '.gradle')
}

/**
 * 只判断"要不要下载"，不判断下载得全不全——那份清单属于 Gradle 自己。
 * @param {{ gradleUserHome?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<boolean>}
 */
export async function minecraftAssetsMissing(options = {}) {
  const home = options.gradleUserHome ?? gradleUserHome(options.env)
  const objects = join(home, 'caches', 'minecraft', 'assets', 'objects')
  try {
    const info = await stat(objects)
    if (!info.isDirectory()) return true
    return (await readdir(objects)).length === 0
  } catch {
    return true
  }
}

/**
 * 客户端目标 + NeoForge/Forge + 资源没下过 → 返回一个提示码。
 *
 * 返回 code 而不是文案：值要语言中立，渲染时再翻。
 * @param {{ loader?: string, kind?: string, gradleUserHome?: string, env?: NodeJS.ProcessEnv }} request
 * @returns {Promise<'first-run-assets' | undefined>}
 */
export async function firstRunNotice(request) {
  if (request.kind !== 'client') return undefined
  if (request.loader !== 'neoforge' && request.loader !== 'forge') return undefined
  return (await minecraftAssetsMissing(request)) ? 'first-run-assets' : undefined
}
