/**
 * TOML 子集解析器：只覆盖 `mods.toml` / `neoforge.mods.toml` 实际用到的语法。
 *
 * 支持：注释、`key = value`、基本字符串（含 `"""` / `'''` 多行）、布尔、数字、
 * 简单数组、`[table]`、`[[array.of.tables]]`。
 * 不支持：内联表、日期、十六进制、转义 unicode——模组元数据里没有。
 *
 * @module minecraft-dev-starter/lib/toml
 */

/**
 * @typedef {Record<string, unknown>} TomlTable
 */

/**
 * @param {string} source
 * @returns {TomlTable}
 */
export function parseToml(source) {
  /** @type {TomlTable} */
  const root = {}
  /** @type {TomlTable} */
  let current = root
  const lines = source.split(/\r?\n/)

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '' || trimmed.startsWith('#')) {
      i += 1
      continue
    }

    if (trimmed.startsWith('[[')) {
      const close = trimmed.indexOf(']]')
      if (close > 0) {
        const path = trimmed.slice(2, close).trim()
        const list = ensureArray(root, splitKey(path))
        /** @type {TomlTable} */
        const table = {}
        list.push(table)
        current = table
      }
      i += 1
      continue
    }

    if (trimmed.startsWith('[')) {
      const close = trimmed.indexOf(']')
      if (close > 0) {
        const path = trimmed.slice(1, close).trim()
        current = ensureTable(root, splitKey(path))
      }
      i += 1
      continue
    }

    const eq = indexOfEquals(trimmed)
    if (eq <= 0) {
      i += 1
      continue
    }

    const key = unquote(trimmed.slice(0, eq).trim())
    let rest = trimmed.slice(eq + 1).trim()

    // 多行字符串：值跨行，直到出现同一对三引号
    const triple = rest.startsWith("'''") ? "'''" : rest.startsWith('"""') ? '"""' : undefined
    if (triple !== undefined) {
      let body = rest.slice(3)
      let closed = body.includes(triple)
      while (!closed && i + 1 < lines.length) {
        i += 1
        body += `\n${lines[i]}`
        closed = body.includes(triple)
      }
      const end = body.indexOf(triple)
      current[key] = end >= 0 ? body.slice(0, end) : body
      i += 1
      continue
    }

    // 普通字符串也可能带行尾注释
    rest = stripTrailingComment(rest)
    current[key] = parseValue(rest)
    i += 1
  }

  return root
}

/**
 * 找 `=`，跳过引号内的内容。
 * @param {string} text
 * @returns {number}
 */
function indexOfEquals(text) {
  let quote
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== undefined) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '=') return i
  }
  return -1
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripTrailingComment(text) {
  let quote
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== undefined) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '#') return text.slice(0, i).trimEnd()
  }
  return text
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitKey(text) {
  return text
    .split('.')
    .map((part) => unquote(part.trim()))
    .filter((part) => part !== '')
}

/**
 * @param {string} text
 * @returns {string}
 */
function unquote(text) {
  if (text.length >= 2 && (text.startsWith('"') || text.startsWith("'"))) {
    return text.slice(1, -1)
  }
  return text
}

/**
 * @param {string} raw
 * @returns {unknown}
 */
function parseValue(raw) {
  const text = raw.trim()
  if (text === '') return ''
  if (text.startsWith('"') || text.startsWith("'") || text.startsWith('"""') || text.startsWith("'''")) {
    return parseString(text)
  }
  if (text.startsWith('[')) return parseArray(text)
  if (text === 'true') return true
  if (text === 'false') return false
  const number = Number(text)
  return Number.isNaN(number) ? text : number
}

/**
 * @param {string} text
 * @returns {string}
 */
function parseString(text) {
  const triple = text.startsWith('"""') ? '"""' : text.startsWith("'''") ? "'''" : undefined
  if (triple !== undefined) {
    const body = text.slice(3)
    const end = body.indexOf(triple)
    return end >= 0 ? body.slice(0, end) : body
  }
  const quote = text[0]
  let out = ''
  for (let i = 1; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\\' && i + 1 < text.length) {
      const next = text[i + 1]
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next
      i += 1
      continue
    }
    if (ch === quote) break
    out += ch
  }
  return out
}

/**
 * @param {string} text
 * @returns {Array<unknown>}
 */
function parseArray(text) {
  const inner = text.slice(1, text.lastIndexOf(']'))
  /** @type {Array<unknown>} */
  const out = []
  let buffer = ''
  let quote
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]
    if (quote !== undefined) {
      buffer += ch
      if (ch === '\\') {
        buffer += inner[i + 1] ?? ''
        i += 1
      } else if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      buffer += ch
      continue
    }
    if (ch === ',') {
      pushItem(out, buffer)
      buffer = ''
      continue
    }
    buffer += ch
  }
  pushItem(out, buffer)
  return out
}

/**
 * @param {Array<unknown>} out
 * @param {string} raw
 */
function pushItem(out, raw) {
  const text = raw.trim()
  if (text === '') return
  out.push(parseValue(text))
}

/**
 * @param {TomlTable} root
 * @param {string[]} path
 * @returns {TomlTable}
 */
function ensureTable(root, path) {
  /** @type {TomlTable} */
  let node = root
  for (const key of path) {
    const next = node[key]
    if (next !== null && typeof next === 'object' && !Array.isArray(next)) {
      node = /** @type {TomlTable} */ (next)
      continue
    }
    /** @type {TomlTable} */
    const created = {}
    node[key] = created
    node = created
  }
  return node
}

/**
 * @param {TomlTable} root
 * @param {string[]} path
 * @returns {Array<TomlTable>}
 */
function ensureArray(root, path) {
  const parent = ensureTable(root, path.slice(0, -1))
  const key = path.at(-1) ?? ''
  const existing = parent[key]
  if (Array.isArray(existing)) return /** @type {Array<TomlTable>} */ (existing)
  /** @type {Array<TomlTable>} */
  const list = []
  parent[key] = list
  return list
}
