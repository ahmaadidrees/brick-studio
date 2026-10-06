/**
 * Platformer extension (step 3): seven blocks plus the physics step that runs in `afterTick`.
 * Exact rules: docs/qa/code-lab-core/STEP3.md. Everything here is plain arithmetic on integers-or-floats, no trig,
 * no randomness, no clock, so a replay with the same inputs lands on the same positions.
 *
 * Collision is box-based (geometry.targetBounds) and lives only here; Scratch `touching` stays pixel-based.
 * Faces that only touch are not overlapping. Movement is swept: a face blocks you when you were on its near side
 * before the move and past it after, so fast fallers never tunnel through thin platforms. A body that starts inside
 * a solid is not blocked by it (it can walk out) instead of being stuck. Tiles follow the same rule: only a tile's
 * outer faces block (a face shared by two solid tiles is inside the wall), so a body embedded in tiles can walk out.
 */
import { DEFAULT_PHYSICS, SOLID_TILES, TILE_CHAR, TILE_SIZE } from './contracts'
import type { Body, TileKind, TileLayer, PhysicsSettings, PrimitiveCtx, PrimitiveTable, RuntimeApi, StageBounds, Target, World } from './contracts'
import { targetBounds } from './geometry'
import { toNumber } from './values'

type Side = 'top' | 'bottom' | 'left' | 'right'

interface Bump {
  side: Side
  /** The solid target, or null for a level wall, the floor or a tile. */
  other: Target | null
  /** True when the thing bumped is a tile (reported as BRICK `_tiles_` and `tile:<kind>`). */
  tile?: boolean
  /** The kind of the tile bumped, read before a ? block turns into `used`. */
  kind?: TileKind
  col?: number
  row?: number
}

// ---- Tile behaviors, copied from the old game's engine (packages/platformer-core/src/engine/tiles.ts, player.ts).
// The old game runs at 60 frames/s in px/frame; the Platformer runs at 30 ticks/s in steps/tick. One old pixel is one
// step (both tiles are 16 wide), so:
//   speed  (px/frame)   x 2  -> steps/tick   (twice the distance per tick, one tick is two frames)
//   accel  (px/frame^2) x 4  -> steps/tick^2
// feel.ts bounceLow 3.25 px/frame (landing with jump not held) -> 6.5 steps/tick.
// feel.ts bounceHigh 5.5 px/frame (landing with jump held)     -> 11 steps/tick.
// player.ts: bumping a bounce block from below pushes you down at 2 px/frame -> 4 steps/tick (vy = -4, y is up).
// "Jump held" is the space key (the Hero's jump key) or the up arrow, read from world.keysDown.
// Known gap: the old player also starts its float-jump gravity after a bounce; here the Hero's own code decides how
// it falls, so a bounce is a plain launch.
export const BOUNCE_LOW = 3.25 * 2
export const BOUNCE_HIGH = 5.5 * 2
export const BOUNCE_HEAD_PUSH = 2 * 2

const KIND_OF_CHAR: Record<string, TileKind> = Object.fromEntries((Object.keys(TILE_CHAR) as TileKind[]).map((k) => [TILE_CHAR[k], k]))
const kindAt = (tiles: TileLayer, col: number, row: number): TileKind | undefined => KIND_OF_CHAR[tiles.data[row]?.[col] ?? '.']

/** Of several candidate columns the body touches, the old engine prefers the one under the body's centre. */
function pickCol(cands: number[], centre: number): number {
  return cands.includes(centre) ? centre : cands[0]
}

