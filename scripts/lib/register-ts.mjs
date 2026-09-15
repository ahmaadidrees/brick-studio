// Usage: node --import ./scripts/lib/register-ts.mjs scripts/<tool>.ts
// See ts-hooks.mjs for what the hooks do and why they are needed.
import { registerHooks } from 'node:module'
import { load, resolve } from './ts-hooks.mjs'

if (typeof registerHooks !== 'function') {
  throw new Error(`Running TypeScript scripts needs Node 22.15 or newer (module.registerHooks); this is ${process.version}`)
}
registerHooks({ resolve, load })
