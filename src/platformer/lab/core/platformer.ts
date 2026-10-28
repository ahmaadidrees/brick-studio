/**
 * Platformer extension (step 3): seven blocks plus the physics step that runs in `afterTick`.
 * Exact rules: docs/qa/code-lab-core/STEP3.md. Everything here is plain arithmetic on integers-or-floats, no trig,
 * no randomness, no clock, so a replay with the same inputs lands on the same positions.
 *
 * Collision is box-based (geometry.targetBounds) and lives only here; Scratch `touching` stays pixel-based.
 * Faces that only touch are not overlapping. Movement is swept: a face blocks you when you were on its near side
 * before the move and past it after, so fast fallers never tunnel through thin platforms. A body that starts inside
 * a solid is not blocked by it (it can walk out) instead of being stuck.
 *
 * Step 7: the engine knows nothing about any particular brick. Solid targets (grid cells and ordinary copies alike) go
 * in a uniform spatial hash rebuilt every tick; `solid [on]` / `solid [only on top]` is the only thing that makes a
 * target block, and bumps are reported on both sides (the mover and the solid it hit both get `when I bump`).
 */
import { DEFAULT_PHYSICS } from './contracts'
import type { Body, PhysicsSettings, PrimitiveCtx, PrimitiveTable, RuntimeApi, StageBounds, Target, World } from './contracts'
import { targetBounds } from './geometry'
import { toNumber } from './values'

type Side = 'top' | 'bottom' | 'left' | 'right'

interface Bump {
  side: Side
  /** The solid target, or null for a level wall or the floor. */
  other: Target | null
}

// Reference numbers for brick authors (the old game's feel, converted; NOT an engine rule any more):
// the old game runs at 60 frames/s in px/frame; the Platformer runs at 30 ticks/s in steps/tick, one old pixel = one step.
//   speed (px/frame) x 2 -> steps/tick;   accel (px/frame^2) x 4 -> steps/tick^2.
//   Bounce block, landing with jump not held: 3.25 px/frame -> y speed 6.5. Held: 5.5 px/frame -> 11.
//   Bumping a bounce block from below pushes you down at 2 px/frame -> 4.
// "Jump held" is the space key or the up arrow. The Bounce brick's own script reads it with `key [space] pressed?`.

export function bodyOf(target: Target): Body {
  if (!target.body) target.body = { gravity: false, solid: false, vx: 0, vy: 0, onGround: false }
  return target.body
}

function axisOf(ctx: PrimitiveCtx): 'x' | 'y' {
  return ctx.field('AXIS') === 'y' ? 'y' : 'x'
}

function speedArg(ctx: PrimitiveCtx): number | undefined {
  const n = toNumber(ctx.arg('SPEED'))
  return Number.isFinite(n) ? n : undefined
}

function setSpeed(ctx: PrimitiveCtx, relative: boolean): void {
  if (ctx.target.isStage) return
  const n = speedArg(ctx)
  if (n === undefined) return
  const body = bodyOf(ctx.target)
  const axis = axisOf(ctx)
  const key = axis === 'x' ? 'vx' : 'vy'
  const next = relative ? body[key] + n : n
  if (Number.isFinite(next)) body[key] = next
  paceLikeMotion(ctx)
}

/**
 * Platformer blocks change how a visible brick moves, so they count as a visible change, like Scratch motion blocks:
 * a non-warp `forever { change y speed by -1 }` then runs once per tick instead of until the op budget runs out (F04).
 */
function paceLikeMotion(ctx: PrimitiveCtx): void {
  if (ctx.target.visible) ctx.runtime.requestRedraw()
}

export const platformerPrimitives: PrimitiveTable = {
  platformer_setgravity(ctx) {
    if (ctx.target.isStage) return
    bodyOf(ctx.target).gravity = ctx.field('GRAVITY') !== 'off'
    paceLikeMotion(ctx)
  },
  platformer_setsolid(ctx) {
    if (ctx.target.isStage) return
    const mode = ctx.field('SOLID')
    const body = bodyOf(ctx.target)
    body.solid = mode !== 'off'
    // `only on top` is a one-way platform: it stops a body falling onto it and lets everything else through.
    body.oneWay = mode === 'top'
    paceLikeMotion(ctx)
  },
  platformer_setspeed: (ctx) => setSpeed(ctx, false),
  platformer_changespeed: (ctx) => setSpeed(ctx, true),
  platformer_speed(ctx) {
    const body = ctx.target.body
    if (!body) return 0
    return axisOf(ctx) === 'x' ? body.vx : body.vy
  },
  platformer_onground: (ctx) => ctx.target.body?.onGround ?? false,
}

