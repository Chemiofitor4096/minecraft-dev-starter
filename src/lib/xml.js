/**
 * 极简 XML 解析：读 IntelliJ IDEA 的配置文件用。
 * @module minecraft-dev-starter/lib/xml
 */

/**
 * @typedef {object} XmlNode
 * @property {string} name
 * @property {Record<string, string>} attrs 已解码的属性
 * @property {XmlNode[]} children
 * @property {string} text 直接子文本
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/**
 * 解码 XML 实体，认不出的原样保留。
 * @param {string} value
 * @returns {string}
 */
export function decodeXmlEntities(value) {
  return value.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      if (Number.isNaN(code) || code < 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return ENTITIES[body] ?? match
  })
}

/**
 * 解析 XML，返回 `#document` 根节点（`children[0]` 是文档元素）。
 * 支持注释、`<?xml?>`、`<!DOCTYPE>`、CDATA、自闭合标签、单双引号属性；不解析外部实体。
 * @param {string} source
 * @returns {XmlNode}
 */
export function parseXml(source) {
  const text = String(source).replace(/^\uFEFF/, '')
  /** @type {XmlNode} */
  const document = { name: '#document', attrs: {}, children: [], text: '' }
  /** @type {XmlNode[]} */
  const stack = [document]
  let index = 0

  /** 栈顶节点，空栈时退回根。 */
  const current = () => stack[stack.length - 1] ?? document

  while (index < text.length) {
    const open = text.indexOf('<', index)
    if (open < 0) {
      appendText(current(), text.slice(index), false)
      break
    }
    if (open > index) appendText(current(), text.slice(index, open), false)

    if (text.startsWith('<!--', open)) {
      index = skipTo(text, open + 4, '-->')
      continue
    }
    if (text.startsWith('<![CDATA[', open)) {
      const end = text.indexOf(']]>', open + 9)
      appendText(current(), text.slice(open + 9, end < 0 ? text.length : end), true)
      index = end < 0 ? text.length : end + 3
      continue
    }
    if (text.startsWith('<?', open)) {
      index = skipTo(text, open + 2, '?>')
      continue
    }
    if (text.startsWith('<!', open)) {
      const end = findTagEnd(text, open + 2)
      index = end < 0 ? text.length : end + 1
      continue
    }

    const end = findTagEnd(text, open + 1)
    if (end < 0) break
    const raw = text.slice(open + 1, end)
    index = end + 1

    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim()
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].name === name) {
          stack.length = depth
          break
        }
      }
      continue
    }

    const selfClosing = raw.endsWith('/')
    const body = selfClosing ? raw.slice(0, -1) : raw
    const nameMatch = /^[^\s/>]+/.exec(body)
    if (nameMatch === null) continue
    /** @type {XmlNode} */
    const node = { name: nameMatch[0], attrs: parseAttributes(body.slice(nameMatch[0].length)), children: [], text: '' }
    current().children.push(node)
    if (!selfClosing) stack.push(node)
  }

  return document
}

/**
 * 找标签结束的 `>`（属性值里的不算）。
 * @param {string} text
 * @param {number} start
 * @returns {number} 找不到返回 -1
 */
function findTagEnd(text, start) {
  let quote
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== undefined) {
      if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') return i
  }
  return -1
}

/**
 * @param {string} text
 * @param {number} start
 * @param {string} marker
 * @returns {number} marker 之后的位置
 */
function skipTo(text, start, marker) {
  const end = text.indexOf(marker, start)
  return end < 0 ? text.length : end + marker.length
}

/**
 * @param {XmlNode} node
 * @param {string} value
 * @param {boolean} raw CDATA 内容不解码
 */
function appendText(node, value, raw) {
  if (value === '') return
  node.text += raw ? value : decodeXmlEntities(value)
}

/**
 * 解析属性串（无值属性忽略）。
 * @param {string} raw
 * @returns {Record<string, string>}
 */
