/**
 * Hackable 3D spike (docs/qa/hackable-3d/SPIKE.md): deterministic 3D physics inside the Hackable core.
 *
 * The 2D Platformer's rules (core/platformer.ts), with a third axis:
 * - every solid is an axis-aligned box on the stud grid; movement is swept one axis at a time (x, z, then y), and a
 *   face blocks you only if you were on its near side before the move, so nothing tunnels and a body that starts inside
 *   a solid can walk out;
 * - plain build bricks (the classic builder's bricks, no code) are scenery: boxes indexed ONCE per build in a uniform
 *   grid and shared by every copy of the world, so a rewind never copies them;
 * - coded bricks are ordinary targets with a `z` and a `body3`; they are solid, bump and move by their own blocks;
 * - the Hero is the classic 3D character (src/brick/characterController.ts) ported to + − × ÷, sqrt and
 *   core/detmath.ts, at the classic's own 60 Hz (two substeps per core tick), with autostep and snap to ground in place
 *   of Rapier's character controller. Its numbers come from the Hero's sliders (walk, run, jump, gravity, air jumps).
 *
 * No Math.sin/cos/atan2/exp/hypot anywhere: ECMAScript lets engines approximate those, and lockstep needs every
 * browser to agree to the last bit.
 */
import type { PrimitiveCtx, PrimitiveTable, RuntimeApi, Target } from '../core/contracts'
import { atan2Deg, exp, sinCosDeg } from '../core/detmath'
import { toNumber } from '../core/values'
import { BRICK_PART_MAP } from '../../../../packages/brick-core/src/parts'
import {
  GRID, PLATE, STUD, SUB_DT, SUBSTEPS, isTarget3,
  type Body3, type BrickDef3, type Bump3, type Character3, type LevelDesign3, type SceneryBrick, type Side3, type Target3, type World3,
} from './contracts3d'

// ------------------------------------------------------------------------------------------------ the classic character's numbers

/** src/brick/characterController.ts, unchanged. The sliders' defaults. */
export const CHARACTER_DEFAULTS = { walk: 3.5, run: 5.4, jump: 5.25, gravity: 16, airJumps: 1 }
const MAX_FALL = 12
const JUMP_BUFFER = 0.15
const COYOTE = 0.12
const JUMP_GROUND_IGNORE = 0.08
const RELIABLE_LANDING_AIR_TIME = 0.05
const GROUND_STICK = -0.35
const MOVE_EPSILON = 1e-5
/** Rapier's autostep and snap distances in the classic (CHARACTER_AUTOSTEP_HEIGHT, CHARACTER_GROUND_SNAP). */
export const AUTOSTEP = 0.22
const SNAP = 0.13
/** The classic capsule (radius 0.18, half height 0.18) as a box. */
export const HERO_SIZE = { w: 0.36, h: 0.72, d: 0.36 }
/** Falling this far below the plate puts the Hero back where it started. */
const FALL_LIMIT = -12

/** exp(-rate × dt) for the classic's damping rates, worked out once with detmath (the same bits everywhere). */
const K_GROUND = exp(-11 * SUB_DT)
const K_AIR = exp(-4.5 * SUB_DT)
const K_BRAKE = exp(-15 * SUB_DT)
const FACING_ALPHA = 1 - exp(-14 * SUB_DT)

/** Faces closer than this count as touching, not overlapping (positions are sums of non-integers like 0.62). */
const EPS = 1e-9

// ------------------------------------------------------------------------------------------------ boxes

interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

/** A target's box: footprint centred on (x, z), standing on y. */
function boxOf(t: Target3, b: Body3): Box {
  const hw = b.w / 2
  const hd = b.d / 2
  return { x0: t.x - hw, x1: t.x + hw, y0: t.y, y1: t.y + b.h, z0: t.z - hd, z1: t.z + hd }
}

const open = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 - EPS && a1 > b0 + EPS
const overlaps = (a: Box, b: Box): boolean => open(a.x0, a.x1, b.x0, b.x1) && open(a.y0, a.y1, b.y0, b.y1) && open(a.z0, a.z1, b.z0, b.z1)