const overlapsOpen = (aLo: number, aHi: number, bLo: number, bHi: number): boolean => aLo < bHi && aHi > bLo

/** A solid target with its box, in world order (`order` breaks ties the same way every run). */
interface Solid {
  target: Target
  box: StageBounds
  oneWay: boolean
  order: number
  /** Query stamp, so a solid that spans several hash cells is considered once per query. */
  seen: number
}

const CELL = 16
/** A solid that would fill more than this many hash cells goes in a short list every query scans instead. */
const MAX_HASH_SPAN = 64
const key = (cx: number, cy: number): number => cx * 1048576 + cy

/**
 * Uniform spatial hash of the solids that do not move this tick, plus a live list of solids that do (a solid body that
 * has speed or gravity), whose box is read fresh. Rebuilt at the start of every physics step: positions change by
 * scripts between steps, so nothing is cached across ticks.
 */
class SolidIndex {
  private cells = new Map<number, Solid[]>()
  private big: Solid[] = []
  private moving: Solid[] = []
  private stamp = 0

  add(world: World, target: Target, order: number, moves: boolean): void {
    const box = targetBounds(world, target)
    if (!box) return
    const solid: Solid = { target, box, oneWay: target.body?.oneWay === true, order, seen: 0 }
    if (moves) {
      this.moving.push(solid)
      return
    }
    const cx0 = Math.floor(box.left / CELL)
    const cx1 = Math.floor(box.right / CELL)
    const cy0 = Math.floor(box.bottom / CELL)
    const cy1 = Math.floor(box.top / CELL)
    if (!Number.isFinite(cx0 + cx1 + cy0 + cy1) || (cx1 - cx0 + 1) * (cy1 - cy0 + 1) > MAX_HASH_SPAN) {
      this.big.push(solid)
      return
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = key(cx, cy)
        const list = this.cells.get(k)
        if (list) list.push(solid)
        else this.cells.set(k, [solid])
      }
    }
  }

  /** Every solid (other than `mover`) whose cells meet the region, with live boxes for the moving ones. */
  near(world: World, mover: Target, left: number, right: number, bottom: number, top: number): Solid[] {
    const out: Solid[] = []
    const stamp = ++this.stamp
    const cx0 = Math.floor(left / CELL)
    const cx1 = Math.floor(right / CELL)
    const cy0 = Math.floor(bottom / CELL)
    const cy1 = Math.floor(top / CELL)
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const list = this.cells.get(key(cx, cy))
        if (!list) continue
        for (const s of list) {
          if (s.seen === stamp || s.target === mover) continue
          s.seen = stamp
          out.push(s)
        }
      }
    }
    for (const s of this.big) if (s.target !== mover) out.push(s)
    for (const s of this.moving) {
      if (s.target === mover) continue
      const box = targetBounds(world, s.target)
      if (!box) continue
      s.box = box
      out.push(s)
    }
    return out
  }
}

function isMover(t: Target): boolean {
  const body = t.body
  return !!body && !body.selfMove && !t.isStage && t.visible && (body.gravity || body.vx !== 0 || body.vy !== 0)
}

/** A solid whose box can change during the tick: an engine mover, or a brick that moves itself. */
function movesThisTick(t: Target): boolean {
  return isMover(t) || (!!t.body?.selfMove && !t.isStage)
}

function buildIndex(world: World): SolidIndex {
  const index = new SolidIndex()
  const targets = world.targets
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    if (t.isStage || !t.visible || !t.body?.solid) continue
    index.add(world, t, i, movesThisTick(t))
  }
  return index
}

