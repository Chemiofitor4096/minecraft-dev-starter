/**
 * 面板展示层的纯函数：依赖合并、JDK 大版本去重。
 *
 * 依赖列表最容易被抱怨"一堆重复"，所以合并规则单独锁一次。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { availableMajors, groupDependencies, PANEL_TITLE } from '../src/client/format.js'

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
