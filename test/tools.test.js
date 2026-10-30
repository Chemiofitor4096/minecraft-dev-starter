/**
 * M5 工具：注册名字、参数 schema、执行与渲染。
 * 用假的 ctx.tools 与假 api，不起真进程。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyTools } from '../src/tools.js'

function fakeCtx() {
  /** @type {Array<any>} */
  const registered = []
  return {
    ctx: { tools: { register: (definition) => registered.push(definition) } },
    registered,
  }
}

function fakeApi(overrides = {}) {
  return {
    'projects.scan': async () => ({
      root: 'C:/p',
      truncated: false,
      projects: [
        {
          name: 'demo',
          root: 'C:/p/demo',
          loader: 'neoforge',
          minecraftVersion: '1.21.1',
          runTargets: [{ taskPath: 'runClient', module: '.', guessed: false }],
        },
      ],
    }),
    'launch.start': async () => ({ id: 'launch-1', status: 'starting', taskPath: 'runClient', pid: 123, logPath: 'C:/logs/launch-1.log' }),
    'launch.list': async () => [{ id: 'launch-1', status: 'running', taskPath: 'runClient', pid: 123, logPath: 'C:/logs/launch-1.log' }],
    'launch.current': async () => ({ id: 'launch-1' }),
    'launch.logs': async () => ({
      launchId: 'launch-1',
      status: 'running',
      outcome: null,
      exitCode: null,
      lines: ['> Task :runClient', 'Backend library: LWJGL'],
      total: 2,
    }),
    'launch.stop': async () => ({ id: 'launch-1', status: 'exited', outcome: 'killed' }),
    ...overrides,
  }
}

function build(overrides) {
  const { ctx, registered } = fakeCtx()
  const api = fakeApi(overrides)
  applyTools(ctx, { api })
  return { registered, byName: Object.fromEntries(registered.map((entry) => [entry.name, entry])) }
}

/**
 * 工具结果必须是无损 JSON：出现 undefined 会被注册器整条拒掉
 * （真机上 mc_launch_logs 就这么失败过）。
 * @param {unknown} value
 */
function assertLossless(value) {
  const roundTrip = JSON.parse(JSON.stringify(value))
  assert.deepEqual(roundTrip, value, `输出里含非 JSON 值：${JSON.stringify(value)}`)
}

test('注册四个工具并且参数已转成 JSON Schema', () => {
  const { byName } = build()
  assert.deepEqual(Object.keys(byName).sort(), ['mc_launch', 'mc_launch_logs', 'mc_launch_stop', 'mc_projects'])
  const launch = byName.mc_launch
  assert.equal(launch.parameters.type, 'object')
  assert.ok(launch.parameters.properties.taskPath)
  assert.deepEqual(launch.parameters.required, ['taskPath'])
})

test('mc_projects 输出紧凑列表并可渲染', async () => {
  const { byName } = build()
  const value = await byName.mc_projects.execute({}, {})
  assert.equal(value.root, 'C:/p')
  assert.equal(value.projects[0].targets[0], 'runClient')
  const blocks = byName.mc_projects.output.render({}, value)
  assert.match(blocks[0].text, /demo/)
  assert.match(blocks[0].text, /neoforge/)
})

test('mc_launch 默认等到运行态', async () => {
  const { byName } = build()
  const value = await byName.mc_launch.execute({ taskPath: 'runClient' }, {})
  assert.equal(value.status, 'running')
  assert.equal(value.timedOut, false)
  assertLossless(value)
  assert.match(byName.mc_launch.output.render({}, value)[0].text, /运行态|状态 running/)
})

test('mc_launch detach 立即返回', async () => {
  const { byName } = build()
  const value = await byName.mc_launch.execute({ taskPath: 'runClient', wait: 'detach' }, {})
  assert.equal(value.status, 'starting')
  assertLossless(value)
})

test('mc_launch_logs 省略 id 时取当前实例，且结果可无损序列化', async () => {
  const { byName } = build()
  const value = await byName.mc_launch_logs.execute({}, {})
  assert.equal(value.launchId, 'launch-1')
  assert.equal(value.lines.length, 2)
  assertLossless(value)
})

test('没有归因/退出码时输出里不出现 undefined 字段', async () => {
  const { byName } = build({
    'launch.logs': async () => ({ launchId: 'launch-1', status: 'running', outcome: null, exitCode: null, lines: [], total: 0 }),
  })
  const value = await byName.mc_launch_logs.execute({ id: 'launch-1' }, {})
  assert.equal('outcome' in value, false)
  assert.equal('exitCode' in value, false)
  assert.equal('diagnosis' in value, false)
  assertLossless(value)
})

test('mc_launch_stop 省略 id 时停当前实例', async () => {
  const { byName } = build()
  const value = await byName.mc_launch_stop.execute({}, {})
  assert.equal(value.status, 'exited')
  assert.equal(value.outcome, 'killed')
})

test('没有活跃实例时给可读错误', async () => {
  const { byName } = build({ 'launch.current': async () => null })
  await assert.rejects(() => byName.mc_launch_logs.execute({}, {}), /没有运行中的实例/)
  await assert.rejects(() => byName.mc_launch_stop.execute({}, {}), /没有运行中的实例/)
})