/** The best of equal-edge candidates: the one overlapping the mover most along the other axis, then world order. */
interface Stop {
  edge: number
  overlap: number
  order: number
  bump: Bump
}
const beats = (a: Stop, b: Stop | null, towardsLower: boolean): boolean => {
  if (b === null) return true
  if (a.edge !== b.edge) return towardsLower ? a.edge < b.edge : a.edge > b.edge
  if (a.overlap !== b.overlap) return a.overlap > b.overlap
  return a.order < b.order
}
const overlapLen = (aLo: number, aHi: number, bLo: number, bHi: number): number => Math.min(aHi, bHi) - Math.max(aLo, bLo)

/**
 * Move `mover` along x by `dx`, stopping flush against the first solid face (or level wall) in the way. Returns the bump
 * when stopped. Speeds are the caller's business: the engine zeroes them, a brick that moves itself decides.
 */
function sweepX(world: World, index: SolidIndex, mover: Target, dx: number, P: PhysicsSettings): Bump | null {
  const old = targetBounds(world, mover)
  if (!old || dx === 0) return null
  mover.x += dx
  const now = targetBounds(world, mover)
  if (!now) return null
  let stop: Stop | null = null
  const lo = Math.min(old.left, now.left)
  const hi = Math.max(old.right, now.right)
  for (const s of index.near(world, mover, lo, hi, now.bottom, now.top)) {
    // A one-way platform lets a body through sideways.
    if (s.oneWay) continue
    if (!overlapsOpen(now.bottom, now.top, s.box.bottom, s.box.top)) continue
    const overlap = overlapLen(now.bottom, now.top, s.box.bottom, s.box.top)
    let cand: Stop | null = null
    if (dx > 0 && old.right <= s.box.left && now.right > s.box.left) cand = { edge: s.box.left, overlap, order: s.order, bump: { side: 'left', other: s.target } }
    if (dx < 0 && old.left >= s.box.right && now.left < s.box.right) cand = { edge: s.box.right, overlap, order: s.order, bump: { side: 'right', other: s.target } }
    if (cand && beats(cand, stop, dx > 0)) stop = cand
  }
  const b = world.bounds
  const wall = (edge: number, side: Side): void => {
    const cand: Stop = { edge, overlap: Infinity, order: -1, bump: { side, other: null } }
    if (beats(cand, stop, dx > 0)) stop = cand
  }
  if (dx > 0 && P.walls.right && now.right > b.right) wall(b.right, 'left')
  if (dx < 0 && P.walls.left && now.left < b.left) wall(b.left, 'right')
  if (!stop) return null
  const hit: Stop = stop
  mover.x += hit.edge - (dx > 0 ? now.right : now.left)
  return hit.bump
}

/** The engine's x move: by vx, and a stop zeroes vx. */
function moveX(world: World, index: SolidIndex, mover: Target, body: Body, P: PhysicsSettings): Bump | null {
  const bump = sweepX(world, index, mover, body.vx, P)
  if (bump) body.vx = 0
  return bump
}

/** Move `mover` along y by `dy` (y up), stopping flush against the first solid face, one-way top or the floor. */
function sweepY(world: World, index: SolidIndex, mover: Target, dy: number, P: PhysicsSettings): Bump | null {
  const old = targetBounds(world, mover)
  if (!old || dy === 0) return null
  mover.y += dy
  const now = targetBounds(world, mover)
  if (!now) return null
  let stop: Stop | null = null
  const lo = Math.min(old.bottom, now.bottom)
  const hi = Math.max(old.top, now.top)
  for (const s of index.near(world, mover, now.left, now.right, lo, hi)) {
    if (!overlapsOpen(now.left, now.right, s.box.left, s.box.right)) continue
    const overlap = overlapLen(now.left, now.right, s.box.left, s.box.right)
    let cand: Stop | null = null
    if (dy < 0 && old.bottom >= s.box.top && now.bottom < s.box.top) cand = { edge: s.box.top, overlap, order: s.order, bump: { side: 'top', other: s.target } }
    // A one-way platform only stops a body falling onto its top, from above.
    else if (dy > 0 && !s.oneWay && old.top <= s.box.bottom && now.top > s.box.bottom) cand = { edge: s.box.bottom, overlap, order: s.order, bump: { side: 'bottom', other: s.target } }
    if (cand && beats(cand, stop, dy < 0)) stop = cand
  }
  if (dy < 0 && P.walls.bottom && now.bottom < world.bounds.bottom) {
    const cand: Stop = { edge: world.bounds.bottom, overlap: Infinity, order: -1, bump: { side: 'top', other: null } }
    if (beats(cand, stop, false)) stop = cand
  }
  if (!stop) return null
  const hit: Stop = stop
  mover.y += hit.edge - (dy < 0 ? now.bottom : now.top)
  return hit.bump
}