function tileBump(side: Side, tiles: TileLayer, col: number, row: number): Bump {
  return { side, other: null, tile: true, kind: kindAt(tiles, col, row), col, row }
}

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
    bodyOf(ctx.target).solid = ctx.field('SOLID') !== 'off'
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
  platformer_touchingtile(ctx) {
    const world = ctx.runtime.world
    const tiles = world.tiles
    if (!tiles || ctx.target.isStage) return false
    const kind = ctx.field('TILE')
    const ch = (TILE_CHAR as Record<string, string | undefined>)[kind]
    if (ch === undefined) return false
    const box = boxOf(world, ctx.target)
    if (!box) return false
    // Cells that overlap the box's interior: faces that only touch don't count (same as bodies).
    const c0 = Math.max(0, Math.floor(box.left / TILE_SIZE))
    const c1 = Math.min(tiles.cols - 1, Math.ceil(box.right / TILE_SIZE) - 1)
    const r0 = Math.max(0, Math.floor(box.bottom / TILE_SIZE))
    const r1 = Math.min(tiles.rows - 1, Math.ceil(box.top / TILE_SIZE) - 1)
    for (let r = r0; r <= r1; r++) {
      const row = tiles.data[r]
      for (let c = c0; c <= c1; c++) if (row[c] === ch) return true
    }
    return false
  },
}

const SOLID_CHARS = new Set(SOLID_TILES.map((k: TileKind) => TILE_CHAR[k]))

function isSolidCell(tiles: TileLayer, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= tiles.cols || row >= tiles.rows) return false
  return SOLID_CHARS.has(tiles.data[row][col])
}

const overlapsOpen = (aLo: number, aHi: number, bLo: number, bHi: number): boolean => aLo < bHi && aHi > bLo

/** The mover's box: translate the world's box by how far the target has moved since `from`. */
function boxOf(world: World, target: Target): StageBounds | undefined {
  return targetBounds(world, target)
}

function solidsFor(world: World, mover: Target): { target: Target; box: StageBounds }[] {
  const out: { target: Target; box: StageBounds }[] = []
  for (const t of world.targets) {
    if (t === mover || t.isStage || !t.visible || !t.body?.solid) continue
    const box = boxOf(world, t)
    if (box) out.push({ target: t, box })
  }
  return out
}

/** Move `mover` along x by its vx; returns a bump when stopped. */
function moveX(world: World, mover: Target, body: Body, P: PhysicsSettings): Bump | null {
  const old = boxOf(world, mover)
  const dx = body.vx
  if (!old || dx === 0) return null
  mover.x += dx
  const now = boxOf(world, mover)
  if (!now) return null
  let stop: { edge: number; bump: Bump } | null = null
  // `edge` is where the mover's leading face must end up; for dx > 0 smaller is more restrictive, for dx < 0 larger.
  const better = (edge: number) => (stop === null ? true : dx > 0 ? edge < stop.edge : edge > stop.edge)
  for (const s of solidsFor(world, mover)) {
    if (!overlapsOpen(now.bottom, now.top, s.box.bottom, s.box.top)) continue
    if (dx > 0 && old.right <= s.box.left && now.right > s.box.left && better(s.box.left)) stop = { edge: s.box.left, bump: { side: 'left', other: s.target } }
    if (dx < 0 && old.left >= s.box.right && now.left < s.box.right && better(s.box.right)) stop = { edge: s.box.right, bump: { side: 'right', other: s.target } }
  }
  const tiles = world.tiles
  if (tiles) {
    // Grid lookup: only the columns whose faces the move crossed, and the rows the box spans.
    const r0 = Math.max(0, Math.floor(now.bottom / TILE_SIZE))
    const r1 = Math.min(tiles.rows - 1, Math.ceil(now.top / TILE_SIZE) - 1)
    if (dx > 0) {
      const cEnd = Math.min(tiles.cols - 1, Math.ceil(now.right / TILE_SIZE) - 1)
      for (let c = Math.max(0, Math.ceil(old.right / TILE_SIZE)); c <= cEnd; c++) {
        const edge = c * TILE_SIZE
        if (!(old.right <= edge && now.right > edge) || !better(edge)) continue
        for (let r = r0; r <= r1; r++) if (isSolidCell(tiles, c, r) && !isSolidCell(tiles, c - 1, r)) { stop = { edge, bump: tileBump('left', tiles, c, r) }; break }
        if (stop && stop.edge === edge) break
      }
    } else {
      const cStart = Math.max(0, Math.floor(now.left / TILE_SIZE))
      for (let c = Math.min(tiles.cols - 1, Math.floor(old.left / TILE_SIZE) - 1); c >= cStart; c--) {
        const edge = (c + 1) * TILE_SIZE
        if (!(old.left >= edge && now.left < edge) || !better(edge)) continue
        for (let r = r0; r <= r1; r++) if (isSolidCell(tiles, c, r) && !isSolidCell(tiles, c + 1, r)) { stop = { edge, bump: tileBump('right', tiles, c, r) }; break }
        if (stop && stop.edge === edge) break
      }
    }
  }
  const b = world.bounds
  if (dx > 0 && P.walls.right && now.right > b.right && better(b.right)) stop = { edge: b.right, bump: { side: 'left', other: null } }
  if (dx < 0 && P.walls.left && now.left < b.left && better(b.left)) stop = { edge: b.left, bump: { side: 'right', other: null } }
  if (!stop) return null
  mover.x += stop.edge - (dx > 0 ? now.right : now.left)
  body.vx = 0
  return stop.bump
}

