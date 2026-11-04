/**
 * `.idea` 的解析回归：这是第二证据源，坏了不会报错，只会悄悄少字段。
 * 用的是 test/fixtures-multi/demo——一个聚合工程的标准 IntelliJ 目录结构。
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { findOwningAggregator, readIdeaProject, resolveProjectDir } from '../src/lib/idea.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures-multi')
const demo = join(fixtures, 'demo')

test('读 Gradle 模块清单、工程 JDK 与字节码目标', async () => {
  const idea = await readIdeaProject(demo)
  assert.ok(idea !== undefined)
  assert.equal(idea.projectName, 'Demo-Multi')
  assert.equal(idea.gradleJvm, '#JAVA_HOME')
  assert.equal(idea.jdkName, 'temurin-21')
  assert.equal(idea.languageLevel, 21)
  assert.equal(idea.bytecodeTarget, 17)
  assert.deepEqual(idea.gradleModules, ['.', 'modules/core', 'modules/gadget'])
  assert.deepEqual(idea.files.sort(), ['.name', 'compiler.xml', 'gradle.xml', 'misc.xml', 'modules.xml', 'workspace.xml'])
})

test('iml 的 minecraft facet 给出平台，并与 Gradle 模块路径对上', async () => {
  const idea = await readIdeaProject(demo)
  assert.ok(idea !== undefined)
  assert.deepEqual(idea.platforms, ['NEOFORGE'])
  assert.deepEqual(
    idea.modules.map((module) => module.gradlePath),
    ['modules/core', 'modules/gadget'],
  )
})

test('运行配置按工作目录归到模块，default 的配置不算', async () => {
  const idea = await readIdeaProject(demo)
  assert.ok(idea !== undefined)
  const summary = idea.runConfigurations.map((config) => `${config.kind}@${config.modulePath}`).sort()
  assert.deepEqual(summary, ['client@modules/core', 'client@modules/gadget'])
})

test('子模块往上找到聚合工程，并带出自己的模块路径', async () => {
  const hit = await findOwningAggregator(join(demo, 'modules', 'core'))
  assert.ok(hit !== undefined)
  assert.equal(hit.modulePath, 'modules/core')
  assert.equal(hit.parentDir, demo)
  assert.equal(hit.idea.projectName, 'Demo-Multi')
})

test('没有 .idea 时返回 undefined，不是空壳对象', async () => {
  assert.equal(await readIdeaProject(fixtures), undefined)
})

test('传 .idea 目录时退回工程根', async () => {
  assert.equal(resolveProjectDir(join(demo, '.idea')), demo)
  assert.equal(resolveProjectDir(demo), demo)
})

test('工程外的 iml 不读：克隆来的仓库写什么路径都不越界', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'mcdev-idea-'))
  try {
    const inside = join(scratch, 'project')
    const outside = join(scratch, 'outside')
    await mkdir(join(inside, '.idea'), { recursive: true })
    await mkdir(outside, { recursive: true })
    await writeFile(join(outside, 'evil.iml'), '<module><facet type="minecraft"><platformType>FORGE</platformType></facet></module>')
    await writeFile(
      join(inside, '.idea', 'modules.xml'),
      `<project><component name="ProjectModuleManager"><modules>`
        + `<module filepath="${join(outside, 'evil.iml').replace(/\\/g, '/')}" />`
        + `</modules></component></project>`,
    )
    const idea = await readIdeaProject(inside)
    assert.ok(idea !== undefined)
    assert.deepEqual(idea.modules, [])
    assert.deepEqual(idea.platforms, [])
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})
