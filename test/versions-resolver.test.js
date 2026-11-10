/**
 * 版本解析测试：上游数据全部用假 fetch 注入，不联网。
 *
 * 这里锁住的是"取哪几个数"的规则，不是"上游现在是多少"——后者会变，
 * 由 `scripts/seed-versions.mjs` 在需要时固化到 seed。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  compareVersions,
  javaForMc,
  loadVersionsData,
  metadataUrl,
  neoforgeLine,
  parseMavenMetadata,
  pickVersion,
  resolveVersions,
} from '../src/lib/versions.js'

const here = dirname(fileURLToPath(import.meta.url))

const FABRIC_LOADER = 'https://meta.fabricmc.net/v2/versions/loader/1.21.1'
const FABRIC_YARN = 'https://meta.fabricmc.net/v2/versions/yarn/1.21.1'
const LOOM = 'https://maven.fabricmc.net/net/fabricmc/fabric-loom/maven-metadata.xml'
const FABRIC_API = 'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml'
const NEOFORGE = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml'
const LEGACY = 'https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml'
const NEOGRADLE = 'https://maven.neoforged.net/releases/net/neoforged/gradle/userdev/maven-metadata.xml'

/** @param {string[]} versions */
function metadata(versions) {
  return `<?xml version="1.0"?><metadata><versioning><versions>${versions
    .map((version) => `<version>${version}</version>`)
    .join('')}</versions></versioning></metadata>`
}

/**
 * @param {Record<string, string>} routes
 * @returns {typeof fetch}
 */
function fakeFetch(routes) {
  return async (url) => {
    const body = routes[String(url)]
    if (body === undefined) throw new Error(`unexpected request: ${url}`)
    return {
      ok: true,
      status: 200,
      text: async () => body,
      json: async () => JSON.parse(body),
    }
  }
}

const baseRoutes = {
  [FABRIC_LOADER]: JSON.stringify([{ loader: { version: '0.20.1' } }]),
  [FABRIC_YARN]: JSON.stringify([{ version: '1.21.1+build.3' }]),
  [LOOM]: metadata(['1.18.4', '1.19.4', '1.20.0-alpha.24']),
  // 故意带上 +1.21.11：后缀匹配不能把它当成 +1.21.1
  [FABRIC_API]: metadata(['0.116.18+1.21.1', '0.141.6+1.21.11']),
  [NEOFORGE]: metadata(['21.1.9', '21.1.265', '21.8.57']),
  [LEGACY]: metadata(['1.20.1-47.1.105', '1.20.1-47.1.106']),
  [NEOGRADLE]: metadata(['7.1.38', '7.1.39']),
}

test('Fabric：loader / yarn / loom / api 一次解析，api 后缀精确', async () => {
  const resolved = await resolveVersions({
    loader: 'fabric',
    mcVersion: '1.21.1',
    fetchImpl: fakeFetch(baseRoutes),
    cache: new Map(),
    seed: [],
  })
  assert.equal(resolved.source, 'upstream')
  assert.equal(resolved.java, 21)
  assert.deepEqual(resolved.versions, {
    loaderVersion: '0.20.1',
    yarn: '1.21.1+build.3',
    loom: '1.19.4',
    api: '0.116.18+1.21.1',
  })
})

test('NeoForge 1.21.x：用 neoforge 坐标，版本按 21.1. 前缀挑最大', async () => {
  const resolved = await resolveVersions({
    loader: 'neoforge',
    mcVersion: '1.21.1',
    fetchImpl: fakeFetch(baseRoutes),
    cache: new Map(),
    seed: [],
  })
  assert.equal(resolved.source, 'upstream')
  assert.deepEqual(resolved.versions, { neoforge: '21.1.265', gradlePlugin: '7.1.39' })
})

