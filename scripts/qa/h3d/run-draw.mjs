/**
 * Hackable 3D draw cost at 500 and 2,000 bricks (docs/qa/hackable-3d/D1.md), in Chrome at normal speed and at 6× CPU
 * slowdown (the stand-in for a school Chromebook). Writes docs/qa/hackable-3d/perf/draw.json.
 *
 *   node scripts/qa/h3d/run-draw.mjs [--gpu]     (--gpu asks headless Chrome for the Mac's GPU via ANGLE/Metal)
 */
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PLAYWRIGHT_MODULE, launchOptions } from '../lib/env.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, '../../../docs/qa/hackable-3d/perf')
const gpu = process.argv.includes('--gpu')
const bundled = await build({
  entryPoints: [path.join(here, 'drawBench.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'Draw3d', platform: 'browser', target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  loader: { '.css': 'empty' },
  logLevel: 'warning',
})
const code = bundled.outputFiles[0].text
const pw = await import(process.env.PLAYWRIGHT_MODULE || DEFAULT_PLAYWRIGHT_MODULE)
const args = gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : []
const results = []
for (const cpu of [1, 6]) {
  const browser = await pw.chromium.launch(launchOptions({ args }))
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.setContent('<!doctype html><title>draw 3d</title><body style="margin:0"></body>')
    await page.addScriptTag({ content: code })
    if (cpu > 1) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
    }
    for (const n of [500, 2000]) {
      const r = await page.evaluate((bricks) => globalThis.Draw3d.benchDraw(bricks), n)
      results.push({ chrome: browser.version(), cpu: `${cpu}×`, ...r })
      console.log(`Chrome ${cpu}× ${String(n).padStart(5)} bricks  meshes ${r.meshesMs} ms  tick ${r.tickMs} ms  draw ${r.drawMs} (p95 ${r.drawP95Ms}) ms  with GPU ${r.finishMs} (p95 ${r.finishP95Ms}) ms  ${r.calls} calls  ${r.triangles} tris  [${r.renderer}]`)
    }
  } finally { await browser.close() }
}
await mkdir(OUT, { recursive: true })
await writeFile(path.join(OUT, gpu ? 'draw-gpu.json' : 'draw.json'), JSON.stringify(results, null, 2) + '\n')
