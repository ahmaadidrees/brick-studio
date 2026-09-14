// W7 evidence: Toy Room Explore at the two contract viewports, with the marketing seed castle on the plate.
//
//   UI_ORIGIN=http://127.0.0.1:5207 node docs/brand/qa/w7/screenshots.mjs
//
// Environment: UI_ORIGIN (required), OUT_DIR (default docs/brand/qa/w7), PLAYWRIGHT_MODULE, CHROME_PATH.
// Explore is entered through the real store (setMode('explore')) and the screenshot waits for exploreSpawnStatus
// === 'ready', so every frame shows the character standing on the plate with the HUD the player actually sees.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSeedBricks, SEED_WORLD } from '../../../../scripts/art/media-seed.mjs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs')

const origin = process.env.UI_ORIGIN
if (!origin) {
  console.error('UI_ORIGIN is required, e.g. UI_ORIGIN=http://127.0.0.1:5207')
  process.exit(2)
}
const outDir = process.env.OUT_DIR || path.dirname(fileURLToPath(import.meta.url))
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const VIEWPORTS = [
  { name: 'desktop-1366x768', width: 1366, height: 768, mobile: false },
  { name: 'phone-390x844', width: 390, height: 844, mobile: true },
]

const browser = await chromium.launch({ headless: true, executablePath: chromePath })
const report = { timestamp: new Date().toISOString(), origin, shots: [] }
try {
  await mkdir(outDir, { recursive: true })
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${origin}/build`)
    await page.getByRole('button', { name: 'World menu', exact: true }).waitFor()
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/src/brick/store.ts')).at(-1)
      window.qaStore = (await import(url)).useBrickStore
    })
    const dismiss = page.getByRole('button', { name: 'Dismiss quick start', exact: true })
    if (await dismiss.count()) await dismiss.click()
    const seeded = await page.evaluate(async ({ bricks, environmentId, plateSize }) => {
      const { createBrickStudioDocument } = await import('/src/brick/brickDocument.ts')
      const outcome = window.qaStore.getState().restoreDocument(createBrickStudioDocument(bricks, { environmentId, plateSize }))
      return { ok: outcome?.ok ?? true, bricks: window.qaStore.getState().bricks.length }
    }, { bricks: createSeedBricks(), environmentId: 'toy-room', plateSize: SEED_WORLD.plateSize })
    await page.waitForTimeout(2000)
    await page.evaluate(() => window.qaStore.getState().setMode('explore'))
    await page.waitForFunction(() => window.qaStore.getState().exploreSpawnStatus === 'ready', null, { timeout: 30000 })
    await page.waitForTimeout(2500)
    const readState = () => page.evaluate(() => {
      const s = window.qaStore.getState()
      return { mode: s.mode, status: s.exploreSpawnStatus, environmentId: s.documentMetadata.environmentId, bricks: s.bricks.length, yaw: s.touchYaw, pitch: s.touchPitch, distance: s.touchCameraDistance }
    })
    const shoot = async (label) => {
      const file = `toy-room-explore-${viewport.name}-${label}.png`
      await page.screenshot({ path: path.join(outDir, file), animations: 'disabled' })
      const state = await readState()
      report.shots.push({ file, viewport: `${viewport.width}x${viewport.height}`, seeded, state, errors: [...errors] })
      console.log('captured', file, JSON.stringify(state), errors.length ? `errors: ${errors.join(' | ')}` : 'no page errors')
    }
    // 1. What the player sees on spawn: the build in front, HUD as shipped.
    await shoot('spawn')
    // 2. Turned toward the lamp with a level camera: the room dressing (lamp, books, wall, window) behind the plate.
    await page.evaluate(() => {
      const s = window.qaStore.getState()
      s.addTouchLook(-2.2, -0.42)
      s.setTouchCameraDistance(9)
    })
    await page.waitForTimeout(1800)
    await shoot('room')
    await context.close()
  }
} finally {
  await writeFile(path.join(outDir, 'screenshots-report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
