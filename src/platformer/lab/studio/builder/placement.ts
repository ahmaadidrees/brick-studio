/**
 * Where a brick may stand in Build: always inside the level, and the Hero never starts inside painted ground.
 * Pure logic (no React, no canvas), tested in placement.test.ts.
 */
import type { CopyPlacement, LevelDesign, StageBounds } from '../../core/contracts'
import { TILE_SIZE } from '../../core/contracts'
import { sinCosDeg } from '../../core/detmath'
import { boundsFor } from '../../core/geometry'
import { tileCharAt } from './tilePaint'

type Pose = Pick<CopyPlacement, 'brickId' | 'direction' | 'size' | 'costume'>

/** Is this brick the Hero (the starter's, a remix of it, or one called "Hero")? Same rule as playRules.hasCopyOf. */
export function isHeroBrick(design: LevelDesign, brickId: string): boolean {
  const brick = design.bricks.find((b) => b.id === brickId)
  if (!brick) return false
  return brick.id === 'brick_hero' || brick.remixOf === 'brick_hero' || brick.name.trim().toLowerCase() === 'hero'
}

/** The world box a copy's visible art covers when it stands at (x, y), or null for a brick with no costume. */
export function copyBox(design: LevelDesign, pose: Pose, x: number, y: number): StageBounds | null {
  const brick = design.bricks.find((b) => b.id === pose.brickId)
  const costume = brick?.costumes[pose.costume ?? 0] ?? brick?.costumes[0]
  if (!costume) return null
  // Build draws copies like the picker does: "all around" rotation from their direction.
  const [sin, cos] = sinCosDeg((pose.direction ?? 90) - 90)
  return boundsFor({ x, y, scale: (pose.size ?? 100) / 100, flipX: 1, sin, cos }, costume)
}

/** Shift one axis so [lo, hi] sits inside [min, max] in whole `step`s (centred when it is wider than the room). */
function fitAxis(p: number, lo: number, hi: number, min: number, max: number, step: number): number {
  if (hi - lo > max - min) return p + (min + max) / 2 - (lo + hi) / 2
  const up = (n: number) => (step > 0 ? Math.ceil(n / step - 1e-9) * step : n)
  if (lo < min) return p + up(min - lo)
  if (hi > max) return p - up(hi - max)
  return p
}

/**
 * Keep a copy's art inside the level: a brick dropped or dragged past an edge stops at that edge. Positions already on
 * the grid stay on it (moves are whole `step`s). A brick without a costume keeps its point inside.
 */
export function clampToLevel(design: LevelDesign, pose: Pose, x: number, y: number, step = 0): { x: number; y: number } {
  const b = design.bounds
  const box = copyBox(design, pose, x, y) ?? { left: x, right: x, bottom: y, top: y }
  return {
    x: fitAxis(x, box.left, box.right, b.left, b.right, step),
    y: fitAxis(y, box.bottom, box.top, b.bottom, b.top, step),
  }
}

/** The highest painted cell row the box overlaps (as the y of that row's top edge), or null when it is clear. */
function paintedTopUnder(design: LevelDesign, box: StageBounds): number | null {
  const layer = design.tiles
  if (!layer) return null
  const eps = 1e-6
  const c0 = Math.floor((box.left + eps) / TILE_SIZE)
  const c1 = Math.ceil((box.right - eps) / TILE_SIZE) - 1
  const r0 = Math.floor((box.bottom + eps) / TILE_SIZE)
  const r1 = Math.ceil((box.top - eps) / TILE_SIZE) - 1
  for (let row = Math.min(r1, layer.rows - 1); row >= Math.max(r0, 0); row--) {
    for (let col = Math.max(c0, 0); col <= Math.min(c1, layer.cols - 1); col++) {
      if (tileCharAt(layer, col, row) !== '.') return (row + 1) * TILE_SIZE
    }
  }
  return null
}

/**
 * Where a brick lands when it is placed or dropped: inside the level, and for the Hero, standing on top of any painted
 * cells it would start inside of (so Play never begins with the Hero stuck in the ground). If there is no clear spot
 * above, the Hero stays where it was put.
 */
export function landingSpot(design: LevelDesign, pose: Pose, x: number, y: number, step = 0): { x: number; y: number } {
  const at = clampToLevel(design, pose, x, y, step)
  if (!isHeroBrick(design, pose.brickId)) return at
  let ny = at.y
  for (let i = 0; i < 64; i++) {
    const box = copyBox(design, pose, at.x, ny)
    if (!box) return at
    const top = paintedTopUnder(design, box)
    if (top === null) return { x: at.x, y: ny }
    const lift = top - box.bottom
    ny += step > 0 ? Math.ceil(lift / step - 1e-9) * step : lift
    // Lifted out of the top of the level: no clear spot.
    const lifted = copyBox(design, pose, at.x, ny)
    if (!lifted || lifted.top > design.bounds.top + 1e-6) return at
  }
  return at
}
