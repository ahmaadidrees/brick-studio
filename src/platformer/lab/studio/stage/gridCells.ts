/**
 * Grid cells in Build (step 7, GridSpec in core/contracts.ts): which brick a cell belongs to and which costume it starts
 * with. Pure and headless. Play draws cells as the ordinary targets they are; Build draws them with this same rule.
 */
import type { BrickDef, LevelDesign, TileLayer } from '../../core/contracts'
import { TILE_SIZE } from '../../core/contracts'
import { getCameraZoom, screenToWorld, worldToScreen, type Camera, type Viewport } from './camera'

/** The grid bricks of a design by their character. */
export function gridBrickIndex(design: Pick<LevelDesign, 'bricks'>): Map<string, BrickDef> {
  const map = new Map<string, BrickDef>()
  for (const b of design.bricks) if (b.grid && !map.has(b.grid.char)) map.set(b.grid.char, b)
  return map
}

/** Starting costume index of cell (col, row; row 0 = bottom): costume 2 when `autotile` and the cell above is the same brick. */
export function cellCostumeIndex(layer: TileLayer, brick: BrickDef, col: number, row: number): number {
  if (!brick.grid?.autotile || brick.costumes.length < 2) return 0
  const ch = brick.grid.char
  return layer.data[row + 1]?.[col] === ch ? 1 : 0
}

/** The inclusive range of cells on screen. */
export function visibleCells(layer: TileLayer, camera: Camera, viewport: Viewport): { c0: number; c1: number; r0: number; r1: number } {
  const [wx0, wy1] = screenToWorld(camera, viewport, 0, 0)
  const [wx1, wy0] = screenToWorld(camera, viewport, viewport.width, viewport.height)
  return {
    c0: Math.max(0, Math.floor(Math.min(wx0, wx1) / TILE_SIZE)),
    c1: Math.min(layer.cols - 1, Math.floor(Math.max(wx0, wx1) / TILE_SIZE)),
    r0: Math.max(0, Math.floor(Math.min(wy0, wy1) / TILE_SIZE)),
    r1: Math.min(layer.rows - 1, Math.floor(Math.max(wy0, wy1) / TILE_SIZE)),
  }
}

/** World centre of a cell, where the brick's copy sits (GridSpec). */
export function cellCentre(col: number, row: number): { x: number; y: number } {
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 }
}

/** An outline around one cell: the selection (solid) or the hover (faint). */
export function drawCellOutline(ctx: CanvasRenderingContext2D, camera: Camera, viewport: Viewport, col: number, row: number, selected: boolean): void {
  const zoom = getCameraZoom(camera, viewport)
  const [sx, sy] = worldToScreen(camera, viewport, col * TILE_SIZE, (row + 1) * TILE_SIZE)
  const size = TILE_SIZE * zoom
  ctx.save()
  if (selected) {
    ctx.strokeStyle = '#5bb2ff'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.strokeRect(sx - 1, sy - 1, size + 2, size + 2)
  } else {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(sx, sy, size, size)
  }
  ctx.restore()
}
