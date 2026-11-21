/**
 * 插件间服务（ctx.mcdev）与 spawn 环境合并。
 *
 * 这里钉的是"接口形状"而不是实现细节：别的插件只依赖版本、能力列表和四个方法。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeEnv } from '../src/lib/launch/launches.js'
import { createMcdevService, sanitizeEnv } from '../src/lib/service.js'

/**
 * 假 api：只实现服务用到的五个方法，并记录调用。
 * @param {Record<string, any>} [overrides]
 */
function fakeApi(overrides = {}) {
  /** @type {Array<Record<string, any>>} */
  const calls = []
  const record = {
    id: 'launch-1',
    status: 'starting',
    mode: 'daemon',
    taskPath: 'runClient',
    logPath: 'C:/logs/launch-1.log',
  }
  const api = {
    calls,
    'launch.start': async (payload) => {
      calls.push({ method: 'launch.start', payload })
      return { ...record, taskPath: payload.taskPath }
    },
    'launch.list': async () => [
      { id: 'launch-1', status: 'running', mode: 'daemon', taskPath: 'runClient' },
    ],
    'launch.stop': async (payload) => {
      calls.push({ method: 'launch.stop', payload })
      return { id: payload.id, status: 'exited', outcome: 'killed' }
    },
    'launch.current': async (payload) => {
      calls.push({ method: 'launch.current', payload })
      return { id: 'launch-7' }
    },
    'projects.detail': async (payload) => {
      calls.push({ method: 'projects.detail', payload })
      return {
        java: {
          required: 21,
          selected: 'C:/jdk21',
          available: [{ home: 'C:/jdk17', major: 17 }, { home: 'C:/jdk21', major: 21 }],
        },
      }
    },
    ...overrides,
  }
  return api
}

test('sanitizeEnv 只留字符串键值，空对象当没给', () => {
  assert.equal(sanitizeEnv(undefined), undefined)
  assert.equal(sanitizeEnv(null), undefined)
  assert.equal(sanitizeEnv('nope'), undefined)
  assert.equal(sanitizeEnv([['A', 'b']]), undefined)
  assert.equal(sanitizeEnv({}), undefined)
  assert.deepEqual(sanitizeEnv({ A: 'b', C: 1, D: null, '': 'x' }), { A: 'b' })
})

test('composeEnv：基础环境 ← 调用方 env ← JAVA_HOME 最高', () => {
  const env = composeEnv({
    baseEnv: { PATH: '/bin', JAVA_HOME: '/old', KEEP: '1' },
    requestEnv: { JAVA_TOOL_OPTIONS: '-javaagent:x', KEEP: '2', JAVA_HOME: '/requested' },
    javaHome: '/chosen',
  })
  assert.equal(env.PATH, '/bin')
  assert.equal(env.KEEP, '2')
  assert.equal(env.JAVA_TOOL_OPTIONS, '-javaagent:x')
  // JDK 由 jdk.json / 面板决定，调用方换不掉
  assert.equal(env.JAVA_HOME, '/chosen')
})

test('composeEnv：没有 javaHome 时保留基础环境里的 JAVA_HOME', () => {
  const env = composeEnv({ baseEnv: { JAVA_HOME: '/old' }, requestEnv: { A: 'b' } })
  assert.equal(env.JAVA_HOME, '/old')
  assert.equal(env.A, 'b')
})

test('服务形状：版本 + 能力列表 + 四个方法', () => {
  const service = createMcdevService({ api: fakeApi(), version: '0.2.2' })
  assert.equal(service.version, '0.2.2')
  assert.deepEqual(service.capabilities, ['launch', 'stop', 'list', 'resolve-java'])
  for (const name of ['launch', 'stop', 'list', 'resolveJava']) {
    assert.equal(typeof service[name], 'function', `缺方法 ${name}`)
  }
})

test('launch 把 env 透传给 api，并按 mode 等到就绪', async () => {
  const api = fakeApi()
  const service = createMcdevService({ api, version: 't' })
  const record = await service.launch({
    root: 'C:/p',
    workspace: 'C:/p',
    taskPath: 'runClient',
    env: { JAVA_TOOL_OPTIONS: '-javaagent:mcdev.jar=out=x' },
  })
  const call = api.calls.find((entry) => entry.method === 'launch.start')
  assert.deepEqual(call?.payload.env, { JAVA_TOOL_OPTIONS: '-javaagent:mcdev.jar=out=x' })
  assert.equal(call?.payload.workspace, 'C:/p')
  assert.equal(record.status, 'running')
  assert.equal(record.timedOut, false)
})

test('launch detach 立即返回，没 taskPath 直接报错', async () => {
  const api = fakeApi()
  const service = createMcdevService({ api, version: 't' })
  const detached = await service.launch({ taskPath: 'runClient', wait: 'detach' })
  assert.equal(detached.status, 'starting')
  await assert.rejects(
    service.launch({}),
    (error) => error.code === 'BAD_REQUEST',
  )
})

test('stop 给 id 就停它，不给就用当前活跃实例', async () => {
  const api = fakeApi()
  const service = createMcdevService({ api, version: 't' })
  await service.stop({ id: 'launch-1' })
  assert.equal(api.calls.at(-1)?.payload.id, 'launch-1')
  await service.stop({ root: 'C:/p' })
  assert.equal(api.calls.at(-2)?.method, 'launch.current')
  assert.equal(api.calls.at(-1)?.payload.id, 'launch-7')
})

test('没有活跃实例时 stop 报 NO_INSTANCE', async () => {
  const api = fakeApi({ 'launch.current': async () => null })
  const service = createMcdevService({ api, version: 't' })
  await assert.rejects(
    service.stop({}),
    (error) => error.code === 'NO_INSTANCE',
  )
})

test('resolveJava 用工程的选中 JDK，并带上大版本', async () => {
  const api = fakeApi()
  const service = createMcdevService({ api, version: 't' })
  assert.deepEqual(await service.resolveJava({ root: 'C:/p' }), {
    home: 'C:/jdk21',
    major: 21,
    required: 21,
  })
  const api2 = fakeApi({
    'projects.detail': async () => ({ java: { required: 21, selected: undefined, available: [] } }),
  })
  assert.equal(await createMcdevService({ api: api2, version: 't' }).resolveJava({}), undefined)
})
