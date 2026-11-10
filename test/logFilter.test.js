/**
 * 日志级别过滤：纯函数 + localStorage 兜底。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterByLevel, levelOfParts, readLevelFilter, writeLevelFilter } from '../src/client/lib/logFilter.js'
import { highlightLine } from '../src/client/lib/logFormat.js'

const parsed = [
  highlightLine('[01:00:00] [main/DEBUG] [x/]: debug 行'),
  highlightLine('[01:00:01] [main/INFO] [x/]: info 行'),
  highlightLine('[01:00:02] [main/WARN] [x/]: warn 行'),
  highlightLine('[01:00:03] [main/ERROR] [x/]: error 行'),
  highlightLine('    at net.minecraft.Foo.bar(Foo.java:1)'),
  highlightLine('> Task :runClient'),
]

const text = (rows) => rows.map((parts) => parts.map((p) => p.text).join(''))

test('从片段里取级别', () => {
  assert.equal(levelOfParts(highlightLine('[01:00:00] [main/DEBUG] [x/]: d')), 'debug')
  assert.equal(levelOfParts(highlightLine('[01:00:01] [main/INFO] [x/]: i')), 'info')
  assert.equal(levelOfParts(highlightLine('[01:00:02] [main/WARN] [x/]: w')), 'warn')
  assert.equal(levelOfParts(highlightLine('[01:00:03] [main/ERROR] [x/]: e')), 'error')
  assert.equal(levelOfParts(highlightLine('    at a.b(C.java:1)')), undefined)
  assert.equal(levelOfParts(highlightLine('> Task :runClient')), undefined)
})

test('全部：不过滤', () => {
  const result = filterByLevel(parsed, 'all')
  assert.equal(result.lines.length, parsed.length)
  assert.equal(result.hidden, 0)
})

test('WARN+：只保留 warn/error 与无级别的行', () => {
  const result = filterByLevel(parsed, 'warn')
  const shown = text(result.lines)
  assert.equal(shown.some((line) => line.includes('debug 行')), false)
  assert.equal(shown.some((line) => line.includes('info 行')), false)
  assert.equal(shown.some((line) => line.includes('warn 行')), true)
  assert.equal(shown.some((line) => line.includes('error 行')), true)
  assert.equal(shown.some((line) => line.includes('at net.minecraft')), true)
  assert.equal(result.hidden, 2)
})

test('ERROR：只保留 error 与无级别的行', () => {
  const result = filterByLevel(parsed, 'error')
  const shown = text(result.lines)
  assert.equal(shown.some((line) => line.includes('warn 行')), false)
  assert.equal(shown.some((line) => line.includes('error 行')), true)
  assert.equal(result.hidden, 3)
})

test('INFO+：只隐藏 debug', () => {
  const result = filterByLevel(parsed, 'info')
  assert.equal(result.lines.length, parsed.length - 1)
})

test('非法档位按「全部」处理', () => {
  assert.equal(filterByLevel(parsed, 'verbose').lines.length, parsed.length)
})

test('读写档位：非法值回退 all', () => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  }
  writeLevelFilter('warn')
  assert.equal(readLevelFilter(), 'warn')
  store.set('mcdev.logLevel', 'nonsense')
  assert.equal(readLevelFilter(), 'all')
  delete globalThis.localStorage
})
