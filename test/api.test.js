/**
 * `/mcdev/api` 的集成测试：真 api 表 + 真识别引擎 + 假 JDK 探测。
 *
 * 覆盖 JDK 选择这条链路（list → add → set → detail），以及 `runs` 假目标不再出现在扫描结果里。
 * 不启动 HTTP：路由层只是把请求交给这张方法表。
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createApi } from '../src/lib/api.js'
import { createLaunchService } from '../src/lib/launches.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fabricRoot = join(fixtures, 'fabric')

/**
 * 假 JDK 探测：只认调用方传入的目录列表。
 * @param {string[]} extraDirs
 */
async function fakeListJdks(extraDirs) {
  return extraDirs.map((home) => ({ home, version: '21.0.7', major: 21, source: 'release' }))
}

/**
 * @param {string} dir 状态目录
 * @returns {ReturnType<typeof createApi>}
 */
function build(dir) {
  return createApi({
    resolveRoot: async () => fabricRoot,
    version: '0.0.0-test',
    launchService: createLaunchService({ dir }),
    // JDK 偏好默认在机器级目录；测试必须指到临时目录，别碰真实的 ~/.dsh
    jdkDir: dir,
    listJdks: fakeListJdks,
  })
}

/**
 * 造一个像 JDK 的目录（`release` 文件是唯一判据）。
 * @param {string} root
 * @param {string} version
 */
async function makeJdk(root, version) {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'release'), `JAVA_VERSION="${version}"\n`, 'utf8')
  return root
}

test('java.list 把手动添加的 JDK 并进列表', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-api-'))
  try {
    const api = build(dir)
    const before = await api['java.list']({})
    assert.deepEqual(before.jdks, [])

    const home = await makeJdk(join(dir, 'jdk-21'), '21.0.7')
    const added = await api['projects.jdk.add']({ path: home })
    assert.equal(added.jdk.major, 21)

    const after = await api['java.list']({})
    assert.equal(after.jdks.length, 1)
    assert.equal(after.jdks[0].home, home)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('添加不是 JDK 的目录会被拒', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-api-'))
  try {
    const api = build(dir)
    await assert.rejects(() => api['projects.jdk.add']({ path: join(dir, 'nope') }), /不像 JDK/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('给工程指定 JDK：detail 标 override，清空后回到 auto', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-api-'))
  try {
    const api = build(dir)
    const home = await makeJdk(join(dir, 'jdk-21'), '21.0.7')
    await api['projects.jdk.add']({ path: home })

    const set = await api['projects.jdk.set']({ root: fabricRoot, home })
    assert.equal(set.override, home)

    const detail = await api['projects.detail']({ root: fabricRoot })
    assert.equal(detail.java.source, 'override')
    assert.equal(detail.java.selected, home)
    assert.equal(detail.java.exact, true)

    const cleared = await api['projects.jdk.set']({ root: fabricRoot, home: '' })
    assert.equal(cleared.override, null)
    const after = await api['projects.detail']({ root: fabricRoot })
    assert.notEqual(after.java.source, 'override')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('扫描结果里不再出现 runs 容器 API 的假目标', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcdev-api-'))
  try {
    const api = build(dir)
    const scan = await api['projects.scan']({ root: fixtures, refresh: true })
    const fabric = /** @type {Record<string, any>} */ (scan.projects.find((project) => String(project.root).endsWith('fabric')))
    assert.ok(fabric !== undefined)
    const tasks = fabric.runTargets.map((target) => target.taskPath)
    assert.deepEqual(tasks, ['runClient', 'runServer'])
    assert.ok(!tasks.some((task) => task.includes('configureEach')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