/** The engine's y move: by vy; a stop zeroes vy, and landing (stopped moving down) sets onGround. */
function moveY(world: World, index: SolidIndex, mover: Target, body: Body, P: PhysicsSettings): Bump | null {
  const dy = body.vy
  const bump = sweepY(world, index, mover, dy, P)
  if (bump) {
    body.vy = 0
    if (dy < 0) body.onGround = true
  }
  return bump
}

/**
 * One physics tick for every mover (runs in `afterTick`, after the script sweeps). Order: gravity, move x, move y,
 * then start bump hats (which run during the next tick's sweeps). Bumps that self-moving bricks reported with "tell
 * what I hit" this tick start first, in the order they were told. Landing and leaving hats start last.
 */
export function physicsStep(runtime: RuntimeApi): void {
  const world = runtime.world
  const P = world.physics ?? DEFAULT_PHYSICS
  const told = toldBumps.get(runtime) ?? []
  toldBumps.delete(runtime)
  frameIndex.delete(world)
  const movers: Target[] = []
  for (const t of world.targets) if (isMover(t)) movers.push(t)
  // Snapshot the list: bump hats start later, but nothing here adds or removes targets.
  const bumps: { mover: Target; bump: Bump }[] = [...told]
  const grounded: { mover: Target; was: boolean }[] = []
  if (movers.length > 0) {
    const index = buildIndex(world)
    for (const mover of movers) {
      const body = mover.body as Body
      if (body.gravity) body.vy = Math.max(body.vy - P.gravity, -P.maxFall)
      grounded.push({ mover, was: body.onGround })
      body.onGround = false
      const fromX = mover.x
      const fromY = mover.y
      const seen = new Set<string>()
      for (const bump of [moveX(world, index, mover, body, P), moveY(world, index, mover, body, P)]) {
        if (!bump) continue
        const k = `${bump.side}|${bump.other ? bump.other.id : 'edge'}`
        if (seen.has(k)) continue
        seen.add(k)
        bumps.push({ mover, bump })
      }
      if (mover.x !== fromX || mover.y !== fromY) runtime.requestRedraw()
    }
  }
  for (const { mover, bump } of bumps) startBumpHats(runtime, mover, bump)
  for (const { mover, was } of grounded) groundHats(runtime, mover, was)
  // Bricks that move themselves set "on ground?" with their own blocks; compare with the end of the last tick.
  for (const t of world.targets) {
    if (!t.body?.selfMove || t.isStage) continue
    groundHats(runtime, t, selfGround.get(t) ?? false)
    selfGround.set(t, t.body.onGround)
  }
}

function groundHats(runtime: RuntimeApi, mover: Target, was: boolean): void {
  const now = (mover.body as Body).onGround
  if (now && !was) runtime.startHats('platformer_whenland', { target: mover })
  else if (was && !now) runtime.startHats('platformer_whenleaveground', { target: mover })
}

/** Runtimes between a green flag and a stop: only they run "every tick" scripts. */
const ticking = new WeakSet<RuntimeApi>()
export const everyTickLifecycle = {
  /** The first tick's "every tick" threads start right behind the green flag's, like a forever loop under the flag. */
  afterGreenFlag: (runtime: RuntimeApi) => { ticking.add(runtime); runtime.startHats('platformer_everytick') },
  stopAll: (runtime: RuntimeApi) => { ticking.delete(runtime) },
  /**
   * Queue next tick's "every tick" scripts. This runs in `afterTick` BEFORE the physics step, so these threads sweep
   * ahead of the bump and landing hats the physics step starts: a script sees a bump on the tick after it happened, the
   * way a forever loop does. A script still running from the last tick (it waited) is not started again.
   */
  afterTick: (runtime: RuntimeApi) => { if (ticking.has(runtime)) runtime.startHats('platformer_everytick') },
}

