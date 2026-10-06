/**
 * Tiles drawn in the Brickgineers look: the real 2D builder's own art (green studded ground over dirt, orange bricks,
 * yellow ? blocks, grey spikes, lava), looked up with the engine's `tileKey` so neighbours join up the same way.
 */
import { T } from '@brick-studio/platformer-core/engine/tiles'
import { Atlas } from '../../../render/atlas'
import { tileKey } from '../../../render/art/library'
import type { StageBounds, TileLayer } from '../../core/contracts'
import { TILE_SIZE } from '../../core/contracts'
import { getCameraZoom, screenToWorld, worldToScreen, type Camera, type Viewport } from './camera'

const CHAR_TO_T: Record<string, number> = { G: T.GROUND, B: T.BRICK, H: T.HARD, Q: T.QBLOCK, S: T.SPIKES, L: T.LAVA, '-': T.SEMI, O: T.BOUNCE, U: T.USED }

let atlas: Atlas | null = null
const grids = new WeakMap<TileLayer, Uint8Array>()

/** The layer as the engine's grid (top row first), cached per layer object (the store replaces it on every edit). */
export function engineGrid(layer: TileLayer): Uint8Array {
  let g = grids.get(layer)
  if (!g) {
    g = new Uint8Array(layer.cols * layer.rows)
    for (let row = 0; row < layer.rows; row++) {
      const y = layer.rows - 1 - row
      const line = layer.data[row] ?? ''
      for (let col = 0; col < layer.cols; col++) g[y * layer.cols + col] = CHAR_TO_T[line[col] ?? '.'] ?? T.EMPTY
    }
    grids.set(layer, g)
  }
  return g
}

/** Art key for a cell (row 0 = bottom), or null when empty. */
export function tileArtKey(layer: TileLayer, col: number, row: number): string | null {
  return tileKey(engineGrid(layer), layer.cols, layer.rows, col, layer.rows - 1 - row, 'day', 0)
}

/** Draw the visible cells of a layer. Quietly draws nothing where canvases are unavailable (tests). */
export function drawTiles(ctx: CanvasRenderingContext2D, layer: TileLayer | undefined, camera: Camera, viewport: Viewport): void {
  if (!layer) return
  let sheet: Atlas
  try {
    sheet = atlas ??= new Atlas()
  } catch {
    return
  }
  const zoom = getCameraZoom(camera, viewport)
  const [wx0, wy1] = screenToWorld(camera, viewport, 0, 0)
  const [wx1, wy0] = screenToWorld(camera, viewport, viewport.width, viewport.height)
  const c0 = Math.max(0, Math.floor(Math.min(wx0, wx1) / TILE_SIZE))
  const c1 = Math.min(layer.cols - 1, Math.floor(Math.max(wx0, wx1) / TILE_SIZE))
  const r0 = Math.max(0, Math.floor(Math.min(wy0, wy1) / TILE_SIZE))
  const r1 = Math.min(layer.rows - 1, Math.floor(Math.max(wy0, wy1) / TILE_SIZE))
  ctx.save()
  ctx.imageSmoothingEnabled = false
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const key = tileArtKey(layer, col, row)
      if (!key) continue
      let img: HTMLCanvasElement
      try {
        img = sheet.get(key)
      } catch {
        return
      }
      // Anchored at the cell's bottom-left, at its natural size (all tiles are 16 steps).
      const [sx, sy] = worldToScreen(camera, viewport, col * TILE_SIZE, row * TILE_SIZE)
      const w = img.width * zoom
      const h = img.height * zoom
      ctx.drawImage(img, Math.round(sx), Math.round(sy - h), Math.ceil(w), Math.ceil(h))
    }
  }
  ctx.restore()
}

