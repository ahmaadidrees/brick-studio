/**
 * The Stage card's size change (docs/qa/blank-2d): the stage grows or shrinks by whole cells from its bottom-left
 * corner. Painted cells beyond the new edge go; placed bricks beyond it move back inside, so nothing is lost by accident.
 */
import { TILE_SIZE, type CopyPlacement, type LevelDesign, type StageBounds, type TileLayer } from '../../core/contracts'

export interface StageLayout {
  bounds: StageBounds
  tiles: TileLayer
  copies: CopyPlacement[]
}

export const layoutOf = (design: LevelDesign): StageLayout => ({
  bounds: design.bounds,
  tiles: design.tiles ?? { cols: 0, rows: 0, data: [] },
  copies: design.copies,
})

export function resizedLayout(design: LevelDesign, cols: number, rows: number): StageLayout {
  const old = design.tiles ?? { cols: 0, rows: 0, data: [] }
  const data = Array.from({ length: rows }, (_, r) => (old.data[r] ?? '').slice(0, cols).padEnd(cols, '.'))
  const bounds: StageBounds = { left: 0, bottom: 0, right: cols * TILE_SIZE, top: rows * TILE_SIZE }
  const inset = TILE_SIZE / 2
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
  const copies = design.copies.map((c) => {
    const x = clamp(c.x, bounds.left + inset, bounds.right - inset)
    const y = clamp(c.y, bounds.bottom + inset, bounds.top - inset)
    return x === c.x && y === c.y ? c : { ...c, x, y }
  })
  return { bounds, tiles: { cols, rows, data }, copies }
}

/** How much a smaller stage would cut off: painted cells lost and bricks moved. */
export function whatResizeLoses(design: LevelDesign, cols: number, rows: number): { cells: number; moved: number } {
  const old = design.tiles ?? { cols: 0, rows: 0, data: [] }
  let cells = 0
  old.data.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] !== '.' && (r >= rows || c >= cols)) cells++
  })
  const next = resizedLayout(design, cols, rows)
  const moved = next.copies.filter((c, i) => c !== design.copies[i]).length
  return { cells, moved }
}
