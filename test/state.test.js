/**
 * 状态目录：按 profile 分目录，以及"拆分前的旧记录搬一次"。
 *
 * 这两件事出错的代价都是数据：把别人的 profile 记录搬过来，或者干脆看不见旧记录。
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { adoptLegacyState, baseStateDir, profileName, stateDir } from '../src/lib/state.js'

const DESKTOP_ARGV = [
  'C:\\Users\\u\\AppData\\Local\\Programs\\DSH NEXT\\DSH NEXT.exe',
  'C:\\Users\\u\\AppData\\Local\\Programs\\DSH NEXT\\resources\\app.asar\\lib\\host.js',
  'C:\\Users\\u\\AppData\\Local\\Programs\\DSH NEXT\\resources\\app.asar',
  'C:\\Users\\u\\.dsh\\profiles\\desktop',
  'C:\\Users\\u\\AppData\\Local\\Programs\\DSH NEXT\\resources\\runtime\\x64\\primary-runtime',
]

test('从宿主参数里认出 profile', () => {
  // 桌面版：argv 里是 profile 目录
  assert.equal(profileName(DESKTOP_ARGV, {}), 'desktop')
  // CLI：argv 里是 --profile <name>，而且优先于继承来的环境变量
  assert.equal(profileName(['node', 'bin.js', '--profile', 'm10smoke', '--no-open'], { DSH_PROFILE: 'desktop' }), 'm10smoke')
  assert.equal(profileName(['node', 'bin.js', '--profile=tui'], {}), 'tui')
  assert.equal(profileName(['node', 'x.js', '/home/u/.dsh/profiles/tui/'], {}), 'tui')
  // 两条都没有时才看环境变量
  assert.equal(profileName([], { DSH_PROFILE: 'web' }), 'web')
  assert.equal(profileName([], {}), undefined)
})

test('状态目录按 profile 分段，认不出来时退回根目录', () => {
  const env = { DSH_HOME: 'C:\\Users\\u\\.dsh' }
  assert.equal(stateDir({ env, argv: DESKTOP_ARGV }), join('C:\\Users\\u\\.dsh', 'mc-dev-starter', 'profiles', 'desktop'))
  assert.equal(stateDir({ env, argv: ['node', 'x.js'] }), baseStateDir(env))
  assert.equal(baseStateDir(env), join('C:\\Users\\u\\.dsh', 'mc-dev-starter'))
})

test('旧记录只搬一次，且不覆盖已有 profile 状态', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mcdev-state-'))
  const legacy = join(root, 'legacy')
  const scoped = join(root, 'profiles', 'desktop')
  try {
    await mkdir(join(legacy, 'logs'), { recursive: true })
    await writeFile(join(legacy, 'state.json'), '{"launches":[]}', 'utf8')
    await writeFile(join(legacy, 'logs', 'launch-1.log'), 'hello', 'utf8')

    assert.equal(await adoptLegacyState(scoped, legacy), true)
    assert.equal(await readFile(join(scoped, 'logs', 'launch-1.log'), 'utf8'), 'hello')
    assert.deepEqual(await readdir(legacy), [])

    // 第二次：新目录已经有 state.json，不再动
    await writeFile(join(scoped, 'state.json'), '{"launches":[1]}', 'utf8')
    await writeFile(join(legacy, 'state.json'), '{"launches":[]}', 'utf8')
    assert.equal(await adoptLegacyState(scoped, legacy), false)
    assert.match(await readFile(join(scoped, 'state.json'), 'utf8'), /\[1\]/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('同目录（没有 profile）时不做搬迁', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mcdev-state-'))
  try {
    await writeFile(join(root, 'state.json'), '{}', 'utf8')
    assert.equal(await adoptLegacyState(root, root), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
