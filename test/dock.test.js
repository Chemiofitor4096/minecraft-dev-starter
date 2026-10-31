/**
 * 日志落点选择：纯函数，不碰 React、不碰 DOM。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseLogDock } from '../src/client/dock.js'

test('默认落在原生右侧栏', () => {
  assert.equal(chooseLogDock({}, true), 'right')
  assert.equal(chooseLogDock(undefined, true), 'right')
  assert.equal(chooseLogDock({ logDock: 'right' }, true), 'right')
})

test('配置为 bottom 且装了 better-sidebar 时落到底部工作台', () => {
  assert.equal(chooseLogDock({ logDock: 'bottom' }, true), 'bottom')
})

test('没装 better-sidebar 时忽略 bottom 配置，避免日志打不开', () => {
  assert.equal(chooseLogDock({ logDock: 'bottom' }, false), 'right')
})

test('非法值回退到右侧栏', () => {
  assert.equal(chooseLogDock({ logDock: 'sidebar' }, true), 'right')
  assert.equal(chooseLogDock({ logDock: '' }, true), 'right')
})
