/**
 * 打包内容守卫：发布前确认"进包的东西"真的在里面。
 *
 * `lib/client.js` 被 .gitignore 忽略，只靠 package.json 的 `files` 进包。
 * 历史上这类包最容易出的错是"测试全绿、发出去的客户端是旧的/根本没有"，
 * 所以这里不猜，直接问 npm 自己：`npm pack --dry-run --json`。
 *
 * 用法：node scripts/check-pack.mjs
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 少了任何一条，装出来的插件就是残的。 */
const REQUIRED = [
  'lib/client.js',
  'src/index.js',
  'src/tools.js',
  'cordis.patch.yml',
  'README.md',
  'README.zh_CN.md',
  'CHANGELOG.md',
]

/** 这些不该出现在 npm 包里。 */
const FORBIDDEN = [/^test\//, /^\.github\//, /^node_modules\//, /^assets\//, /^doc\//, /^scripts\//]

let raw
try {
  // 用一整个命令串交给 shell：Windows 上 npm 是 .cmd，直接 spawn 会 EINVAL；
  // 而 `shell: true` 配 args 数组会触发 DEP0190（参数不再转义）。
  raw = execFileSync('npm pack --dry-run --json', {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
} catch (error) {
  console.error('[check-pack] npm pack 失败')
  process.exit(1)
}

/**
 * `npm pack --json` 的 stdout 会被 prepack（客户端构建）的日志污染，格式还随 npm
 * 版本变——这里不猜行号，把所有"行首的 ["位置都试一遍，从后往前，第一个能解析的就是结果。
 * @param {string} text
 */
function parsePackOutput(text) {
  const candidates = []
  const pattern = /(?:^|\n)\[/g
  let match
  while ((match = pattern.exec(text)) !== null) candidates.push(match.index + match[0].length - 1)
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(text.slice(candidates[index]))
    } catch {
      /* 试下一个候选位置 */
    }
  }
  throw new Error(`npm pack 输出无法解析：${JSON.stringify(text.slice(0, 200))}`)
}

const [pack] = parsePackOutput(raw)
const files = new Set(pack.files.map((file) => file.path.replace(/\\/g, '/')))
const missing = REQUIRED.filter((path) => !files.has(path))
const leaked = [...files].filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)))

if (missing.length > 0 || leaked.length > 0) {
  if (missing.length > 0) console.error(`[check-pack] 包内缺少：\n  ${missing.join('\n  ')}`)
  if (leaked.length > 0) console.error(`[check-pack] 包内不该有：\n  ${leaked.join('\n  ')}`)
  process.exit(1)
}

const kib = (pack.unpackedSize / 1024).toFixed(0)
console.log(`[check-pack] ok — ${files.size} 个文件，解包 ${kib} KiB（${pack.filename}）`)
