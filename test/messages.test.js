/**
 * 文案字典护栏：
 *   1. zh / en 的 key 集合完全一致，值都不为空；
 *   2. 组件里除注释外不允许再出现中文字面量；
 *   3. 静态 `t('key')` 的 key 必须真的在词典里。
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { LOCALE_NS, attachLocale, en, interpolate, localeSource, t, zh } from '../src/client/messages.js'

const CLIENT_DIR = fileURLToPath(new URL('../src/client/', import.meta.url))
const DICTIONARY_FILE = 'messages.js'

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/

/** 去掉 JS 注释；模板字符串里的 CSS 注释也一并去掉。 */
function withoutComments(source) {
  let out = ''
  let index = 0
  let mode = 'code'
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]
    if (mode === 'code') {
      if (char === '/' && next === '/') {
        mode = 'line'
        index += 2
        out += ' '
        continue
      }
      if (char === '/' && next === '*') {
        mode = 'block'
        index += 2
        out += ' '
        continue
      }
      if (char === "'" || char === '"') {
        mode = char
        out += char
        index += 1
        continue
      }
      if (char === '`') {
        mode = 'template'
        out += char
        index += 1
        continue
      }
      out += char
      index += 1
      continue
    }
    if (mode === 'line') {
      if (char === '\n') {
        mode = 'code'
        out += '\n'
      }
      index += 1
      continue
    }
    if (mode === 'block') {
      if (char === '*' && next === '/') {
        mode = 'code'
        index += 2
        out += ' '
      } else {
        index += 1
      }
      continue
    }
    if (mode === 'template') {
      if (char === '\\') {
        out += char + (next ?? '')
        index += 2
        continue
      }
      if (char === '`') {
        mode = 'code'
        out += char
        index += 1
        continue
      }
      out += char
      index += 1
      continue
    }
    // 单引号 / 双引号字符串
    if (char === '\\') {
      out += char + (next ?? '')
      index += 2
      continue
    }
    if (char === mode) {
      mode = 'code'
      out += char
      index += 1
      continue
    }
    out += char
    index += 1
  }
  // 样式文件把 CSS 写在模板字符串里，里面的 /* … */ 也是注释。
  return out.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/** @returns {string[]} */
function clientFiles() {
  return readdirSync(CLIENT_DIR)
    .filter((name) => name.endsWith('.js') && name !== DICTIONARY_FILE)
    .sort()
}

test('zh / en key 集合完全一致', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
})

test('zh / en 的值都不为空', () => {
  for (const [key, value] of [...Object.entries(zh), ...Object.entries(en)]) {
    assert.equal(typeof value, 'string', `${key} 必须是字符串`)
    assert.notEqual(value.trim(), '', `${key} 不能为空`)
  }
})

test('en 里没有中文字符', () => {
  for (const [key, value] of Object.entries(en)) {
    assert.equal(CJK.test(value), false, `${key} 仍是中文：${value}`)
  }
})

test('中文侧有实义文案的 key，en 必须真的翻译过', () => {
  for (const [key, value] of Object.entries(zh)) {
    // 纯占位符（`{project}\n{root}`）本来就不该有语言差异
    if (!CJK.test(value)) continue
    assert.notEqual(en[key], value, `${key} 没有翻译，仍是中文`)
  }
})

test('en 与 zh 的参数占位符一致', () => {
  const names = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  for (const [key, value] of Object.entries(zh)) {
    assert.deepEqual(names(en[key] ?? ''), names(value), `${key} 的占位符对不上`)
  }
})

test('t 支持 {name} 参数', () => {
  assert.equal(t('capsule.start', { target: 'runClient' }), '启动 runClient')
  assert.equal(interpolate('{a} / {b}', { a: 1, b: 2 }), '1 / 2')
  // 没给的占位符原样保留，方便发现漏传参数
  assert.equal(interpolate('{a} / {b}', { a: 1 }), '1 / {b}')
})

test('组件里除注释外没有中文字面量', () => {
  for (const name of clientFiles()) {
    const code = withoutComments(readFileSync(join(CLIENT_DIR, name), 'utf8'))
    const match = CJK.exec(code)
    assert.equal(match, null, `${name} 仍有中文字面量：${match?.[0] ?? ''}`)
  }
})

test('静态 t(key) 的 key 都在 zh 词典里', () => {
  for (const name of clientFiles()) {
    const code = withoutComments(readFileSync(join(CLIENT_DIR, name), 'utf8'))
    for (const match of code.matchAll(/\bt\(\s*'([^']+)'/g)) {
      assert.ok(Object.hasOwn(zh, match[1]), `${name} 用了不存在的 key：${match[1]}`)
    }
  }
})

test('没有 locale 服务时 attachLocale 安静返回 false', () => {
  assert.equal(attachLocale(undefined), false)
  assert.equal(attachLocale({}), false)
})

test('locale 注册/绑定抛错不往外抛（不影响插件加载）', () => {
  const registerCalls = []
  const service = {
    register(namespace, dictionaries) {
      registerCalls.push([namespace, dictionaries])
      throw new Error('duplicate registration')
    },
    bind() {
      throw new Error('bind failed')
    },
  }
  assert.equal(attachLocale({ locale: service }), true)
  assert.equal(registerCalls[0][0], LOCALE_NS)
  assert.equal(registerCalls[0][1].zh, zh)
  assert.equal(registerCalls[0][1].en, en)
})

test('宿主有 locale 时优先用 bind 出来的翻译', () => {
  const service = {
    register() {},
    bind: () => (key, params) => `EN:${key}:${params?.target ?? ''}`,
    getSnapshot: () => ({ active: 'en' }),
  }
  attachLocale({ locale: service })
  assert.equal(t('capsule.start', { target: 'runClient' }), 'EN:capsule.start:runClient')
})

test('语言订阅源引用稳定，没有 locale 服务时也不抛错', () => {
  // useSyncExternalStore 依赖引用稳定：每次渲染新建对象会让 React 反复重订阅
  assert.equal(localeSource(), localeSource())
  const source = localeSource()
  const dispose = source.subscribe(() => {})
  assert.equal(typeof dispose, 'function')
  assert.equal(typeof source.snapshot(), 'string')
  dispose()
})

test('传进来的 locale 服务会真正转发订阅', () => {
  /** @type {Array<() => void>} */
  const listeners = []
  const service = {
    register() {},
    bind: (key) => (k) => k,
    subscribe(callback) {
      listeners.push(callback)
      return () => {
        const at = listeners.indexOf(callback)
        if (at >= 0) listeners.splice(at, 1)
      }
    },
    getSnapshot: () => ({ active: 'en' }),
  }
  attachLocale({ locale: service })
  const source = localeSource()
  let calls = 0
  const dispose = source.subscribe(() => {
    calls += 1
  })
  assert.equal(listeners.length > 0, true)
  for (const listener of listeners.slice()) listener()
  assert.equal(calls > 0, true)
  assert.equal(source.snapshot(), 'en')
  dispose()
})
