/**
 * 客户端半边构建：esbuild 打包 → 包上 `__ModuleLoader__` 外壳 → lib/client.js。
 *
 * 为什么自己包外壳：DSH 不按 ESM 加载客户端包，它要的是
 * `window.__ModuleLoader__.load({ id, factory: (require) => exports })`
 * 形态的懒 CJS（依据见 doc/调研-DSH插件机制.md §2.3）。esbuild 的 cjs 产物
 * 已经把 react 之类留成 require(...)，套一层就行。
 *
 * 用法：node scripts/build-client.mjs [--watch]
 */
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = resolve(root, 'lib/client.js')
const PACKAGE_ID = 'minecraft-dev-starter'

const watch = process.argv.includes('--watch')

/** 外部依赖由运行时模块表提供，不进包体。 */
const EXTERNAL = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']

/** 开发期诊断：factory 里任何异常都先报回宿主，再照常抛出。 */
const REPORT = `(function(event, error){ try { fetch('/mcdev/api/client.report', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ event: event, detail: { message: String((error && error.message) || error), stack: String((error && error.stack) || '').slice(0, 900) } }) }).catch(function(){}); } catch (ignored) {} })`

const banner = `window.__ModuleLoader__.load({
  id: '${PACKAGE_ID}',
  factory: (require) => {
    try {
    var module = { exports: {} };
    var exports = module.exports;`
const footer = `    return module.exports;
    } catch (error) {
      ${REPORT}('factory.error', error);
      throw error;
    }
  },
});`

await mkdir(dirname(outfile), { recursive: true })

/**
 * @param {boolean} watching
 */
async function run(watching) {
  const result = await build({
    entryPoints: [resolve(root, 'src/client/index.js')],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome110', 'safari16'],
    external: EXTERNAL,
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
    metafile: true,
  })
  const body = result.outputFiles[0].text
  const wrapped = `${banner}\n${body}\n${footer}\n`
  await writeFile(outfile, wrapped, 'utf8')
  const size = Buffer.byteLength(wrapped)
  console.log(`[build-client] ${watching ? 'rebuilt' : 'built'} lib/client.js (${(size / 1024).toFixed(1)} KiB)`)
}

if (watch) {
  const { context } = await import('esbuild')
  const ctx = await context({
    entryPoints: [resolve(root, 'src/client/index.js')],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome110', 'safari16'],
    external: EXTERNAL,
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  })
  const rebuild = async () => {
    const result = await ctx.rebuild()
    const body = result.outputFiles[0].text
    await writeFile(outfile, `${banner}\n${body}\n${footer}\n`, 'utf8')
    console.log(`[build-client] rebuilt ${new Date().toLocaleTimeString()}`)
  }
  await ctx.watch()
  await rebuild()
  console.log('[build-client] watching src/client …')
} else {
  await run(false)
}
