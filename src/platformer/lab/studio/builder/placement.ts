/**
 * Where a brick may stand in Build: always inside the level, and the Hero never starts inside painted ground. In
 * Hackable Racing, a car (the Car, a Computer racer, or a remix of one) never starts inside a Barrier, and faces along
 * the track where it is put. Pure logic (no React, no canvas), tested in placement.test.ts.
 */
import type { CopyPlacement, LevelDesign, StageBounds } from '../../core/contracts'
import { TILE_SIZE, designKit } from '../../core/contracts'
import { atan2Deg, sinCosDeg } from '../../core/detmath'
import { boundsFor } from '../../core/geometry'
import { brickIsWall, computeRaceLoop, type RaceLoop } from '../../core/race'
import { CAR_BRICK_ID, RACER_BRICK_ID } from '../race/carBrick'
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

// ------------------------------------------------------------------------------------------------ Hackable Racing

/** A car in a race level: the Car or a Computer racer, or a remix of either. */
export function isRaceCarBrick(design: LevelDesign, brickId: string): boolean {
  if (designKit(design) !== 'race') return false
  const brick = design.bricks.find((b) => b.id === brickId)
  const id = brick?.remixOf ?? brick?.id
  return id === CAR_BRICK_ID || id === RACER_BRICK_ID
}

/** The grid characters a car can't drive through (bricks that make themselves solid: the Barrier). */
function wallChars(design: LevelDesign): Set<string> {
  return new Set(design.bricks.filter((b) => b.grid && brickIsWall(b)).map((b) => b.grid!.char))
}

/** Does this box overlap a wall cell? */
function hitsWall(design: LevelDesign, walls: Set<string>, box: StageBounds): boolean {
  const layer = design.tiles
  if (!layer || walls.size === 0) return false
  const eps = 1e-6
  const c0 = Math.max(0, Math.floor((box.left - design.bounds.left + eps) / TILE_SIZE))
  const c1 = Math.min(layer.cols - 1, Math.ceil((box.right - design.bounds.left - eps) / TILE_SIZE) - 1)
  const r0 = Math.max(0, Math.floor((box.bottom - design.bounds.bottom + eps) / TILE_SIZE))
  const r1 = Math.min(layer.rows - 1, Math.ceil((box.top - design.bounds.bottom - eps) / TILE_SIZE) - 1)
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) if (walls.has(tileCharAt(layer, col, row))) return true
  }
  return false
}

/**
 * Which way the track goes at (x, y): up, right, down or left, or a diagonal where the road turns. It reads the Racing
 * engine's own numbering of the road (computeRaceLoop: how far round the lap each road cell is) near the nearest road
 * cell, and points from the road a little behind to the road a little ahead, so a car at the edge of the road, or on the
 * grass beside it, still faces along it. Undefined when laps can't count yet (no finish line, no loop) or no road is
 * near.
 */
export function trackFacing(design: LevelDesign, x: number, y: number): number | undefined {
  return facingOn(computeRaceLoop(design.tiles, design.bricks), design.bounds, x, y)
}

/** How far to look for the road, and how far behind and ahead of it (in cells round the lap) to aim. */
const NEAR_ROAD = 6
const AROUND = 7
const ALONG_MIN = 2
const ALONG_MAX = 7

function facingOn(loop: RaceLoop, bounds: StageBounds, x: number, y: number): number | undefined {
  if (!loop.ok) return undefined
  const col = Math.floor((x - bounds.left) / TILE_SIZE), row = Math.floor((y - bounds.bottom) / TILE_SIZE)
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= loop.cols || r >= loop.rows ? -1 : loop.dist[r * loop.cols + c])
  let near: [number, number, number] | undefined
  for (let ring = 0; ring <= NEAR_ROAD && !near; ring++) {
    for (let r = row - ring; r <= row + ring && !near; r++) {
      for (let c = col - ring; c <= col + ring; c++) {
        if (Math.max(Math.abs(r - row), Math.abs(c - col)) !== ring || at(c, r) <= 0) continue
        near = [c, r, at(c, r)]
        break
      }
    }
  }
  if (!near) return undefined
  const [nc, nr, d] = near
  let ax = 0, ay = 0, an = 0, bx = 0, by = 0, bn = 0
  for (let r = nr - AROUND; r <= nr + AROUND; r++) {
    for (let c = nc - AROUND; c <= nc + AROUND; c++) {
      const t = at(c, r)
      if (t <= 0) continue
      const ahead = (t - d + loop.length) % loop.length
      if (ahead >= ALONG_MIN && ahead <= ALONG_MAX) { ax += c; ay += r; an++ }
      else if (ahead >= loop.length - ALONG_MAX && ahead <= loop.length - ALONG_MIN) { bx += c; by += r; bn++ }
    }
  }
  if (!an || !bn) return undefined
  const dx = ax / an - bx / bn, dy = ay / an - by / bn
  if (dx === 0 && dy === 0) return undefined
  // Scratch directions: 0 is up and 90 is right (rows count up, like y).
  const direction = atan2Deg(dx, dy)
  // Square to the road unless it really turns: within 30 of a straight way is that way, else the nearest 45.
  const square = Math.round(direction / 90) * 90
  const rounded = Math.abs(direction - square) <= 30 ? square : Math.round(direction / 45) * 45
  // Scratch directions run from -179 to 180.
  const wrapped = ((rounded % 360) + 360) % 360
  return wrapped > 180 ? wrapped - 360 : wrapped
}

/** Spots around (x, y), nearest first, `step` apart (half a cell when there is no grid), out to about 6 cells. */
function* nearby(x: number, y: number, step: number): Generator<[number, number]> {
  const s = step > 0 ? step : TILE_SIZE / 2
  const reach = Math.ceil((6 * TILE_SIZE) / s)
  const spots: Array<[number, number, number]> = []
  for (let j = -reach; j <= reach; j++) {
    for (let i = -reach; i <= reach; i++) spots.push([x + i * s, y + j * s, i * i + j * j])
  }
  spots.sort((a, b) => a[2] - b[2])
  for (const [sx, sy] of spots) yield [sx, sy]
}

/**
 * Where a brick lands and which way it faces. Like landingSpot, and in a race level a car is moved to the nearest spot
 * clear of Barriers (it stays put if there is none nearby) and gets the direction along the track there. `direction` is
 * only set for race cars.
 */
export function landingPose(design: LevelDesign, pose: Pose, x: number, y: number, step = 0): { x: number; y: number; direction?: number } {
  const at = landingSpot(design, pose, x, y, step)
  if (!isRaceCarBrick(design, pose.brickId)) return at
  const walls = wallChars(design)
  const loop = computeRaceLoop(design.tiles, design.bricks)
  const facing = (px: number, py: number) => facingOn(loop, design.bounds, px, py) ?? pose.direction ?? 90
  for (const [sx, sy] of nearby(at.x, at.y, step)) {
    const spot = clampToLevel(design, pose, sx, sy, step)
    const direction = facing(spot.x, spot.y)
    const box = copyBox(design, { ...pose, direction }, spot.x, spot.y)
    if (!box || !hitsWall(design, walls, box)) return { ...spot, direction }
  }
  return { ...at, direction: facing(at.x, at.y) }
}
