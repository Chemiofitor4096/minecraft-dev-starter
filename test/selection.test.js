/**
 * 目标选择逻辑：单选、按模块分组、记住上次选择。纯函数，不碰 React 与 DOM。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { capsuleParts, capsuleSummary, capsuleText, groupByModule, selectedTarget, targetKey } from '../src/client/selection.js'

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
