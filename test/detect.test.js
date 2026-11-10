/**
 * 识别引擎的回归：四种工程形态各断言一次，用的是 test/fixtures 里的最小工程。
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { detectProject } from '../src/lib/detect/detect.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const multi = join(dirname(fileURLToPath(import.meta.url)), 'fixtures-multi')
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
  // 没有 .idea 就没有可对照的解析结果：字段整个不出现，而不是空数组
  assert.equal('compared' in dependencies, false)
})

test('子模块工程：任务带模块前缀，Gradle 根指回聚合根', async () => {
  const profile = await detectProject(join(multi, 'demo', 'modules', 'core'), { jdks })
  assert.equal(profile.modulePath, 'modules/core')
  assert.equal(profile.gradleRoot, join(multi, 'demo'))
  assert.equal(profile.loader, 'neoforge')
  assert.deepEqual(
    profile.runTargets.map((target) => target.taskPath),
    [':modules:core:runClient', ':modules:core:runData'],
  )
  assert.deepEqual(profile.runTargets.map((target) => target.module), ['modules/core', 'modules/core'])
  // wrapper 继承自父工程
  assert.equal(profile.gradleVersion, '9.5.0')
  assert.ok(profile.evidence.some((entry) => entry.detail.includes('继承自父工程')))
})

test('子模块工程沿用父工程 .idea 的工程模型', async () => {
  const profile = await detectProject(join(multi, 'demo', 'modules', 'gadget'), { jdks })
  const idea = /** @type {Record<string, any>} */ (profile.idea)
  assert.equal(idea.name, 'Demo-Multi')
  // 只保留属于这个模块的运行配置
  assert.equal(idea.runConfigurations, 1)
})

test('聚合根：没有自己的元数据时用 rootProject.name 当工程名', async () => {
  const profile = await detectProject(join(multi, 'demo'), { jdks })
  assert.equal(profile.modName, 'Demo-Multi')
  assert.equal(profile.modId, undefined)
  assert.ok(profile.evidence.some((entry) => entry.kind === 'aggregator'))
})

test('依赖对照：声明 vs IDE 同步库表，same / differs / unresolved，传递依赖不列', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'mcdev-compare-'))
  try {
    const projectDir = join(scratch, 'project')
    await mkdir(join(projectDir, '.idea'), { recursive: true })
    await writeFile(
      join(projectDir, 'build.gradle'),
      `plugins { id 'fabric-loom' version '1.10-SNAPSHOT' }\n`
        + 'dependencies {\n'
        + '  modImplementation "net.fabricmc:fabric-loader:${fabric_loader_version}"\n'
        + '  implementation "com.example:dynamic:1.2.+"\n'
        + '  implementation "com.example:missing:3.0.0"\n'
        + '}\n',
    )
    await writeFile(join(projectDir, 'gradle.properties'), 'fabric_loader_version=0.16.10\n')
    await writeFile(
      join(projectDir, '.idea', 'misc.xml'),
      '<project version="4"><component name="ExternalStorageConfigurationManager" enabled="true" /></project>',
    )
    await writeExternalLibraries(scratch, projectDir, [
      { group: 'net.fabricmc', artifact: 'fabric-loader', version: '0.16.10' },
      { group: 'com.example', artifact: 'dynamic', version: '1.2.7' },
      // 传递依赖：只在库表里，没有在构建脚本里声明
      { group: 'com.google.guava', artifact: 'guava', version: '32.1.2-jre' },
    ])

    const profile = await detectProject(projectDir, { jdks, externalRoots: [join(scratch, 'jetbrains')] })
    const dependencies = /** @type {Record<string, any>} */ (profile.dependencies)
    const idea = /** @type {Record<string, any>} */ (profile.idea)
    // 声明里的 ${fabric_loader_version} 先按 gradle.properties 解析，再对照
    assert.equal(dependencies.build[0].notation, 'net.fabricmc:fabric-loader:0.16.10')
    assert.equal(typeof idea.libraries.syncedAt, 'string')
    assert.deepEqual(dependencies.compared, [
      { module: 'net.fabricmc:fabric-loader', declared: '0.16.10', resolved: '0.16.10', status: 'same' },
      { module: 'com.example:dynamic', declared: '1.2.+', resolved: '1.2.7', status: 'differs' },
      { module: 'com.example:missing', declared: '3.0.0', resolved: null, status: 'unresolved' },
    ])
    // 原始索引太大，不跟着画像进扫描结果
    assert.equal('resolved' in idea.libraries, false)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

test('外部存储开关关掉时不读旧库表，也没有 compared', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'mcdev-external-off-'))
  try {
    const projectDir = join(scratch, 'project')
    await mkdir(join(projectDir, '.idea'), { recursive: true })
    await writeFile(join(projectDir, 'build.gradle'), 'dependencies { implementation "com.example:thing:1.0" }\n')
    await writeFile(
      join(projectDir, '.idea', 'misc.xml'),
      '<project version="4"><component name="ExternalStorageConfigurationManager" enabled="false" /></project>',
    )
    await writeExternalLibraries(scratch, projectDir, [{ group: 'com.example', artifact: 'thing', version: '1.0' }])

    const profile = await detectProject(projectDir, { jdks, externalRoots: [join(scratch, 'jetbrains')] })
    const dependencies = /** @type {Record<string, any>} */ (profile.dependencies)
    assert.equal(profile.idea?.libraries, undefined)
    assert.equal('compared' in dependencies, false)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

test('有 .idea 但从没同步过：没有 compared 字段', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'mcdev-never-synced-'))
  try {
    const projectDir = join(scratch, 'project')
    await mkdir(join(projectDir, '.idea'), { recursive: true })
    await writeFile(join(projectDir, 'build.gradle'), 'dependencies { implementation "com.example:thing:1.0" }\n')
    await writeFile(
      join(projectDir, '.idea', 'misc.xml'),
      '<project version="4"><component name="ExternalStorageConfigurationManager" enabled="true" /></project>',
    )

    const profile = await detectProject(projectDir, { jdks, externalRoots: [join(scratch, 'jetbrains')] })
    const dependencies = /** @type {Record<string, any>} */ (profile.dependencies)
    assert.equal(profile.idea?.libraries, undefined)
    assert.equal('compared' in dependencies, false)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

/**
 * 造一份 IDE 外部存储的缓存：cache-state.xml 用工程绝对路径认领，libraries.xml 放库表。
 * @param {string} scratch
 * @param {string} projectDir
 * @param {Array<{ group: string, artifact: string, version: string }>} entries
 */
async function writeExternalLibraries(scratch, projectDir, entries) {
  const cacheDir = join(scratch, 'jetbrains', 'IntelliJIdea2026.1', 'projects', 'project.test')
  await mkdir(join(cacheDir, 'external_build_system', 'project'), { recursive: true })
  const projectKey = projectDir.replace(/\\/g, '/')
  const state = { projectData: { GRADLE: { [projectKey]: {} } } }
  await writeFile(
    join(cacheDir, 'cache-state.xml'),
    `<project version="4"><component name="ExternalSystemProjectTracker"><![CDATA[${JSON.stringify(state)}]]></component></project>`,
  )
  const libraries = entries
    .map(
      (entry) =>
        `<library name="Gradle: ${entry.group}:${entry.artifact}:${entry.version}" type="java-imported">`
        + `<properties groupId="${entry.group}" artifactId="${entry.artifact}" version="${entry.version}" />`
        + '</library>',
    )
    .join('')
  await writeFile(
    join(cacheDir, 'external_build_system', 'project', 'libraries.xml'),
    `<component name="libraryTable">${libraries}</component>`,
  )
}
