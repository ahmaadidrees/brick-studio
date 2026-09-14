// Captures the Brickgineers marketing masters from the real running editor.
//
// This script starts nothing itself. Point it at a running Vite dev server (or preview build):
//
//   UI_ORIGIN=http://127.0.0.1:5207 OUT_DIR=/tmp/brickgineers-media-captures node scripts/art/media-capture.mjs
//   MASTERS_DIR=/tmp/brickgineers-media-captures node scripts/art/media-optimize.mjs
//
// Environment:
//   UI_ORIGIN          required — editor origin to load
//   OUT_DIR            master PNG output (default /tmp/brickgineers-media-captures)
//   ONLY               comma list of hero,scenes,characters (default all)
//   PLAYWRIGHT_MODULE  path to playwright's index.mjs (defaults to the shared npx cache used by scripts/qa)
//   CHROME_PATH        Chrome executable (defaults to system Google Chrome)
//   HERO_CAMERA        optional "px,py,pz,tx,ty,tz[,fov]" override for the hero framing
//   SCENE_CAMERA       optional "px,py,pz,tx,ty,tz[,fov]" override for the scene cards
//   CHARACTER_LOOK     optional "yawDelta,pitchDelta,distance" override for the portrait orbit (default "3.1416,-0.2,4.2")
//   CHARACTERS         comma list to capture a subset of pip,fern,nova,toy-figure
//
// Every master is a clean runtime composition: the seed castle from media-seed.mjs is restored through the real
// Zustand store, the editor chrome is hidden with visibility (nothing is cropped out of a UI screenshot), and the
// WebGL canvas is clipped at the exact intrinsic size. Smaller variants are produced by media-optimize.mjs.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createSeedBricks, SEED_WORLD } from './media-seed.mjs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs')

const origin = process.env.UI_ORIGIN
if (!origin) {
  console.error('UI_ORIGIN is required, e.g. UI_ORIGIN=http://127.0.0.1:5207')
  process.exit(2)
}
const outDir = process.env.OUT_DIR || '/tmp/brickgineers-media-captures'
const only = new Set((process.env.ONLY || 'hero,scenes,characters').split(',').map((part) => part.trim()).filter(Boolean))
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** Master sizes. Each is the largest intrinsic size in the media contract; optimize derives the rest. */
export const MASTERS = {
  hero: { width: 1600, height: 960 },
  scene: { width: 1600, height: 1000 },
  character: { width: 800, height: 800 },
}

const SCENES = ['toy-room', 'brick-valley', 'sky-island', 'classic']
const CHARACTERS = (process.env.CHARACTERS || 'pip,fern,nova,toy-figure').split(',').map((part) => part.trim()).filter(Boolean)
const CHARACTER_LOOK = (() => {
  const parts = (process.env.CHARACTER_LOOK || '3.1416,-0.2,4.2').split(',').map(Number)
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) throw new Error(`Bad CHARACTER_LOOK: ${process.env.CHARACTER_LOOK}`)
  return { yaw: parts[0], pitch: parts[1], distance: parts[2] }
})()

function parseCamera(value, fallback) {
  if (!value) return fallback
  const parts = value.split(',').map(Number)
  if ((parts.length !== 6 && parts.length !== 7) || parts.some((part) => Number.isNaN(part))) throw new Error(`Bad camera spec: ${value}`)
  return { position: parts.slice(0, 3), target: parts.slice(3, 6), fov: parts[6] ?? fallback.fov }
}

/**
 * Low three-quarter view from the front of the plate with a wider lens than the editor's 45°, so the oversized lamp
 * (back-left), the castle (centre) and the book stack (right) share one frame like the approved board.
 */
const HERO_CAMERA = parseCamera(process.env.HERO_CAMERA, { position: [2, 6, 15], target: [2, 5, -9], fov: 70 })
/** Closer and lower for the scene cards: the same build, each environment's character around it. */
const SCENE_CAMERA = parseCamera(process.env.SCENE_CAMERA, { position: [-8, 8, 22], target: [1, 2.5, -4], fov: 50 })

