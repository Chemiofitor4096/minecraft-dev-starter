/**
 * 版本矩阵的纯函数测试：只测比较、筛选、解析与矩阵自身的结构，不联网。
 *
 * 这里锁住两条实际踩过的坑：
 *   1. `+1.21.1` 用 contains 会误伤 `+1.21.11`，必须用 suffix；
 *   2. maven-metadata 的 `<latest>` 可能指向 alpha，发布线要显式过滤。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  compareVersions,
  diffCell,
  metadataUrl,
  parseMavenMetadata,
  pickVersion,
  selectVersion,
} from '../scripts/refresh-versions.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const matrix = JSON.parse(readFileSync(join(here, '..', 'data', 'versions.json'), 'utf8'))

test('maven 坐标映射到 metadata 地址', () => {
  assert.equal(
    metadataUrl('fabric', 'net.fabricmc:fabric-loom'),
    'https://maven.fabricmc.net/net/fabricmc/fabric-loom/maven-metadata.xml',
  )
  assert.equal(
    metadataUrl('neoforged', 'net.neoforged.gradle:userdev'),
    'https://maven.neoforged.net/releases/net/neoforged/gradle/userdev/maven-metadata.xml',
  )
  assert.throws(() => metadataUrl('unknown', 'a:b'))
  assert.throws(() => metadataUrl('fabric', 'no-colon'))
})

test('解析 maven-metadata：latest / release / versions', () => {
  const xml = `<?xml version="1.0"?>
    <metadata>
      <versioning>
        <latest>1.20.0-alpha.24</latest>
        <release>1.19.4</release>
        <versions>
          <version>1.18.4</version>
          <version>1.19.4</version>
          <version>1.20.0-alpha.24</version>
        </versions>
      </versioning>
    </metadata>`
  const parsed = parseMavenMetadata(xml)
  assert.equal(parsed.latest, '1.20.0-alpha.24')
  assert.equal(parsed.release, '1.19.4')
  assert.deepEqual(parsed.versions, ['1.18.4', '1.19.4', '1.20.0-alpha.24'])
})

test('版本比较：数字段按数值，字母段比数字段旧', () => {
  assert.equal(compareVersions('21.1.9', '21.1.10') < 0, true)
  assert.equal(compareVersions('0.92.12+1.20.1', '0.116.18+1.21.1') < 0, true)
  assert.equal(compareVersions('1.20.1-47.1.106', '1.20.1-47.1.9') > 0, true)
  assert.equal(compareVersions('1.19.4', '1.20.0-alpha.24') < 0, true)
})

test('发布线过滤掉 alpha / beta / rc / snapshot', () => {
  const versions = ['1.18.4', '1.19.4', '1.20.0-alpha.24', '1.11.0-beta.1']
  assert.equal(pickVersion(versions, { channel: 'release' }), '1.19.4')
  assert.equal(pickVersion(versions), '1.20.0-alpha.24')
})

test('suffix 精确匹配，不被 +1.21.11 误伤', () => {
  const versions = ['0.116.18+1.21.1', '0.141.6+1.21.11', '0.136.1+1.21.8']
  assert.equal(selectVersion(versions, { suffix: '+1.21.1' }), '0.116.18+1.21.1')
  // 反例：contains 会把 +1.21.11 也收进来，所以矩阵里不许用 contains 匹配版本后缀
  assert.equal(selectVersion(versions, { contains: '+1.21.1' }), '0.141.6+1.21.11')
  assert.equal(selectVersion(versions, { suffix: '+1.21.8' }), '0.136.1+1.21.8')
})

test('正则 filter 按线挑版本', () => {
  const versions = ['21.1.9', '21.1.10', '21.8.57', '20.4.1']
  assert.equal(selectVersion(versions, { filter: '^21\\.1\\.' }), '21.1.10')
  assert.equal(selectVersion(versions, { filter: '^21\\.' }), '21.8.57')
})

test('对照：pinned 与 latest 不同即漂移', () => {
  const rows = diffCell(
    { pinned: { neoforge: '21.1.265', gradlePlugin: '7.1.39' } },
    { neoforge: '21.1.266', gradlePlugin: '7.1.39' },
  )
  assert.deepEqual(rows, [
    { field: 'gradlePlugin', pinned: '7.1.39', latest: '7.1.39', drift: false },
    { field: 'neoforge', pinned: '21.1.265', latest: '21.1.266', drift: true },
  ])
})

test('矩阵结构：每条线都有两个 loader，单元字段齐全且不重复', () => {
  assert.ok(Array.isArray(matrix.cells) && matrix.cells.length > 0)
  assert.equal(matrix.schemaVersion, 1)

  const ids = new Set()
  for (const cell of matrix.cells) {
    assert.equal(ids.has(cell.id), false, `重复的单元 id: ${cell.id}`)
    ids.add(cell.id)
    assert.ok(['fabric', 'neoforge'].includes(cell.loader), `未知 loader: ${cell.loader}`)
    assert.ok(typeof cell.mcVersion === 'string' && cell.mcVersion !== '')
    assert.ok(Number.isInteger(cell.java) && cell.java >= 8, `java 版本不对: ${cell.id}`)
    assert.ok(['verified', 'supported', 'unknown'].includes(cell.status), `未知状态: ${cell.id}`)
    assert.ok(Object.keys(cell.pinned ?? {}).length > 0, `没有 pinned: ${cell.id}`)
    assert.ok(Array.isArray(cell.sources) && cell.sources.length > 0, `没有 sources: ${cell.id}`)
    // pinned 的每个字段都必须有来源能刷新它，否则它会悄悄变旧
    const fields = new Set(cell.sources.flatMap((source) => [source.field, ...(source.fields ?? [])]).filter(Boolean))
    for (const field of Object.keys(cell.pinned)) {
      assert.ok(fields.has(field), `${cell.id} 的 ${field} 没有对应的刷新来源`)
    }
    assert.ok(matrix.lines.some((line) => line.mcVersion === cell.mcVersion), `${cell.id} 不在 lines 里`)
  }

  // 每条线都覆盖两个 loader
  for (const line of matrix.lines) {
    const loaders = matrix.cells.filter((cell) => cell.mcVersion === line.mcVersion).map((cell) => cell.loader)
    assert.deepEqual([...loaders].sort(), ['fabric', 'neoforge'], `${line.mcVersion} 缺 loader`)
  }
})
