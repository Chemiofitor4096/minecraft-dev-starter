/**
 * 声明的依赖：构建脚本解析 + 版本目录解析 + 元数据依赖。
 *
 * 这块输出会直接显示在面板上"核对用"，所以行号与坐标都必须准。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseBuildDependencies,
  parseVersionCatalog,
  resolveCatalogRefs,
  splitCoordinates,
  toModDependencies,
} from '../src/lib/deps.js'

const GROOVY = `
dependencies {
    minecraft "net.minecraft:joined:1.21.1"
    modImplementation "net.fabricmc:fabric-loader:0.16.9"
    modImplementation(libs.fabric.api)
    implementation project(':common')
    implementation platform("net.fabricmc:fabric-bom:1.0.0")
    compileOnly files('libs/foo.jar')
    implementation('com.example:thing:1.2.3') {
        exclude group: 'com.google.guava'
        transitive = false
    }
    constraints {
        implementation("com.example:pin:2.0.0")
    }
}
`

test('解析 dependencies 块：坐标、行号、忽略约束与排除项', () => {
  const deps = parseBuildDependencies(GROOVY, 'build.gradle')
  const summary = deps.map((entry) => `${entry.configuration}:${entry.notation}`)
  assert.deepEqual(summary, [
    'minecraft:net.minecraft:joined:1.21.1',
    'modImplementation:net.fabricmc:fabric-loader:0.16.9',
    'modImplementation:libs.fabric.api',
    'implementation:project :common',
    'implementation:net.fabricmc:fabric-bom:1.0.0',
    'implementation:com.example:thing:1.2.3',
  ])
  // 行号 1 起算，指着声明那一行
  const loader = deps.find((entry) => entry.module === 'net.fabricmc:fabric-loader')
  assert.equal(loader.line, 4)
  assert.equal(loader.file, 'build.gradle')
  assert.equal(loader.version, '0.16.9')
  // 版本目录引用原样保留，等解析阶段再换
  assert.equal(deps[2].catalogRef, 'libs.fabric.api')
})

test('没有 dependencies 块时返回空数组', () => {
  assert.deepEqual(parseBuildDependencies('plugins { id "fabric-loom" }'), [])
})

test('一行里多个坐标不误判（version 可以带冒号后缀）', () => {
  const deps = parseBuildDependencies('dependencies { modImplementation "a:b:1.0+mc1.21" }', 'build.gradle.kts')
  assert.equal(deps.length, 1)
  assert.equal(deps[0].module, 'a:b')
  assert.equal(deps[0].version, '1.0+mc1.21')
})

test('版本目录：字符串、module+version.ref、group/name 三种写法', () => {
  const catalog = parseVersionCatalog(`
[versions]
fabric = "0.16.9"
mixin = "0.15.0"

[libraries]
fabric-api = { module = "net.fabricmc.fabric-api:fabric-api", version = "0.115.0+1.21.1" }
fabric-loader = { module = "net.fabricmc:fabric-loader", version.ref = "fabric" }
legacy = "com.example:legacy:2.0"
grouped = { group = "com.example", name = "grouped", version.ref = "mixin" }
`)
  const byAlias = Object.fromEntries(catalog.map((entry) => [entry.alias, entry]))
  assert.equal(byAlias['fabric-api'].notation, 'net.fabricmc.fabric-api:fabric-api:0.115.0+1.21.1')
  assert.equal(byAlias['fabric-loader'].version, '0.16.9')
  assert.equal(byAlias.legacy.notation, 'com.example:legacy:2.0')
  assert.equal(byAlias.grouped.notation, 'com.example:grouped:0.15.0')
})

test('libs.xxx 解析成真实坐标：点号与驼峰两种写法都认', () => {
  const catalog = parseVersionCatalog(`
[libraries]
fabric-api = { module = "net.fabricmc.fabric-api:fabric-api", version = "1.0.0" }
`)
  const deps = parseBuildDependencies(`
dependencies {
    modImplementation libs.fabric.api
    modImplementation libs.fabricApi
    modImplementation libs.unknown.thing
}
`)
  const resolved = resolveCatalogRefs(deps, catalog)
  assert.equal(resolved[0].notation, 'net.fabricmc.fabric-api:fabric-api:1.0.0')
  assert.equal(resolved[0].catalogRef, 'libs.fabric.api')
  assert.equal(resolved[1].notation, 'net.fabricmc.fabric-api:fabric-api:1.0.0')
  // 解析不出来就保留原引用，不猜
  assert.equal(resolved[2].notation, 'libs.unknown.thing')
})

test('坐标拆分与元数据依赖', () => {
  assert.deepEqual(splitCoordinates('g:a:1.0'), { module: 'g:a', version: '1.0' })
  assert.deepEqual(splitCoordinates('g:a'), { module: 'g:a' })
  assert.deepEqual(splitCoordinates('garbage'), {})
  assert.deepEqual(toModDependencies({ minecraft: '~1.21.1', create: '[6.0.8,)' }), [
    { modId: 'minecraft', range: '~1.21.1' },
    { modId: 'create', range: '[6.0.8,)' },
  ])
})
