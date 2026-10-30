/**
 * 扫描器回归：只找出真工程，不把 build/、reference/ 下的干扰项算进来。
 */
import assert from 'node:assert/strict'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { scanWorkspace } from '../src/lib/scanner.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

test('只返回四个真工程，干扰项被剪掉', async () => {
  const result = await scanWorkspace(fixtures, { jdks: [] })
  const names = result.projects.map((project) => basename(String(project.root))).sort()
  assert.deepEqual(names, ['architectury', 'fabric', 'neoforge', 'unknown'])
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
