/**
 * 日志高亮解析：只测纯函数，不碰 DOM。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { highlightLine, highlightLines } from '../src/client/logFormat.js'

/** @param {Array<{ text: string, kind: string }>} parts */
function text(parts) {
  return parts.map((part) => part.text).join('')
}

/** @param {Array<{ text: string, kind: string }>} parts */
function kinds(parts) {
  return parts.map((part) => part.kind)
}

test('log4j：时间、线程、level、logger、正文各自成段', () => {
  const parts = highlightLine('[01:28:48] [Render thread/WARN] [minecraft/SoundEngine]: Missing sound for event: minecraft:item.goat_horn.play')
  assert.equal(text(parts), '[01:28:48] [Render thread/WARN] [minecraft/SoundEngine]: Missing sound for event: minecraft:item.goat_horn.play')
  assert.deepEqual(kinds(parts), ['time', 'thread', 'level-warn', 'thread', 'logger', 'message'])
})

test('log4j：ERROR 的正文也标红', () => {
  const parts = highlightLine('[01:30:00] [main/ERROR] [minecraft/Minecraft]: Failed to start')
  assert.equal(kinds(parts).includes('level-error'), true)
  assert.equal(parts.at(-1).kind, 'level-error')
})

test('log4j：没有 logger 段时也能解析', () => {
  const parts = highlightLine('[01:30:00] [main/INFO]: hello')
  assert.equal(text(parts), '[01:30:00] [main/INFO]: hello')
  assert.deepEqual(kinds(parts), ['time', 'thread', 'level-info', 'thread', 'message'])
})

test('Paper：`[时间 LEVEL]:` 格式', () => {
  const parts = highlightLine('[01:28:45 INFO]: [EnchatingPaper] Enabling v1.0')
  assert.equal(text(parts), '[01:28:45 INFO]: [EnchatingPaper] Enabling v1.0')
  assert.deepEqual(kinds(parts), ['time', 'level-info', 'time', 'message'])
})

test('无时间戳的 level 行', () => {
  const parts = highlightLine('WARN StatusConsoleListener Advanced terminal features are not available')
  assert.deepEqual(kinds(parts), ['level-warn', 'message'])
})

test('Gradle 任务与构建结果', () => {
  assert.deepEqual(kinds(highlightLine('> Task :runClient')), ['task'])
  assert.deepEqual(kinds(highlightLine('BUILD SUCCESSFUL in 12s')), ['ok'])
  assert.deepEqual(kinds(highlightLine('BUILD FAILED in 3s')), ['fail'])
  assert.deepEqual(kinds(highlightLine('FAILURE: Build failed with an exception.')), ['fail'])
  assert.deepEqual(kinds(highlightLine('* What went wrong:')), ['level-warn'])
})

test('堆栈帧与 Caused by 分开标色', () => {
  assert.deepEqual(kinds(highlightLine('    at net.minecraft.client.Main.main(Main.java:12)')), ['stack'])
  assert.deepEqual(kinds(highlightLine('Caused by: java.lang.NullPointerException')), ['fail'])
})

test('ANSI 转义会被剥掉，不会渲染成乱码', () => {
  const parts = highlightLine('\u001b[31m[01:30:00] [main/ERROR]\u001b[0m boom')
  assert.equal(text(parts).includes('\u001b'), false)
})

test('普通文本原样返回', () => {
  assert.deepEqual(highlightLine('Reusing configuration cache.'), [{ text: 'Reusing configuration cache.', kind: 'muted' }])
  assert.deepEqual(highlightLine('hello'), [{ text: 'hello', kind: 'plain' }])
  assert.deepEqual(highlightLine(''), [{ text: '', kind: 'plain' }])
})

test('批量解析保持行数', () => {
  const lines = highlightLines(['a', '', 'BUILD SUCCESSFUL in 1s'])
  assert.equal(lines.length, 3)
  assert.equal(lines[2][0].kind, 'ok')
})
