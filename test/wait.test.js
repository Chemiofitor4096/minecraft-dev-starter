/**
 * 等实例落到目标状态：语义由 `until` 决定，`ready` 之后还有一个观察窗。
 *
 * 真的踩过：客户端在就绪标记出现的同一秒崩掉（`launch-44`），工具如实报"运行中"，
 * 调用方两秒后再看才发现已经退出了。观察窗把这种"起来了但立刻崩"算进这次等待里。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { READY_GRACE_MS, waitForLaunch } from '../src/lib/launch/wait.js'

/**
 * 按给定顺序返回状态的假 list；用完后一直返回最后一个。
 * @param {Array<Record<string, any>>} sequence
 */
function listFrom(sequence) {
  let index = 0
  return async () => {
    const entry = sequence[Math.min(index, sequence.length - 1)]
    index += 1
    return [{ id: 'launch-1', ...entry }]
  }
}

test('ready：running 之后又退出，返回退出的那份而不是 running', async () => {
  const settled = await waitForLaunch({
    list: listFrom([{ status: 'starting' }, { status: 'running' }, { status: 'exited', verdict: 'crashed' }]),
    id: 'launch-1',
    until: 'ready',
    timeoutMs: 5_000,
    intervalMs: 1,
    graceMs: 5,
  })
  assert.equal(settled.timedOut, false)
  assert.equal(settled.entry?.status, 'exited')
  assert.equal(settled.entry?.verdict, 'crashed')
})

test('ready：一直 running 就返回 running', async () => {
  const settled = await waitForLaunch({
    list: listFrom([{ status: 'running' }]),
    id: 'launch-1',
    until: 'ready',
    timeoutMs: 5_000,
    intervalMs: 1,
    graceMs: 5,
  })
  assert.equal(settled.entry?.status, 'running')
})

test('已经 exited 的实例不再多等观察窗', async () => {
  const started = Date.now()
  const settled = await waitForLaunch({
    list: listFrom([{ status: 'exited' }]),
    id: 'launch-1',
    until: 'ready',
    timeoutMs: 5_000,
    intervalMs: 1,
    graceMs: 5_000,
  })
  assert.equal(settled.entry?.status, 'exited')
  assert.ok(Date.now() - started < 1_000, '不该为已退出的实例等满观察窗')
})

test('exit：等的是结束，不看观察窗', async () => {
  const settled = await waitForLaunch({
    list: listFrom([{ status: 'running' }, { status: 'exited', verdict: 'passed' }]),
    id: 'launch-1',
    until: 'exit',
    timeoutMs: 5_000,
    intervalMs: 1,
    graceMs: 9_999,
  })
  assert.equal(settled.entry?.status, 'exited')
  assert.equal(settled.entry?.verdict, 'passed')
})

test('超时返回 timedOut，实例不见了返回空', async () => {
  const timeout = await waitForLaunch({
    list: listFrom([{ status: 'starting' }]),
    id: 'launch-1',
    until: 'ready',
    timeoutMs: 5,
    intervalMs: 1,
    graceMs: 0,
  })
  assert.equal(timeout.timedOut, true)
  const gone = await waitForLaunch({
    list: async () => [],
    id: 'launch-1',
    until: 'ready',
    timeoutMs: 5_000,
    intervalMs: 1,
  })
  assert.equal(gone.entry, undefined)
  assert.equal(gone.timedOut, false)
})

test('默认观察窗是 2 秒', () => {
  assert.equal(READY_GRACE_MS, 2_000)
})