const browser = await chromium.launch({ headless: true, executablePath: chromePath })
const report = { timestamp: new Date().toISOString(), origin, outDir, captures: [] }

async function openEditor(context, viewport) {
  const page = await context.newPage()
  await page.setViewportSize(viewport)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${origin}/build`)
  await page.getByRole('button', { name: 'World menu', exact: true }).waitFor()
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/src/brick/store.ts')).at(-1)
    window.mediaStore = (await import(url)).useBrickStore
  })
  const dismiss = page.getByRole('button', { name: 'Dismiss quick start', exact: true })
  if (await dismiss.count()) await dismiss.click()
  return { page, errors }
}

async function seedWorld(page, environmentId) {
  const result = await page.evaluate(async ({ bricks, environmentId, plateSize }) => {
    const { createBrickStudioDocument } = await import('/src/brick/brickDocument.ts')
    const document = createBrickStudioDocument(bricks, { environmentId, plateSize })
    const outcome = window.mediaStore.getState().restoreDocument(document)
    const state = window.mediaStore.getState()
    return { ok: outcome?.ok ?? true, error: outcome?.error ?? null, bricks: state.bricks.length, environmentId: state.documentMetadata.environmentId }
  }, { bricks: createSeedBricks(), environmentId, plateSize: SEED_WORLD.plateSize })
  if (!result.ok || result.bricks !== createSeedBricks().length) {
    throw new Error(`Seed world rejected for ${environmentId}: ${JSON.stringify(result)}`)
  }
  return result
}

/** Hide every element that is not the WebGL canvas or one of its ancestors. Layout is untouched. */
async function isolateCanvas(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('.brick-canvas canvas') || document.querySelector('canvas')
    if (!canvas) throw new Error('No canvas found')
    const keep = new Set()
    for (let node = canvas; node; node = node.parentElement) keep.add(node)
    for (const element of document.body.querySelectorAll('*')) {
      if (keep.has(element)) continue
      element.style.setProperty('visibility', 'hidden', 'important')
    }
    canvas.style.setProperty('visibility', 'visible', 'important')
  })
}

async function canvasRect(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.brick-canvas canvas') || document.querySelector('canvas')
    const rect = canvas.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
}

/** Grow the viewport until the canvas is at least the master size, then return a centred clip. */
async function fitCanvas(page, size) {
  let rect = await canvasRect(page)
  for (let attempt = 0; attempt < 4 && (rect.width < size.width || rect.height < size.height); attempt += 1) {
    const viewport = page.viewportSize()
    await page.setViewportSize({
      width: viewport.width + Math.max(0, Math.ceil(size.width - rect.width)),
      height: viewport.height + Math.max(0, Math.ceil(size.height - rect.height)),
    })
    await page.waitForTimeout(400)
    rect = await canvasRect(page)
  }
  if (rect.width < size.width || rect.height < size.height) throw new Error(`Canvas ${rect.width}×${rect.height} smaller than ${size.width}×${size.height}`)
  return {
    x: Math.round(rect.x + (rect.width - size.width) / 2),
    y: Math.round(rect.y + (rect.height - size.height) / 2),
    width: size.width,
    height: size.height,
  }
}

async function placeBuildCamera(page, camera) {
  await page.evaluate(() => window.mediaStore.getState().requestView('home'))
  await page.waitForTimeout(300)
  await page.evaluate(async ({ position, target, fov }) => {
    const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => name.includes('/@react-three_fiber.js'))
    const { _roots } = await import(url)
    const root = [..._roots.values()][0]?.store.getState()
    if (!root) throw new Error('No react-three-fiber root')
    const controls = root.controls
    // Build-mode helper only: the stud grid is an editing aid, not part of the scene's look.
    root.scene.traverse((object) => { if (object.type === 'GridHelper') object.visible = false })
    root.camera.position.set(position[0], position[1], position[2])
    if (fov) {
      root.camera.fov = fov
      root.camera.updateProjectionMatrix()
    }
    if (controls) {
      controls.target.set(target[0], target[1], target[2])
      controls.update()
    } else {
      root.camera.lookAt(target[0], target[1], target[2])
    }
  }, camera)
}

async function settle(page, ms) {
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(ms)
}

async function capture(page, file, clip) {
  const target = path.join(outDir, file)
  await page.screenshot({ path: target, clip, animations: 'disabled' })
  report.captures.push({ file, width: clip.width, height: clip.height })
  console.log('captured', file, `${clip.width}×${clip.height}`)
}

try {
  await mkdir(outDir, { recursive: true })
  const context = await browser.newContext({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: 1 })

  if (only.has('hero') || only.has('scenes')) {
    const { page, errors } = await openEditor(context, { width: MASTERS.scene.width + 100, height: MASTERS.scene.height + 140 })
    const sceneList = only.has('scenes') ? SCENES : ['toy-room']
    for (const environmentId of sceneList) {
      await seedWorld(page, environmentId)
      await settle(page, 3500)
      await isolateCanvas(page)
      if (environmentId === 'toy-room' && only.has('hero')) {
        await placeBuildCamera(page, HERO_CAMERA)
        await settle(page, 1200)
        await capture(page, 'hero-master.png', await fitCanvas(page, MASTERS.hero))
      }
      if (only.has('scenes')) {
        await placeBuildCamera(page, SCENE_CAMERA)
        await settle(page, 1200)
        await capture(page, `scene-${environmentId}-master.png`, await fitCanvas(page, MASTERS.scene))
      }
    }
    report.buildErrors = errors
    await page.close()
  }

  if (only.has('characters')) {
    for (const characterId of CHARACTERS) {
      // Tall canvas: the orbit target sits above the avatar, so the figure lands in the lower part of the canvas and
      // the square is clipped bottom-aligned to keep feet, body and a slice of room in frame.
      const { page, errors } = await openEditor(context, { width: MASTERS.character.width + 300, height: MASTERS.character.height + 600 })
      // Select the character through the real preference path, then reload so the app mounts with it.
      await page.evaluate(async ({ characterId, environmentId }) => {
        const { saveCharacterPreferences } = await import('/src/brick/contentPreferences.ts')
        saveCharacterPreferences({ characterId, palette: {} }, undefined, environmentId)
      }, { characterId, environmentId: SEED_WORLD.environmentId })
      await page.reload()
      await page.getByRole('button', { name: 'World menu', exact: true }).waitFor()
      await page.evaluate(async () => {
        const url = performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/src/brick/store.ts')).at(-1)
        window.mediaStore = (await import(url)).useBrickStore
      })
      const dismiss = page.getByRole('button', { name: 'Dismiss quick start', exact: true })
      if (await dismiss.count()) await dismiss.click()
      await seedWorld(page, SEED_WORLD.environmentId)
      await settle(page, 2500)
      await page.evaluate(() => window.mediaStore.getState().setMode('explore'))
      await page.waitForFunction(() => window.mediaStore.getState().exploreSpawnStatus === 'ready', null, { timeout: 30000 })
      await settle(page, 1500)
      // Swing the orbit camera round to the avatar's face, level it a little and come in close, so the figure
      // sits mid-frame with the room behind it instead of low in a square of studs.
      await page.evaluate(({ yaw, pitch, distance }) => {
        const state = window.mediaStore.getState()
        state.addTouchLook(yaw, pitch)
        state.setTouchCameraDistance(distance)
      }, CHARACTER_LOOK)
      await settle(page, 1800)
      await isolateCanvas(page)
      const clip = await fitCanvas(page, MASTERS.character)
      const rect = await canvasRect(page)
      clip.y = Math.round(rect.y + rect.height - MASTERS.character.height - 24)
      await capture(page, `character-${characterId}-master.png`, clip)
      report[`characterErrors:${characterId}`] = errors
      await page.close()
    }
  }

  await context.close()
} finally {
  await writeFile(path.join(outDir, 'capture-report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
