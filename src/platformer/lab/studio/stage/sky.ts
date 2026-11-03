/**
 * The Brickgineers day sky (the one stage drawing that is not a brick). Step 7 removed the tile drawing and the coin pop
 * that used to live here: every painted cell is a brick drawn with its own costume (stage/gridCells.ts, renderer.ts).
 */
import { Atlas } from '../../../render/atlas'
import type { StageBounds } from '../../core/contracts'
import { getCameraZoom, worldToScreen, type Camera, type Viewport } from './camera'

let atlas: Atlas | null = null

// ---------------------------------------------------------------- the Brickgineers day sky

const SKY_BLUE = '#79b8ff'
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const SKY_LAYERS: { key: string; spacing: number; par: number; lift: (h: number) => number; salt: number }[] = [
  { key: 'cloud:big', spacing: 300, par: 0.15, lift: () => 216, salt: 1 },
  { key: 'cloud:small', spacing: 220, par: 0.22, lift: () => 166, salt: 2 },
  { key: 'hill:big:far', spacing: 380, par: 0.3, lift: (h) => 16 + h - 14, salt: 3 },
  { key: 'hill:small:near', spacing: 260, par: 0.55, lift: (h) => 16 + h - 4, salt: 4 },
]

/**
 * The real builder's day sky and studded hills, used when the stage has no backdrop picture. The scenery scrolls more
 * slowly than the level. It is clipped to the level, and the ground line is one tile above the level's floor.
 */
export function drawSky(ctx: CanvasRenderingContext2D, bounds: StageBounds, camera: Camera, viewport: Viewport): void {
  const [lX, tY] = worldToScreen(camera, viewport, bounds.left, bounds.top)
  const [rX, bY] = worldToScreen(camera, viewport, bounds.right, bounds.bottom)
  ctx.fillStyle = SKY_BLUE
  ctx.fillRect(lX, tY, rX - lX, bY - tY)
  let sheet: Atlas
  try {
    sheet = atlas ??= new Atlas()
  } catch {
    return
  }
  const zoom = getCameraZoom(camera, viewport)
  const viewLeft = camera.x - viewport.width / 2 / zoom
  const viewW = viewport.width / zoom
  ctx.save()
  ctx.beginPath()
  ctx.rect(lX, tY, rX - lX, bY - tY)
  ctx.clip()
  ctx.imageSmoothingEnabled = false
  try {
    for (const L of SKY_LAYERS) {
      const img = sheet.get(L.key)
      const offset = viewLeft * L.par
      const first = Math.floor((offset - img.width) / L.spacing)
      const last = Math.ceil((offset + viewW) / L.spacing)
      for (let i = first; i <= last; i++) {
        const r = hash(i * 7 + L.salt)
        if (r < 0.25) continue
        // World x of the picture's left edge; it parallax-scrolls relative to the camera's left edge.
        const wx = viewLeft + (Math.round(i * L.spacing + r * L.spacing * 0.5) - offset)
        const top = bounds.bottom + L.lift(img.height)
        const [sx, sy] = worldToScreen(camera, viewport, wx, top)
        ctx.drawImage(img, Math.round(sx), Math.round(sy), Math.ceil(img.width * zoom), Math.ceil(img.height * zoom))
      }
    }
  } catch {
    /* no canvas */
  }
  ctx.restore()
}

// ---------------------------------------------------------------- Hackable Racing's grass

/** The grass a race track is painted on (kitScreens' `background: 'grass'`). */
export const GRASS = '#4d9a3a'
/** Every other mowing stripe, a shade lighter. */
export const GRASS_STRIPE = '#53a03f'
/** How tall a mowing stripe is, in steps (four bricks). */
export const GRASS_STRIPE_STEPS = 64
/** The tuft pattern repeats every this many steps (two bricks). */
const TUFT_TILE = 32
const TUFT_DARK = '#438c32'
const TUFT_LIGHT = '#5cab47'

let tuftCanvas: HTMLCanvasElement | null | undefined
const tuftPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>()

/** A small see-through square with a few blades of grass, drawn once. Null where there is no canvas (tests, workers). */
function tuftTile(): HTMLCanvasElement | null {
  if (tuftCanvas !== undefined) return tuftCanvas
  tuftCanvas = null
  if (typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = TUFT_TILE
    canvas.height = TUFT_TILE
    const c = canvas.getContext('2d')
    if (!c) return null
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(hash(i * 3 + 11) * (TUFT_TILE - 2))
      const y = Math.floor(hash(i * 5 + 17) * (TUFT_TILE - 3))
      c.fillStyle = i % 3 === 0 ? TUFT_LIGHT : TUFT_DARK
      // A blade or two: one pixel wide, two tall, sometimes with a neighbour leaning in.
      c.fillRect(x, y, 1, 2)
      if (i % 2) c.fillRect(x + 1, y + 1, 1, 2)
    }
    tuftCanvas = canvas
  } catch {
    tuftCanvas = null
  }
  return tuftCanvas
}

function tuftPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (tuftPatterns.has(ctx)) return tuftPatterns.get(ctx) ?? null
  let pattern: CanvasPattern | null = null
  const tile = typeof ctx.createPattern === 'function' ? tuftTile() : null
  try {
    pattern = tile ? ctx.createPattern(tile, 'repeat') : null
    // The pattern must move with the level, so it needs setTransform (and DOMMatrix); without them, plain grass.
    if (pattern && (typeof pattern.setTransform !== 'function' || typeof DOMMatrix !== 'function')) pattern = null
  } catch {
    pattern = null
  }
  tuftPatterns.set(ctx, pattern)
  return pattern
}

/**
 * Racing's grass, seen from above: green, lighter mowing stripes every four bricks, and a scatter of tufts that move
 * with the track. Cheap on purpose (a race has 1,000+ cells to draw): one fill, a few stripes, one pattern fill, all
 * cut to what is on screen.
 */
export function drawGrass(ctx: CanvasRenderingContext2D, bounds: StageBounds, camera: Camera, viewport: Viewport): void {
  const [lX, tY] = worldToScreen(camera, viewport, bounds.left, bounds.top)
  const [rX, bY] = worldToScreen(camera, viewport, bounds.right, bounds.bottom)
  // The part of the level on screen.
  const x0 = Math.max(0, lX), x1 = Math.min(viewport.width, rX)
  const y0 = Math.max(0, tY), y1 = Math.min(viewport.height, bY)
  if (x1 <= x0 || y1 <= y0) return
  ctx.fillStyle = GRASS
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0)

  const zoom = getCameraZoom(camera, viewport)
  const band = GRASS_STRIPE_STEPS * zoom
  if (band >= 4) {
    ctx.fillStyle = GRASS_STRIPE
    // Stripe k covers steps [bottom + k * 64, bottom + (k + 1) * 64); the odd ones are lighter. Screen y grows downwards.
    const first = Math.max(0, Math.floor((bY - y1) / band))
    const last = Math.ceil((bY - y0) / band)
    for (let k = first; k <= last; k++) {
      if (k % 2 === 0) continue
      const top = Math.max(y0, bY - (k + 1) * band)
      const bottom = Math.min(y1, bY - k * band)
      if (bottom > top) ctx.fillRect(x0, top, x1 - x0, bottom - top)
    }
  }

  const pattern = zoom >= 0.5 ? tuftPattern(ctx) : null
  if (!pattern) return
  try {
    pattern.setTransform(new DOMMatrix([zoom, 0, 0, zoom, lX, tY]))
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = pattern
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    ctx.restore()
  } catch {
    /* plain grass */
  }
}
