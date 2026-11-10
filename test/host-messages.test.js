/**
 * 宿主侧文案护栏：双语字典 + 识别结果里不许留中文。
 *
 * 这一份字典管的是**识别与运行产生的内容**（证据 / 警告 / 归因 / 错误），
 * 它们和客户端词典是两回事：客户端管界面骨架，这里管内容。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createApi } from '../src/lib/api.js'
import { detectProject } from '../src/lib/detect/detect.js'
import { createLaunchService } from '../src/lib/launch/launches.js'
import { diagnose } from '../src/lib/launch/launches.js'
import { currentLanguage, en, setLanguage, t, zh } from '../src/lib/i18n/messages.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const jdks = [
  { home: 'C:/fake/jdk8', version: '1.8.0_402', major: 8, source: 'release' },
  { home: 'C:/fake/jdk21', version: '21.0.7', major: 21, source: 'release' },
]

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/

/** 每条归因规则各给一行能命中的日志。 */
const DIAGNOSIS_SAMPLES = [
  ['Could not resolve net.fabricmc:fabric-loader', 'DEPENDENCY_UNRESOLVED'],
  ['java.lang.UnsupportedClassVersionError: Unsupported class file major version 65', 'JDK_VERSION_MISMATCH'],
  ['No matching toolchains found for requested specification: {languageVersion=21}', 'JDK_TOOLCHAIN_MISSING'],
  ['java.net.BindException: Address already in use: bind', 'PORT_IN_USE'],
  ['org.spongepowered.asm.mixin.MixinException: Mixin apply failed', 'MIXIN_APPLY_FAILED'],
  ['java.lang.OutOfMemoryError: Java heap space', 'OUT_OF_MEMORY'],
  ['# There is insufficient memory? See crash-reports/crash-2026-11-06.txt', 'GAME_CRASH_REPORT'],
  ['BUILD FAILED in 12s', 'GRADLE_BUILD_FAILED'],
]

/** 断言一段文字里没有中文。 */
function assertNoChinese(value, label) {
  const match = CJK.exec(String(value))
  assert.equal(match, null, `${label} 仍有中文：${value}`)
}

/**
 * @param {Record<string, any>} profile
 * @returns {string[]} 所有会显示给人看的文字
 */
function visibleText(profile) {
  const evidence = (profile.evidence ?? []).flatMap((entry) => [entry.file, entry.detail])
  return [...evidence, ...(profile.warnings ?? []), ...(profile.conflicts ?? [])]
}

test('zh / en key 集合完全一致', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
})

test('en 里没有中文字符，中文侧有实义文案的 key 必须翻译过', () => {
  for (const [key, value] of Object.entries(en)) {
    assert.equal(CJK.test(value), false, `${key} 仍是中文：${value}`)
  }
  for (const [key, value] of Object.entries(zh)) {
    if (!CJK.test(value)) continue
    assert.notEqual(en[key], value, `${key} 没有翻译`)
  }
})

test('en 与 zh 的参数占位符一致', () => {
  const names = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  for (const [key, value] of Object.entries(zh)) {
    assert.deepEqual(names(en[key] ?? ''), names(value), `${key} 的占位符对不上`)
  }
})

test('语言默认中文，认不出的值也退回中文', () => {
  try {
    setLanguage('en-US')
    assert.equal(currentLanguage(), 'en')
    setLanguage(undefined)
    assert.equal(currentLanguage(), 'zh')
    setLanguage('fr')
    assert.equal(currentLanguage(), 'zh')
    setLanguage('en')
    assert.equal(currentLanguage(), 'en')
    assert.equal(t('summary.notStarted'), 'The process failed to start')
  } finally {
    setLanguage('zh')
  }
})

test('中文的标点没有被英文侧带偏', () => {
  try {
    setLanguage('zh')
    // 列举用顿号，句子之间用全角分号——都是 0.1.12 的原样
    assert.equal(t('list.separator'), '、')
    assert.equal(t('list.clauseSeparator'), '；')
    setLanguage('en')
    assert.equal(t('list.separator'), ', ')
    assert.equal(t('list.clauseSeparator'), '; ')
  } finally {
    setLanguage('zh')
  }
})

test('每条归因规则都有中英两版 hint / suggestion', () => {
  try {
    for (const [line, code] of DIAGNOSIS_SAMPLES) {
      setLanguage('zh')
      const china = diagnose([line])
      assert.equal(china?.code, code, `没命中 ${code}`)
      assert.notEqual(china?.hint, `diagnosis.${code}.hint`, `${code} 的 hint 缺失`)
      assert.notEqual(china?.suggestion, `diagnosis.${code}.suggestion`, `${code} 的 suggestion 缺失`)

      setLanguage('en')
      const english = diagnose([line])
      assert.equal(english?.code, code)
      assertNoChinese(english?.hint, `${code} hint`)
      assertNoChinese(english?.suggestion, `${code} suggestion`)
    }
  } finally {
    setLanguage('zh')
  }
})

test('英文模式下识别结果里零中文，中文模式下与 0.1.12 原文案一致', async () => {
  try {
    setLanguage('en')
    const english = await detectProject(join(fixtures, 'fabric'), { jdks })
    for (const text of visibleText(english)) assertNoChinese(text, 'fabric 英文证据')

    const englishMulti = await detectProject(join(fixtures, 'forge'), { jdks })
    for (const text of visibleText(englishMulti)) assertNoChinese(text, 'forge 英文证据')

    setLanguage('zh')
    const china = await detectProject(join(fixtures, 'fabric'), { jdks })
    // 结构与语言无关：条数一样，只有文字变了
    assert.equal(china.evidence.length, english.evidence.length)
    assert.equal(china.warnings.length, english.warnings.length)
    assert.ok(
      visibleText(china).some((text) => text.includes('Gradle 构建脚本')),
      '中文模式下应保留 0.1.12 的原文案',
    )
    assert.ok(visibleText(english).some((text) => text.includes('Gradle build script')))
  } finally {
    setLanguage('zh')
  }
})

test('扫描缓存按语言分开：切英文后不会拿到中文那份', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-lang-'))
  try {
    const api = createApi({
      resolveRoot: async () => join(fixtures, 'fabric'),
      version: '0.0.0-test',
      launchService: createLaunchService({ dir }),
      jdkDir: dir,
      listJdks: async () => [
        { home: 'C:/fake/jdk21', version: '21.0.7', major: 21, source: 'release' },
      ],
    })

    setLanguage('zh')
    const china = await api['projects.scan']({})
    assert.ok(visibleText(china.projects[0]).some((text) => text.includes('Gradle 构建脚本')))

    // 不带 refresh：正常会命中缓存。缓存 key 里没有语言的话，这里仍是中文。
    setLanguage('en')
    const english = await api['projects.scan']({})
    for (const text of visibleText(english.projects[0])) assertNoChinese(text, '缓存后的英文证据')
  } finally {
    setLanguage('zh')
    await rm(dir, { recursive: true, force: true })
  }
})