/** Move `mover` along y by its vy; returns a bump when stopped. Landing sets onGround. */
function moveY(world: World, mover: Target, body: Body, P: PhysicsSettings): Bump | null {
  const old = boxOf(world, mover)
  const dy = body.vy
  if (!old || dy === 0) return null
  mover.y += dy
  const now = boxOf(world, mover)
  if (!now) return null
  let stop: { edge: number; bump: Bump } | null = null
  const better = (edge: number) => (stop === null ? true : dy < 0 ? edge > stop.edge : edge < stop.edge)
  for (const s of solidsFor(world, mover)) {
    if (!overlapsOpen(now.left, now.right, s.box.left, s.box.right)) continue
    if (dy < 0 && old.bottom >= s.box.top && now.bottom < s.box.top && better(s.box.top)) stop = { edge: s.box.top, bump: { side: 'top', other: s.target } }
    if (dy > 0 && old.top <= s.box.bottom && now.top > s.box.bottom && better(s.box.bottom)) stop = { edge: s.box.bottom, bump: { side: 'bottom', other: s.target } }
  }
  const tiles = world.tiles
  if (tiles) {
    const c0 = Math.max(0, Math.floor(now.left / TILE_SIZE))
    const c1 = Math.min(tiles.cols - 1, Math.ceil(now.right / TILE_SIZE) - 1)
    const centre = Math.floor((now.left + now.right) / 2 / TILE_SIZE)
    if (dy < 0) {
      const rStart = Math.max(0, Math.floor(now.bottom / TILE_SIZE))
      for (let r = Math.min(tiles.rows - 1, Math.floor(old.bottom / TILE_SIZE) - 1); r >= rStart; r--) {
        const edge = (r + 1) * TILE_SIZE
        if (!(old.bottom >= edge && now.bottom < edge) || !better(edge)) continue
        // A floor: the top of a solid tile, or a one-way platform (it only stops a body coming down onto it).
        const cands: number[] = []
        for (let c = c0; c <= c1; c++) if ((isSolidCell(tiles, c, r) && !isSolidCell(tiles, c, r + 1)) || kindAt(tiles, c, r) === 'semi') cands.push(c)
        if (cands.length) { stop = { edge, bump: tileBump('top', tiles, pickCol(cands, centre), r) }; break }
      }
    } else {
      const rEnd = Math.min(tiles.rows - 1, Math.ceil(now.top / TILE_SIZE) - 1)
      for (let r = Math.max(0, Math.ceil(old.top / TILE_SIZE)); r <= rEnd; r++) {
        const edge = r * TILE_SIZE
        if (!(old.top <= edge && now.top > edge) || !better(edge)) continue
        const cands: number[] = []
        for (let c = c0; c <= c1; c++) if (isSolidCell(tiles, c, r) && !isSolidCell(tiles, c, r - 1)) cands.push(c)
        if (cands.length) { stop = { edge, bump: tileBump('bottom', tiles, pickCol(cands, centre), r) }; break }
      }
    }
  }
  if (dy < 0 && P.walls.bottom && now.bottom < world.bounds.bottom && better(world.bounds.bottom)) {
    stop = { edge: world.bounds.bottom, bump: { side: 'top', other: null } }
  }
  if (!stop) return null
  mover.y += stop.edge - (dy < 0 ? now.bottom : now.top)
  body.vy = 0
  if (dy < 0) body.onGround = true
  const hit = stop.bump
  if (hit.tile && tiles && hit.col !== undefined && hit.row !== undefined) {
    if (hit.kind === 'qblock' && hit.side === 'bottom') {
      // A ? block hit from below becomes a used block. This changes the running world only, never the design.
      const row = tiles.data[hit.row]
      tiles.data[hit.row] = row.slice(0, hit.col) + TILE_CHAR.used + row.slice(hit.col + 1)
    } else if (hit.kind === 'bounce') {
      if (hit.side === 'top') {
        // Landing on a bounce block launches you again (higher when jump is held).
        const held = world.keysDown.has('space') || world.keysDown.has('up arrow')
        body.vy = held ? BOUNCE_HIGH : BOUNCE_LOW
        body.onGround = false
      } else if (hit.side === 'bottom') body.vy = -BOUNCE_HEAD_PUSH
    }
  }
  return hit
}