/** Quarter turns as exact integers: [cos, sin] (packages/brick-core rotateLocalPoint, without Math.cos). */
const QUARTER: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]

/** A part-local box (x across the width, z along the depth, origin at the footprint centre, y up from its bottom). */
type Local = [cx: number, cy: number, cz: number, w: number, h: number, d: number]

/**
 * A classic part's collision as boxes, in part-local units. Exact stud and plate multiples (no insets), so neighbours
 * meet face to face. Slopes become plate-high steps the Hero climbs by autostep; round parts and cones their footprint.
 */
function partBoxes(partId: string): Local[] {
  const part = BRICK_PART_MAP[partId]
  if (!part) return []
  const W = part.width * STUD
  const D = part.depth * STUD
  const H = part.height * PLATE
  switch (part.kind) {
    case 'corner':
      return [[-(W - STUD) / 2, 0, 0, STUD, H, D], [0, 0, -(D - STUD) / 2, W, H, STUD]]
    case 'door': {
      const m = 0.16
      return [[0, 0, -(D - m) / 2, W, H, m], [0, 0, (D - m) / 2, W, H, m], [0, H - m, 0, W, m, D]]
    }
    case 'arch': {
      const leg = 0.62
      const beam = 0.34
      return [[0, 0, -(D - leg) / 2, W, H, leg], [0, 0, (D - leg) / 2, W, H, leg], [0, H - beam, 0, W, beam, D]]
    }
    case 'stair': {
      const out: Local[] = []
      for (let s = 0; s < part.depth; s++) out.push([0, 0, (s - (part.depth - 1) / 2) * STUD, W, ((s + 1) * H) / part.depth, STUD])
      return out
    }
    case 'slope': {
      // High at +z (the classic hull): one step per plate of height.
      const steps = part.height
      const out: Local[] = []
      for (let s = 0; s < steps; s++) out.push([0, 0, -D / 2 + ((s + 0.5) * D) / steps, W, (s + 1) * PLATE, D / steps])
      return out
    }
    default:
      return [[0, 0, 0, W, H, D]]
  }
}

/** World boxes of one build brick. */
export function sceneryBoxes(brick: SceneryBrick): Box[] {
  const part = BRICK_PART_MAP[brick.partId]
  if (!part) return []
  const odd = brick.rotation % 2 === 1
  const sw = odd ? part.depth : part.width
  const sd = odd ? part.width : part.depth
  // Centre of the footprint: brickWorldPosition, with the plate's half width taken off in studs first (exact).
  const ox = (2 * brick.x + sw - GRID) * (STUD / 2)
  const oz = (2 * brick.z + sd - GRID) * (STUD / 2)
  const oy = brick.y * PLATE
  const [c, s] = QUARTER[brick.rotation & 3]
  return partBoxes(brick.partId).map(([cx, cy, cz, w, h, d]) => {
    const x = cx * c + cz * s
    const z = -cx * s + cz * c
    const hw = (odd ? d : w) / 2
    const hd = (odd ? w : d) / 2
    return { x0: ox + x - hw, x1: ox + x + hw, y0: oy + cy, y1: oy + cy + h, z0: oz + z - hd, z1: oz + z + hd }
  })
}

/** The build plate: a slab whose top is y = 0. Off its edge you fall. */
const HALF_PLATE = (GRID / 2) * STUD
const PLATE_BOX: Box = { x0: -HALF_PLATE, x1: HALF_PLATE, y0: -1, y1: 0, z0: -HALF_PLATE, z1: HALF_PLATE }

// ------------------------------------------------------------------------------------------------ indexes

interface Solid {
  box: Box
  /** A coded brick, or null for scenery and the plate. */
  target: Target3 | null
  order: number
  seen: number
}

/** Two studs per cell: a Hero's query touches 1–4 cells, a 6 × 8 plate fills 12–20. */
const CELL = STUD * 2
const cellKey = (cx: number, cz: number): number => (cx + 512) * 4096 + (cz + 512)

