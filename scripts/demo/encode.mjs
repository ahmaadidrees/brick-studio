/**
 * Re-encode recordings from their saved frames without recording again, for example after changing the encoding:
 * `node scripts/demo/encode.mjs build-3d build-2d` reads DEMO_OUT/<name>.json and DEMO_OUT/<name>-frames.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { encode, OUT } from './lib/studio.mjs'

const names = process.argv.slice(2)
if (!names.length) throw new Error('usage: node scripts/demo/encode.mjs <recording name>…')
for (const name of names) encode(JSON.parse(await readFile(path.join(OUT, `${name}.json`), 'utf8')))
