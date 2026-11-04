/**
 * 扫描器回归：只找出真工程，不把 build/、reference/ 下的干扰项算进来。
 */
import assert from 'node:assert/strict'
import { join, dirname, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { scanWorkspace } from '../src/lib/scanner.js'

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