/** A uniform grid over x and z of boxes that don't move during the step. */
class GridIndex {
  private cells = new Map<number, Solid[]>()
  private stamp = 0
  readonly all: Solid[] = []

  add(solid: Solid): void {
    this.all.push(solid)
    const { box } = solid
    const cx0 = Math.floor(box.x0 / CELL)
    const cx1 = Math.floor(box.x1 / CELL)
    const cz0 = Math.floor(box.z0 / CELL)
    const cz1 = Math.floor(box.z1 / CELL)
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cellKey(cx, cz)
        const list = this.cells.get(k)
        if (list) list.push(solid)
        else this.cells.set(k, [solid])
      }
    }
  }

  query(r: Box, out: Solid[], skip: Target3 | null): void {
    const stamp = ++this.stamp
    const cx0 = Math.floor(r.x0 / CELL)
    const cx1 = Math.floor(r.x1 / CELL)
    const cz0 = Math.floor(r.z0 / CELL)
    const cz1 = Math.floor(r.z1 / CELL)
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.cells.get(cellKey(cx, cz))
        if (!list) continue
        for (const s of list) {
          if (s.seen === stamp || (skip && s.target === skip)) continue
          s.seen = stamp
          if (s.box.y1 > r.y0 - EPS && s.box.y0 < r.y1 + EPS) out.push(s)
        }
      }
    }
  }
}

/**
 * The scenery's index, built the first time a build is played and kept for as long as that build (the array) lives.
 * It is derived from the project alone, so every browser builds the same one; an edit to the build replaces the array.
 */
const sceneryIndexes = new WeakMap<SceneryBrick[], GridIndex>()

export function sceneryIndex(scenery: SceneryBrick[]): GridIndex {
  let index = sceneryIndexes.get(scenery)
  if (!index) {
    index = new GridIndex()
    index.add({ box: PLATE_BOX, target: null, order: -1, seen: 0 })
    let order = 0
    for (const brick of scenery) for (const box of sceneryBoxes(brick)) index.add({ box, target: null, order: order++, seen: 0 })
    sceneryIndexes.set(scenery, index)
  }
  return index
}

/** Coded solids for one physics step: a short list, or a grid when there are many (every brick a target). */
class TargetSolids {
  private list: Solid[] = []
  private grid: GridIndex | null = null
  private moving: Solid[] = []

  constructor(world: World3) {
    const targets = world.targets
    const fixed: Solid[] = []
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      const b = t.body3
      if (!b?.solid || !t.visible || !isTarget3(t)) continue
      const solid: Solid = { box: boxOf(t, b), target: t, order: i, seen: 0 }
      if (b.character || b.gravity || b.vx !== 0 || b.vy !== 0 || b.vz !== 0) this.moving.push(solid)
      else fixed.push(solid)
    }
    if (fixed.length > 64) {
      this.grid = new GridIndex()
      for (const s of fixed) this.grid.add(s)
    } else this.list = fixed
  }

  query(r: Box, out: Solid[], skip: Target3): void {
    if (this.grid) this.grid.query(r, out, skip)
    for (const s of this.list) if (s.target !== skip && s.box.y1 > r.y0 - EPS && s.box.y0 < r.y1 + EPS) out.push(s)
    for (const s of this.moving) {
      if (s.target === skip) continue
      s.box = boxOf(s.target!, s.target!.body3!)
      out.push(s)
    }
  }
}

interface Space {
  scenery: GridIndex
  targets: TargetSolids
  scratch: Solid[]
}

function near(space: Space, r: Box, mover: Target3): Solid[] {
  const out = space.scratch
  out.length = 0
  space.scenery.query(r, out, null)
  space.targets.query(r, out, mover)
  return out
}

const union = (a: Box, b: Box): Box => ({
  x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), z0: Math.min(a.z0, b.z0),
  x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), z1: Math.max(a.z1, b.z1),
})

