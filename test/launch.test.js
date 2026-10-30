/**
 * 启动链路的测试：命令行构造、任务路径白名单、真实子进程的启停与日志。
 *
 * 进程部分用 node 自己当"假 gradlew"：打印就绪标记后挂住，
 * 这样能真实验证 spawn/日志/停止/状态机，而不用等 Gradle 构建。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gradlewCommand, isAlive, TASK_PATH_PATTERN } from '../src/lib/argv.js'
import { createLaunchService, decodeLine, splitBufferLines } from '../src/lib/launches.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 等到条件成立或超时。 */
async function waitFor(check, timeoutMs = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = await check()
    if (value) return value
    await sleep(50)
  }
  throw new Error('等待超时')
}

test('Windows 下 gradlew 命令带正确的引号与 verbatim 标记', () => {
  const command = gradlewCommand({ platform: 'win32', projectDir: 'C:\\Projects\\demo', taskPath: ':fabric:runClient' })
  assert.equal(command.argv[0], 'cmd.exe')
  assert.deepEqual(command.argv.slice(1, 4), ['/d', '/s', '/c'])
  // 外层一对引号给 cmd /s 剥，里层给路径与参数
  assert.equal(command.argv[4], '""C:\\Projects\\demo\\gradlew.bat" ":fabric:runClient""')
  assert.equal(command.windowsVerbatimArguments, true)
  assert.equal(command.cwd, 'C:\\Projects\\demo')
})

test('POSIX 下直接调用 wrapper', () => {
  const command = gradlewCommand({ platform: 'linux', projectDir: '/home/u/demo', taskPath: 'runClient' })
  assert.deepEqual(command.argv, ['/home/u/demo/gradlew', 'runClient'])
  assert.equal(command.windowsVerbatimArguments, false)
})

test('任务路径白名单只放 run*', () => {
  for (const ok of ['runClient', 'runServer', 'runData', ':fabric:runClient', ':a:b:runGameTestServer']) {
    assert.ok(TASK_PATH_PATTERN.test(ok), ok)
  }
  for (const bad of ['build', 'run', 'clean runClient', 'runClient && whoami', ':fabric:test']) {
    assert.equal(TASK_PATH_PATTERN.test(bad), false, bad)
  }
})

test('isAlive 认得当前进程与不存在的 pid', () => {
  assert.equal(isAlive(process.pid), true)
  assert.equal(isAlive(999999), false)
  assert.equal(isAlive(null), false)
})

test('输出解码：UTF-8 直通，GBK 回退', () => {
  assert.equal(decodeLine(Buffer.from('构建完成', 'utf8')), '构建完成')
  // GBK 的"中文"
  const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4])
  const decoded = decodeLine(gbk)
  // 运行时不带完整 ICU 时只能退回 UTF-8，此时允许解码失败
  if (decoded.includes('\uFFFD')) return
  assert.equal(decoded, '中文')
})

test('整份日志按行解码', () => {
  const buffer = Buffer.concat([Buffer.from('line-1\n'), Buffer.from('line-2\r\n'), Buffer.from('line-3')])
  assert.deepEqual(splitBufferLines(buffer), ['line-1', 'line-2', 'line-3'])
})

test('启动 → 就绪 → 读日志 → 停止', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-launch-'))
  const script = [
    "process.stdout.write('> Task :compileJava\\n')",
    "process.stdout.write('[Render thread/INFO]: Backend library: LWJGL 3.3.3\\n')",
    'setInterval(() => {}, 1000)',
  ].join(';')
  const service = createLaunchService({
    dir,
    commandFor: () => ({ argv: [process.execPath, '-e', script], cwd: process.cwd(), windowsVerbatimArguments: false }),
    readyTimeoutMs: 3000,
  })

  try {
    const record = await service.start({ root: 'C:\\fake\\demo', taskPath: 'runClient', label: 'Client', kind: 'client' })
    assert.equal(record.status, 'starting')
    assert.equal(typeof record.pid, 'number')

    const running = await waitFor(async () => {
      const list = await service.list()
      return list.find((entry) => entry.status === 'running')
    })
    assert.equal(running.id, record.id)

    const logs = await waitFor(async () => {
      const result = await service.logs(record.id)
      return result.total >= 2 ? result : undefined
    })
    assert.ok(logs.lines.some((line) => line.includes('Backend library')), logs.lines.join('\n'))

    // 同工程再起一个必须被挡住
    await assert.rejects(
      () => service.start({ root: 'C:\\fake\\demo', taskPath: 'runServer', label: 'Server', kind: 'server' }),
      /已有运行中的实例/,
    )

    await service.stop(record.id)
    const exited = await waitFor(async () => {
      const list = await service.list()
      const entry = list.find((item) => item.id === record.id)
      return entry?.status === 'exited' ? entry : undefined
    })
    assert.equal(exited.outcome, 'killed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('宿主重启后对账：进程没了就标 unknown，不伪造结局', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-reconcile-'))
  try {
    // 先写一条"运行中但 pid 已经不存在"的记录
    const { saveState, emptyState } = await import('../src/lib/state.js')
    const state = emptyState()
    state.launches.push({
      id: 'launch-1',
      root: 'C:\\fake\\demo',
      taskPath: 'runClient',
      label: 'Client',
      kind: 'client',
      module: '.',
      pid: 999999,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'running',
      outcome: null,
      exitCode: null,
      signal: null,
      logPath: join(dir, 'logs', 'launch-1.log'),
    })
    await saveState(dir, state)

    const service = createLaunchService({ dir })
    const list = await service.list()
    assert.equal(list[0].status, 'unknown')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
