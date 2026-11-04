/**
 * Lockstep sync test (docs/qa/hackable-rooms/LOCKSTEP-SPIKE.md): play the same Hackable game with the same key presses
 * and live edits in Node, Chrome and WebKit (Safari's engine), and check the whole game matches on every tick.
 *
 *   node scripts/qa/lockstep/run.mjs [--ticks 1800] [--out dir] [--strict-rejoin]
 *
 * Uses the QA Playwright module (scripts/qa/lib/env.mjs) for Chrome and its WebKit build. Exits 1 when engines
 * disagree; with --strict-rejoin also when the late joiner does (a known gap until M0 moves game state into World).
 */
import { build } from 'esbuild'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { launchOptions } from '../lib/env.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback }
const TICKS = Number(arg('ticks', 1800))
const OUT = arg('out', path.join(here, '../../../docs/qa/hackable-rooms/lockstep'))
const REJOIN_AT = Math.floor(TICKS / 2)
const STRICT_REJOIN = process.argv.includes('--strict-rejoin')

// One bundle for every engine, so they all run the same code.
const bundled = await build({
  entryPoints: [path.join(here, 'harness.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'Lockstep', platform: 'browser', target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  loader: { '.png': 'dataurl', '.svg': 'dataurl', '.webp': 'dataurl', '.json': 'json' },
  logLevel: 'warning',
})
const code = bundled.outputFiles[0].text
vm.runInThisContext(code)
const L = globalThis.Lockstep

/**
 * Each kit's timelines. Both have "Play again" every 600 ticks (the Hero reaches the flag in about 20 seconds),
 * "Coin now worth 5" at tick 300, and a knob turned at tick 750, before the late joiner arrives at the halfway tick.
 * - solo: one keyboard, no players (a game outside a room, as today).
 * - room: Maya plays from the start, Sam joins at 100, Lee joins at 400 and leaves at 1000, Maya leaves at 1500;
 *   each presses their own keys.
 */
function timeline(kit, scenario) {
  const events = []
  if (scenario === 'solo') events.push(...L.kidInput(kit, TICKS, kit === 'race' ? 7 : 3))
  else {
    const players = [
      { num: 1, name: 'Maya', seed: 3, from: 0, to: Math.min(1500, TICKS) },
      { num: 2, name: 'Sam', seed: 11, from: 100, to: TICKS },
      { num: 3, name: 'Lee', seed: 17, from: 400, to: Math.min(1000, TICKS) },
    ].filter((p) => p.from < TICKS)
    // Joins first, so a player's first keys on their join tick come after it (the sort below keeps this order).
    for (const p of players) events.push({ tick: p.from, kind: 'join', player: p.num, name: p.name })
    for (const p of players) if (p.to < TICKS) events.push({ tick: p.to, kind: 'leave', player: p.num })
    for (const p of players) events.push(...L.kidInput(kit, TICKS, p.seed + (kit === 'race' ? 4 : 0), p.num, p.from, p.to))
  }
  for (let tick = 600; tick < TICKS; tick += 600) events.push({ tick, kind: 'flag' })
  events.push({ tick: 300, kind: 'edit-program', what: 'Stage: change by 1 → by 5 (nothing to change)' })
  events.push({ tick: 750, kind: 'edit-knob', what: 'player knob x 1.3 (nothing to change)' })
  // Building together (M2): live edits as room events, before and after the late joiner.
  events.push({ tick: 200, kind: 'together', what: 'place' })
  events.push({ tick: 450, kind: 'together', what: 'paint' })
  events.push({ tick: 820, kind: 'together', what: 'code' })
  events.push({ tick: 1300, kind: 'together', what: 'undo-code' })
  return events.sort((a, b) => a.tick - b.tick)
}

const { DEFAULT_PLAYWRIGHT_MODULE } = await import('../lib/env.mjs')
const pw = await import(process.env.PLAYWRIGHT_MODULE || DEFAULT_PLAYWRIGHT_MODULE)
/** Playwright's own WebKit, or the newest WebKit build in its cache (WEBKIT_PATH overrides): Safari's engine either way. */
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

async function inBrowser(b, options) {
  const browser = await b.launch()
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><title>lockstep</title>')
    await page.addScriptTag({ content: code })
    const version = browser.version()
    const result = await page.evaluate((o) => globalThis.Lockstep.runScenario(o.engine, o.opts), { engine: `${b.name} ${version}`, opts: options })
    return result
  } finally { await browser.close() }
}

/** The first tick where either fingerprint differs (the full text one, or the cheap one rooms would send). */
function firstMismatch(a, b) {
  const n = Math.min(a.hashes.length, b.hashes.length)
  for (let i = 0; i < n; i++) if (a.hashes[i] !== b.hashes[i] || a.fingerprints[i] !== b.fingerprints[i]) return i
  return a.hashes.length === b.hashes.length ? -1 : n
}

/** The first differing key paths between two fingerprint texts (they are stable JSON-like text). */
function explain(textA, textB) {
  let i = 0
  while (i < textA.length && textA[i] === textB[i]) i++
  return { at: i, a: textA.slice(Math.max(0, i - 160), i + 120), b: textB.slice(Math.max(0, i - 160), i + 120) }
}

await mkdir(OUT, { recursive: true })
const summary = { ticks: TICKS, rejoinAt: REJOIN_AT, node: process.version, kits: {} }
let failed = false

for (const [kit, scenario] of [['platformer', 'solo'], ['platformer', 'room'], ['race', 'solo'], ['race', 'room']]) {
  const name = `${kit} ${scenario}`
  const projectText = L.starterText(kit)
  const events = timeline(kit, scenario)
  const opts = { projectText, kit, ticks: TICKS, events }
  const runs = [L.runScenario(`Node ${process.version}`, opts), L.runScenario(`Node ${process.version} again`, opts)]
  for (const b of browsers) {
    try { runs.push(await inBrowser(b, opts)) } catch (e) { runs.push({ engine: b.name, error: String(e).split('\n')[0] }) }
  }
  const ref = runs[0]
  const rows = runs.map((r) => {
    if (r.error) return { engine: r.engine, error: r.error }
    const at = firstMismatch(ref, r)
    return { engine: r.engine, matches: at < 0, firstMismatchTick: at < 0 ? null : at, stepMsPerTick: +(r.stepMs / TICKS).toFixed(3), final: r.final, finalHash: r.hashes.at(-1) }
  })

  // The late joiner: same timeline, turned into JSON halfway and carried on in a fresh runtime.
  const rejoinRun = L.runScenario('Node, rejoined', { ...opts, rejoinAt: REJOIN_AT })
  const rejoinAt = firstMismatch(ref, rejoinRun)
  let rejoinExplain
  if (rejoinAt >= 0) {
    const dumpAt = [rejoinAt]
    const a = L.runScenario('dump', { ...opts, dumpAt })
    const b = L.runScenario('dump', { ...opts, rejoinAt: REJOIN_AT, dumpAt })
    rejoinExplain = explain(a.dumps[rejoinAt], b.dumps[rejoinAt])
  }
  const mismatchExplain = {}
  for (const r of runs.slice(1)) {
    const row = rows.find((x) => x.engine === r.engine)
    if (!row || row.matches || row.error) continue
    failed = true
    const a = L.runScenario('dump', { ...opts, dumpAt: [row.firstMismatchTick] })
    mismatchExplain[r.engine] = { tick: row.firstMismatchTick, refText: a.dumps[row.firstMismatchTick]?.slice(0, 400) }
  }
  if (rows.some((r) => r.error)) failed = true
  if (STRICT_REJOIN && rejoinAt >= 0) failed = true

  summary.kits[name] = {
    events: events.length, keyEvents: events.filter((e) => e.kind === 'down' || e.kind === 'up').length, restarts: events.filter((e) => e.kind === 'flag').map((e) => e.tick), players: events.filter((e) => e.kind === 'join' || e.kind === 'leave').map((e) => `${e.kind} ${e.player} @${e.tick}`),
    applied: ref.applied, skipped: ref.skipped, runs: rows, mismatchExplain,
    rejoin: { snapshotBytes: rejoinRun.snapshotBytes, matches: rejoinAt < 0, firstMismatchTick: rejoinAt < 0 ? null : rejoinAt, explain: rejoinExplain },
  }
  console.log(`\n${name}: ${events.length} events (${summary.kits[name].keyEvents} keys); ${ref.applied.join('; ') || 'no edits applied'}`)
  for (const r of rows) console.log(`  ${r.engine.padEnd(28)} ${r.error ? `ERROR ${r.error}` : r.matches ? `same on all ${TICKS} ticks` : `DIFFERS from tick ${r.firstMismatchTick}`}${r.stepMsPerTick != null ? `  ${r.stepMsPerTick} ms/tick` : ''}`)
  console.log(`  late joiner at tick ${REJOIN_AT} (${rejoinRun.snapshotBytes} bytes): ${rejoinAt < 0 ? 'same to the end' : `DIFFERS from tick ${rejoinAt}`}`)
  if (rejoinExplain) console.log(`    first difference:\n      kept:     …${rejoinExplain.a}\n      rejoined: …${rejoinExplain.b}`)
}

await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(`\nwrote ${path.relative(process.cwd(), path.join(OUT, 'summary.json'))}`)
process.exit(failed ? 1 : 0)