// ------------------------------------------------------------------------------------------------ sweeps

type Axis = 'x' | 'y' | 'z'
interface Hit { solid: Solid; side: Side3 }

const SIDE: Record<Axis, [neg: Side3, pos: Side3]> = {
  // Moving +x you hit the other's left face, −x its right face; +y its bottom, −y its top; +z its back, −z its front.
  x: ['right', 'left'],
  y: ['top', 'bottom'],
  z: ['front', 'back'],
}

/**
 * Move along one axis by `delta`, stopping flush against the nearest face in the way. Ties go to the earliest solid
 * (scenery before coded bricks, then world order), so every engine picks the same one.
 */
function sweep(space: Space, t: Target3, b: Body3, axis: Axis, delta: number): Hit | null {
  if (delta === 0) return null
  const old = boxOf(t, b)
  t[axis] += delta
  const now = boxOf(t, b)
  const lo = axis === 'x' ? 'x0' : axis === 'y' ? 'y0' : 'z0'
  const hi = axis === 'x' ? 'x1' : axis === 'y' ? 'y1' : 'z1'
  let best: Solid | null = null
  let edge = 0
  for (const s of near(space, union(old, now), t)) {
    const sb = s.box
    if (axis !== 'x' && !open(now.x0, now.x1, sb.x0, sb.x1)) continue
    if (axis !== 'y' && !open(now.y0, now.y1, sb.y0, sb.y1)) continue
    if (axis !== 'z' && !open(now.z0, now.z1, sb.z0, sb.z1)) continue
    if (delta > 0) {
      if (old[hi] <= sb[lo] + EPS && now[hi] > sb[lo] + EPS && (!best || sb[lo] < edge || (sb[lo] === edge && s.order < best.order))) { best = s; edge = sb[lo] }
    } else if (old[lo] >= sb[hi] - EPS && now[lo] < sb[hi] - EPS && (!best || sb[hi] > edge || (sb[hi] === edge && s.order < best.order))) { best = s; edge = sb[hi] }
  }
  if (!best) return null
  t[axis] += edge - (delta > 0 ? now[hi] : now[lo])
  return { solid: best, side: SIDE[axis][delta > 0 ? 1 : 0] }
}

function isFree(space: Space, t: Target3, b: Body3): boolean {
  const box = boxOf(t, b)
  for (const s of near(space, box, t)) if (overlaps(box, s.box)) return false
  return true
}

/**
 * A horizontal move with the classic's autostep: blocked by a ledge no higher than AUTOSTEP while on the ground, try
 * the same move from on top of it, and keep whichever got further.
 */
function walk(space: Space, t: Target3, b: Body3, axis: 'x' | 'z', delta: number, canStep: boolean, hits: Hit[]): void {
  const fromA = t[axis]
  const fromY = t.y
  const hit = sweep(space, t, b, axis, delta)
  if (!hit) return
  const rise = hit.solid.box.y1 - fromY
  if (canStep && rise > EPS && rise <= AUTOSTEP) {
    const blockedAt = t[axis]
    t[axis] = fromA
    t.y = fromY + rise
    if (isFree(space, t, b)) {
      const second = sweep(space, t, b, axis, delta)
      if (Math.abs(t[axis] - fromA) > Math.abs(blockedAt - fromA)) {
        if (second) hits.push(second)
        return
      }
    }
    t[axis] = blockedAt
    t.y = fromY
  }
  hits.push(hit)
}

// ------------------------------------------------------------------------------------------------ the character

/** The Hero's sliders: its variables by name (a brick's ids, looked up once per brick). */
const sliderIds = new WeakMap<BrickDef3, Record<string, string>>()

