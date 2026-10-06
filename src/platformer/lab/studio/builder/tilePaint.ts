/**
 * Pure builder logic: tile coordinates (row 0 is the BOTTOM row, y up) and what a press on the level does.
 * No React, no canvas, so it is tested headlessly (tilePaint.test.ts).
 */
import type { CopyPlacement, LevelDesign, TileLayer } from '../../core/contracts'
import { TILE_SIZE } from '../../core/contracts'
import { pickCopy } from '../stage/picking'

export interface Cell {
  col: number
  row: number
}

/** The tile cell under a world point, or null outside the layer. World y is up, so row 0 is the floor row. */
export function worldToCell(layer: TileLayer, wx: number, wy: number): Cell | null {
  if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null
  const col = Math.floor(wx / TILE_SIZE)
  const row = Math.floor(wy / TILE_SIZE)
  if (col < 0 || row < 0 || col >= layer.cols || row >= layer.rows) return null
  return { col, row }
}

/** World position of a cell's bottom-left corner. */
export function cellOrigin(cell: Cell): { x: number; y: number } {
  return { x: cell.col * TILE_SIZE, y: cell.row * TILE_SIZE }
}

export function tileCharAt(layer: TileLayer, col: number, row: number): string {
  if (col < 0 || row < 0 || col >= layer.cols || row >= layer.rows) return '.'
  return layer.data[row]?.[col] ?? '.'
}

/** Every cell on the straight line from a to b, both ends included (Bresenham), so a fast drag leaves no gaps. */
export function cellsOnLine(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = []
  let x = a.col
  let y = a.row
  const dx = Math.abs(b.col - a.col)
  const dy = Math.abs(b.row - a.row)
  const sx = a.col < b.col ? 1 : -1
  const sy = a.row < b.row ? 1 : -1
  let err = dx - dy
  for (;;) {
    cells.push({ col: x, row: y })
    if (x === b.col && y === b.row) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
  return cells
}

/**
 * What the kid has armed: a grid brick to paint, a brick to place, or the eraser. `brushTile` is the armed grid brick's
 * character (null for any other brick); the Stage derives it from the brush brick's `grid.char`.
 */
export interface BuildTool {
  /** The armed grid brick's character to paint; null when placing a normal brick. */
  brushTile: string | null
  brushBrickId: string | null
  erasing: boolean
}

export type PressDecision =
  /** An existing copy was pressed: select it (and a drag moves it). */
  | { kind: 'select-copy'; copy: CopyPlacement }
  /** Paint one cell; '.' erases it. A drag keeps painting. */
  | { kind: 'paint-tile'; cell: Cell; ch: string }
  /** A painted cell was pressed: select it (`selectCopy(gridCopyId)`). A grid brush keeps painting on a drag. */
  | { kind: 'select-cell'; cell: Cell; ch: string }
  | { kind: 'erase-copy'; copy: CopyPlacement }
  | { kind: 'place-copy'; brickId: string; x: number; y: number }
  /** Empty space and nothing armed. */
  | { kind: 'nothing' }

/**
 * Press on the level in Build. Right-click (or the Erase tool) removes whatever is there. Otherwise an existing copy is
 * selected instead of painted over (a Hero standing in front of a cell wins), then a painted cell is selected when
 * nothing paints over it (no grid brick armed, or the armed brick is the cell's own), then the armed brick goes down.
 */
export function decidePress(
  design: LevelDesign,
  tool: BuildTool,
  wx: number,
  wy: number,
  opts: { erase?: boolean; snap?: number } = {},
): PressDecision {
  const erase = opts.erase || tool.erasing
  const copy = pickCopy(design, wx, wy)
  const cell = design.tiles ? worldToCell(design.tiles, wx, wy) : null
  if (erase) {
    if (copy) return { kind: 'erase-copy', copy }
    return cell ? { kind: 'paint-tile', cell, ch: '.' } : { kind: 'nothing' }
  }
  if (copy) return { kind: 'select-copy', copy }
  const here = design.tiles && cell ? tileCharAt(design.tiles, cell.col, cell.row) : '.'
  if (cell && here !== '.' && (!tool.brushTile || tool.brushTile === here)) return { kind: 'select-cell', cell, ch: here }
  if (tool.brushTile && cell) return { kind: 'paint-tile', cell, ch: tool.brushTile }
  if (!tool.brushTile && tool.brushBrickId) {
    const snap = opts.snap ?? 0
    const q = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : v)
    return { kind: 'place-copy', brickId: tool.brushBrickId, x: q(wx), y: q(wy) }
  }
  return { kind: 'nothing' }
}
