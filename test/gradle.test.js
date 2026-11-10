/**
 * Gradle 静态解析的单元测试。
 * 这些函数一旦错，整个识别面板就会给出错误的 loader/版本，所以按"容易错的边角"覆盖。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  minecraftFromNeoVersion,
  parseJavaLevel,
  parseMinecraftVersion,
  parsePluginIds,
  parseRuns,
  parseSettingsIncludes,
  parseWrapperVersion,
  stripComments,
} from '../src/lib/detect/gradle.js'

test('stripComments 不碰字符串里的 //', () => {
  const text = `plugins { id 'fabric-loom' } // 注释\nversion = "1.0.0" // 另一个`
  const out = stripComments(text)
  assert.match(out, /fabric-loom/)
  assert.match(out, /1\.0\.0/)
  assert.doesNotMatch(out, /另一个/)
})

test('parsePluginIds 覆盖 id/apply 两种写法', () => {
  const text = `
    plugins { id 'fabric-loom' version '1.10-SNAPSHOT'; id("maven-publish") }
    apply plugin: "dev.architectury.loom"
  `
  const ids = parsePluginIds(text)
  assert.ok(ids.includes('fabric-loom'))
  assert.ok(ids.includes('maven-publish'))
  assert.ok(ids.includes('dev.architectury.loom'))
})

test('parseSettingsIncludes 支持括号与逗号写法', () => {
  assert.deepEqual(parseSettingsIncludes('include("fabric")\ninclude("forge")'), ['fabric', 'forge'])
  assert.deepEqual(parseSettingsIncludes("include 'api', 'common'"), ['api', 'common'])
  assert.deepEqual(parseSettingsIncludes("include(':fabric')"), ['fabric'])
})

test('parseRuns 读出块名与任务名', () => {
  const text = `
    neoForge {
      runs {
        client { client() }
        server { server() }
        data { data() }
        gameTestServer { type = "gameTestServer" }
      }
    }
  `
  const runs = parseRuns(text)
  assert.deepEqual(
    runs.map((run) => run.task),
    ['runClient', 'runServer', 'runData', 'runGameTestServer'],
  )
  assert.equal(runs[0].label, 'Client')
  assert.equal(runs[2].kind, 'data')
})

test('parseRuns 在嵌套花括号里不会数错', () => {
  const text = `
    runs {
      client {
        client()
        programArgs "--x", { nested: true }
      }
    }
  `
  const runs = parseRuns(text)
  assert.equal(runs.length, 1)
  assert.equal(runs[0].task, 'runClient')
})

test('parseRuns 不把 runs 容器 API 当成运行目标', () => {
  // 真实踩坑：ProtectionEngineering 的 runs.configureEach 曾产出 runConfigureEach，
  // 选中启动得到 "Task 'runConfigureEach' not found"。
  const text = `
    runs {
      configureEach { systemProperty "a", "b" }
      all { jvmArgumentProviders.clear() }
      client { client() }
    }
  `
  assert.deepEqual(parseRuns(text).map((run) => run.task), ['runClient'])
})

test('parseRuns 认 create("name") 这类工厂写法', () => {
  const text = `
    runs {
      create("benchmark") { server() }
      register("probe") { }
    }
  `
  const runs = parseRuns(text)
  assert.deepEqual(runs.map((run) => run.task), ['runBenchmark', 'runProbe'])
  assert.equal(runs[0].kind, 'server')
  // 块体里没有类型调用时，类型退回块名
  assert.equal(runs[1].kind, 'probe')
})

test('parseRuns 忽略 run 配置内部的嵌套块', () => {
  const text = `
    runs {
      client {
        mods { create("foo") { } }
        client()
      }
    }
  `
  assert.deepEqual(parseRuns(text).map((run) => run.task), ['runClient'])
})

test('parseJavaLevel 认 toolchain 与 compatibility', () => {
  assert.equal(parseJavaLevel('java.toolchain.languageVersion = JavaLanguageVersion.of(21)'), 21)
  assert.equal(parseJavaLevel('sourceCompatibility = JavaVersion.VERSION_17'), 17)
  assert.equal(parseJavaLevel('java {}\n'), undefined)
})

test('parseMinecraftVersion 认 loom 依赖与 forge 块', () => {
  assert.equal(parseMinecraftVersion(`minecraft "com.mojang:minecraft:1.20.1"`, {}), '1.20.1')
  assert.equal(parseMinecraftVersion(`minecraft { version = "1.12.2-14.23.5.2859" }`, {}), '1.12.2')
  assert.equal(parseMinecraftVersion('', { minecraft_version: '1.21.1' }), '1.21.1')
})

test('parseWrapperVersion 从 distributionUrl 取版本', () => {
  const version = parseWrapperVersion({
    distributionUrl: 'https\\://services.gradle.org/distributions/gradle-9.5.0-bin.zip',
  })
  assert.equal(version, '9.5.0')
})

test('minecraftFromNeoVersion 的映射', () => {
  assert.equal(minecraftFromNeoVersion('21.1.251'), '1.21.1')
  assert.equal(minecraftFromNeoVersion('20.4.237'), '1.20.4')
  assert.equal(minecraftFromNeoVersion('20.2.88'), '1.20.2')
  assert.equal(minecraftFromNeoVersion('nonsense'), undefined)
  assert.equal(minecraftFromNeoVersion(undefined), undefined)
})
