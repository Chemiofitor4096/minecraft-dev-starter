/**
 * 真实工程回归工具：扫一个目录，打印每个工程的判定结果。
 * 不是测试（依赖本机目录），而是"改完规则后一眼看有没有打回原形"。
 *
 * 用法：node scripts/scan-catalog.mjs [目录] [深度]
 */
import { relative } from 'node:path'
import { scanWorkspace } from '../src/lib/detect/scanner.js'

const root = process.argv[2] ?? process.cwd()
const depth = Number(process.argv[3] ?? 2)
const started = Date.now()
const result = await scanWorkspace(root, { depth })

const pad = (value, width) => String(value ?? '').padEnd(width).slice(0, width)
const label = (project) => relative(result.root, String(project.root)) || '.'
console.log(`root: ${result.root}  depth: ${depth}  projects: ${result.projects.length}  dirs: ${result.scannedDirs}  ${Date.now() - started}ms\n`)
console.log(
  pad('project', 30),
  pad('kind', 13),
  pad('loader', 12),
  pad('mc', 9),
  pad('loaderVer', 12),
  pad('java', 5),
  pad('targets', 8),
  pad('guess', 6),
  'conf',
)
console.log('-'.repeat(120))
for (const project of result.projects) {
  const targets = /** @type {Array<any>} */ (project.runTargets ?? [])
  const guessed = targets.filter((target) => target.guessed === true).length
  console.log(
    pad(label(project), 30),
    pad(project.kind, 13),
    pad(project.loader, 12),
    pad(project.minecraftVersion ?? '?', 9),
    pad(project.loaderVersion ?? '?', 12),
    pad(project.java?.required ?? '?', 5),
    pad(targets.length, 8),
    pad(guessed, 6),
    project.confidence,
  )
  for (const warning of project.warnings ?? []) console.log(`    ! ${warning}`)
  for (const conflict of project.conflicts ?? []) console.log(`    × ${conflict}`)
}
if (result.truncated) console.log('\n(结果被预算截断)')
