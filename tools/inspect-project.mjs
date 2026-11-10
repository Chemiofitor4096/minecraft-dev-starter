/**
 * 打印一个工程的完整画像——面板与工具看不到的那部分（证据、`.idea` 模型、目标来源）都在这里。
 *
 * 用法：node scripts/inspect-project.mjs <工程目录>
 *
 * 为什么需要它：`.idea` 是"辅助证据源"，只看界面很难回答"这条结论到底从哪来的"。
 * 这个脚本把 evidence、idea 块、每个目标的 source 一次摊开，也方便反证——
 * 把 `.idea` 改名再跑一次，对比前后差异就知道它到底补了什么。
 */
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const target = process.argv[2]
if (target === undefined) {
  console.error('用法：node scripts/inspect-project.mjs <工程目录>')
  process.exit(1)
}

const root = resolve(target)
const { detectProject } = await import(pathToFileURL(resolve('src/lib/detect.js')).href)
const { discoverJdks } = await import(pathToFileURL(resolve('src/lib/java.js')).href)
// 不传 jdks 时识别会当成"本机没有 JDK"，诊断脚本要看真实匹配结果
const profile = await detectProject(root, { jdks: await discoverJdks() })

const line = (label, value) => console.log(`${label.padEnd(10)} ${value}`)

line('工程', `${profile.name}  (${root})`)
line('loader', `${profile.loader}${profile.minecraftVersion === undefined ? '' : ` / MC ${profile.minecraftVersion}`}`)
line('身份', [profile.modId, profile.modName, profile.modVersion].filter((v) => v !== undefined && v !== '').join(' · ') || '—')
line('Gradle', `${profile.gradleVersion ?? '?'}${profile.wrapper === true ? ' (wrapper)' : ''}`)
if (profile.gradleRoot !== root) {
  line('Gradle 根', `${profile.gradleRoot}${profile.modulePath === undefined ? '' : `  (模块 ${profile.modulePath})`}`)
}
line('JDK', `需要 ${profile.java?.required ?? '?'}，选中 ${profile.java?.selected ?? '无'}（${profile.java?.source ?? '?'}）`)

console.log('\n模块')
for (const module of profile.modules ?? []) {
  const targets = (module.targets ?? []).map((t) => t.task ?? t.taskPath).join(' ') || '—'
  console.log(`  ${String(module.gradlePath ?? module.path).padEnd(20)} ${String(module.platform).padEnd(12)} ${targets}`)
}

console.log('\n目标')
if ((profile.runTargets ?? []).length === 0) console.log('  （没有可运行目标）')
for (const target of profile.runTargets ?? []) {
  console.log(`  ${target.taskPath.padEnd(40)} ${String(target.mode).padEnd(8)} ${target.source ?? 'unknown'}${target.guessed === true ? ' (未验证)' : ''}`)
}

console.log('\n.idea 工程模型')
if (profile.idea === undefined) {
  console.log('  （没有 .idea，或没有可读的工程模型——识别完全走构建脚本）')
} else {
  const idea = profile.idea
  line('  名称', idea.name)
  line('  目录', idea.dir)
  if (idea.gradleRoot !== undefined && idea.gradleRoot !== root) line('  Gradle 根', idea.gradleRoot)
  line('  构建 JVM', idea.gradleJvm ?? '—')
  line('  工程 JDK', `${idea.jdkName ?? '—'}${idea.languageLevel === undefined ? '' : `（languageLevel ${idea.languageLevel}）`}`)
  if (idea.minecraftVersion !== undefined) line('  MC 版本', idea.minecraftVersion)
  if (idea.libraries !== undefined) {
    const where = idea.libraries.storage === 'external' ? '外部存储' : '.idea/libraries'
    const local = idea.libraries.local > 0 ? `（${idea.libraries.local} 条本地 remap）` : ''
    line('  库表', `${where} · ${idea.libraries.count} 条${local}`)
    line('  库表位置', idea.libraries.file)
    if (idea.libraries.syncedAt !== undefined) line('  同步时间', stamp(idea.libraries.syncedAt))
  }
  line('  字节码', idea.bytecodeTarget ?? '—')
  line('  模块', `${idea.modules} 个（${idea.imls} 个 iml）`)
  line('  运行配置', `${idea.runConfigurations} 个`)
  line('  facet', (idea.platforms ?? []).join(' / ') || '—')
  if ((idea.linkedProjects ?? []).length > 0) line('  链接工程', idea.linkedProjects.join('、'))
  line('  读到', (idea.files ?? []).join('、'))
}

console.log('\n依赖对照')
const compared = profile.dependencies?.compared
if (compared === undefined) {
  console.log('  （没有可用的 IDE 同步库表，不做对照）')
} else if (compared.length === 0) {
  console.log('  （没有可对照的声明依赖）')
} else {
  for (const entry of compared) {
    const actual = entry.resolved === null ? '—' : entry.resolved
    console.log(
      `  ${String(entry.module).padEnd(52)} 声明 ${String(entry.declared).padEnd(20)} 实际 ${String(actual).padEnd(20)} ${entry.status}`,
    )
  }
}

console.log('\n证据')
for (const entry of profile.evidence ?? []) {
  console.log(`  ${String(entry.kind).padEnd(18)} ${entry.file}`)
}
if ((profile.warnings ?? []).length > 0) {
  console.log('\n警告')
  for (const warning of profile.warnings) console.log(`  ${warning}`)
}

/**
 * 本地时区的「年-月-日 时:分」，和面板上的同步时间一致。
 * @param {string} iso
 * @returns {string}
 */
function stamp(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