function sliders(world: World3, t: Target3) {
  const brick = world.bricks[t.brickId] as BrickDef3
  let ids = brick ? sliderIds.get(brick) : undefined
  if (brick && !ids) {
    ids = {}
    for (const v of brick.program.variables) ids[v.name] = v.id
    sliderIds.set(brick, ids)
  }
  const read = (name: string, fallback: number): number => {
    const id = ids?.[name]
    const n = id === undefined ? NaN : toNumber(t.variables[id])
    return Number.isFinite(n) ? n : fallback
  }
  return {
    walk: read('walk speed', CHARACTER_DEFAULTS.walk),
    run: read('run speed', CHARACTER_DEFAULTS.run),
    jump: read('jump speed', CHARACTER_DEFAULTS.jump),
    gravity: read('gravity', CHARACTER_DEFAULTS.gravity),
    airJumps: Math.max(0, Math.floor(read('air jumps', CHARACTER_DEFAULTS.airJumps))),
  }
}

export function newCharacter(): Character3 {
  return { velocityX: 0, velocityZ: 0, facing: 180, grounded: false, coyote: 0, jumpBuffer: 0, airJumps: CHARACTER_DEFAULTS.airJumps, groundIgnore: 0, airborne: 0, jumpWasDown: false }
}

/** The keys a target hears: its player's in a room, otherwise every key that is down (core/sensing.ts). */
function keysOf(world: World3, t: Target3): { has(key: string): boolean } {
  if (t.player === undefined || !world.players) return world.keysDown
  const keys = world.players.find((p) => p.num === t.player)?.keys ?? []
  return { has: (k: string) => keys.includes(k) }
}

function yawOf(world: World3, t: Target3): number {
  if (t.player !== undefined && world.players) return world.players.find((p) => p.num === t.player)?.yaw ?? 0
  return world.yaw3d ?? 0
}

const shortest = (from: number, to: number): number => (((to - from + 180) % 360) + 360) % 360 - 180

/**
 * One 60 Hz step of the classic character's intent (stepCharacterMotion), returning the desired move. Keys move the
 * Hero relative to its player's camera yaw: arrows or WASD, Space jumps, X runs.
 */
function characterIntent(world: World3, t: Target3, b: Body3, c: Character3, observedGrounded: boolean): { dx: number; dy: number; dz: number; jumped: boolean } {
  const s = sliders(world, t)
  const keys = keysOf(world, t)
  const jumpDown = keys.has('space')
  if (jumpDown && !c.jumpWasDown) c.jumpBuffer = JUMP_BUFFER
  c.jumpWasDown = jumpDown

  c.groundIgnore = Math.max(0, c.groundIgnore - SUB_DT)
  const reliable = observedGrounded && c.groundIgnore === 0 && b.vy <= 0
  if (reliable) {
    if (!c.grounded && c.airborne >= RELIABLE_LANDING_AIR_TIME) c.airJumps = s.airJumps
    c.grounded = true
    c.airborne = 0
    c.coyote = COYOTE
    b.vy = GROUND_STICK
  } else {
    c.grounded = false
    c.airborne += SUB_DT
    c.coyote = Math.max(0, c.coyote - SUB_DT)
  }

  let jumped = false
  if (c.jumpBuffer > 0 && (c.grounded || c.coyote > 0 || c.airJumps > 0)) {
    if (!c.grounded && c.coyote <= 0) c.airJumps -= 1
    jumped = true
    b.vy = s.jump
    c.grounded = false
    c.coyote = 0
    c.jumpBuffer = 0
    c.groundIgnore = JUMP_GROUND_IGNORE
    c.airborne = 0
  } else {
    c.jumpBuffer = Math.max(0, c.jumpBuffer - SUB_DT)
    if (!c.grounded) b.vy = Math.max(-MAX_FALL, b.vy - s.gravity * SUB_DT)
  }

  const right = (keys.has('right arrow') || keys.has('d') ? 1 : 0) - (keys.has('left arrow') || keys.has('a') ? 1 : 0)
  const fwd = (keys.has('up arrow') || keys.has('w') ? 1 : 0) - (keys.has('down arrow') || keys.has('s') ? 1 : 0)
  // Camera yaw 0 looks along −z: forward (−sin, −cos), right (cos, −sin).
  const [sy, cy] = sinCosDeg(yawOf(world, t))
  const wx = right * cy - fwd * sy
  const wz = -right * sy - fwd * cy
  const mag = Math.sqrt(wx * wx + wz * wz)
  const scale = mag > 1 ? 1 / mag : 1
  const max = keys.has('x') ? s.run : s.walk
  const hasInput = mag > MOVE_EPSILON
  const k = hasInput ? (c.grounded ? K_GROUND : K_AIR) : K_BRAKE
  c.velocityX = wx * scale * max + (c.velocityX - wx * scale * max) * k
  c.velocityZ = wz * scale * max + (c.velocityZ - wz * scale * max) * k
  if (hasInput) c.facing += shortest(c.facing, atan2Deg(wx, wz)) * FACING_ALPHA
  return { dx: c.velocityX * SUB_DT, dy: b.vy * SUB_DT, dz: c.velocityZ * SUB_DT, jumped }
}

