import { TS, fdiv } from './constants'
import { T, isOneWay, isSolid } from './tiles'

/** The minimum a collision query needs: the level size and the live tiles. */
export interface TileGrid {
  width: number
  height: number
  tiles: Uint8Array
}

/** Out of bounds to the left and right is wall; above the top and below the bottom is open air. */
export function tileAt(g: TileGrid, tx: number, ty: number): number {
  if (tx < 0 || tx >= g.width) return T.HARD
  if (ty < 0 || ty >= g.height) return T.EMPTY
  return g.tiles[ty * g.width + tx]
}

/** Any solid tile in column `col` over the vertical span [y, y + h). */
export function columnBlocked(g: TileGrid, col: number, y: number, h: number): boolean {
  const r1 = fdiv(y + h - 1, TS)
  for (let r = fdiv(y, TS); r <= r1; r++) if (isSolid(tileAt(g, col, r))) return true
  return false
}

/** Any solid tile in row `row` over the horizontal span [x, x + w). */
export function rowSolid(g: TileGrid, row: number, x: number, w: number): boolean {
  const c1 = fdiv(x + w - 1, TS)
  for (let c = fdiv(x, TS); c <= c1; c++) if (isSolid(tileAt(g, c, row))) return true
  return false
}

/**
 * Something to land on in row `row` over [x, x + w): a solid tile, or a one-way tile whose top the
 * mover was at or above before it moved (`oldBottom`).
 */
export function rowFloor(g: TileGrid, row: number, x: number, w: number, oldBottom: number): boolean {
  const top = row * TS
  const c1 = fdiv(x + w - 1, TS)
  for (let c = fdiv(x, TS); c <= c1; c++) {
    const t = tileAt(g, c, row)
    if (isSolid(t) || (isOneWay(t) && oldBottom <= top)) return true
  }
  return false
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Move a box horizontally by dx (|dx| < one tile) and stop it at solid tiles.
 * Returns the column it hit, or null.
 */
export function moveX(g: TileGrid, b: Box, dx: number): number | null {
  if (dx === 0) return null
  const nx = b.x + dx
  if (dx > 0) {
    const oldCol = fdiv(b.x + b.w - 1, TS)
    const newCol = fdiv(nx + b.w - 1, TS)
    if (newCol !== oldCol && columnBlocked(g, newCol, b.y, b.h)) {
      b.x = newCol * TS - b.w
      return newCol
    }
  } else {
    const oldCol = fdiv(b.x, TS)
    const newCol = fdiv(nx, TS)
    if (newCol !== oldCol && columnBlocked(g, newCol, b.y, b.h)) {
      b.x = (newCol + 1) * TS
      return newCol
    }
  }
  b.x = nx
  return null
}

/**
 * Move a box vertically by dy (|dy| < one tile). Lands on solid and one-way tiles, bumps its head on
 * solid tiles. Returns 1 for landed, -1 for ceiling, 0 for neither.
 */
export function moveY(g: TileGrid, b: Box, dy: number): 1 | -1 | 0 {
  if (dy === 0) return 0
  const ny = b.y + dy
  if (dy > 0) {
    const oldBottom = b.y + b.h
    const oldRow = fdiv(oldBottom - 1, TS)
    const newRow = fdiv(ny + b.h - 1, TS)
    if (newRow !== oldRow && rowFloor(g, newRow, b.x, b.w, oldBottom)) {
      b.y = newRow * TS - b.h
      return 1
    }
  } else {
    const oldRow = fdiv(b.y, TS)
    const newRow = fdiv(ny, TS)
    if (newRow !== oldRow && rowSolid(g, newRow, b.x, b.w)) {
      b.y = (newRow + 1) * TS
      return -1
    }
  }
  b.y = ny
  return 0
}
