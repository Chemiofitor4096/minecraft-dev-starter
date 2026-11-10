/**
 * TOML 子集解析：mods.toml 里全是 `[[array.of.tables]]`、多行字符串和点号键。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parseModsToml, parseYamlSubset } from '../src/lib/detect/metadata.js'
import { parseToml } from '../src/lib/util/toml.js'

const here = dirname(fileURLToPath(import.meta.url))

test('parseToml 处理数组表与点号键', () => {
  const root = parseToml(`
    modLoader="javafml"
    [[mods]]
    modId="demo"
    [[dependencies.demo]]
    modId="minecraft"
    versionRange="[1.21.1,1.22)"
  `)
  assert.equal(root.modLoader, 'javafml')
  assert.equal(Array.isArray(root.mods), true)
  assert.equal(root.mods[0].modId, 'demo')
  assert.equal(root.dependencies.demo[0].versionRange, '[1.21.1,1.22)')
})

test('parseToml 支持三引号多行字符串', () => {
  const root = parseToml(`description='''\n第一行\n第二行\n'''\nversion="1.0"`)
  assert.match(String(root.description), /第二行/)
  assert.equal(root.version, '1.0')
})

test('parseToml 不把字符串里的 # 当注释', () => {
  const root = parseToml(`license="MIT # not a comment"\n`)
  assert.equal(root.license, 'MIT # not a comment')
})

test('parseModsToml 拉平依赖', async () => {
  const text = await readFile(
    join(here, 'fixtures/neoforge/src/main/templates/META-INF/neoforge.mods.toml'),
    'utf8',
  )
  const data = parseModsToml(text)
  assert.equal(data.modLoader, 'javafml')
  assert.equal(data.modId, '${mod_id}')
  assert.equal(data.dependencies.length, 1)
  assert.equal(data.dependencies[0].modId, 'neoforge')
})

test('parseYamlSubset 只读顶层键', () => {
  const data = parseYamlSubset(`name: DemoPlugin\nversion: '1.2.3'\ncommands:\n  demo:\n    usage: /demo\napi-version: '1.20'\n`)
  assert.equal(data.name, 'DemoPlugin')
  assert.equal(data.version, '1.2.3')
  assert.equal(data['api-version'], '1.20')
})