// ------------------------------------------------------------------------------------------------ the physics step

interface Spawn { x: number; y: number; z: number }

/** Where a Hero goes back to when it falls off the plate: its placement in the project (players: theirs). */
function spawnOf(world: World3, t: Target3): Spawn {
  const design = world.design as LevelDesign3 | undefined
  const placement = design?.copies.find((c) => c.id === t.copyId) ?? design?.copies.find((c) => c.brickId === t.brickId)
  return placement ? { x: placement.x, y: placement.y, z: placement.z } : { x: 0, y: 1, z: 0 }
}

function moves(t: Target3): boolean {
  const b = t.body3
  return !!b && t.visible && (!!b.character || b.gravity || b.vx !== 0 || b.vy !== 0 || b.vz !== 0)
}

/** One substep for one body. Returns its hits on coded bricks. */
function stepBody(world: World3, space: Space, t: Target3, b: Body3, hits: Hit[]): void {
  const c = b.character
  const wasGrounded = b.onGround
  let dx: number, dy: number, dz: number
  let jumped = false
  if (c) ({ dx, dy, dz, jumped } = characterIntent(world, t, b, c, b.onGround))
  else {
    if (b.gravity) b.vy = Math.max(-MAX_FALL, b.vy - CHARACTER_DEFAULTS.gravity * SUB_DT)
    dx = b.vx * SUB_DT
    dy = b.vy * SUB_DT
    dz = b.vz * SUB_DT
  }
  b.onGround = false
  const canStep = !!c && wasGrounded && !jumped
  const local: Hit[] = []
  walk(space, t, b, 'x', dx, canStep, local)
  walk(space, t, b, 'z', dz, canStep, local)
  const yHit = sweep(space, t, b, 'y', dy)
  if (yHit) {
    local.push(yHit)
    if (dy < 0) b.onGround = true
    // A character keeps its fall speed for one substep: its controller turns a reliable landing into the ground stick.
    if (!c || dy > 0) b.vy = 0
  } else if (c && wasGrounded && !jumped && b.vy <= 0) {
    // Snap to ground: walking off a plate-high ledge keeps the Hero on the ground, as Rapier's snap did.
    const fromY = t.y
    const snap = sweep(space, t, b, 'y', -SNAP)
    if (snap) { b.onGround = true; local.push(snap) } else t.y = fromY
  }
  for (const h of local) if (h.solid.target) hits.push(h)
  if (t.y < FALL_LIMIT) {
    const at = spawnOf(world, t)
    t.x = at.x; t.y = at.y; t.z = at.z
    b.vy = 0; b.vx = 0; b.vz = 0
    if (c) { c.velocityX = 0; c.velocityZ = 0 }
  }
}

const OPPOSITE: Record<Side3, Side3> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left', front: 'back', back: 'front' }

/**
 * The 3D physics step (afterTick, after the scripts): every moving body in world order, two 60 Hz substeps each, then
 * bump hats on both sides (the mover hears the side of the brick it hit, the brick the side of the mover, as in 2D),
 * then landing and leaving hats.
 */
