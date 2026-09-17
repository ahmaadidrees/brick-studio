/**
 * Per-route transfer measurement: opens each route against a production preview (`npx vite preview`) or a
 * dev origin and records every response by type with its encoded (transfer) and decoded sizes, using the
 * browser's PerformanceResourceTiming entries. Use it to hold the plan's budgets: landing must not pull the
 * editor/three/physics chunks, hero <= 250 KB delivered, initial marketing media <= 600 KB.
 *
 * Environment: PLAYWRIGHT_MODULE, CHROME_PATH, UI_ORIGIN (default http://127.0.0.1:4173), UI_OUTPUT
 *   (default /tmp/brick-route-transfer), ROUTES=/,/build (default landing, build, live gate, published viewer,
 *   character sheet), SETTLE_MS (default 4000; time allowed for lazy chunks after the route is interactive).
 * Output: results.json and a Markdown table (transfer.md). Exit code 1 only when a route fails to load.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostSnapshot, launchOptions, loadChromium, outputDir } from './lib/env.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const chromium = await loadChromium()
const origin = (process.env.UI_ORIGIN || 'http://127.0.0.1:4173').replace(/\/+$/, '')
const output = await outputDir('UI_OUTPUT', '/tmp/brick-route-transfer')
const settle = Number(process.env.SETTLE_MS || 4000)
const fixture = JSON.parse(await readFile(path.join(here, '../perf/fixtures/mixed-250.brickstudio.json'), 'utf8'))
const publishedHash = '#' + Buffer.from(JSON.stringify({ title: 'QA transfer world', document: fixture })).toString('base64url')
const DEFAULT_ROUTES = [
  { id: 'landing', path: '/' },
  { id: 'build', path: '/build', dismissOnboarding: true },
  { id: 'build-character-sheet', path: '/build', dismissOnboarding: true, click: { role: 'button', name: 'Character' } },
  { id: 'live-create', path: '/live/new' },
  { id: 'published-viewer', path: '/world' + publishedHash },
]
const routes = process.env.ROUTES ? process.env.ROUTES.split(',').map((p) => ({ id: p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root', path: p })) : DEFAULT_ROUTES
const kind = (entry) => {
  const name = entry.name.split('?')[0]
  if (/\.(js|mjs)$/.test(name)) return 'js'
  if (/\.css$/.test(name)) return 'css'
  if (/\.(avif|webp|png|jpe?g|svg|gif)$/.test(name)) return 'image'
  if (/\.(glb|gltf|bin)$/.test(name)) return 'model'
  if (/\.(woff2?|ttf|otf)$/.test(name)) return 'font'
  if (/\.wasm$/.test(name)) return 'wasm'
  return entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest' ? 'fetch' : 'other'
}

const browser = await chromium.launch(launchOptions())
const report = { checkedAt: new Date().toISOString(), origin, settleMs: settle, host: hostSnapshot(), routes: [] }
let failed = false
try {
  for (const route of routes) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
    if (route.dismissOnboarding) await context.addInitScript(() => { try { localStorage.setItem('brick-studio:onboarding:v1', 'dismissed') } catch {} })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const entry = { id: route.id, path: route.path.length > 80 ? route.path.slice(0, 60) + '…' : route.path }
    try {
      await page.goto(origin + route.path, { waitUntil: 'load', timeout: 30000 })
      if (route.click) await page.getByRole(route.click.role, { name: route.click.name, exact: true }).first().click({ timeout: 15000 })
      await page.waitForTimeout(settle)
      const resources = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0]
        const list = performance.getEntriesByType('resource').map((r) => ({ name: r.name, initiatorType: r.initiatorType, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize, duration: Math.round(r.duration) }))
        return { document: nav ? { transferSize: nav.transferSize, decodedBodySize: nav.decodedBodySize, domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) } : null, list }
      })
      const byKind = {}
      for (const r of resources.list) {
        const k = kind(r)
        byKind[k] ??= { count: 0, transferKB: 0, decodedKB: 0, files: [] }
        byKind[k].count += 1
        byKind[k].transferKB += r.transferSize / 1024
        byKind[k].decodedKB += r.decodedBodySize / 1024
        byKind[k].files.push({ file: r.name.replace(origin, ''), transferKB: Math.round(r.transferSize / 102.4) / 10, decodedKB: Math.round(r.decodedBodySize / 102.4) / 10 })
      }
      for (const k of Object.values(byKind)) { k.transferKB = Math.round(k.transferKB * 10) / 10; k.decodedKB = Math.round(k.decodedKB * 10) / 10; k.files.sort((a, b) => b.transferKB - a.transferKB) }
      const total = resources.list.reduce((n, r) => n + r.transferSize, 0) / 1024 + (resources.document?.transferSize ?? 0) / 1024
      Object.assign(entry, { status: errors.length ? 'errors' : 'ok', errors, document: resources.document, totalTransferKB: Math.round(total * 10) / 10, byKind })
      const heavy = resources.list.filter((r) => /rapier|events-|BrickStudioApp|store/.test(r.name)).map((r) => r.name.replace(origin, ''))
      entry.editorChunksLoaded = heavy
    } catch (error) {
      failed = true
      Object.assign(entry, { status: 'failed', error: String(error).split('\n')[0], errors })
    }
    report.routes.push(entry)
    console.log(`${entry.status.padEnd(7)} ${route.id.padEnd(22)} total ${entry.totalTransferKB ?? '?'} KB${entry.byKind ? '  ' + Object.entries(entry.byKind).map(([k, v]) => `${k} ${v.transferKB}KB/${v.count}`).join('  ') : ''}`)
    await context.close()
  }
} finally {
  await browser.close()
}
const lines = ['| Route | Total transfer KB | JS KB (files) | CSS KB | Images KB | Models KB | Fonts KB | Fetch/other KB | DOMContentLoaded ms | load ms | Editor chunks on route |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|']
for (const r of report.routes) {
  if (r.status === 'failed') { lines.push(`| ${r.id} | failed | | | | | | | | | ${r.error} |`); continue }
  const k = (name) => r.byKind[name] ? `${r.byKind[name].transferKB} (${r.byKind[name].count})` : '0'
  const misc = ['fetch', 'other', 'wasm'].reduce((n, name) => n + (r.byKind[name]?.transferKB ?? 0), 0)
  lines.push(`| ${r.id} | ${r.totalTransferKB} | ${k('js')} | ${k('css')} | ${k('image')} | ${k('model')} | ${k('font')} | ${Math.round(misc * 10) / 10} | ${r.document?.domContentLoaded ?? ''} | ${r.document?.load ?? ''} | ${r.editorChunksLoaded.length ? r.editorChunksLoaded.map((f) => f.replace(/^\/assets\//, '')).join(', ') : 'none'} |`)
}
await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2))
await writeFile(path.join(output, 'transfer.md'), lines.join('\n') + '\n')
console.log(lines.join('\n'))
process.exitCode = failed ? 1 : 0
