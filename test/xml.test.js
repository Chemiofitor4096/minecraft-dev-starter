/**
 * 极简 XML 解析器的回归：它只服务 `.idea`，但错一处的表现是"某个字段静默消失"，
 * 所以边界（注释 / CDATA / 自闭合 / 属性引号 / 实体）逐个钉住。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attrOf, childOf, childrenOf, componentOf, findFirst, findAll, optionValue, parseXml, rootOf, textOf } from '../src/lib/xml.js'

test('基本结构：属性、嵌套、自闭合', () => {
  const doc = parseXml(`<?xml version="1.0"?>
    <project version="4">
      <component name="A">
        <option name="x" value="1" />
        <option name='y' value='2'/>
      </component>
    </project>`)
  const project = rootOf(doc)
  assert.equal(project?.name, 'project')
  assert.equal(attrOf(project, 'version'), '4')
  const component = componentOf(doc, 'A')
  assert.equal(component?.name, 'component')
  assert.deepEqual(childrenOf(component, 'option').map((node) => attrOf(node, 'name')), ['x', 'y'])
  assert.equal(optionValue(component, 'y'), '2')
})

test('注释、DOCTYPE 与 CDATA 不参与解析', () => {
  const doc = parseXml(`<!DOCTYPE project>
    <!-- <component name="fake" /> -->
    <project>
      <![CDATA[<option name="cdata" />]]>
      <component name="real" />
    </project>`)
  assert.deepEqual(findAll(doc, 'component').map((node) => node.attrs.name), ['real'])
  assert.equal(textOf(rootOf(doc)).includes('<option'), true)
})

test('实体解码：命名与数字，认不出的原样保留', () => {
  const doc = parseXml('<project name="a &amp; b &lt;c&gt; &#65; &#x42; &bogus;" />')
  assert.equal(attrOf(rootOf(doc), 'name'), 'a & b <c> A B &bogus;')
})

test('属性里的 > 不提前结束标签', () => {
  const doc = parseXml('<project a="x>y" b="2" />')
  assert.equal(attrOf(rootOf(doc), 'a'), 'x>y')
  assert.equal(attrOf(rootOf(doc), 'b'), '2')
})

test('findFirst 跳过根节点自身，只找后代', () => {
  const doc = parseXml('<root><item id="1"/><item id="2"/></root>')
  const hit = findFirst(rootOf(doc), (node) => node.name === 'item')
  assert.equal(attrOf(hit, 'id'), '1')
})

test('BOM 与多余空白不影响解析', () => {
  const doc = parseXml('\uFEFF\n  <project name="x" />\n')
  assert.equal(attrOf(rootOf(doc), 'name'), 'x')
})

test('tag 未闭合时不死循环，返回已解析的部分', () => {
  const doc = parseXml('<project><component name="a">')
  const nodes = findAll(doc, 'component')
  assert.equal(nodes.length, 1)
  assert.equal(attrOf(nodes[0], 'name'), 'a')
  assert.equal(childOf(nodes[0], 'nope'), undefined)
})
