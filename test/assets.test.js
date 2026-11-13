/**
 * 首次运行资源检查：只判断"要不要下载"，不判断下载得全不全。
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { firstRunNotice, gradleUserHome, minecraftAssetsMissing } from '../src/lib/launch/assets.js'

/** @param {(base: string) => Promise<void>} run */
async function withTempHome(run) {
  const base = await mkdtemp(join(tmpdir(), 'mcdev-assets-'))
  try {
    await run(base)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

test('没有 objects 目录、或目录为空，都算缺失', async () => {
  await withTempHome(async (base) => {
    assert.equal(await minecraftAssetsMissing({ gradleUserHome: base }), true)
    await mkdir(join(base, 'caches', 'minecraft', 'assets', 'objects'), { recursive: true })
    assert.equal(await minecraftAssetsMissing({ gradleUserHome: base }), true)
    await writeFile(join(base, 'caches', 'minecraft', 'assets', 'objects', 'ab', 'abcdef'), 'x').catch(async () => {
      await mkdir(join(base, 'caches', 'minecraft', 'assets', 'objects', 'ab'), { recursive: true })
      await writeFile(join(base, 'caches', 'minecraft', 'assets', 'objects', 'ab', 'abcdef'), 'x')
    })
    assert.equal(await minecraftAssetsMissing({ gradleUserHome: base }), false)
  })
})

test('只有客户端 + NeoForge/Forge 才提示', async () => {
  await withTempHome(async (base) => {
    const missing = { gradleUserHome: base }
    assert.equal(await firstRunNotice({ ...missing, loader: 'neoforge', kind: 'client' }), 'first-run-assets')
    assert.equal(await firstRunNotice({ ...missing, loader: 'forge', kind: 'client' }), 'first-run-assets')
    assert.equal(await firstRunNotice({ ...missing, loader: 'fabric', kind: 'client' }), undefined)
    assert.equal(await firstRunNotice({ ...missing, loader: 'neoforge', kind: 'server' }), undefined)
    assert.equal(await firstRunNotice({ ...missing, loader: 'neoforge', kind: 'gameTestServer' }), undefined)
  })
})

test('GRADLE_USER_HOME 优先于用户目录', () => {
  assert.equal(gradleUserHome({ GRADLE_USER_HOME: 'D:/gradle' }), 'D:/gradle')
  assert.match(gradleUserHome({}), /\.gradle$/)
})
