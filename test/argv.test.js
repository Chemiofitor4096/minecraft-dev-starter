/**
 * Gradle 选项：结构化 → argv，且必须排在任务名之前。
 *
 * 这条顺序是真机踩出来的：`gradle build -Dhttp.proxyHost=...` 会把 `-Dhttp.proxyHost`
 * 当成任务选项，报 `Task '.proxyHost=127.0.0.1' not found`。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gradleOptionArgs, gradlewCommand } from '../src/lib/launch/argv.js'

test('Gradle 选项按 offline → refresh → -D 的顺序展开', () => {
  assert.deepEqual(gradleOptionArgs({}), [])
  assert.deepEqual(gradleOptionArgs({ offline: true }), ['--offline'])
  assert.deepEqual(
    gradleOptionArgs({ offline: true, refreshDependencies: true, properties: { 'https.proxyHost': '127.0.0.1' } }),
    ['--offline', '--refresh-dependencies', '-Dhttps.proxyHost=127.0.0.1'],
  )
})

test('Gradle 属性校验：非法键、换行值、保留键都拒绝', () => {
  assert.throws(() => gradleOptionArgs({ properties: { 'a b': '1' } }), /invalid Gradle property name/)
  assert.throws(() => gradleOptionArgs({ properties: { a: 'x\ny' } }), /invalid Gradle property value/)
  assert.throws(
    () => gradleOptionArgs({ properties: { 'org.gradle.java.home': 'C:/jdk' } }),
    /managed by the JDK selector/,
  )
})

test('POSIX：选项排在任务名之前', () => {
  const command = gradlewCommand({
    platform: 'linux',
    projectDir: '/p',
    taskPath: 'runClient',
    options: ['--offline', '-Dhttps.proxyHost=127.0.0.1'],
  })
  assert.deepEqual(command.argv, ['/p/gradlew', '--offline', '-Dhttps.proxyHost=127.0.0.1', 'runClient'])
  assert.equal(command.cwd, '/p')
})

test('JDK 属性在最前，用户选项其次，任务名最后', () => {
  const command = gradlewCommand({ platform: 'linux', projectDir: '/p', taskPath: 'runClient', javaHome: '/jdk', options: ['--offline'] })
  assert.deepEqual(command.argv, ['/p/gradlew', '-Dorg.gradle.java.home=/jdk', '--offline', 'runClient'])
})

test('Windows：整条命令包在 cmd /c 的一层引号里，任务名仍然最后', () => {
  const command = gradlewCommand({ platform: 'win32', projectDir: 'C:/p', taskPath: 'runClient', options: ['--offline'] })
  assert.equal(command.argv[0], 'cmd.exe')
  assert.equal(command.windowsVerbatimArguments, true)
  // 外层 `/s` 需要再包一层引号，所以末尾是两个引号
  assert.match(command.argv[4], /gradlew\.bat" "--offline" "runClient""$/)
})
