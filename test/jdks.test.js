/**
 * 每个工程的 JDK 选择：优先级、持久化与"要不要真的传给 Gradle"。
 *
 * 这里的规则一旦错，表现是"面板说用 21，实际跑的是 17"这种最难查的问题。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  emptyJdkPrefs,
  loadJdkPrefs,
  overrideFor,
  projectKey,
  resolveJdk,
  saveJdkPrefs,
  shouldInjectJdk,
  withExtra,
} from '../src/lib/jdks.js'

const jdks = [
  { home: 'C:/jdk/jdk-21', version: '21.0.7', major: 21, source: 'release' },
  { home: 'C:/jdk/jdk-17', version: '17.0.12', major: 17, source: 'release' },
]

test('工程根归一化：斜杠、尾斜杠、大小写都不影响命中', () => {
  assert.equal(projectKey('C:/Projects/Demo/'), projectKey('c:\\projects\\demo'))
  const prefs = { ...emptyJdkPrefs(), projects: { [projectKey('C:\\Projects\\Demo')]: 'C:/jdk/jdk-21' } }
  assert.equal(overrideFor(prefs, 'C:/Projects/Demo/'), 'C:/jdk/jdk-21')
})

test('优先级：手动指定 > gradle.properties > 自动', () => {
  const prefs = { ...emptyJdkPrefs(), projects: { [projectKey('C:/p')]: 'C:/jdk/jdk-17' } }
  const override = resolveJdk(prefs, 'C:/p', jdks, 21, 'C:/jdk/jdk-21')
  assert.equal(override.home, 'C:/jdk/jdk-17')
  assert.equal(override.source, 'override')

  const configured = resolveJdk(emptyJdkPrefs(), 'C:/p', jdks, 21, 'C:/jdk/jdk-21')
  assert.equal(configured.source, 'configured')
  assert.equal(configured.home, 'C:/jdk/jdk-21')

  const auto = resolveJdk(emptyJdkPrefs(), 'C:/p', jdks, 21, undefined)
  assert.equal(auto.source, 'auto')
  assert.equal(auto.home, 'C:/jdk/jdk-21')
  assert.equal(auto.exact, true)
})

test('手动指定的 JDK 已经不在了：仍然返回它，标记为不匹配', () => {
  const prefs = { ...emptyJdkPrefs(), projects: { [projectKey('C:/p')]: 'C:/gone/jdk-21' } }
  const choice = resolveJdk(prefs, 'C:/p', jdks, 21, undefined)
  assert.equal(choice.home, 'C:/gone/jdk-21')
  assert.equal(choice.source, 'override')
  assert.equal(choice.exact, false)
  assert.equal(choice.major, undefined)
})

test('只有"手动指定"或"完全匹配且 Gradle 跑得动"才注入 JDK', () => {
  const exact = { home: 'C:/jdk/jdk-21', source: 'auto', exact: true, major: 21 }
  assert.equal(shouldInjectJdk(exact, '8.8'), true)
  // Gradle 8.8 跑不了 JDK 25：宁可交回环境原本的 JAVA_HOME
  assert.equal(shouldInjectJdk({ ...exact, major: 25 }, '8.8'), false)
  assert.equal(shouldInjectJdk({ ...exact, exact: false }, '8.8'), false)
  assert.equal(shouldInjectJdk({ ...exact, source: 'configured' }, '8.8'), false)
  assert.equal(shouldInjectJdk({ home: 'C:/x', source: 'override', exact: false, major: 25 }, '8.8'), true)
  assert.equal(shouldInjectJdk(undefined, '8.8'), false)
})

test('手动添加的 JDK 去重且有上限', () => {
  let prefs = emptyJdkPrefs()
  prefs = withExtra(prefs, 'C:/jdk/jdk-21')
  prefs = withExtra(prefs, 'c:/JDK/jdk-21')
  assert.deepEqual(prefs.extra, ['C:/jdk/jdk-21'])
  for (let index = 0; index < 40; index += 1) prefs = withExtra(prefs, `C:/jdk/x${index}`)
  assert.equal(prefs.extra.length, 20)
  assert.equal(prefs.extra[0], 'C:/jdk/x39')
})

test('jdk.json 读写：缺文件时给空值，写入后可读回', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-jdk-'))
  try {
    assert.deepEqual(await loadJdkPrefs(dir), { extra: [], projects: {} })
    await saveJdkPrefs(dir, { extra: ['C:/jdk/jdk-21'], projects: { [projectKey('C:/p')]: 'C:/jdk/jdk-21' } })
    const loaded = await loadJdkPrefs(dir)
    assert.deepEqual(loaded.extra, ['C:/jdk/jdk-21'])
    assert.equal(overrideFor(loaded, 'C:/p/'), 'C:/jdk/jdk-21')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
