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
    'projects.scan': async (payload) => ({
      root: payload?.root ?? 'C:/p',
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
    'projects.detail': async (payload) => ({
      root: payload?.root ?? 'C:/p',
      name: 'demo',
      modName: 'Demo Mod',
      kind: 'mod',
      loader: 'neoforge',
      loaders: ['neoforge'],
      minecraftVersion: '1.21.1',
      confidence: 0.95,
      modules: [{ path: '.', platform: 'neoforge', targets: [{ taskPath: 'runClient' }] }],
      evidence: [{ file: 'build.gradle', kind: 'plugin', detail: '插件 net.neoforged.moddev' }],
      warnings: ['没找到可用的 JDK 21'],
      conflicts: [],
      java: { required: 21, selected: 'C:/jdk-21', exact: true, available: [{ major: 21 }, { major: 17 }] },
    }),
    'launch.start': async () => ({ id: 'launch-1', status: 'starting', taskPath: 'runClient', pid: 123, logPath: 'C:/logs/launch-1.log' }),
    'launch.list': async () => [
      {
        id: 'launch-2',
        status: 'exited',
        outcome: 'normal',
        taskPath: 'runClient',
        label: 'Client',
        pid: null,
        startedAt: '2026-10-31T01:28:24.500Z',
        endedAt: '2026-10-31T01:29:08.665Z',
        logPath: 'C:/logs/launch-2.log',
      },
      { id: 'launch-1', status: 'running', taskPath: 'runClient', label: 'Client', startedAt: '2026-10-31T01:20:00.000Z', logPath: 'C:/logs/launch-1.log' },
    ],
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

test('注册六个工具并且参数已转成 JSON Schema', () => {
  const { byName } = build()
  assert.deepEqual(Object.keys(byName).sort(), [
    'mc_launch',
    'mc_launch_list',
    'mc_launch_logs',
    'mc_launch_stop',
    'mc_project_detail',
    'mc_projects',
  ])
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

// ── 会话工作区 ────────────────────────────────────────────────────────

test('mc_projects 用调用会话的 cwd 当工作区', async () => {
  const { byName } = build()
  const value = await byName.mc_projects.execute({}, { agent: { session: { header: { cwd: 'C:/agent' } } } })
  assert.equal(value.root, 'C:/agent')
})

test('显式 root 优先于会话 cwd', async () => {
  const { byName } = build()
  const value = await byName.mc_projects.execute({ root: 'C:/explicit' }, { agent: { session: { header: { cwd: 'C:/agent' } } } })
  assert.equal(value.root, 'C:/explicit')
})

test('省略 id 的工具把会话 cwd 传给宿主', async () => {
  const seen = []
  const { byName } = build({
    'launch.current': async (payload) => {
      seen.push(payload)
      return { id: 'launch-1' }
    },
  })
  const exec = { agent: { session: { header: { cwd: 'C:/agent' } } } }
  await byName.mc_launch_logs.execute({}, exec)
  await byName.mc_launch_stop.execute({}, exec)
  assert.deepEqual(seen.map((payload) => payload.root), ['C:/agent', 'C:/agent'])
})

// ── 新增：历史列表与工程详情 ──────────────────────────────────────────

test('mc_launch_list 列出实例并渲染状态', async () => {
  const { byName } = build()
  const value = await byName.mc_launch_list.execute({}, {})
  assert.equal(value.launches.length, 2)
  assert.equal(value.launches[0].id, 'launch-2')
  assert.equal(value.launches[0].outcome, 'normal')
  assertLossless(value)
  const blocks = byName.mc_launch_list.output.render({}, value)
  assert.match(blocks[0].text, /launch-2/)
  assert.match(blocks[0].text, /已退出/)
})

test('mc_launch_list 支持 limit', async () => {
  const { byName } = build()
  const value = await byName.mc_launch_list.execute({ limit: 1 }, {})
  assert.equal(value.launches.length, 1)
})

test('mc_project_detail 输出证据、JDK 与警告', async () => {
  const { byName } = build()
  const value = await byName.mc_project_detail.execute({ root: 'C:/p' }, {})
  assert.equal(value.name, 'Demo Mod')
  assert.equal(value.loader, 'neoforge')
  assert.deepEqual(value.modules[0].targets, ['runClient'])
  assert.equal(value.java.required, 21)
  assert.deepEqual(value.java.available, [21, 17])
  assert.match(value.evidence[0], /build\.gradle/)
  assert.match(value.warnings[0], /JDK/)
  assertLossless(value)
  const blocks = byName.mc_project_detail.output.render({}, value)
  assert.match(blocks[0].text, /置信度 95%/)
  assert.match(blocks[0].text, /需要 21/)
})

test('mc_launch_logs 把归因输出为结构化对象', async () => {
  const { byName } = build({
    'launch.logs': async () => ({
      launchId: 'launch-1',
      status: 'exited',
      outcome: 'crashed',
      exitCode: 1,
      lines: ['Could not resolve net.neoforged:neoforge:21.1.251'],
      total: 1,
      diagnosis: { code: 'DEPENDENCY_UNRESOLVED', hint: '依赖解析失败', suggestion: '检查网络', line: 'Could not resolve …' },
    }),
  })
  const value = await byName.mc_launch_logs.execute({ id: 'launch-1' }, {})
  assert.equal(value.diagnosis.code, 'DEPENDENCY_UNRESOLVED')
  assert.equal(value.diagnosis.suggestion, '检查网络')
  assertLossless(value)
  assert.match(byName.mc_launch_logs.output.render({}, value)[0].text, /建议：检查网络/)
})