/** A translucent preview of the armed tile (or an eraser outline) under the pointer. */
export function drawTileHover(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewport: Viewport,
  hover: { col: number; row: number; ch: string; erase: boolean },
): void {
  const zoom = getCameraZoom(camera, viewport)
  const [sx, sy] = worldToScreen(camera, viewport, hover.col * TILE_SIZE, (hover.row + 1) * TILE_SIZE)
  const size = TILE_SIZE * zoom
  ctx.save()
  if (!hover.erase && hover.ch !== '.') {
    const layer: TileLayer = { cols: 1, rows: 1, data: [hover.ch] }
    try {
      const key = tileArtKey(layer, 0, 0)
      if (key) {
        atlas ??= new Atlas()
        ctx.imageSmoothingEnabled = false
        ctx.globalAlpha = 0.6
        ctx.drawImage(atlas.get(key), sx, sy, size, size)
        ctx.globalAlpha = 1
      }
    } catch {
      /* no canvas: outline only */
    }
  }
  ctx.strokeStyle = hover.erase ? '#d9534f' : '#5888da'
  ctx.lineWidth = 2
  ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2)
  ctx.restore()
}

// ---------------------------------------------------------------- coin pop (view only)

/** How long a coin rises above a ? block that was just hit, in milliseconds. */
export const COIN_POP_MS = 500
/** How high it rises, in world steps. */
const COIN_POP_RISE = 30

interface Pop {
  col: number
  row: number
  at: number
}
interface PopState {
  /** The rows as they were last frame. */
  seen: string[]
  pops: Pop[]
}
const popStates = new WeakMap<TileLayer, PopState>()

/**
 * Compare the live tiles with the last frame: a `?` that became a used block starts a coin pop. This is only a
 * picture. The engine has no hidden score; counting the coin is the Hero's code (bump hat `tile:qblock`).
 * The first frame for a layer only records the rows, so loading a level never pops anything.
 */
export function trackCoinPops(layer: TileLayer | undefined, now: number): void {
  if (!layer) return
  const state = popStates.get(layer)
  if (!state) {
    popStates.set(layer, { seen: layer.data.slice(), pops: [] })
    return
  }
  for (let row = 0; row < layer.rows; row++) {
    const line = layer.data[row]
    const before = state.seen[row]
    if (line === before) continue
    for (let col = 0; col < layer.cols; col++) if (before?.[col] === 'Q' && line[col] === 'U') state.pops.push({ col, row, at: now })
    state.seen[row] = line
  }
  state.pops = state.pops.filter((p) => now - p.at < COIN_POP_MS)
}

/** The live coin pops as how far through each one is (0 to 1), for drawing and tests. */
export function activeCoinPops(layer: TileLayer | undefined, now: number): { col: number; row: number; t: number }[] {
  const state = layer ? popStates.get(layer) : undefined
  if (!state) return []
  return state.pops.filter((p) => now - p.at < COIN_POP_MS).map((p) => ({ col: p.col, row: p.row, t: (now - p.at) / COIN_POP_MS }))
}

/** Draw the coin pops: a spinning coin rises above the block and fades. Call after the tiles. */
export function drawCoinPops(ctx: CanvasRenderingContext2D, layer: TileLayer | undefined, camera: Camera, viewport: Viewport, now: number): void {
  const pops = activeCoinPops(layer, now)
  if (pops.length === 0) return
  let sheet: Atlas
  try {
    sheet = atlas ??= new Atlas()
  } catch {
    return
  }
  const zoom = getCameraZoom(camera, viewport)
  ctx.save()
  ctx.imageSmoothingEnabled = false
  for (const p of pops) {
    try {
      const img = sheet.get(`coin:${Math.floor(p.t * 12) % 4}`)
      const rise = Math.sin(p.t * Math.PI * 0.5) * COIN_POP_RISE
      const [sx, sy] = worldToScreen(camera, viewport, p.col * TILE_SIZE, (p.row + 1) * TILE_SIZE + rise)
      ctx.globalAlpha = p.t < 0.7 ? 1 : 1 - (p.t - 0.7) / 0.3
      ctx.drawImage(img, Math.round(sx), Math.round(sy - img.height * zoom), Math.ceil(img.width * zoom), Math.ceil(img.height * zoom))
    } catch {
      return
    } finally {
      ctx.globalAlpha = 1
    }
  }
  ctx.restore()
}

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