/**
 * One physics tick for every mover (runs in `afterTick`, after the script sweeps). Order: gravity, move x, move y,
 * then start bump hats (which run during the next tick's sweeps).
 */
export function physicsStep(runtime: RuntimeApi): void {
  const world = runtime.world
  const P = world.physics ?? DEFAULT_PHYSICS
  // Snapshot the list: bump hats start later, but nothing here adds or removes targets.
  const bumps: { mover: Target; bump: Bump }[] = []
  for (const mover of world.targets) {
    const body = mover.body
    if (!body || mover.isStage || !mover.visible) continue
    // A mover falls (gravity on) or already has speed. A body with no gravity and no speed does nothing.
    if (!body.gravity && body.vx === 0 && body.vy === 0) continue
    if (body.gravity) body.vy = Math.max(body.vy - P.gravity, -P.maxFall)
    body.onGround = false
    const fromX = mover.x
    const fromY = mover.y
    const seen = new Set<string>()
    for (const bump of [moveX(world, mover, body, P), moveY(world, mover, body, P)]) {
      if (!bump) continue
      const key = `${bump.side}|${bump.tile ? `tile:${bump.kind}` : bump.other ? bump.other.id : 'edge'}`
      if (seen.has(key)) continue
      seen.add(key)
      bumps.push({ mover, bump })
    }
    if (mover.x !== fromX || mover.y !== fromY) runtime.requestRedraw()
  }
  for (const { mover, bump } of bumps) startBumpHats(runtime, mover, bump)
}

/** The runtime matches hat fields by equality, so start the hats once per (side or any) x (brick, edge or any). */
function startBumpHats(runtime: RuntimeApi, mover: Target, bump: Bump): void {
  const sides = ['_any_', bump.side]
  const bricks = ['_any_']
  if (bump.tile) bricks.push('_tiles_', `tile:${bump.kind ?? ''}`)
  else if (bump.other === null) bricks.push('_edge_')
  else {
    const name = runtime.world.bricks[bump.other.brickId]?.name
    if (name !== undefined && name !== '_any_' && name !== '_edge_') bricks.push(name)
  }
  for (const SIDE of sides) {
    for (const BRICK of bricks) runtime.startHats('platformer_whenbump', { target: mover, fields: { SIDE, BRICK } })
  }
}
