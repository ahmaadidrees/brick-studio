/**
 * Screenshots for lane W5 (/class and /class/projector) at 1366×768, 1024×768 and 390×844.
 * States come from the page's dev fixtures (`?demo=first-run`, `?demo=everyday`), so no worker is needed.
 *
 *   UI_ORIGIN   Vite dev origin (default http://127.0.0.1:5271)
 *   UI_OUTPUT   output directory (default this directory)
 *
 * Run: node docs/flows/qa/w5/capture.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchOptions, loadChromium, localOrigin, outputDir } from '../../../../scripts/qa/lib/env.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5271', 'the capture only reads dev fixtures.')
const output = await outputDir('UI_OUTPUT', here)
const chromium = await loadChromium()

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '390x844', width: 390, height: 844 },
]

const STATES = [
  { name: 'first-run', url: '/class?demo=first-run' },
  { name: 'students', url: '/class?demo=everyday' },
  { name: 'settings', url: '/class?demo=everyday', click: 'Settings' },
  { name: 'worlds', url: '/class?demo=everyday', click: 'Worlds' },
  { name: 'projector', url: '/class/projector?demo=1' },
]

const browser = await chromium.launch(launchOptions())
const captured = []
for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  for (const state of STATES) {
    await page.goto(`${origin}${state.url}`, { waitUntil: 'networkidle' })
    if (state.click) await page.getByRole('radio', { name: state.click }).click()
    await page.waitForTimeout(400)
    const file = path.join(output, `${state.name}-${viewport.name}.png`)
    await page.screenshot({ path: file })
    captured.push(path.basename(file))
  }
  await context.close()
}
await browser.close()
console.log(captured.join('\n'))
