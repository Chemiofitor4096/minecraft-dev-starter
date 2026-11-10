/**
 * 面板展示层的纯函数：依赖合并、JDK 大版本去重。
 *
 * 依赖列表最容易被抱怨"一堆重复"，所以合并规则单独锁一次。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { availableMajors, groupDependencies, kindLabel, listRows, loaderLabel, PANEL_TITLE, projectTitle, relativeTime, runDuration } from '../src/client/lib/format.js'
import { attachLocale } from '../src/client/lib/messages.js'

/**
 * 切换当前语言：走真实的解析路径（attachLocale 之后 getSnapshot().active），
 * 不额外造一个只给测试用的开关。
 * @param {'zh' | 'en'} language
 */
function useLanguage(language) {
  attachLocale({
    locale: {
      register() {},
      // bind 返回 undefined：t() 回退到本地词典，避免假的宿主翻译混进来
      bind: () => undefined,
      getSnapshot: () => ({ active: language }),
    },
  })
}

test('依赖按模块合并：同一模块的多个配置收成一行', () => {
  const groups = groupDependencies([
    { configuration: 'modCompileOnly', module: 'mezz.jei:jei', notation: 'mezz.jei:jei:1', file: 'build.gradle', line: 116 },
    { configuration: 'modRuntimeOnly', module: 'mezz.jei:jei', notation: 'mezz.jei:jei:1', file: 'build.gradle', line: 117 },
    { configuration: 'implementation', module: 'io.github:other', notation: 'io.github:other:2', file: 'build.gradle', line: 98 },
  ])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].configurations, ['modCompileOnly', 'modRuntimeOnly'])
  // module 要留着：面板靠它去找 IDE 解析出的版本
  assert.equal(groups[0].module, 'mezz.jei:jei')
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

test('未知 loader / kind 仍然显示中文文案，不退化成原始枚举值', () => {
  assert.equal(loaderLabel('unknown'), '未识别')
  assert.equal(loaderLabel(undefined), '未识别')
  assert.equal(kindLabel('unknown'), '未知')
  assert.equal(kindLabel(undefined), '未知')
  // 认得出的 loader 名不翻译
  assert.equal(loaderLabel('neoforge'), 'NeoForge')
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

test('跨组重名也补目录名：可运行与未识别同名时两处一致', () => {
  // 调用方把「可运行」「其他」两组作为同一个列表传进来
  const rows = listRows([
    { modName: 'Burst Door Open', name: 'fabric', root: 'C:/Projects/BurstDoorOpen-fabric-1.21.1', runTargets: [{ taskPath: 'runClient' }] },
    { modName: 'Burst Door Open', name: 'neoforge', root: 'C:/Projects/BurstDoorOpen-neoforge-1.21.1', runTargets: [] },
    { modName: 'anno-core', name: 'anno-core', root: 'C:/Projects/anno-core', runTargets: [] },
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

test('聚合工程子模块补父目录名，同一父工程相邻排列', () => {
  const rows = listRows([
    { name: 'api', root: 'C:/Projects/anno-core/api', parentRoot: 'C:/Projects/anno-core' },
    { name: 'standalone', root: 'C:/Projects/standalone' },
    { name: 'core', root: 'C:/Projects/anno-core/core', parentRoot: 'C:/Projects/anno-core' },
    { name: 'client', root: 'C:/Projects/other/client', parentRoot: 'C:/Projects/other' },
  ])
  assert.deepEqual(
    rows.map((row) => [row.title, row.suffix]),
    [
      ['api', 'anno-core'],
      ['core', 'anno-core'],
      ['standalone', ''],
      ['client', 'other'],
    ],
  )
})

test('运行时长：不足一分钟按秒，否则 N 分 M 秒', () => {
  assert.equal(runDuration('2026-11-06T00:00:00Z', '2026-11-06T00:00:27Z'), '27 秒')
  assert.equal(runDuration('2026-11-06T00:00:00Z', '2026-11-06T00:01:27Z'), '1 分 27 秒')
  assert.equal(runDuration(undefined, '2026-11-06T00:01:27Z'), undefined)
})

test('相对时间：中文与 0.1.12 逐字一致，英文读得出「多久以前」', () => {
  const now = Date.parse('2026-11-06T12:00:00Z')
  /** @param {string} iso */
  const at = (iso) => relativeTime(iso, now)
  try {
    useLanguage('zh')
    assert.equal(at('2026-11-06T11:59:55Z'), '5 秒前')
    assert.equal(at('2026-11-06T11:48:00Z'), '12 分钟前')
    assert.equal(at('2026-11-06T09:00:00Z'), '3 小时前')
    // 超过一天退回 UTC 日期，与 0.1.12 一致
    assert.equal(at('2026-11-04T12:00:00Z'), '2026-11-04')

    useLanguage('en')
    assert.equal(at('2026-11-06T11:59:55Z'), '5 sec ago')
    assert.equal(at('2026-11-06T11:48:00Z'), '12 min ago')
    assert.equal(at('2026-11-06T09:00:00Z'), '3 hours ago')
    // 单数不能写成 "1 hours ago"
    assert.equal(at('2026-11-06T11:00:00Z'), '1 hour ago')
    assert.equal(at('2026-11-06T11:59:00Z'), '1 min ago')
    assert.equal(at('2026-11-04T12:00:00Z'), '2026-11-04')
  } finally {
    useLanguage('zh')
  }
})