function parseAttributes(raw) {
  /** @type {Record<string, string>} */
  const attrs = {}
  const pattern = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match
  while ((match = pattern.exec(raw)) !== null) {
    attrs[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? '')
  }
  return attrs
}

/**
 * 文档元素（根节点的第一个子元素）。
 * @param {XmlNode} node
 * @returns {XmlNode | undefined}
 */
export function rootOf(node) {
  return node.name === '#document' ? node.children[0] : node
}

/**
 * 直接子元素里同名的第一个。
 * @param {XmlNode | undefined} node
 * @param {string} name
 * @returns {XmlNode | undefined}
 */
export function childOf(node, name) {
  if (node === undefined) return undefined
  return node.children.find((entry) => entry.name === name)
}

/**
 * 直接子元素里所有同名的。
 * @param {XmlNode | undefined} node
 * @param {string} name
 * @returns {XmlNode[]}
 */
export function childrenOf(node, name) {
  if (node === undefined) return []
  return node.children.filter((entry) => entry.name === name)
}

/**
 * 属性值（空串视为没有）。
 * @param {XmlNode | undefined} node
 * @param {string} name
 * @returns {string | undefined}
 */
export function attrOf(node, name) {
  if (node === undefined) return undefined
  const value = node.attrs[name]
  return value === undefined || value === '' ? undefined : value
}

/**
 * 深度优先找第一个满足条件的节点。
 * @param {XmlNode | undefined} node
 * @param {(node: XmlNode) => boolean} predicate
 * @returns {XmlNode | undefined}
 */
export function findFirst(node, predicate) {
  if (node === undefined) return undefined
  /** @type {XmlNode[]} */
  const stack = [node]
  while (stack.length > 0) {
    const cursor = stack.pop()
    if (cursor === undefined) break
    if (cursor !== node && predicate(cursor)) return cursor
    for (let i = cursor.children.length - 1; i >= 0; i -= 1) stack.push(cursor.children[i])
  }
  return undefined
}

/**
 * 深度优先找所有同名节点（`*` 匹配任意）。
 * @param {XmlNode | undefined} node
 * @param {string} name
 * @returns {XmlNode[]}
 */
export function findAll(node, name) {
  /** @type {XmlNode[]} */
  const hits = []
  if (node === undefined) return hits
  /** @type {XmlNode[]} */
  const stack = [...node.children].reverse()
  while (stack.length > 0) {
    const cursor = stack.pop()
    if (cursor === undefined) break
    if (name === '*' || cursor.name === name) hits.push(cursor)
    for (let i = cursor.children.length - 1; i >= 0; i -= 1) stack.push(cursor.children[i])
  }
  return hits
}

/**
 * `<component name="X">`。
 * @param {XmlNode} node 文档根或任意节点
 * @param {string} name
 * @returns {XmlNode | undefined}
 */
export function componentOf(node, name) {
  return findAll(rootOf(node) ?? node, 'component').find((entry) => entry.attrs.name === name)
}

/**
 * `<option name="X" value="Y" />` 节点。
 * @param {XmlNode | undefined} node
 * @param {string} name
 * @returns {XmlNode | undefined}
 */
export function optionNamed(node, name) {
  return childrenOf(node, 'option').find((entry) => entry.attrs.name === name)
}

/**
 * `<option name="X" value="Y" />` 的值。
 * @param {XmlNode | undefined} node
 * @param {string} name
 * @returns {string | undefined}
 */
export function optionValue(node, name) {
  return attrOf(optionNamed(node, name), 'value')
}

/**
 * 节点自身与全部后代的文本（折叠空白）。
 * @param {XmlNode | undefined} node
 * @returns {string}
 */
export function textOf(node) {
  if (node === undefined) return ''
  /** @type {string[]} */
  const parts = []
  /** @type {XmlNode[]} */
  const stack = [node]
  while (stack.length > 0) {
    const cursor = stack.pop()
    if (cursor === undefined) break
    if (cursor.text !== '') parts.push(cursor.text)
    for (let i = cursor.children.length - 1; i >= 0; i -= 1) stack.push(cursor.children[i])
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}
