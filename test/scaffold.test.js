/**
 * 脚手架测试：模板渲染、参数校验、目录保护与版本回退。
 *
 * 模板是仓库里的真实文件（`templates/fabric`），版本用假 fetch 注入，不联网。
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { classNameFor, createProject, normalizeParams, renderText } from '../src/lib/scaffold.js'

const FABRIC_LOADER = 'https://meta.fabricmc.net/v2/versions/loader/1.21.1'
const FABRIC_YARN = 'https://meta.fabricmc.net/v2/versions/yarn/1.21.1'
const LOOM = 'https://maven.fabricmc.net/net/fabricmc/fabric-loom/maven-metadata.xml'
const FABRIC_API = 'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml'
const NEOFORGE = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml'
const NEOGRADLE = 'https://maven.neoforged.net/releases/net/neoforged/gradle/userdev/maven-metadata.xml'

/** @param {string[]} versions */
function metadata(versions) {
  return `<?xml version="1.0"?><metadata><versioning><versions>${versions
    .map((version) => `<version>${version}</version>`)
    .join('')}</versions></versioning></metadata>`
}

const routes = {
  [FABRIC_LOADER]: JSON.stringify([{ loader: { version: '0.20.1' } }]),
  [FABRIC_YARN]: JSON.stringify([{ version: '1.21.1+build.3' }]),
  [LOOM]: metadata(['1.18.4', '1.19.4', '1.20.0-alpha.24']),
  [FABRIC_API]: metadata(['0.116.18+1.21.1', '0.141.6+1.21.11']),
  [NEOFORGE]: metadata(['21.1.9', '21.1.265', '21.8.57']),
  [NEOGRADLE]: metadata(['7.1.38', '7.1.39']),
}

const fakeFetch = async (url) => {
  const body = routes[String(url)]
  if (body === undefined) throw new Error(`unexpected request: ${url}`)
  return { ok: true, status: 200, text: async () => body }
}

/** @param {(dir: string) => Promise<void>} run */
async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-scaffold-'))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('类名从显示名推导', () => {
  assert.equal(classNameFor('Demo Mod'), 'DemoMod')
  assert.equal(classNameFor('my-cool_mod'), 'MyCoolMod')
  assert.equal(classNameFor("Damascus's Blacksmith"), 'DamascusBlacksmith')
  assert.equal(classNameFor("Players' Guild"), 'PlayersGuild')
  assert.equal(classNameFor('123'), 'ExampleMod')
  assert.equal(classNameFor(''), 'ExampleMod')
})

test('参数校验：modid / 包名 / 版本 / loader', () => {
  assert.throws(() => normalizeParams({ modid: 'Demo', name: 'x' }), /invalid mod id/)
  assert.throws(() => normalizeParams({ modid: 'demo', name: '' }), /name is required/)
  assert.throws(() => normalizeParams({ modid: 'demo', name: 'x', group: 'com.Example' }), /invalid Java package/)
  assert.throws(() => normalizeParams({ modid: 'demo', name: 'x', version: '1.0' }), /invalid version/)
  assert.throws(() => normalizeParams({ modid: 'demo', name: 'x', loader: 'forge' }), /not supported yet/)

  const params = normalizeParams({ modid: 'demo_mod', name: 'Demo Mod' })
  assert.equal(params.group, 'com.example.demo_mod')
  assert.equal(params.loader, 'fabric')
  assert.equal(params.mcVersion, '1.21.1')
  assert.equal(params.version, '0.1.0')
})

test('占位符渲染：未知 token 原样保留', () => {
  assert.equal(renderText('{{modid}}/{{groupPath}}', { modid: 'demo', groupPath: 'com/example' }), 'demo/com/example')
  assert.equal(renderText('{{unknown}}', {}), '{{unknown}}')
})