test('NeoForge 1.20.1：改用 legacyforge 坐标与 1.20.1- 前缀', async () => {
  assert.deepEqual(neoforgeLine('1.20.1'), { coord: 'net.neoforged:forge', prefix: '1.20.1-' })
  assert.deepEqual(neoforgeLine('1.21.1'), { coord: 'net.neoforged:neoforge', prefix: '21.1.' })
  assert.deepEqual(neoforgeLine('1.21.8'), { coord: 'net.neoforged:neoforge', prefix: '21.8.' })
  const resolved = await resolveVersions({
    loader: 'neoforge',
    mcVersion: '1.20.1',
    fetchImpl: fakeFetch(baseRoutes),
    cache: new Map(),
    seed: [],
  })
  assert.equal(resolved.java, 17)
  assert.equal(resolved.versions.neoforge, '1.20.1-47.1.106')
})

test('上游不可用时退回 seed，并说明原因', async () => {
  const seed = [{ loader: 'fabric', mcVersion: '1.21.1', versions: { loaderVersion: '0.19.0', yarn: '1.21.1+build.1', loom: '1.18.4', api: '0.110.0+1.21.1' } }]
  const resolved = await resolveVersions({
    loader: 'fabric',
    mcVersion: '1.21.1',
    fetchImpl: async () => {
      throw new Error('offline')
    },
    cache: new Map(),
    seed,
  })
  assert.equal(resolved.source, 'seed')
  assert.equal(resolved.versions.loaderVersion, '0.19.0')
  assert.match(String(resolved.reason), /offline/)
})

test('没有 seed 兜底时，上游失败就抛错', async () => {
  await assert.rejects(
    () =>
      resolveVersions({
        loader: 'fabric',
        mcVersion: '1.21.1',
        fetchImpl: async () => {
          throw new Error('offline')
        },
        cache: new Map(),
        seed: [],
      }),
    /offline/,
  )
})

test('Java 大版本跟着 MC 版本走', () => {
  assert.equal(javaForMc('1.20.1'), 17)
  assert.equal(javaForMc('1.21.1'), 21)
  assert.equal(javaForMc('1.21.8'), 21)
  assert.equal(javaForMc('26.1'), 25)
})

test('版本比较与过滤：数字按数值、前缀后缀是字面量', () => {
  assert.equal(compareVersions('21.1.9', '21.1.265') < 0, true)
  assert.equal(compareVersions('1.20.1-47.1.106', '1.20.1-47.1.9') > 0, true)
  assert.equal(pickVersion(['1.19.4', '1.20.0-alpha.24'], { releaseOnly: true }), '1.19.4')
  assert.equal(pickVersion(['0.116.18+1.21.1', '0.141.6+1.21.11'], { suffix: '+1.21.1' }), '0.116.18+1.21.1')
  assert.equal(pickVersion(['21.1.9', '21.1.265', '21.8.57'], { prefix: '21.1.' }), '21.1.265')
})

test('metadataUrl 与 maven 解析', () => {
  assert.equal(metadataUrl('fabric', 'net.fabricmc:fabric-loom'), LOOM)
  assert.equal(metadataUrl('neoforged', 'net.neoforged.gradle:userdev'), NEOGRADLE)
  const parsed = parseMavenMetadata(metadata(['7.1.38', '7.1.39']))
  assert.deepEqual(parsed.versions, ['7.1.38', '7.1.39'])
})

test('data/versions.json 只剩 seed 与 verified，且字段齐全', async () => {
  const data = JSON.parse(readFileSync(join(here, '..', 'data', 'versions.json'), 'utf8'))
  assert.equal(data.schemaVersion, 3)
  assert.ok(Array.isArray(data.seed))
  assert.ok(Array.isArray(data.verified))
  for (const entry of data.seed) {
    assert.ok(['fabric', 'neoforge'].includes(entry.loader))
    assert.ok(typeof entry.mcVersion === 'string' && entry.mcVersion !== '')
    assert.ok(Object.keys(entry.versions ?? {}).length > 0)
  }
  for (const entry of data.verified) {
    assert.ok(typeof entry.loader === 'string')
    assert.ok(typeof entry.mcVersion === 'string')
    assert.ok(typeof entry.proof === 'string' && entry.proof !== '', 'verified 必须写清楚是怎么验的')
  }
  const loaded = await loadVersionsData()
  assert.equal(loaded.seed.length, data.seed.length)
})
