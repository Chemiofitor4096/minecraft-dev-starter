/**
 * 日志落点选择：纯函数，不碰 React、不碰 DOM。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseLogDock } from '../src/client/lib/dock.js'

test('装了 better-sidebar 时默认落底部工作台', () => {
  assert.equal(chooseLogDock(undefined, true), 'bottom')
  assert.equal(chooseLogDock({}, true), 'bottom')
  assert.equal(chooseLogDock({ logDock: 'bottom' }, true), 'bottom')
})

test('显式配置 right 时尊重配置', () => {
  assert.equal(chooseLogDock({ logDock: 'right' }, true), 'right')
})

test('没装 better-sidebar 时一律落右侧栏', () => {
  assert.equal(chooseLogDock(undefined, false), 'right')
  assert.equal(chooseLogDock({ logDock: 'bottom' }, false), 'right')
  assert.equal(chooseLogDock({ logDock: 'right' }, false), 'right')
})

test('非法值按默认处理：有 better-sidebar 落底部，没有落右侧栏', () => {
  assert.equal(chooseLogDock({ logDock: 'sidebar' }, true), 'bottom')
  assert.equal(chooseLogDock({ logDock: '' }, true), 'bottom')
  assert.equal(chooseLogDock({ logDock: 'sidebar' }, false), 'right')
})