export function physicsStep3d(runtime: RuntimeApi): void {
  const world = runtime.world as World3
  const design = world.design as LevelDesign3 | undefined
  const movers: Target3[] = []
  for (const t of world.targets) if (isTarget3(t) && moves(t)) movers.push(t)
  const bumps: Bump3[] = []
  const seen = new Set<string>()
  const ground: { t: Target3; was: boolean }[] = []
  if (movers.length > 0) {
    const space: Space = { scenery: sceneryIndex(design?.sceneryAsTargets ? EMPTY : design?.scenery3d ?? EMPTY), targets: new TargetSolids(world), scratch: [] }
    for (const t of movers) {
      const b = t.body3!
      ground.push({ t, was: b.onGround })
      const hits: Hit[] = []
      const fromX = t.x, fromY = t.y, fromZ = t.z
      for (let i = 0; i < SUBSTEPS; i++) stepBody(world, space, t, b, hits)
      for (const h of hits) {
        const other = h.solid.target!
        const k = `${t.id}|${h.side}|${other.id}`
        if (seen.has(k)) continue
        seen.add(k)
        bumps.push({ moverId: t.id, otherId: other.id, side: h.side })
      }
      if (t.x !== fromX || t.y !== fromY || t.z !== fromZ) runtime.requestRedraw()
    }
  }
  if (bumps.length > 0) world.bumps3d = bumps
  else delete world.bumps3d
  const byId = new Map<string, Target3>()
  if (bumps.length > 0) for (const t of world.targets) byId.set(t.id, t as Target3)
  for (const bump of bumps) {
    const mover = byId.get(bump.moverId)!
    const other = byId.get(bump.otherId)!
    startBumpHats(runtime, mover, bump.side, other)
    startBumpHats(runtime, other, OPPOSITE[bump.side], mover)
  }
  for (const { t, was } of ground) {
    const now = t.body3!.onGround
    if (now && !was) runtime.startHats('platformer_whenland', { target: t })
    else if (was && !now) runtime.startHats('platformer_whenleaveground', { target: t })
  }
}

const EMPTY: SceneryBrick[] = []

function startBumpHats(runtime: RuntimeApi, target: Target, side: Side3, other: Target): void {
  const name = runtime.world.bricks[other.brickId]?.name
  const bricks = ['_any_']
  if (name && name !== '_any_') bricks.push(name)
  for (const SIDE of ['_any_', side]) for (const BRICK of bricks) runtime.startHats('platformer_whenbump', { target, fields: { SIDE, BRICK } })
}

// ------------------------------------------------------------------------------------------------ the 3D blocks

/** A 3D target's body, made on first use like the Platformer's. */
function body3Of(t: Target): Body3 | null {
  if (t.isStage || !isTarget3(t)) return null
  if (!t.body3) t.body3 = { w: 1, h: 1, d: 1, solid: false, gravity: false, vx: 0, vy: 0, vz: 0, onGround: false }
  return t.body3
}

const axis3 = (ctx: PrimitiveCtx): Axis => (ctx.field('AXIS') === 'y' ? 'y' : ctx.field('AXIS') === 'z' ? 'z' : 'x')

/** Speeds a script gives a character go where its controller reads them; an upward one launches it off the ground. */
function setVelocity(b: Body3, axis: Axis, v: number): void {
  const c = b.character
  if (axis === 'y') {
    b.vy = v
    if (c && v > 0) { c.grounded = false; c.coyote = 0; c.groundIgnore = JUMP_GROUND_IGNORE; c.airborne = 0; b.onGround = false }
  } else if (c) {
    if (axis === 'x') c.velocityX = v
    else c.velocityZ = v
  } else if (axis === 'x') b.vx = v
  else b.vz = v
}

function speed(ctx: PrimitiveCtx, relative: boolean): void {
  const t = ctx.target
  const b = body3Of(t)
  const n = toNumber(ctx.arg('SPEED'))
  if (!b || !Number.isFinite(n)) return
  const axis = axis3(ctx)
  const now = axis === 'y' ? b.vy : b.character ? (axis === 'x' ? b.character.velocityX : b.character.velocityZ) : axis === 'x' ? b.vx : b.vz
  setVelocity(b, axis, relative ? now + n : n)
  if (t.visible) ctx.runtime.requestRedraw()
}

