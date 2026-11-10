/**
 * 目标分类与验证裁决。
 *
 * 这两件事是"agent 能不能自己验证"的前提：先分清哪些目标会跑完，
 * 再保证跑完之后有一个可断言的结论。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { modeOf, readVerdict } from '../src/lib/launch/verify.js'

test('mode：客户端与服务端常驻，数据生成与 gametest 会跑完', () => {
  assert.equal(modeOf('client'), 'daemon')
  assert.equal(modeOf('server'), 'daemon')
  for (const kind of ['data', 'datagen', 'gameTest', 'gameTestServer']) {
    assert.equal(modeOf(kind), 'oneshot', kind)
  }
  // 认不出来的 kind 当常驻：不能替一个陌生任务宣布"它已经跑完了"
  assert.equal(modeOf('custom'), 'daemon')
  assert.equal(modeOf(undefined), 'daemon')
})

test('裁决：零退出码 + BUILD SUCCESSFUL 是通过', () => {
  const verdict = readVerdict({ exitCode: 0, outcome: 'normal', lines: ['> Task :runData', 'BUILD SUCCESSFUL in 12s'] })
  assert.equal(verdict.verdict, 'passed')
  assert.match(verdict.summary, /BUILD SUCCESSFUL/)
  assert.equal(verdict.failures, undefined)
})

test('裁决：测试挂了但进程退了 0 也算失败（日志特征优先于退出码）', () => {
  const lines = ['Running test demo:oak_planks', '3 required tests failed :(', 'BUILD SUCCESSFUL in 12s']
  const verdict = readVerdict({ exitCode: 0, outcome: 'normal', lines })
  assert.equal(verdict.verdict, 'failed')
  assert.match(verdict.summary, /3 required tests failed/)
  assert.deepEqual(verdict.failures, ['3 required tests failed :('])
})

test('裁决：非零退出码失败，被停是 aborted，起不来是 error', () => {
  const crashed = readVerdict({ exitCode: 1, outcome: 'crashed', lines: [] })
  assert.equal(crashed.verdict, 'failed')
  assert.equal(crashed.summary, '退出码 1')
  assert.equal(readVerdict({ exitCode: null, outcome: 'killed', lines: [] }).verdict, 'aborted')
  assert.equal(readVerdict({ exitCode: null, outcome: 'failed', lines: [] }).verdict, 'error')
})

test('裁决：没有日志特征也没有退出码时不下结论', () => {
  assert.equal(readVerdict({ exitCode: null, outcome: null, lines: [] }).verdict, 'unknown')
})

test('裁决：ANSI 颜色会被剥掉，重复行只留一条', () => {
  const lines = ['\u001B[31mAssertionError: nope\u001B[0m', 'AssertionError: nope']
  const verdict = readVerdict({ exitCode: 0, outcome: 'normal', lines })
  assert.equal(verdict.verdict, 'failed')
  assert.deepEqual(verdict.failures, ['AssertionError: nope'])
})

test('裁决：失败行有上限，不会把整段堆栈搬回来', () => {
  const lines = Array.from({ length: 40 }, (_, index) => `AssertionError: case ${index}`)
  const verdict = readVerdict({ exitCode: 0, outcome: 'normal', lines })
  assert.equal(verdict.verdict, 'failed')
  assert.ok(verdict.failures.length <= 8, String(verdict.failures.length))
})