// ------------------------------------------------------------------------------------------------ bricks that move themselves

/** What each self-moving brick's last "move … until I hit something" stopped at (null: nothing in the way). */
const lastHit = new WeakMap<Target, Bump | null>()
/** Bumps told this tick, started by the next physics step so they run next tick, like the engine's own. */
const toldBumps = new WeakMap<RuntimeApi, { mover: Target; bump: Bump }[]>()
/** "on ground?" of each self-moving brick at the end of the last tick, for the landing and leaving hats. */
const selfGround = new WeakMap<Target, boolean>()
/**
 * The solids, indexed once per tick the first time a brick moves itself (the engine rebuilds its own in the physics
 * step). Solids that move this tick are read live, as in the engine; one that a script moves without speeds (go to,
 * change y) is seen where it was when the index was built.
 */
const frameIndex = new WeakMap<World, SolidIndex>()

function indexFor(world: World): SolidIndex {
  let index = frameIndex.get(world)
  if (!index) {
    index = buildIndex(world)
    frameIndex.set(world, index)
  }
  return index
}

function moveSelf(ctx: PrimitiveCtx): void {
  const t = ctx.target
  if (t.isStage) return
  const n = toNumber(ctx.arg('DISTANCE'))
  if (!Number.isFinite(n)) return
  const world = ctx.runtime.world
  const P = world.physics ?? DEFAULT_PHYSICS
  const fromX = t.x
  const fromY = t.y
  const bump = axisOf(ctx) === 'x' ? sweepX(world, indexFor(world), t, n, P) : sweepY(world, indexFor(world), t, n, P)
  lastHit.set(t, bump)
  if (t.x !== fromX || t.y !== fromY) ctx.runtime.requestRedraw()
}

function tellHit(ctx: PrimitiveCtx): void {
  const bump = lastHit.get(ctx.target)
  if (!bump) return
  const list = toldBumps.get(ctx.runtime) ?? []
  // Like the engine, one bump per side and thing per tick.
  const k = `${bump.side}|${bump.other ? bump.other.id : 'edge'}`
  if (list.some((b) => b.mover === ctx.target && `${b.bump.side}|${b.bump.other ? b.bump.other.id : 'edge'}` === k)) return
  list.push({ mover: ctx.target, bump })
  toldBumps.set(ctx.runtime, list)
}

export const selfMovePrimitives: PrimitiveTable = {
  platformer_setmover(ctx) {
    if (ctx.target.isStage) return
    const body = bodyOf(ctx.target)
    body.selfMove = ctx.field('MOVER') === 'self'
    selfGround.set(ctx.target, body.onGround)
    paceLikeMotion(ctx)
  },
  platformer_moveuntilhit: moveSelf,
  platformer_hitsomething: (ctx) => !!lastHit.get(ctx.target),
  platformer_tellhit: tellHit,
  platformer_setonground(ctx) {
    if (ctx.target.isStage) return
    bodyOf(ctx.target).onGround = ctx.field('ONGROUND') !== 'no'
  },
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

/** Both sides hear about a bump: the mover (side of the thing it hit) and the thing it hit (side of the mover). */
function startBumpHats(runtime: RuntimeApi, mover: Target, bump: Bump): void {
  startHatsFor(runtime, mover, bump.side, bump.other === null ? '_edge_' : brickNameOf(runtime, bump.other))
  if (bump.other) startHatsFor(runtime, bump.other, OPPOSITE[bump.side], brickNameOf(runtime, mover))
}

function brickNameOf(runtime: RuntimeApi, t: Target): string | undefined {
  const name = runtime.world.bricks[t.brickId]?.name
  return name === '_any_' || name === '_edge_' ? undefined : name
}

/** The runtime matches hat fields by equality, so start the hats once per (side or any) x (brick, edge or any). */
function startHatsFor(runtime: RuntimeApi, target: Target, side: Side, brick: string | undefined): void {
  const bricks = ['_any_']
  if (brick !== undefined && brick !== '_any_') bricks.push(brick)
  for (const SIDE of ['_any_', side]) {
    for (const BRICK of bricks) runtime.startHats('platformer_whenbump', { target, fields: { SIDE, BRICK } })
  }
}