test('生成工程：文件齐全、版本来自上游、没有残留占位符', async () => {
  await withTempDir(async (parent) => {
    const dir = join(parent, 'demo-mod')
    const result = await createProject({
      dir,
      modid: 'demo_mod',
      name: 'Demo Mod',
      fetchImpl: fakeFetch,
      cache: new Map(),
    })

    assert.equal(result.source, 'upstream')
    assert.equal(result.java, 21)
    assert.deepEqual(result.versions, {
      loaderVersion: '0.20.1',
      yarn: '1.21.1+build.3',
      loom: '1.10.5',
      api: '0.116.18+1.21.1',
    })
    assert.ok(result.files.includes('build.gradle'))
    assert.ok(result.files.includes('gradle/wrapper/gradle-wrapper.jar'))
    assert.ok(result.files.includes('src/main/java/com/example/demo_mod/DemoMod.java'))

    const properties = await readFile(join(dir, 'gradle.properties'), 'utf8')
    assert.match(properties, /minecraft_version=1\.21\.1/)
    assert.match(properties, /yarn_mappings=1\.21\.1\+build\.3/)
    assert.match(properties, /fabric_loader_version=0\.20\.1/)
    assert.match(properties, /fabric_api_version=0\.116\.18\+1\.21\.1/)
    assert.match(properties, /mod_id=demo_mod/)

    const build = await readFile(join(dir, 'build.gradle'), 'utf8')
    assert.match(build, /id 'fabric-loom' version '1\.10\.5'/)
    assert.match(build, /options\.release = 21/)

    const mod = JSON.parse(await readFile(join(dir, 'src/main/resources/fabric.mod.json'), 'utf8'))
    assert.equal(mod.id, 'demo_mod')
    assert.equal(mod.name, 'Demo Mod')
    assert.deepEqual(mod.entrypoints.main, ['com.example.demo_mod.DemoMod'])
    assert.equal(mod.depends.fabricloader, '>=0.20.1')

    const java = await readFile(join(dir, 'src/main/java/com/example/demo_mod/DemoMod.java'), 'utf8')
    assert.match(java, /package com\.example\.demo_mod;/)
    assert.match(java, /public final class DemoMod implements ModInitializer/)

    // 模板占位符必须全部替换干净（Gradle 自己的 ${...} 不在检查范围）
    for (const file of result.files.filter((name) => !name.endsWith('.jar'))) {
      const text = await readFile(join(dir, ...file.split('/')), 'utf8')
      assert.equal(/\{\{[a-zA-Z]/.test(text), false, `${file} 还有残留占位符`)
    }

    // wrapper 是二进制复制，不能被文本渲染破坏
    const jar = await readFile(join(dir, 'gradle/wrapper/gradle-wrapper.jar'))
    assert.ok(jar.length > 10_000)
  })
})

test('生成 NeoForge 工程：userdev 插件、模组元数据与入口类', async () => {
  await withTempDir(async (parent) => {
    const dir = join(parent, 'neo-demo')
    const result = await createProject({
      dir,
      modid: 'demo_mod',
      name: 'Demo Mod',
      loader: 'neoforge',
      fetchImpl: fakeFetch,
      cache: new Map(),
    })

    assert.equal(result.source, 'upstream')
    assert.equal(result.java, 21)
    assert.deepEqual(result.versions, { neoforge: '21.1.265', gradlePlugin: '7.1.39' })
    assert.ok(result.files.includes('src/main/resources/META-INF/neoforge.mods.toml'))
    assert.ok(result.files.includes('src/main/java/com/example/demo_mod/DemoMod.java'))

    const build = await readFile(join(dir, 'build.gradle'), 'utf8')
    assert.match(build, /id 'net\.neoforged\.gradle\.userdev' version '7\.1\.39'/)
    assert.match(build, /implementation "net\.neoforged:neoforge:\$\{neo_version\}"/)
    assert.match(build, /languageVersion = JavaLanguageVersion\.of\(21\)/)

    const properties = await readFile(join(dir, 'gradle.properties'), 'utf8')
    assert.match(properties, /neo_version=21\.1\.265/)
    assert.match(properties, /minecraft_version=1\.21\.1/)

    const mods = await readFile(join(dir, 'src/main/resources/META-INF/neoforge.mods.toml'), 'utf8')
    assert.match(mods, /modId = "demo_mod"/)
    assert.match(mods, /versionRange = "\[21\.1\.265,\)"/)
    assert.equal(/\{\{[a-zA-Z]/.test(mods), false)

    const java = await readFile(join(dir, 'src/main/java/com/example/demo_mod/DemoMod.java'), 'utf8')
    assert.match(java, /@Mod\(DemoMod\.MODID\)/)
    assert.match(java, /public static final String MODID = "demo_mod";/)
  })
})

test('拒绝非空目录，绝不覆盖已有工程', async () => {
  await withTempDir(async (parent) => {
    const dir = join(parent, 'occupied')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'keep.txt'), 'x')
    await assert.rejects(
      () => createProject({ dir, modid: 'demo', name: 'Demo', fetchImpl: fakeFetch, cache: new Map() }),
      /not empty/,
    )
    assert.deepEqual(await readdir(dir), ['keep.txt'])
  })
})

test('上游不可用时退回 seed，并带上说明', async () => {
  await withTempDir(async (parent) => {
    const dir = join(parent, 'offline')
    const result = await createProject({
      dir,
      modid: 'demo',
      name: 'Demo',
      fetchImpl: async () => {
        throw new Error('offline')
      },
      cache: new Map(),
    })
    assert.equal(result.source, 'seed')
    assert.match(String(result.note), /offline/)
    assert.equal(result.versions.loaderVersion, '0.20.1')
  })
})
