/**
 * Lockstep sync test for Hackable 3D (docs/qa/hackable-3d/SPIKE.md): the same 3D room timeline in Node, Chrome and
 * WebKit, checked tick for tick, plus a late joiner and the cost of a tick, a copy and a rewind at 500 and 2,000 bricks.
 *
 *   node scripts/qa/lockstep/run3d.mjs [--ticks 1800] [--bricks 500] [--out dir] [--no-bench]
 *
 * Browsers come from the QA Playwright module like run.mjs (Chrome; Playwright's WebKit or the newest one in its cache).
 * Chrome's bench also runs at 6× CPU slowdown, the stand-in for a school Chromebook. Exits 1 when engines disagree.
 */
import { build } from 'esbuild'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PLAYWRIGHT_MODULE, launchOptions } from '../lib/env.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback }
const TICKS = Number(arg('ticks', 1800))
const BRICKS = Number(arg('bricks', 500))
const OUT = arg('out', path.join(here, '../../../docs/qa/hackable-3d/lockstep'))
const REJOIN_AT = Math.floor(TICKS / 2) + 7
const BENCH = !process.argv.includes('--no-bench')

const bundled = await build({
  entryPoints: [path.join(here, 'harness3d.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'Lockstep3d', platform: 'browser', target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  logLevel: 'warning',
})
const code = bundled.outputFiles[0].text
vm.runInThisContext(code)
const L = globalThis.Lockstep3d

const pw = await import(process.env.PLAYWRIGHT_MODULE || DEFAULT_PLAYWRIGHT_MODULE)
function webkitPath() {
  if (process.env.WEBKIT_PATH) return process.env.WEBKIT_PATH
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  if (!existsSync(cache)) return undefined
  const builds = readdirSync(cache).filter((d) => /^webkit-\d+$/.test(d)).sort((a, b) => Number(b.slice(7)) - Number(a.slice(7)))
  return builds.map((d) => path.join(cache, d, 'pw_run.sh')).find((p) => existsSync(p))
}
const browsers = [
  { name: 'Chrome', launch: () => pw.chromium.launch(launchOptions()) },
  {
    name: 'WebKit',
    launch: () => pw.webkit.launch({ headless: true }).catch(() => {
      const executablePath = webkitPath()
      if (!executablePath) throw new Error('No WebKit build found: run `npx playwright install webkit` or set WEBKIT_PATH')
      return pw.webkit.launch({ headless: true, executablePath })
    }),
  },
]

/** Open a page with the harness in it; `cpu` slows Chrome's CPU (CDP) for the Chromebook stand-in. */
async function withPage(b, fn, cpu = 1) {
  const browser = await b.launch()
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><title>lockstep 3d</title>')
    await page.addScriptTag({ content: code })
    if (cpu > 1) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
    }
    return await fn(page, browser.version())
  } finally { await browser.close() }
}

function firstMismatch(a, b) {
  const n = Math.min(a.hashes.length, b.hashes.length)
  for (let i = 0; i < n; i++) if (a.hashes[i] !== b.hashes[i] || a.fingerprints[i] !== b.fingerprints[i]) return i
  return a.hashes.length === b.hashes.length ? -1 : n
}
function explain(textA, textB) {
  let i = 0
  while (i < textA.length && textA[i] === textB[i]) i++
  return { at: i, a: textA.slice(Math.max(0, i - 160), i + 120), b: textB.slice(Math.max(0, i - 160), i + 120) }
}

await mkdir(OUT, { recursive: true })
const events = L.timeline3d(TICKS)
const summary = { ticks: TICKS, bricks: BRICKS, rejoinAt: REJOIN_AT, node: process.version, events: events.length, scenarios: {}, bench: [] }
let failed = false

