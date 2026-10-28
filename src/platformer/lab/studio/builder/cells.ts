/**
 * Painted grid cells as the builder sees them (step 7). A cell is not a CopyPlacement: the store knows nothing about
 * it, so `selectedCopyId` holds `cell:<col>:<row>` (gridCopyId) and every builder path that reads it comes through here.
 */
import { parseGridCopyId, type BrickDef, type LevelDesign } from '../../core/contracts'
import type { StudioStore } from '../store'
import { tileStrokeEdit, type History } from './history'
import { tileCharAt } from './tilePaint'

export interface SelectedCell {
  col: number
  row: number
  ch: string
  brick: BrickDef
}

/** The grid brick whose character is `ch`. */
export function brickForChar(design: Pick<LevelDesign, 'bricks'>, ch: string): BrickDef | undefined {
  return ch === '.' ? undefined : design.bricks.find((b) => b.grid?.char === ch)
}

/** The brick painted at a cell, if any. */
export function brickAtCell(design: LevelDesign, col: number, row: number): BrickDef | undefined {
  return design.tiles ? brickForChar(design, tileCharAt(design.tiles, col, row)) : undefined
}

/** How many cells in the level hold this character ("N in this level"). */
export function cellCount(design: LevelDesign, ch: string): number {
  let n = 0
  for (const line of design.tiles?.data ?? []) for (const c of line) if (c === ch) n++
  return n
}

/** The painted cell a `selectedCopyId` names, or undefined when it is a normal copy or the cell is empty now. */
export function selectedCell(design: LevelDesign, copyId: string | null): SelectedCell | undefined {
  const at = copyId ? parseGridCopyId(copyId) : null
  if (!at || !design.tiles) return undefined
  const ch = tileCharAt(design.tiles, at.col, at.row)
  const brick = brickForChar(design, ch)
  return brick ? { ...at, ch, brick } : undefined
}

/** Clear one cell (Remove, Delete key). One undo step; deselects it. */
export function removeCell(store: StudioStore, history: History | undefined, col: number, row: number): void {
  const layer = store.getState().project.design.tiles
  if (!layer) return
  const from = tileCharAt(layer, col, row)
  if (from === '.') return
  history?.push(tileStrokeEdit(store, [{ col, row, from, to: '.' }]))
  store.setTile(col, row, '.')
  store.selectCopy(null)
}
