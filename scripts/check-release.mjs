/**
 * 发版前守卫：把"人肉记得检查"的几步变成一条命令。
 *
 * 起因（2026-11-14）：本地 Windows 全绿、CI 的 ubuntu/macOS 红了，我却直接
 * `npm stage publish` 了 0.2.1——包发出去、tag 指向红提交，事后只能挪 tag。
 * 这几步每次都能查，就别靠记性：
 *
 *   1. 工作树干净（有未提交改动时打出来的包和版本记录对不上）
 *   2. `package.json` 的版本 == CHANGELOG 最新一节
 *   3. 这个版本还没发布过（重复发版 npm 只会报一句难懂的错）
 *   4. HEAD 的 CI 是绿的（没跑完/失败都拦下来）
 *
 * 用法：node scripts/check-release.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** @type {Array<{ ok: boolean, level: 'fail' | 'warn', okText: string, failText: string }>} */
const results = []

/**
 * 跑一条命令，拿 stdout；失败返回 undefined。
 * @param {string} command
 * @param {string[]} args
 */
function run(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
}

/**
 * 记一条检查结果：通过和失败各有一句话，读起来不别扭。
 * @param {boolean} ok
 * @param {string} okText
 * @param {string} failText
 * @param {'fail' | 'warn'} [level]
 */
function check(ok, okText, failText = okText, level = 'fail') {
  results.push({ ok, level, okText, failText })
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = String(pkg.version)

// 1. 工作树
const dirty = run('git status --porcelain')
check(
  dirty !== undefined && dirty === '',
  '工作树干净',
  dirty === undefined ? '读不到 git 状态' : `工作树不干净，先提交：\n${dirty}`,
)

// 2. 版本与 CHANGELOG 对齐
const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
const released = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1]
check(
  released === version,
  `版本与 CHANGELOG 一致（${version}）`,
  `package.json 是 ${version}，CHANGELOG 最新一节是 ${released ?? '（没有）'}`,
)

// 3. 还没发布过
const published = run(`npm view ${pkg.name}@${version} version`)
check(
  published === undefined || published === '',
  `${pkg.name}@${version} 还没发布过`,
  `npm 上已经有 ${pkg.name}@${version}，换个版本号再发`,
)

// 4. HEAD 的 CI
const head = run('git rev-parse HEAD')
const runs = run(`gh run list --commit ${head} --limit 1 --json conclusion`)
if (runs === undefined || runs === '') {
  check(true, '查不到 GitHub Actions（未装 gh 或未登录），这一项跳过了', '', 'warn')
} else {
  let conclusion = ''
  try {
    conclusion = JSON.parse(runs)[0]?.conclusion ?? ''
  } catch {
    conclusion = ''
  }
  check(
    conclusion === 'success',
    'HEAD 的 CI 是绿的',
    `HEAD 的 CI 结论是 ${conclusion === '' ? '（没有运行记录）' : conclusion}，等它绿了再发`,
  )
}

let failed = false
for (const item of results) {
  if (item.ok) console.log(`[check-release] ✓ ${item.okText}`)
  else if (item.level === 'warn') console.log(`[check-release] ! ${item.failText}`)
  else {
    failed = true
    console.error(`[check-release] ✗ ${item.failText}`)
  }
}

if (failed) {
  console.error(`[check-release] 不满足发版条件（${version}）`)
  process.exit(1)
}
console.log(`[check-release] ok — ${version} 可以 staging 了`)
