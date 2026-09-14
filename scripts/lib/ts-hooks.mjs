// Synchronous module hooks that let plain `node` run this repo's TypeScript
// sources (scripts/ and packages/brick-core/src) without a bundler or extra
// dependencies. Two gaps in Node's built-in TypeScript support are covered:
//
// 1. brick-core uses extensionless relative imports (`from './parts'`), which
//    Vite resolves but Node's ESM loader rejects. The resolve hook retries
//    such specifiers with `.ts` appended.
// 2. brick-core uses a constructor parameter property, which Node's default
//    type *stripping* refuses. The load hook transforms `.ts` sources with
//    `module.stripTypeScriptTypes({ mode: 'transform' })` (Node 22.13 – 25).
//    Node 26 ships strip-only type stripping, so there the hook transforms
//    with rolldown's synchronous oxc transform instead — rolldown is Vite 8's
//    bundler and therefore already installed.
//
// Register with `node --import ./scripts/lib/register-ts.mjs <script.ts>`.
import { readFileSync } from 'node:fs'
import { createRequire, stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'

const RELATIVE_WITHOUT_EXTENSION = /^\.\.?\/(?:.*\/)?[^./]+$/
const require = createRequire(import.meta.url)

export function resolve(specifier, context, nextResolve) {
  try {
    return nextResolve(specifier, context)
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && RELATIVE_WITHOUT_EXTENSION.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context)
    }
    throw error
  }
}

export function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !url.endsWith('.ts')) return nextLoad(url, context)
  const filename = fileURLToPath(url)
  return { format: 'module', shortCircuit: true, source: transformTypeScript(readFileSync(filename, 'utf8'), filename, url) }
}

function transformTypeScript(code, filename, url) {
  try {
    return stripTypeScriptTypes(code, { mode: 'transform', sourceUrl: url })
  } catch (error) {
    if (error?.code !== 'ERR_INVALID_ARG_VALUE') throw error
  }
  const { transformSync } = require('rolldown/experimental')
  const result = transformSync(filename, code, { lang: 'ts' })
  if (result.errors?.length) {
    throw new Error(`Could not transform ${filename}:\n${result.errors.map((entry) => entry.message ?? String(entry)).join('\n')}`)
  }
  return result.code
}
