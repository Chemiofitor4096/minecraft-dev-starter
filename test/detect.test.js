/**
 * 识别引擎的回归：四种工程形态各断言一次，用的是 test/fixtures 里的最小工程。
 */
import assert from 'node:assert/strict'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { detectProject } from '../src/lib/detect.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const jdks = [
  { home: 'C:/fake/jdk8', version: '1.8.0_402', major: 8, source: 'release' },
  { home: 'C:/fake/jdk21', version: '21.0.7', major: 21, source: 'release' },
]

test('fabric：占位符会被 gradle.properties 解析', async () => {
  const profile = await detectProject(join(fixtures, 'fabric'), { jdks })
  assert.equal(profile.loader, 'fabric')
  assert.equal(profile.minecraftVersion, '1.21.1')
  assert.equal(profile.modId, 'examplemod')
  assert.equal(profile.modName, 'Example Mod')
  assert.equal(profile.kind, 'mod')
  assert.equal(profile.confidence, 0.95)
  const tasks = profile.runTargets.map((target) => target.taskPath)
  assert.deepEqual(tasks, ['runClient', 'runServer'])
  assert.ok(profile.runTargets.every((target) => target.guessed === false))
  assert.equal(profile.java.required, 21)
  assert.equal(profile.java.exact, true)
})

test('neoforge：版本来自 neo_version 映射，runs 四个目标', async () => {
  const profile = await detectProject(join(fixtures, 'neoforge'), { jdks })
  assert.equal(profile.loader, 'neoforge')
  assert.equal(profile.minecraftVersion, '1.21.1')
  assert.equal(profile.loaderVersion, '21.1.251')
  assert.deepEqual(
    profile.runTargets.map((target) => target.taskPath),
    ['runClient', 'runServer', 'runData', 'runGameTestServer'],
  )
  // 常驻还是会跑完：决定启动后是等就绪还是等结束
  assert.deepEqual(
    profile.runTargets.map((target) => target.mode),
    ['daemon', 'daemon', 'oneshot', 'oneshot'],
  )
  assert.ok(profile.warnings.some((warning) => warning.includes('configuration-cache')))
})

test('architectury：模块展开 + 平台识别 + common 不猜客户端', async () => {
  const profile = await detectProject(join(fixtures, 'architectury'), { jdks })
  assert.equal(profile.kind, 'multi-loader')
  const modules = /** @type {Array<Record<string, any>>} */ (profile.modules)
  assert.deepEqual(
    modules.map((module) => module.path),
    ['.', 'common', 'fabric', 'forge'],
  )
  const byPath = Object.fromEntries(modules.map((module) => [module.path, module]))
  assert.equal(byPath.fabric.platform, 'fabric')
  assert.equal(byPath.forge.platform, 'forge')
  assert.equal(byPath.common.targets.length, 0, 'common 不应有推测的客户端目标')
  assert.ok(byPath.fabric.targets.length > 0)
  assert.ok(byPath.fabric.targets.every((target) => target.guessed === true))
  assert.ok(profile.warnings.some((warning) => warning.includes('推测')))
})

test('unknown：有 Gradle 但没有 loader 特征时不猜', async () => {
  const profile = await detectProject(join(fixtures, 'unknown'), { jdks })
  assert.equal(profile.loader, 'unknown')
  assert.equal(profile.kind, 'unknown')
  assert.equal(profile.confidence, 0.2)
  assert.equal(profile.runTargets.length, 0)
})

test('缺失目录不会抛异常', async () => {
  const profile = await detectProject(join(fixtures, 'does-not-exist'), { jdks })
  assert.equal(profile.loader, 'unknown')
  assert.ok(Array.isArray(profile.warnings))
})

test('手动指定 JDK 时画像标为 override', async () => {
  const profile = await detectProject(join(fixtures, 'fabric'), { jdks, overrideJavaHome: 'C:/fake/jdk21' })
  assert.equal(profile.java.source, 'override')
  assert.equal(profile.java.override, 'C:/fake/jdk21')
  assert.equal(profile.java.selected, 'C:/fake/jdk21')
  assert.equal(profile.java.exact, true)
})

test('自动挑选的 JDK 标为 auto', async () => {
  const profile = await detectProject(join(fixtures, 'fabric'), { jdks })
  assert.equal(profile.java.source, 'auto')
  assert.equal(profile.java.override, undefined)
})

test('画像里带声明依赖：元数据的 depends 拉成列表', async () => {
  const profile = await detectProject(join(fixtures, 'fabric'), { jdks })
  const dependencies = /** @type {Record<string, any>} */ (profile.dependencies)
  assert.deepEqual(dependencies.build, [])
  assert.deepEqual(
    dependencies.mods.map((entry) => `${entry.modId}:${entry.range}`),
    ['fabricloader:>=0.16.10', 'minecraft:~1.21.1'],
  )
  assert.equal(dependencies.catalogFile, null)
})
