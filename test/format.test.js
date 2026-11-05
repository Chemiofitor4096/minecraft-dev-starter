/**
 * 面板展示层的纯函数：依赖合并、JDK 大版本去重。
 *
 * 依赖列表最容易被抱怨"一堆重复"，所以合并规则单独锁一次。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { availableMajors, groupDependencies, listRows, PANEL_TITLE, projectTitle } from '../src/client/format.js'

test('依赖按模块合并：同一模块的多个配置收成一行', () => {
  const groups = groupDependencies([
    { configuration: 'modCompileOnly', module: 'mezz.jei:jei', notation: 'mezz.jei:jei:1', file: 'build.gradle', line: 116 },
    { configuration: 'modRuntimeOnly', module: 'mezz.jei:jei', notation: 'mezz.jei:jei:1', file: 'build.gradle', line: 117 },
    { configuration: 'implementation', module: 'io.github:other', notation: 'io.github:other:2', file: 'build.gradle', line: 98 },
  ])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].configurations, ['modCompileOnly', 'modRuntimeOnly'])
  // 位置取第一次声明的那一行，够用来核对
  assert.equal(groups[0].line, 116)
  assert.equal(groups[1].notation, 'io.github:other:2')
})

test('没有 module 时用坐标本身当 key，避免把不同库并成一条', () => {
  const groups = groupDependencies([
    { configuration: 'implementation', notation: 'libs.a', file: 'build.gradle', line: 1 },
    { configuration: 'implementation', notation: 'libs.b', file: 'build.gradle', line: 2 },
  ])
  assert.equal(groups.length, 2)
})

test('本机 JDK 列表按大版本去重并降序', () => {
  const text = availableMajors({
    available: [{ home: 'C:/j1', major: 17 }, { home: 'C:/j2', major: 21 }, { home: 'C:/j3', major: 21 }],
  })
  assert.equal(text, '21 / 17')
  assert.equal(availableMajors({ available: [] }), '未发现')
  assert.equal(availableMajors({}), '未发现')
})

test('面板名保持稳定', () => {
  assert.equal(PANEL_TITLE, 'Mod Dev')
})

test('未解析的 Gradle 占位符不当名字用，退回目录名', () => {
  assert.equal(projectTitle({ modName: '${mod_name}', name: 'anno-mod-fabric', root: 'C:/Projects/anno-mod-fabric' }), 'anno-mod-fabric')
  assert.equal(projectTitle({ modName: 'Burst Door Open', name: 'x', root: 'C:/p/x' }), 'Burst Door Open')
  assert.equal(projectTitle(undefined), '—')
})

test('重名工程补目录名，其余保持干净', () => {
  const rows = listRows([
    { modName: 'Burst Door Open', name: 'fabric', root: 'C:/Projects/BurstDoorOpen-fabric-1.21.1' },
    { modName: 'Burst Door Open', name: 'neoforge', root: 'C:/Projects/BurstDoorOpen-neoforge-1.21.1' },
    { modName: 'anno-core', name: 'anno-core', root: 'C:/Projects/anno-core' },
  ])
  assert.deepEqual(
    rows.map((row) => [row.title, row.suffix]),
    [
      ['Burst Door Open', 'BurstDoorOpen-fabric-1.21.1'],
      ['Burst Door Open', 'BurstDoorOpen-neoforge-1.21.1'],
      ['anno-core', ''],
    ],
  )
})
