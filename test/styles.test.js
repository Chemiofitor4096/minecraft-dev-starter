/**
 * 样式约束：客户端样式必须只用 DSH 的设计 token。
 *
 * 这条测试是"跟随系统主题"的护栏——一旦有人写死 #3fb950 之类的色值，
 * 亮色主题和第三方皮肤下就会冒出一块不属于系统的东西。
 * 同类做法见 dsh-better-sidebar 的 theme.spec.ts。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { CSS } from '../src/client/lib/styles.js'

const here = dirname(fileURLToPath(import.meta.url))

test('样式里没有写死的颜色字面量', () => {
  assert.doesNotMatch(CSS, /#[0-9a-fA-F]{3,8}\b/, '出现了十六进制色值')
  assert.doesNotMatch(CSS, /\b(rgba?|hsla?)\(/, '出现了 rgb()/hsl() 色值')
})

test('颜色相关声明必须引用 --dsw-* token', () => {
  const declarations = CSS.matchAll(/(?:^|[{;])\s*([a-z-]+)\s*:\s*([^;{}]+);/g)
  const colorProps = /^(color|background|background-color|border|border-color|border-top|border-right|border-bottom|border-left|box-shadow|outline|fill|stroke)$/
  const allowed = /^(transparent|none|inherit|currentColor|0)$/
  for (const match of declarations) {
    const property = match[1]
    const value = match[2].trim()
    if (!colorProps.test(property)) continue
    if (allowed.test(value)) continue
    assert.ok(
      value.includes('var(--dsw-'),
      `${property}: ${value} 没有引用 --dsw-* token`,
    )
  }
})

test('字号走 --dsw-font-* token', () => {
  const fontShorthands = [...CSS.matchAll(/(?:^|[{;])\s*font\s*:\s*([^;{}]+);/g)].map((match) => match[1].trim())
  assert.ok(fontShorthands.length > 0, '应该至少有一处 font 声明')
  for (const value of fontShorthands) {
    assert.match(value, /var\(--dsw-font-/, `font: ${value} 没有使用 --dsw-font-* token`)
  }
})

test('组件里不写死颜色（只允许布局属性）', async () => {
  const files = ['views/Capsule.js', 'views/Flyout.js', 'views/DetailTab.js']
  for (const file of files) {
    const source = await readFile(join(here, '..', 'src', 'client', file), 'utf8')
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, `${file} 里出现了十六进制色值`)
    assert.doesNotMatch(source, /\b(rgba?|hsla?)\(/, `${file} 里出现了 rgb()/hsl() 色值`)
  }
})
