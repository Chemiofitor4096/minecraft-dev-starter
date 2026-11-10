/**
 * 目标选择逻辑：单选、按模块分组、记住上次选择。纯函数，不碰 React 与 DOM。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { capsuleParts, capsuleSummary, capsuleText, groupByModule, hasActiveLaunch, hasRunnableProject, launchStatusText, pickLogTarget, selectedTarget, targetKey } from '../src/client/lib/selection.js'

const project = {
  root: 'C:\\Projects\\rationality',
  runTargets: [
    { module: '.', taskPath: 'runClient', label: 'Client', kind: 'client' },
    { module: '.', taskPath: 'runServer', label: 'Server', kind: 'server' },
    { module: '.', taskPath: 'runData', label: 'Data', kind: 'data' },
  ],
}

const architectury = {
  root: 'C:\\Projects\\Custom-Machinery-1.20.1',
  runTargets: [
    { module: 'fabric', taskPath: ':fabric:runClient', label: 'Client', kind: 'client', guessed: true },
    { module: 'forge', taskPath: ':forge:runClient', label: 'Client', kind: 'client', guessed: true },
  ],
}

test('targetKey 用模块 + 任务路径，跨模块不撞', () => {
  assert.equal(targetKey(project.runTargets[0]), '.:runClient')
  assert.equal(targetKey(architectury.runTargets[1]), 'forge::forge:runClient')
})

test('groupByModule 保持顺序并按模块分组', () => {
  const groups = groupByModule(architectury.runTargets)
  assert.deepEqual(groups.map((group) => group.module), ['fabric', 'forge'])
  assert.equal(groups[0].targets.length, 1)
})

test('没有记忆时选第一个目标', () => {
  assert.equal(selectedTarget(project, {}), project.runTargets[0])
})

test('记住的目标还在就用它', () => {
  const selection = { [project.root]: targetKey(project.runTargets[1]) }
  assert.equal(selectedTarget(project, selection).taskPath, 'runServer')
})

test('记住的目标没了就退回第一个', () => {
  const selection = { [project.root]: '.:runGameTestServer' }
  assert.equal(selectedTarget(project, selection).taskPath, 'runClient')
})

test('没有目标时返回 undefined', () => {
  assert.equal(selectedTarget({ root: 'x', runTargets: [] }, {}), undefined)
  assert.equal(selectedTarget(undefined, {}), undefined)
})

test('胶囊文案：单模块只有目标名，多模块带模块前缀', () => {
  assert.equal(capsuleText(project, project.runTargets[0]), 'Client')
  assert.equal(capsuleText(architectury, architectury.runTargets[0]), 'fabric · Client')
  assert.equal(capsuleText(undefined, undefined), '未检测到 MC 工程')
  assert.equal(capsuleText({ root: 'x', runTargets: [] }, undefined), '无可运行目标')
})

test('多工程工作区：胶囊带上工程名，避免只显示 Client 不知道是哪个', () => {
  const named = { ...project, modName: 'Example Mod' }
  assert.equal(capsuleSummary(named, named.runTargets[0], { multipleProjects: true }), 'Example Mod · Client')
  assert.equal(capsuleSummary(named, named.runTargets[0]), 'Client')
  assert.equal(capsuleSummary(named, named.runTargets[0], { multipleProjects: false }), 'Client')
  assert.equal(capsuleSummary(undefined, undefined, { multipleProjects: true }), '未检测到 MC 工程')
})

test('胶囊分段：窄的时候省略工程名，目标名保持完整', () => {
  const named = { ...project, modName: 'Example Neo Mod' }
  const dataTarget = named.runTargets[2]
  const parts = capsuleParts(named, dataTarget, { multipleProjects: true })
  assert.equal(parts.project, 'Example Neo Mod')
  assert.equal(parts.target, 'Data')

  const single = capsuleParts(named, dataTarget, { multipleProjects: false })
  assert.equal(single.project, undefined)
  assert.equal(single.target, 'Data')

  assert.deepEqual(capsuleParts(undefined, undefined, { multipleProjects: true }), {
    project: undefined,
    target: '未检测到 MC 工程',
  })
})

// ── 日志标签的跟随 ────────────────────────────────────────────────────

const launches = [
  { id: 'launch-3', status: 'exited', outcome: 'normal' },
  { id: 'launch-2', status: 'running', outcome: null },
  { id: 'launch-1', status: 'exited', outcome: 'killed' },
]

test('有实例在跑时，日志标签跟它（哪怕用户之前选了旧的）', () => {
  assert.equal(pickLogTarget(launches, 'launch-1', true), 'launch-2')
  assert.equal(pickLogTarget(launches, 'launch-3', false), 'launch-2')
})

test('没有实例在跑：手动选过的保持不变', () => {
  const idle = launches.filter((entry) => entry.status !== 'running')
  assert.equal(pickLogTarget(idle, 'launch-1', true), 'launch-1')
})

test('没有实例在跑且没手动选：保持当前，当前没了就跟最新', () => {
  const idle = launches.filter((entry) => entry.status !== 'running')
  assert.equal(pickLogTarget(idle, 'launch-3', false), 'launch-3')
  assert.equal(pickLogTarget(idle, 'launch-9', false), 'launch-3')
  assert.equal(pickLogTarget([], undefined, false), undefined)
})

test('实例状态的中文标签', () => {
  assert.equal(launchStatusText({ status: 'starting' }), '启动中')
  assert.equal(launchStatusText({ status: 'running' }), '运行中')
  assert.equal(launchStatusText({ status: 'unknown' }), '状态未知')
  assert.equal(launchStatusText({ status: 'exited', outcome: 'killed' }), '已停止')
  assert.equal(launchStatusText({ status: 'exited', outcome: 'normal' }), '已退出')
  assert.equal(launchStatusText({ status: 'exited', outcome: 'crashed', exitCode: 1 }), '已退出(1)')
  // 会跑完的目标说的是"过没过"，不是"退没退"
  assert.equal(launchStatusText({ status: 'running', mode: 'oneshot' }), '执行中')
  assert.equal(launchStatusText({ status: 'exited', verdict: 'passed' }), '通过')
  assert.equal(launchStatusText({ status: 'exited', verdict: 'failed', exitCode: 1 }), '失败')
  assert.equal(launchStatusText({ status: 'exited', verdict: 'aborted', outcome: 'killed' }), '已停止')
})

test('有没有能跑的工程：看 runTargets，不看 loader', () => {
  assert.equal(hasRunnableProject(undefined), false)
  assert.equal(hasRunnableProject([]), false)
  // 库工程识别得出 loader，但没有可运行目标：胶囊不该出现
  assert.equal(hasRunnableProject([{ loader: 'fabric', runTargets: [] }]), false)
  assert.equal(hasRunnableProject([{ loader: 'unknown', runTargets: [] }, project]), true)
})

test('有实例在跑时胶囊必须留着（否则没有停止按钮）', () => {
  assert.equal(hasActiveLaunch(undefined), false)
  assert.equal(hasActiveLaunch([{ status: 'exited' }]), false)
  assert.equal(hasActiveLaunch([{ status: 'starting' }]), true)
  assert.equal(hasActiveLaunch([{ status: 'running' }]), true)
})
