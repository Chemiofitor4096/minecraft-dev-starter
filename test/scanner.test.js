/**
 * 扫描器回归：只找出真工程，不把 build/、reference/ 下的干扰项算进来。
 */
import assert from 'node:assert/strict'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { scanWorkspace } from '../src/lib/detect/scanner.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

test('多模块聚合工程不再单列，子模块各自成工程', async () => {
  const result = await scanWorkspace(fixtures, { jdks: [] })
  const names = result.projects
    .map((project) => relative(fixtures, String(project.root)).replace(/\\/g, '/'))
    .sort()
  assert.deepEqual(names, ['architectury/common', 'architectury/fabric', 'architectury/forge', 'fabric', 'neoforge', 'unknown'])
  assert.equal(result.truncated, false)
})

test('工作区根本身是工程时也会被识别', async () => {
  const result = await scanWorkspace(join(fixtures, 'fabric'), { jdks: [] })
  assert.equal(result.projects.length, 1)
  assert.equal(result.projects[0].loader, 'fabric')
})

test('maxProjects 触顶时标记 truncated', async () => {
  const result = await scanWorkspace(fixtures, { jdks: [], maxProjects: 2 })
  assert.equal(result.projects.length, 2)
  assert.equal(result.truncated, true)
})

test('聚合工程：子模块各自成工程，聚合根不单列', async () => {
  const demo = join(dirname(fileURLToPath(import.meta.url)), 'fixtures-multi', 'demo')
  const result = await scanWorkspace(demo, { jdks: [] })
  assert.deepEqual(
    result.projects.map((project) => relative(demo, String(project.root)).replace(/\\/g, '/')),
    ['modules/core', 'modules/gadget'],
  )
  // 每个子工程都要指回聚合根，否则启动时在模块目录里找不到 gradlew
  assert.ok(result.projects.every((project) => project.gradleRoot === demo))
})

test('没有 .idea 时用 settings.gradle 的 include 拆子工程', async () => {
  const plain = join(dirname(fileURLToPath(import.meta.url)), 'fixtures-multi', 'plain')
  const result = await scanWorkspace(plain, { jdks: [] })
  assert.deepEqual(
    result.projects.map((project) => relative(plain, String(project.root)).replace(/\\/g, '/')),
    ['modules/alpha', 'modules/beta'],
  )
  assert.ok(result.projects.every((project) => project.idea === undefined))
})

test('IDEA 运行配置补出的子模块目标继承父工程 wrapper', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'mcdev-scan-idea-run-'))
  const demo = join(scratch, 'demo')
  const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures-multi', 'demo')
  try {
    await cp(fixture, demo, { recursive: true })
    const moduleRoot = join(demo, 'modules', 'core')
    await writeFile(
      join(moduleRoot, 'build.gradle'),
      [
        "plugins { id 'net.neoforged.moddev' version '2.0.147' }",
        "neoForge { version = '21.1.251' }",
      ].join('\n'),
    )

    const result = await scanWorkspace(demo, { jdks: [] })
    const core = result.projects.find((project) => project.root === moduleRoot)
    assert.ok(core, '扫描结果应保留 core 子模块')
    assert.equal(core.error, undefined)
    assert.equal(core.modulePath, 'modules/core')
    assert.equal(core.loader, 'neoforge')
    assert.equal(core.gradleRoot, demo)
    assert.equal(core.wrapper, true)
    assert.deepEqual(core.runTargets.map((target) => target.taskPath), [':modules:core:runClient'])
    assert.equal(core.runTargets[0].source, 'idea-run-config')
    assert.ok(core.evidence.some((entry) => entry.kind === 'idea-run-config' && entry.detail.includes('Core Client')))
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})
