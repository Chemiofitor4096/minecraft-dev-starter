/**
 * dump schema 的护栏：文件必须能解析，且关键约束没被改坏。
 *
 * 真校验（用 JSON Schema 库）不在这里做——本包零依赖，validator 由 atlas 插件那边带；
 * 这份测试只保证"契约文件本身没写错"。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const schema = JSON.parse(readFileSync(join(root, 'doc/schema/dump-v1.schema.json'), 'utf8'))

test('dump schema 是 v1，且顶层必需字段齐全', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(schema.properties.schema.const, 1)
  assert.deepEqual(schema.required.sort(), [
    'env',
    'errors',
    'generatedAt',
    'provenance',
    'recipes',
    'registries',
    'schema',
    'tags',
    'truncated',
    'truncatedSections',
    'warnings',
  ])
})

test('env 必须交代 loader / mappings / adapter —— 读的人才知道类名口径', () => {
  assert.deepEqual(schema.properties.env.required.sort(), [
    'adapter',
    'loader',
    'mappings',
    'mcVersion',
    'side',
    'via',
  ])
  assert.deepEqual(schema.properties.env.properties.mappings.enum.sort(), ['mojmap', 'yarn'])
  assert.deepEqual(schema.properties.env.properties.via.enum.sort(), ['agent-attach', 'agent-boot'])
})

test('失败的 section 有明确语义：count 0 + errors 点名', () => {
  const registry = schema.properties.registries.additionalProperties
  assert.deepEqual(registry.required.sort(), ['count', 'entries'])
  const error = schema.properties.errors.items
  assert.deepEqual(error.required.sort(), ['message', 'section'])
  assert.deepEqual(error.properties.section.enum.sort(), ['env', 'recipes', 'registries', 'tags', 'write'])
})