function boxOfTarget(t: Target): Box | null {
  return isTarget3(t) && t.body3 ? boxOf(t, t.body3) : null
}

/**
 * The 3D kit's blocks. The Platformer's opcodes keep their meaning with a z added ("set [z] speed to"), so a kid who
 * knows the Platformer category already knows most of the 3D one; the rest are new.
 */
export const kit3dPrimitives: PrimitiveTable = {
  platformer_setspeed: (ctx) => speed(ctx, false),
  platformer_changespeed: (ctx) => speed(ctx, true),
  platformer_speed(ctx) {
    const b = isTarget3(ctx.target) ? ctx.target.body3 : undefined
    if (!b) return 0
    const axis = axis3(ctx)
    if (axis === 'y') return b.vy
    if (b.character) return axis === 'x' ? b.character.velocityX : b.character.velocityZ
    return axis === 'x' ? b.vx : b.vz
  },
  platformer_setgravity(ctx) {
    const b = body3Of(ctx.target)
    if (b) b.gravity = ctx.field('GRAVITY') !== 'off'
  },
  platformer_setsolid(ctx) {
    const b = body3Of(ctx.target)
    if (b) b.solid = ctx.field('SOLID') !== 'off'
  },
  platformer_onground: (ctx) => (isTarget3(ctx.target) && ctx.target.body3?.onGround) ?? false,
  /** go to x: () y: () z: () */
  kit3d_gotoxyz(ctx) {
    const t = ctx.target
    if (!isTarget3(t) || t.isStage) return
    const x = toNumber(ctx.arg('X'))
    const y = toNumber(ctx.arg('Y'))
    const z = toNumber(ctx.arg('Z'))
    if (Number.isFinite(x)) t.x = x
    if (Number.isFinite(y)) t.y = y
    if (Number.isFinite(z)) t.z = z
    if (t.visible) ctx.runtime.requestRedraw()
  },
  kit3d_changez(ctx) {
    const t = ctx.target
    const n = toNumber(ctx.arg('DZ'))
    if (!isTarget3(t) || t.isStage || !Number.isFinite(n)) return
    t.z += n
    if (t.visible) ctx.runtime.requestRedraw()
  },
  kit3d_zposition: (ctx) => (isTarget3(ctx.target) ? ctx.target.z : 0),
  /** launch who landed on me up at (speed): every body that hit this brick's top in the last physics step. */
  kit3d_launchlanders(ctx) {
    const n = toNumber(ctx.arg('SPEED'))
    const world = ctx.runtime.world as World3
    if (!Number.isFinite(n) || !world.bumps3d) return
    for (const bump of world.bumps3d) {
      if (bump.otherId !== ctx.target.id || bump.side !== 'top') continue
      const mover = world.targets.find((t) => t.id === bump.moverId)
      if (mover?.body3) setVelocity(mover.body3, 'y', n)
    }
  },
  /** touching (brick)?: boxes that overlap or meet (3D replaces 2D's pixel touching). */
  sensing_touchingobject(ctx) {
    const me = boxOfTarget(ctx.target)
    const arg = ctx.arg('TOUCHINGOBJECTMENU')
    const name = arg !== '' ? String(arg) : ctx.field('TOUCHINGOBJECTMENU')
    if (!me || !name) return false
    const world = ctx.runtime.world
    for (const t of world.targets) {
      if (t === ctx.target || !t.visible || world.bricks[t.brickId]?.name !== name) continue
      const o = boxOfTarget(t)
      if (o && me.x0 <= o.x1 && me.x1 >= o.x0 && me.y0 <= o.y1 && me.y1 >= o.y0 && me.z0 <= o.z1 && me.z1 >= o.z0) return true
    }
    return false
  },
}
