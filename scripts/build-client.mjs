/**
 * 客户端半边的构建入口。
 *
 * M0 阶段是「原样拷贝」：探针是手写的 CJS，自己包了 __ModuleLoader__，
 * 不需要打包器。这样 M0 只验证加载协议，不引入构建链变量。
 *
 * M1 起换成 esbuild：bundled TSX → CJS → banner/footer 包 __ModuleLoader__，
 * 见 doc/策划.md §5.4 与 §16.3（为什么是 esbuild 而不是 tsdown）。
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const from = resolve(root, 'src/client.js')
const to = resolve(root, 'lib/client.js')

await mkdir(dirname(to), { recursive: true })
await copyFile(from, to)
console.log(`[build-client] ${from} → ${to}`)
