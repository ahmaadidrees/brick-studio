// Builds the block editor served at brickgineers.com/micro: a static copy of MakeCode for micro:bit (MIT, pinned
// below), so it loads on school networks that block MakeCode's own domains. Editor, simulator and compiler all come
// from our origin. Microsoft's telemetry and feedback widget are removed.
//
//   node scripts/build-micro-editor.mjs <work-dir>
//
// Output: <work-dir>/pxt-microbit/built/packaged/micro (about 250 MB, not committed). Copy it to
// .vercel/output/static/micro when deploying (see docs/MICRO-EDITOR.md).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const TAG = 'v9.0.12' // stable9.0, the release makecode.microbit.org serves
const REPO = 'https://github.com/microsoft/pxt-microbit'
const ROUTE = 'micro'

const work = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('usage: node scripts/build-micro-editor.mjs <work-dir>')
const src = join(work, 'pxt-microbit')
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] })

if (!existsSync(src)) run('git', ['clone', '-q', '--depth', '1', '--branch', TAG, REPO, src], work)
run('npm', ['install', '--no-audit', '--no-fund'], src)
run('node', ['node_modules/pxt-core/built/pxt.js', 'staticpkg', '--route', ROUTE], src)

const out = join(src, 'built/packaged', ROUTE)
const USABILLA = /<!-- begin usabilla live embed code -->[\s\S]*?<!-- end usabilla live embed code -->/
const APP_INSIGHTS = /window\.loadAppInsights = function \(([^)]*)\) \{/
const NO_TELEMETRY =
  'var none = new Proxy(function () {}, { get: function (t, k) { return k === "then" || typeof k === "symbol" ? undefined : none }, apply: function () {} }); window.appInsights = none;'
let patched = 0
for (const name of readdirSync(out).filter((f) => f.endsWith('.html'))) {
  const file = join(out, name)
  const before = readFileSync(file, 'utf8')
  const after = before
    .replace(USABILLA, '<!-- feedback widget removed -->')
    // The page asks this whether to report usage. It never loads the SDK now; the editor still calls
    // window.appInsights, so that becomes a stand-in that accepts any call and sends nothing.
    .replace(APP_INSIGHTS, `${NO_TELEMETRY} window.loadAppInsights = function () { return false }; window.__unusedAppInsights = function ($1) {`)
  if (after !== before) {
    writeFileSync(file, after)
    patched++
  }
}
if (!readFileSync(join(out, 'index.html'), 'utf8').includes('window.appInsights = none;')) {
  throw new Error('index.html telemetry hook not found: the MakeCode release changed, update this script')
}
console.log(`Built ${out} (${patched} pages patched)`)
