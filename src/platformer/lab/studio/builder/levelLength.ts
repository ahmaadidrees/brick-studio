/**
 * Level length (parity bucket B, 2026-11-04). Classic levels are 160 tiles long; a new Hackable Platformer is 60. Build's
 * length chip makes a level longer or shorter a screen at a time (20 tiles), up to the grid's 400 columns. Longer: the
 * level's bounds and its grid grow to the right, and the floor carries on (the bottom row's last cell is repeated, so
 * a level ending in ground keeps its ground and one ending in a pit keeps its pit). Shorter: never past anything painted
 * or placed, so nothing is ever lost, and "longer" then "shorter" gives the same level back.
 */
import { TILE_SIZE, type LevelDesign } from '../../core/contracts'
import { DESIGN_LIMITS } from '../../core/project'

export const LENGTH_STEP = 20
export const MIN_LENGTH = 20
export const MAX_LENGTH = DESIGN_LIMITS.maxTileCols

/** The level's length in tiles. */
export function levelLength(design: Pick<LevelDesign, 'bounds' | 'tiles'>): number {
  return design.tiles?.cols ?? Math.round((design.bounds.right - design.bounds.left) / TILE_SIZE)
}

/**
 * The fewest tiles the level can have without losing a painted cell or a placed brick. The floor's last stretch (the
 * bottom row's trailing run of one brick) doesn't count past its first cell: it is what "longer" adds, so cutting it
 * back loses nothing.
 */
export function shortestLength(design: Pick<LevelDesign, 'bounds' | 'tiles' | 'copies'>): number {
  let last = 0
  ;(design.tiles?.data ?? []).forEach((row, r) => {
    let c = row.length - 1
    while (c >= 0 && row[c] === '.') c--
    if (r === 0) while (c > 0 && row[c - 1] === row[c]) c--
    last = Math.max(last, c + 1)
  })
  for (const copy of design.copies) last = Math.max(last, Math.floor((copy.x - design.bounds.left) / TILE_SIZE) + 1)
  return Math.max(MIN_LENGTH, last)
}

/** The design at `cols` tiles long, or the same design when that would lose something or is out of range. */
export function withLength(design: LevelDesign, cols: number): LevelDesign {
  const now = levelLength(design)
  if (!Number.isInteger(cols) || cols === now || cols > MAX_LENGTH || cols < shortestLength(design)) return design
  const bounds = { ...design.bounds, right: design.bounds.left + cols * TILE_SIZE }
  if (!design.tiles) return { ...design, bounds }
  const data = design.tiles.data.map((row, r) => {
    if (cols < row.length) return row.slice(0, cols)
    const fill = r === 0 && row.length > 0 ? row[row.length - 1]! : '.'
    return row + fill.repeat(cols - row.length)
  })
  return { ...design, bounds, tiles: { ...design.tiles, cols, data } }
}
