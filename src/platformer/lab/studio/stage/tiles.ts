/**
 * Tiles drawn in the Brickgineers look: the real 2D builder's own art (green studded ground over dirt, orange bricks,
 * yellow ? blocks, grey spikes, lava), looked up with the engine's `tileKey` so neighbours join up the same way.
 */
import { T } from '@brick-studio/platformer-core/engine/tiles'
import { Atlas } from '../../../render/atlas'
import { tileKey } from '../../../render/art/library'
import type { TileLayer } from '../../core/contracts'
import { TILE_SIZE } from '../../core/contracts'
import { getCameraZoom, screenToWorld, worldToScreen, type Camera, type Viewport } from './camera'

const CHAR_TO_T: Record<string, number> = { G: T.GROUND, B: T.BRICK, H: T.HARD, Q: T.QBLOCK, S: T.SPIKES, L: T.LAVA }

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
