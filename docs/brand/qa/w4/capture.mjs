// W4 evidence capture. Run from the worktree with the dev server on UI_ORIGIN:
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… UI_ORIGIN=http://127.0.0.1:5194 node docs/brand/qa/w4/capture.mjs [only-substring]
// Writes PNGs next to this file. Only presentation state is touched: a demo build is restored into the
// store through the same Vite module the app imports, the guest room seed goes through sessionStorage, and
// the graphics-paused state is produced by dispatching the real webglcontextlost event on the canvas.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const origin = process.env.UI_ORIGIN ?? 'http://127.0.0.1:5194'
const only = process.argv[2] ?? ''
const outDir = dirname(fileURLToPath(import.meta.url))
mkdirSync(outDir, { recursive: true })

const VIEWPORTS = { desktop: { width: 1366, height: 768 }, phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }

function demoBricks() {
  const colors = ['#5888da', '#f17861', '#f3ca74', '#5888da', '#f17861']
  const bricks = []
  let n = 0
  for (let x = 0; x < 5; x += 1) for (let z = 0; z < 3; z += 1) {
    bricks.push({ id: `demo-${n}`, partId: 'brick_2x4', x: 4 + x * 2, y: 0, z: 4 + z * 4, rotation: 0, color: colors[(x + z) % colors.length] })
    n += 1
  }
  for (let y = 0; y < 4; y += 1) bricks.push({ id: `tower-${y}`, partId: 'brick_2x2', x: 20, y: y * 3, z: 4, rotation: 0, color: '#5888da' })
  bricks.push({ id: 'roof', partId: 'slope_2x2', x: 20, y: 12, z: 4, rotation: 0, color: '#f17861' })
  return bricks
}

async function restoreDemoBuild(page) {
  await page.evaluate(async (bricks) => {
    const [{ useBrickStore }, { createBrickStudioDocument }] = await Promise.all([import('/src/brick/store.ts'), import('/src/brick/brickDocument.ts')])
    const result = useBrickStore.getState().restoreDocument(createBrickStudioDocument(bricks, { environmentId: 'toy-room' }))
    if (!result.ok) throw new Error(result.error?.message ?? 'restore failed')
  }, demoBricks())
  await page.waitForTimeout(1200)
}

async function openBuild(page) {
  await page.goto(`${origin}/build`, { waitUntil: 'networkidle' })
  await page.evaluate(() => { try { localStorage.setItem('brick-studio:onboarding:v1', 'dismissed') } catch {} })
  await page.goto(`${origin}/build`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.brick-header', { timeout: 15000 })
  await restoreDemoBuild(page)
}

function base64Url(text) {
  return Buffer.from(text, 'utf8').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

const shots = [
  { name: '06-build', run: async (page) => { await openBuild(page); await page.evaluate(async () => { const { useBrickStore } = await import('/src/brick/store.ts'); useBrickStore.getState().selectBrick('tower-2') }); await page.waitForTimeout(300) } },
  { name: '06-build-drawer-sheet', phoneOnly: true, run: async (page) => { await openBuild(page); await page.getByRole('button', { name: 'Open brick drawer' }).click(); await page.waitForTimeout(400) } },
  { name: '07-explore', run: async (page) => { await openBuild(page); await page.getByRole('button', { name: 'Explore mode' }).click(); await page.waitForTimeout(1500) } },
  { name: '11-guest-room-create', run: async (page) => {
    await openBuild(page)
    await page.evaluate(async () => { const [{ useBrickStore }, { saveLiveWorldSeed }] = await Promise.all([import('/src/brick/store.ts'), import('/src/brick/live/liveWorldSeed.ts')]); saveLiveWorldSeed(useBrickStore.getState().getDocumentSnapshot()) })
    await page.goto(`${origin}/live/new`, { waitUntil: 'networkidle' })
    await page.waitForSelector('form', { timeout: 15000 })
    await page.waitForTimeout(300)
  } },
  { name: '12-settings', run: async (page) => { await openBuild(page); await page.getByRole('button', { name: 'Settings' }).click(); await page.waitForTimeout(400) } },
  { name: '12-world-menu', run: async (page) => { await openBuild(page); await page.getByRole('button', { name: 'World menu' }).click(); await page.waitForTimeout(300) } },
  { name: '15-graphics-paused', run: async (page) => {
    await openBuild(page)
    await page.evaluate(() => { document.querySelector('.brick-canvas canvas')?.dispatchEvent(new Event('webglcontextlost')) })
    await page.waitForSelector('.graphics-paused', { timeout: 5000 })
    await page.waitForTimeout(300)
  } },
  { name: '15-read-only-viewer', run: async (page) => {
    await page.goto(`${origin}/build`, { waitUntil: 'networkidle' })
    const serialized = await page.evaluate(async (bricks) => {
      const { createBrickStudioDocument, serializeBrickStudioDocument } = await import('/src/brick/brickDocument.ts')
      return serializeBrickStudioDocument(createBrickStudioDocument(bricks, { environmentId: 'toy-room' }))
    }, demoBricks())
    const payload = JSON.stringify({ title: 'Desk Castle', document: JSON.parse(serialized) })
    await page.goto(`${origin}/world#${base64Url(payload)}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.published-world-bar', { timeout: 20000 })
    await page.waitForTimeout(1800)
  } },
]

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const shot of shots) {
    if (only && !shot.name.includes(only)) continue
    for (const [label, viewport] of Object.entries(VIEWPORTS)) {
      if (shot.phoneOnly && label !== 'phone') continue
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, deviceScaleFactor: viewport.deviceScaleFactor ?? 1, reducedMotion: 'reduce' })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(String(error)))
      try {
        await shot.run(page)
        const file = join(outDir, `${shot.name}-${viewport.width}x${viewport.height}.png`)
        await page.screenshot({ path: file })
        console.log(`wrote ${file}${errors.length ? ` (page errors: ${errors.join(' | ')})` : ''}`)
      } catch (error) {
        console.error(`FAILED ${shot.name} ${label}: ${error instanceof Error ? error.message : error}`)
      } finally {
        await context.close()
      }
    }
  }
} finally {
  await browser.close()
}
