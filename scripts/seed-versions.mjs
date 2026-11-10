#!/usr/bin/env node
/**
 * 把一条 `(loader, MC 版本)` 的当前上游版本写进 `data/versions.json` 的 `seed`。
 *
 * 平时不需要它：生成工程时会直接向上游解析（`src/lib/versions.js`）。这个脚本只做两件事：
 *   1. 新增一条热门线时，把"当时的正确版本"固化下来当离线兜底；
 *   2. 怀疑 seed 过期时，核对并更新它。
 *
 * 用法：
 *   node scripts/seed-versions.mjs fabric 1.21.1            # 只看解析结果
 *   node scripts/seed-versions.mjs fabric 1.21.1 --write    # 写入 seed（不动 verified）
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveVersions } from '../src/lib/versions.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = join(HERE, '..', 'data', 'versions.json')

const argv = process.argv.slice(2)
const write = argv.includes('--write')
const positional = argv.filter((arg) => !arg.startsWith('--'))
const [loader, mcVersion] = positional

if (loader === undefined || mcVersion === undefined) {
  console.error('usage: node scripts/seed-versions.mjs <fabric|neoforge> <mcVersion> [--write]')
  process.exit(2)
}

const resolved = await resolveVersions({ loader, mcVersion })
const fields = Object.entries(resolved.versions)
  .map(([key, value]) => `${key}=${value}`)
  .join('  ')
console.log(`${resolved.loader} ${resolved.mcVersion}  java ${resolved.java}  (${resolved.source})`)
console.log(`  ${fields}`)
if (resolved.source === 'seed') console.log(`  上游不可用：${resolved.reason ?? 'unknown'}`)

if (write) {
  const data = JSON.parse(await readFile(FILE, 'utf8'))
  data.seed = data.seed ?? []
  const entry = { loader: resolved.loader, mcVersion: resolved.mcVersion, versions: resolved.versions }
  const index = data.seed.findIndex((item) => item.loader === entry.loader && item.mcVersion === entry.mcVersion)
  if (index >= 0) data.seed[index] = entry
  else data.seed.push(entry)
  data.updatedAt = new Date().toISOString().slice(0, 10)
  await writeFile(FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  console.log(`  ${index >= 0 ? 'updated' : 'added'} seed entry → ${FILE}`)
}