for (const mode of [{ name: `room, ${BRICKS} bricks as scenery`, sceneryAsTargets: false }, { name: `room, ${BRICKS} bricks as targets`, sceneryAsTargets: true }]) {
  const opts = { bricks: BRICKS, sceneryAsTargets: mode.sceneryAsTargets, ticks: TICKS, events }
  const runs = [L.runScenario3d(`Node ${process.version}`, opts), L.runScenario3d(`Node ${process.version} again`, opts)]
  for (const b of browsers) {
    try { runs.push(await withPage(b, (page, version) => page.evaluate((o) => globalThis.Lockstep3d.runScenario3d(o.engine, o.opts), { engine: `${b.name} ${version}`, opts }))) } catch (e) { runs.push({ engine: b.name, error: String(e).split('\n')[0] }) }
  }
  const ref = runs[0]
  const rows = runs.map((r) => {
    if (r.error) { failed = true; return { engine: r.engine, error: r.error } }
    const at = firstMismatch(ref, r)
    if (at >= 0) failed = true
    return { engine: r.engine, matches: at < 0, firstMismatchTick: at < 0 ? null : at, stepMsPerTick: +(r.stepMs / TICKS).toFixed(3), finalHash: r.hashes.at(-1), final: r.final }
  })
  const rejoinRun = L.runScenario3d('Node, late joiner', { ...opts, rejoinAt: REJOIN_AT })
  const rejoinAt = firstMismatch(ref, rejoinRun)
  let rejoinExplain
  if (rejoinAt >= 0) {
    failed = true
    const a = L.runScenario3d('dump', { ...opts, dumpAt: [rejoinAt] })
    const b = L.runScenario3d('dump', { ...opts, rejoinAt: REJOIN_AT, dumpAt: [rejoinAt] })
    rejoinExplain = explain(a.dumps[rejoinAt], b.dumps[rejoinAt])
  }
  summary.scenarios[mode.name] = { applied: ref.applied, totals: ref.totals, runs: rows, rejoin: { at: REJOIN_AT, snapshotBytes: rejoinRun.snapshotBytes, matches: rejoinAt < 0, firstMismatchTick: rejoinAt < 0 ? null : rejoinAt, explain: rejoinExplain } }
  console.log(`\n${mode.name}: ${events.length} events; ${ref.applied.join('; ')}`)
  console.log(`  over the run: ${ref.totals.bounces} bounces, ${ref.totals.coins} coins, ${ref.totals.landings} landings; ${ref.final.heroes.length} hero(es) at the end`)
  for (const r of rows) console.log(`  ${r.engine.padEnd(30)} ${r.error ? `ERROR ${r.error}` : r.matches ? `same on all ${TICKS} ticks` : `DIFFERS from tick ${r.firstMismatchTick}`}${r.stepMsPerTick != null ? `  ${r.stepMsPerTick} ms/tick` : ''}`)
  console.log(`  late joiner at tick ${REJOIN_AT} (${rejoinRun.snapshotBytes} bytes): ${rejoinAt < 0 ? 'same to the end' : `DIFFERS from tick ${rejoinAt}`}`)
  if (rejoinExplain) console.log(`    kept:     …${rejoinExplain.a}\n    rejoined: …${rejoinExplain.b}`)
}

if (BENCH) {
  const cases = [[500, false], [2000, false], [500, true], [2000, true]]
  const engines = [
    { name: `Node ${process.version}`, run: async () => cases.map(([n, t]) => L.bench3d(n, t)) },
    { name: 'Chrome', run: () => withPage(browsers[0], (page) => page.evaluate((cs) => cs.map(([n, t]) => globalThis.Lockstep3d.bench3d(n, t)), cases)) },
    { name: 'Chrome at 6× CPU slowdown', run: () => withPage(browsers[0], (page) => page.evaluate((cs) => cs.map(([n, t]) => globalThis.Lockstep3d.bench3d(n, t)), cases), 6) },
    { name: 'WebKit', run: () => withPage(browsers[1], (page) => page.evaluate((cs) => cs.map(([n, t]) => globalThis.Lockstep3d.bench3d(n, t)), cases)) },
  ]
  console.log('\ncost (two to three players running about, 300 ticks):')
  console.log('  engine                       bricks  mode      targets  play ms  tick avg  tick p95  copy   rewind10  print   json KB')
  for (const e of engines) {
    let results
    try { results = await e.run() } catch (err) { console.log(`  ${e.name}: ERROR ${String(err).split('\n')[0]}`); continue }
    for (const r of results) {
      summary.bench.push({ engine: e.name, ...r })
      console.log(`  ${e.name.padEnd(28)} ${String(r.bricks).padStart(6)}  ${r.mode.padEnd(8)}  ${String(r.targets).padStart(7)}  ${r.playMs.toFixed(1).padStart(7)}  ${r.tickAvgMs.toFixed(3).padStart(8)}  ${r.tickP95Ms.toFixed(3).padStart(8)}  ${r.copyAvgMs.toFixed(3).padStart(5)}  ${r.rewind10Ms.toFixed(2).padStart(8)}  ${r.fingerprintMs.toFixed(3).padStart(5)}  ${(r.jsonBytes / 1024).toFixed(1).padStart(7)}`)
    }
  }
}

await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(`\nwrote ${path.relative(process.cwd(), path.join(OUT, 'summary.json'))}`)
process.exit(failed ? 1 : 0)
