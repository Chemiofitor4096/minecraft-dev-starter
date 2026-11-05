/**
 * 启动链路的测试：命令行构造、任务路径白名单、真实子进程的启停与日志。
 *
 * 进程部分用 node 自己当"假 gradlew"：打印就绪标记后挂住，
 * 这样能真实验证 spawn/日志/停止/状态机，而不用等 Gradle 构建。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gradlewCommand, isAlive, TASK_PATH_PATTERN } from '../src/lib/argv.js'
import { createLaunchService, decodeLine, diagnose, splitBufferLines } from '../src/lib/launches.js'

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

test('任务路径白名单接受 Gradle 的冒号分层，拒绝文件路径式斜杠', () => {
  // 聚合工程的子模块任务长这样：:modules:CTNH-Core:runClient
  assert.equal(TASK_PATH_PATTERN.test(':modules:CTNH-Core:runClient'), true)
  assert.equal(TASK_PATH_PATTERN.test(':CTNH-Core:runClient'), true)
  assert.equal(TASK_PATH_PATTERN.test('runClient'), true)
  // 斜杠是文件路径写法，Gradle 不认
  assert.equal(TASK_PATH_PATTERN.test(':modules/CTNH-Core:runClient'), false)
})

test('POSIX 下直接调用 wrapper', () => {
  const command = gradlewCommand({ platform: 'linux', projectDir: '/home/u/demo', taskPath: 'runClient' })
  assert.deepEqual(command.argv, ['/home/u/demo/gradlew', 'runClient'])
  assert.equal(command.windowsVerbatimArguments, false)
})

test('指定 JDK 时把它放在任务名前面（含空格的路径也带引号）', () => {
  const win = gradlewCommand({
    platform: 'win32',
    projectDir: 'C:\\Projects\\demo',
    taskPath: 'runClient',
    javaHome: 'C:\\Program Files\\Java\\jdk-21',
  })
  assert.match(win.argv[4], /"-Dorg\.gradle\.java\.home=C:\\Program Files\\Java\\jdk-21"/)
  // 整条命令外面还有一层给 cmd /s 剥的引号，所以结尾是 `"runClient""`
  assert.match(win.argv[4], /"runClient""$/)

  const posix = gradlewCommand({ platform: 'linux', projectDir: '/home/u/demo', taskPath: 'runClient', javaHome: '/opt/jdk-21' })
  assert.deepEqual(posix.argv, ['/home/u/demo/gradlew', '-Dorg.gradle.java.home=/opt/jdk-21', 'runClient'])
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

test('崩溃归因：依赖 / JDK / 端口 / Mixin 各给一句话', () => {
  assert.match(diagnose(['> Could not resolve net.neoforged:neoforge:21.1.251']).hint, /依赖/)
  assert.match(diagnose(['java.lang.UnsupportedClassVersionError: Unsupported class file major version 65']).hint, /JDK/)
  assert.match(diagnose(['java.net.BindException: Address already in use: bind']).hint, /端口/)
  assert.match(diagnose(['Mixin apply failed mod.mixins.json:DemoMixin -> demo.Mixin']).hint, /Mixin/)
  assert.equal(diagnose(['all good', 'BUILD SUCCESSFUL']), undefined)
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
    // 常驻目标没有"过没过"这回事，结论字段保持空
    assert.equal(exited.mode, 'daemon')
    assert.equal(exited.verdict, null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('会跑完的目标：生下来就是运行中，结束即结论', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-oneshot-'))
  const script = [
    "setTimeout(() => { process.stdout.write('> Task :runData\\n'); process.stdout.write('BUILD SUCCESSFUL in 3s\\n') }, 150)",
  ].join(';')
  const service = createLaunchService({
    dir,
    commandFor: () => ({ argv: [process.execPath, '-e', script], cwd: process.cwd(), windowsVerbatimArguments: false }),
  })

  try {
    const record = await service.start({ root: 'C:\\fake\\demo', taskPath: 'runData', label: 'Data', kind: 'data' })
    // 没有就绪这一步：进程活着就是在跑
    assert.equal(record.mode, 'oneshot')
    assert.equal(record.status, 'running')

    const exited = await waitFor(async () => {
      const list = await service.list()
      return list.find((entry) => entry.id === record.id && entry.status === 'exited')
    })
    assert.equal(exited.exitCode, 0)
    assert.equal(exited.outcome, 'normal')
    assert.equal(exited.verdict, 'passed')
    assert.match(exited.summary, /BUILD SUCCESSFUL/)
    assert.equal(exited.readyTimedOut, false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('会跑完的目标：测试挂了但退了 0，也要判失败', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-gametest-'))
  const script = [
    "setTimeout(() => { process.stdout.write('Running test demo:oak_planks\\n'); process.stdout.write('2 required tests failed :(\\n') }, 150)",
  ].join(';')
  const service = createLaunchService({
    dir,
    commandFor: () => ({ argv: [process.execPath, '-e', script], cwd: process.cwd(), windowsVerbatimArguments: false }),
  })

  try {
    const record = await service.start({ root: 'C:\\fake\\game', taskPath: 'runGameTestServer', label: 'GameTestServer', kind: 'gameTestServer' })
    const exited = await waitFor(async () => {
      const list = await service.list()
      return list.find((entry) => entry.id === record.id && entry.status === 'exited')
    })
    assert.equal(exited.exitCode, 0)
    assert.equal(exited.verdict, 'failed')
    assert.match(exited.summary, /2 required tests failed/)
    assert.equal(exited.failures.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('指定 JDK 时透传到 spawn：命令行参数 + JAVA_HOME', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-jdk-'))
  /** @type {{ options?: any, env?: any }} */
  const captured = {}
  const service = createLaunchService({
    dir,
    commandFor: (options) => {
      captured.options = options
      return { argv: [process.execPath, '-e', 'setTimeout(() => {}, 400)'], cwd: process.cwd(), windowsVerbatimArguments: false }
    },
    spawnImpl: (command, args, spawnOptions) => {
      captured.env = spawnOptions.env
      return spawn(command, args, spawnOptions)
    },
  })
  try {
    const record = await service.start({
      root: 'C:\\fake\\demo',
      taskPath: 'runData',
      label: 'Data',
      kind: 'data',
      javaHome: 'C:\\jdk\\jdk-21',
    })
    assert.equal(captured.options.javaHome, 'C:\\jdk\\jdk-21')
    assert.equal(captured.env.JAVA_HOME, 'C:\\jdk\\jdk-21')
    assert.equal(record.javaHome, 'C:\\jdk\\jdk-21')
    await service.stop(record.id)
    // 等进程真的退出、状态落盘后再删目录，否则会撞上 ENOTEMPTY
    await waitFor(async () => {
      const entry = (await service.list()).find((item) => item.id === record.id)
      return entry?.status === 'exited'
    })
    await sleep(150)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('宿主重启后对账：进程没了就标 unknown，不伪造结局', async () => {  const dir = await mkdtemp(join(tmpdir(), 'mcdev-reconcile-'))
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
