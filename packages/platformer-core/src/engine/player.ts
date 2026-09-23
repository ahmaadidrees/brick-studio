import { TS, fdiv, sub } from './constants'
import { moveX, moveY, overlaps, rowSolid, tileAt, type Box } from './collide'
import type { WorldEvent } from './events'
import { P_SEGMENTS, type FeelSub } from './feel'
import { T, isBumpable, isSolid } from './tiles'
import { EK, ES, findEntity, findObject, isItem, isKillable, type Effect, type World } from './world'

// =============================================================================================
// The player. Each game moves its own player; nothing here is shared or needs to be
// deterministic across machines. What the player does *to* the world goes out as events.
// =============================================================================================

export const POWER = { SMALL: 0, BIG: 1, SPARK: 2 } as const

export const PLAYER_W = sub(12)
export const H_SMALL = sub(14)
export const H_BIG = sub(26)
export const H_CROUCH = sub(14)

const TRANSFORM_TICKS = 24
const HURT_INVULN = 120
const RESPAWN_INVULN = 120
const WALL_COYOTE = 5
const SKID_MIN = sub(0.75)
const DEATH_PAUSE = 30
const DEATH_TICKS = 150
const CELEBRATE_TICKS = 210

export interface PlayerInput {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  jump: boolean
  jumpPressed: boolean
  run: boolean
  runPressed: boolean
}

export const NO_INPUT: PlayerInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  jumpPressed: false,
  run: false,
  runPressed: false,
}

export type PlayerSound =
  | 'jump'
  | 'jumpBig'
  | 'walljump'
  | 'skid'
  | 'bonk'
  | 'spring'
  | 'hurt'
  | 'die'
  | 'checkpoint'
  | 'goal'
  | 'headbounce'
  | 'powerup'

export interface OtherBody extends Box {
  num: number
}

export interface PlayerContext {
  world: World
  feel: FeelSub
  tick: number
  emit: (ev: WorldEvent) => void
  sound: (name: PlayerSound) => void
  /** Pixel position for a puff of dust. */
  dust?: (x: number, y: number) => void
  /** Other players, for bouncing off their heads. */
  others: readonly OtherBody[]
  /** Called when this player lands on another's head. */
  bonk?: (num: number) => void
}

export interface Player extends Box {
  num: number
  vx: number
  vy: number
  facing: 1 | -1
  onGround: boolean
  /** Platform entity id this player is standing on, or 0. */
  riding: number
  power: number
  pmeter: number
  pTimer: number
  jumping: boolean
  jumpHold: number
  /** Took off with a full run meter, so may keep P-speed in the air. */
  pJump: boolean
  coyote: number
  buffer: number
  wallSide: number
  wallCoyote: number
  wallCoyoteSide: number
  wallLock: number
  wallLockSide: number
  crouch: boolean
  skid: boolean
  invuln: number
  transform: number
  transformFrom: number
  /** 0 alive, otherwise ticks since dying. */
  dead: number
  kick: number
  throwAnim: number
  /** Distance walked, drives the walk cycle. */
  anim: number
  coins: number
  checkpoint: number
  runStart: number
  /** Ticks the last run took to reach the goal, or -1. */
  clearTime: number
  bestTime: number
  celebrate: number
  /** Squash animation when someone bounces on this player's head. */
  squash: number
  ignore: Map<number, number>
  claimedCoins: Map<number, number>
}

export function createPlayer(num: number): Player {
  return {
    num,
    x: 0,
    y: 0,
    w: PLAYER_W,
    h: H_SMALL,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    riding: 0,
    power: POWER.SMALL,
    pmeter: 0,
    pTimer: 0,
    jumping: false,
    jumpHold: 0,
    pJump: false,
    coyote: 0,
    buffer: 0,
    wallSide: 0,
    wallCoyote: 0,
    wallCoyoteSide: 0,
    wallLock: 0,
    wallLockSide: 0,
    crouch: false,
    skid: false,
    invuln: 0,
    transform: 0,
    transformFrom: 0,
    dead: 0,
    kick: 0,
    throwAnim: 0,
    anim: 0,
    coins: 0,
    checkpoint: 0,
    runStart: 0,
    clearTime: -1,
    bestTime: -1,
    celebrate: 0,
    squash: 0,
    ignore: new Map(),
    claimedCoins: new Map(),
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers

function boxSolid(w: World, x: number, y: number, bw: number, bh: number): boolean {
  const c1 = fdiv(x + bw - 1, TS)
  const r1 = fdiv(y + bh - 1, TS)
  for (let r = fdiv(y, TS); r <= r1; r++) for (let c = fdiv(x, TS); c <= c1; c++) if (isSolid(tileAt(w, c, r))) return true
  return false
}

function setHeight(p: Player, h: number) {
  const bottom = p.y + p.h
  p.h = h
  p.y = bottom - h
}

function standingHeight(p: Player): number {
  return p.power === POWER.SMALL ? H_SMALL : H_BIG
}

function canStand(p: Player, w: World): boolean {
  const h = standingHeight(p)
  return !boxSolid(w, p.x, p.y + p.h - h, p.w, h)
}

function touchingWall(p: Player, w: World, side: number): boolean {
  if (side > 0) {
    const edge = p.x + p.w
    if (edge % TS !== 0) return false
    return rowSpanSolid(w, edge / TS, p.y + sub(3), p.h - sub(6))
  }
  if (p.x % TS !== 0) return false
  return rowSpanSolid(w, p.x / TS - 1, p.y + sub(3), p.h - sub(6))
}

function rowSpanSolid(w: World, col: number, y: number, h: number): boolean {
  if (col < 0 || col >= w.width) return false
  const r1 = fdiv(y + h - 1, TS)
  for (let r = fdiv(y, TS); r <= r1; r++) if (isSolid(tileAt(w, col, r))) return true
  return false
}

const centerX = (b: Box) => b.x + b.w / 2

/** Move out of anything solid an edit dropped on top of us: up to four tiles upward. */
function unstick(p: Player, ctx: PlayerContext) {
  const w = ctx.world
  if (!boxSolid(w, p.x, p.y, p.w, p.h)) return
  const bottomRow = fdiv(p.y + p.h - 1, TS)
  for (let k = 0; k < 4; k++) {
    const ny = (bottomRow - k) * TS - p.h
    if (!boxSolid(w, p.x, ny, p.w, p.h)) {
      p.y = ny
      p.vy = 0
      return
    }
  }
  die(p, ctx)
}

// ---------------------------------------------------------------------------------------------
// Life, death and power

export function placePlayer(p: Player, tx: number, ty: number) {
  p.x = tx * TS + (TS - p.w) / 2
  p.y = (ty + 1) * TS - p.h
  p.vx = 0
  p.vy = 0
  p.onGround = false
  p.riding = 0
  p.jumping = false
}

/** Back to the start (fresh run) or the last checkpoint. */
export function respawn(p: Player, ctx: PlayerContext, fresh: boolean) {
  const w = ctx.world
  const cp = !fresh && p.checkpoint ? findObject(w, p.checkpoint) : undefined
  const spot = cp ?? w.design.objects.find((o) => o.kind === 'start')
  p.dead = 0
  p.celebrate = 0
  p.transform = 0
  p.power = POWER.SMALL
  p.crouch = false
  p.h = H_SMALL
  p.pmeter = 0
  p.pTimer = 0
  p.facing = 1
  p.invuln = RESPAWN_INVULN
  p.wallSide = 0
  p.wallLock = 0
  p.skid = false
  placePlayer(p, spot ? spot.x : 2, spot ? spot.y : w.height - 3)
  if (fresh) {
    p.checkpoint = 0
    p.runStart = ctx.tick
    p.clearTime = -1
  }
}

export function die(p: Player, ctx: PlayerContext) {
  if (p.dead) return
  p.dead = 1
  p.vx = 0
  p.vy = 0
  p.transform = 0
  p.pmeter = 0
  p.riding = 0
  p.crouch = false
  ctx.sound('die')
}

function damage(p: Player, ctx: PlayerContext) {
  if (p.invuln > 0 || p.transform > 0 || p.dead || p.celebrate) return
  if (p.power === POWER.SMALL) {
    die(p, ctx)
    return
  }
  p.transformFrom = p.power
  p.power = p.power === POWER.SPARK ? POWER.BIG : POWER.SMALL
  if (p.power === POWER.SMALL) {
    p.crouch = false
    setHeight(p, H_SMALL)
  }
  p.transform = TRANSFORM_TICKS
  p.invuln = HURT_INVULN
  ctx.sound('hurt')
}

function powerUp(p: Player, to: number, ctx: PlayerContext) {
  ctx.sound('powerup')
  if (p.dead) return
  if (to === POWER.BIG && p.power !== POWER.SMALL) return
  if (to === p.power) return
  p.transformFrom = p.power
  p.power = to
  if (p.h < H_BIG && !p.crouch) {
    if (canStand(p, ctx.world)) setHeight(p, H_BIG)
    else {
      p.crouch = true
      setHeight(p, H_CROUCH)
    }
  }
  p.transform = TRANSFORM_TICKS
}

/** A world effect caused by this player: coins and power-ups land here. */
export function grantEffect(p: Player, e: Effect, ctx: PlayerContext) {
  if (e.by !== p.num) return
  if (e.k === 'coin') p.coins++
  else if (e.k === 'grow') powerUp(p, POWER.BIG, ctx)
  else if (e.k === 'spark-up') powerUp(p, POWER.SPARK, ctx)
}

// ---------------------------------------------------------------------------------------------
// The step

export function stepPlayer(p: Player, input: PlayerInput, ctx: PlayerContext): void {
  const f = ctx.feel
  const w = ctx.world
  if (p.squash > 0) p.squash--
  if (p.kick > 0) p.kick--
  if (p.throwAnim > 0) p.throwAnim--
  if (p.dead) {
    stepDead(p, ctx)
    return
  }
  if (p.celebrate) {
    p.celebrate--
    p.vx = 0
    fallOnly(p, ctx)
    if (p.celebrate === 0) respawn(p, ctx, true)
    return
  }
  if (p.transform > 0) {
    p.transform--
    return
  }
  if (p.invuln > 0) p.invuln--

  // Ride a moving platform.
  if (p.riding) {
    const e = findEntity(w, p.riding)
    if (e && !e.rm) {
      const dx = e.x - e.ox
      if (dx) moveX(w, p, dx)
      if (!p.jumping) p.y = e.y - p.h
    } else p.riding = 0
  }
  unstick(p, ctx)
  if (p.dead) return

  const dirIn = (input.right ? 1 : 0) - (input.left ? 1 : 0)

  // Crouch (big only). Stays crouched in the air if you jumped from a crouch.
  if (input.down && p.onGround && p.power !== POWER.SMALL && !p.crouch) {
    p.crouch = true
    setHeight(p, H_CROUCH)
  } else if (p.crouch && (!input.down || p.power === POWER.SMALL) && (p.onGround || !input.down) && canStand(p, w)) {
    p.crouch = false
    setHeight(p, standingHeight(p))
  }

  let dir = p.crouch && p.onGround ? 0 : dirIn
  if (p.wallLock > 0) {
    p.wallLock--
    if (dir === p.wallLockSide) dir = 0
  }

  // --- Horizontal speed
  const pFull = p.pmeter >= P_SEGMENTS
  const cap = input.run ? ((p.onGround ? pFull : p.pJump) ? f.pMax : f.runMax) : f.walkMax
  const wasSkidding = p.skid
  if (dir !== 0) {
    if (p.vx === 0 || Math.sign(p.vx) === dir) {
      const speed = Math.abs(p.vx)
      if (speed < cap) {
        const acc = !p.onGround ? f.airAccel : input.run ? f.runAccel : f.walkAccel
        p.vx = dir * Math.min(speed + acc, cap)
      } else if (p.onGround && speed > cap) {
        p.vx = dir * Math.max(speed - f.releaseDecel, cap)
      }
      p.skid = false
    } else {
      p.vx += dir * (p.onGround ? f.skidDecel : f.airTurn)
      p.skid = p.onGround && Math.abs(p.vx) > SKID_MIN && Math.sign(p.vx) !== dir
    }
    p.facing = dir as 1 | -1
  } else {
    p.skid = false
    if (p.onGround) {
      const speed = Math.max(0, Math.abs(p.vx) - f.releaseDecel)
      p.vx = Math.sign(p.vx) * speed
    }
  }
  if (p.skid && !wasSkidding) ctx.sound('skid')
  if (p.skid && ctx.tick % 4 === 0) ctx.dust?.(fdiv(centerX(p), 256), fdiv(p.y + p.h, 256))

  // --- Run meter: fills while running flat out on the ground, holds in the air
  if (p.onGround) {
    const flatOut = input.run && dir !== 0 && Math.sign(p.vx) === dir && Math.abs(p.vx) >= f.runMax - sub(0.0625)
    if (flatOut) {
      if (++p.pTimer >= f.pFillFrames) {
        p.pTimer = 0
        if (p.pmeter < P_SEGMENTS) p.pmeter++
      }
    } else if (p.pmeter > 0) {
      if (++p.pTimer >= f.pDrainFrames) {
        p.pTimer = 0
        p.pmeter--
      }
    } else p.pTimer = 0
  }

  // --- Jumps
  if (input.jumpPressed) p.buffer = f.bufferFrames + 1
  if (p.onGround) p.coyote = f.coyoteFrames
  else if (p.coyote > 0) p.coyote--

  // Wall slide: falling while pushing into a wall.
  p.wallSide = 0
  if (!p.onGround && p.vy >= 0 && dirIn !== 0 && touchingWall(p, w, dirIn)) {
    p.wallSide = dirIn
    p.wallCoyote = WALL_COYOTE
    p.wallCoyoteSide = dirIn
    if (ctx.tick % 6 === 0) ctx.dust?.(fdiv(dirIn > 0 ? p.x + p.w : p.x, 256), fdiv(p.y + p.h / 2, 256))
  } else if (p.wallCoyote > 0) p.wallCoyote--

  if (p.buffer > 0) {
    if (p.onGround || p.coyote > 0) {
      const speed = Math.abs(p.vx)
      const tier = speed < sub(1) ? 0 : speed < sub(2.25) ? 1 : speed < sub(3.25) ? 2 : 3
      p.vy = -f.jump[tier]
      p.jumpHold = f.hold[tier]
      p.jumping = true
      p.onGround = false
      p.riding = 0
      p.coyote = 0
      p.buffer = 0
      p.pJump = p.pmeter >= P_SEGMENTS
      ctx.sound(p.power === POWER.SMALL ? 'jump' : 'jumpBig')
    } else if (p.wallSide !== 0 || p.wallCoyote > 0) {
      const side = p.wallSide || p.wallCoyoteSide
      p.vx = -side * f.wallJumpX
      p.vy = -f.wallJumpY
      p.jumpHold = f.hold[0]
      p.jumping = true
      p.pJump = false
      p.wallLock = f.wallJumpLock
      p.wallLockSide = side
      p.facing = -side as 1 | -1
      p.wallSide = 0
      p.wallCoyote = 0
      p.buffer = 0
      ctx.sound('walljump')
      ctx.dust?.(fdiv(side > 0 ? p.x + p.w : p.x, 256), fdiv(p.y + p.h / 2, 256))
    }
  }
  // A press that could not jump yet stays live for a few frames (landing, reaching a wall).
  if (p.buffer > 0) p.buffer--

  // --- Gravity. Holding jump while rising is floatier; letting go or falling is heavier.
  if (p.jumping && p.vy < 0 && input.jump) p.vy += p.jumpHold
  else p.vy += f.fallGravity
  if (p.vy >= 0) p.jumping = false
  const maxFall = p.wallSide ? f.wallSlideMax : f.maxFall
  // Grabbing a wall sheds fall speed fast: half the excess each frame.
  if (p.vy > maxFall) p.vy = p.wallSide ? Math.max(maxFall, p.vy - Math.max(sub(0.75), (p.vy - maxFall) >> 1)) : maxFall

  // --- Move
  const startBottom = p.y + p.h
  const falling = p.vy > 0
  if (moveX(w, p, p.vx) !== null) {
    p.vx = 0
    if (p.pmeter > 0 && p.onGround) p.pmeter = Math.max(0, p.pmeter - 2)
  }
  const wasOnGround = p.onGround
  p.onGround = false
  p.riding = 0
  if (p.vy < 0) rise(p, ctx)
  else fallAndLand(p, ctx, input, startBottom)
  if (p.onGround) {
    p.anim += Math.abs(p.vx)
    if (!wasOnGround && startBottom < p.y + p.h - sub(2)) ctx.dust?.(fdiv(centerX(p), 256), fdiv(p.y + p.h, 256))
  }

  hazards(p, ctx)
  if (p.dead) return
  collectCoins(p, ctx)
  touchEntities(p, ctx, falling, startBottom)
  touchOthers(p, ctx, falling, startBottom)
  touchCourse(p, ctx)

  // Spark throw on the run button.
  if (p.power === POWER.SPARK && input.runPressed && !p.crouch) {
    ctx.emit({ t: 'spark', x: Math.round(centerX(p) + p.facing * sub(8)), y: p.y + sub(14), dir: p.facing })
    p.throwAnim = 10
  }

  // Forget stale bookkeeping now and then.
  if (ctx.tick % 120 === 0) {
    for (const [id, until] of p.ignore) if (until <= ctx.tick) p.ignore.delete(id)
    for (const [i, until] of p.claimedCoins) if (until <= ctx.tick) p.claimedCoins.delete(i)
  }
}

function fallOnly(p: Player, ctx: PlayerContext) {
  p.vy = Math.min(p.vy + ctx.feel.fallGravity, ctx.feel.maxFall)
  const r = moveY(ctx.world, p, p.vy)
  if (r !== 0) p.vy = 0
  p.onGround = r === 1
}

function stepDead(p: Player, ctx: PlayerContext) {
  p.dead++
  if (p.dead === DEATH_PAUSE) p.vy = -sub(4.5)
  if (p.dead > DEATH_PAUSE) {
    p.vy = Math.min(p.vy + sub(0.25), sub(4))
    p.y += p.vy
  }
  if (p.dead > DEATH_TICKS) respawn(p, ctx, false)
}

/** Moving up: stop at ceilings, nudge around corners, hit blocks. */
function rise(p: Player, ctx: PlayerContext) {
  const w = ctx.world
  const ny = p.y + p.vy
  const oldRow = fdiv(p.y, TS)
  const newRow = fdiv(ny, TS)
  if (newRow === oldRow || !rowSolid(w, newRow, p.x, p.w)) {
    p.y = ny
    return
  }
  const c0 = fdiv(p.x, TS)
  const c1 = fdiv(p.x + p.w - 1, TS)
  const leftSolid = isSolid(tileAt(w, c0, newRow))
  const rightSolid = isSolid(tileAt(w, c1, newRow))
  if (c0 !== c1 && leftSolid !== rightSolid) {
    // Only a corner is in the way: slide past it if the overlap is small.
    const shift = leftSolid ? (c0 + 1) * TS - p.x : -(p.x + p.w - c1 * TS)
    if (Math.abs(shift) <= ctx.feel.cornerNudge && !boxSolid(w, p.x + shift, ny, p.w, p.h)) {
      p.x += shift
      p.y = ny
      return
    }
  }
  p.y = (newRow + 1) * TS
  p.vy = 0
  p.jumping = false
  let col = fdiv(centerX(p), TS)
  if (!isSolid(tileAt(w, col, newRow))) col = leftSolid ? c0 : c1
  const t = tileAt(w, col, newRow)
  if (isBumpable(t)) {
    ctx.emit({ t: 'bump', x: col, y: newRow, big: p.power === POWER.SMALL ? 0 : 1, dir: p.facing })
    if (t === T.BOUNCE) p.vy = sub(2)
  } else ctx.sound('bonk')
}

/** Moving down: land on tiles, one-way tops, moving platforms, springs and bounce blocks. */
function fallAndLand(p: Player, ctx: PlayerContext, input: PlayerInput, startBottom: number) {
  const w = ctx.world
  const f = ctx.feel
  const intendedBottom = startBottom + p.vy
  const landedTile = moveY(w, p, p.vy) === 1
  // Moving platforms are one-way tops. Pick the highest one we passed through.
  let best: { id: number; top: number } | null = null
  for (const e of w.entities) {
    if (e.kind !== EK.PLATFORM || e.rm) continue
    if (p.x + p.w <= e.x || p.x >= e.x + e.w) continue
    if (startBottom > Math.max(e.oy, e.y) + sub(1)) continue
    if (intendedBottom < e.y) continue
    if (!best || e.y < best.top) best = { id: e.id, top: e.y }
  }
  if (best && (!landedTile || best.top <= p.y + p.h)) {
    p.y = best.top - p.h
    p.vy = 0
    p.onGround = true
    p.riding = best.id
    return
  }
  if (!landedTile) return
  p.vy = 0
  p.onGround = true
  p.jumping = false
  // What did we land on?
  const row = fdiv(p.y + p.h, TS)
  const c0 = fdiv(p.x, TS)
  const c1 = fdiv(p.x + p.w - 1, TS)
  const centre = fdiv(centerX(p), TS)
  const under = tileAt(w, centre, row)
  const any = (t: number) => tileAt(w, c0, row) === t || tileAt(w, c1, row) === t
  if (any(T.SPRING)) {
    p.vy = -(input.jump ? f.springHigh : f.springLow)
    p.jumpHold = f.hold[0]
    p.jumping = true
    p.onGround = false
    p.pJump = p.pmeter >= P_SEGMENTS
    ctx.sound('spring')
  } else if (under === T.BOUNCE || (!isSolid(under) && any(T.BOUNCE))) {
    const col = under === T.BOUNCE ? centre : tileAt(w, c0, row) === T.BOUNCE ? c0 : c1
    p.vy = -(input.jump ? f.bounceHigh : f.bounceLow)
    p.jumpHold = f.hold[0]
    p.jumping = true
    p.onGround = false
    ctx.emit({ t: 'bump', x: col, y: row, big: 0, dir: p.facing })
  }
}

function hazards(p: Player, ctx: PlayerContext) {
  const w = ctx.world
  if (p.y > (w.height + 1) * TS) {
    die(p, ctx)
    return
  }
  // Lava: overlapping its lower part kills, whatever your power.
  const c0 = fdiv(p.x, TS)
  const c1 = fdiv(p.x + p.w - 1, TS)
  const r0 = fdiv(p.y, TS)
  const r1 = fdiv(p.y + p.h - 1, TS)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (tileAt(w, c, r) === T.LAVA && p.y + p.h > r * TS + sub(6)) {
        die(p, ctx)
        return
      }
    }
  }
  // Spikes: touching them from any side hurts.
  if (p.invuln > 0) return
  const m = 1
  const k0 = fdiv(p.x - m, TS)
  const k1 = fdiv(p.x + p.w - 1 + m, TS)
  const j0 = fdiv(p.y - m, TS)
  const j1 = fdiv(p.y + p.h - 1 + m, TS)
  for (let r = j0; r <= j1; r++) {
    for (let c = k0; c <= k1; c++) {
      if (tileAt(w, c, r) === T.SPIKES) {
        damage(p, ctx)
        return
      }
    }
  }
}

function collectCoins(p: Player, ctx: PlayerContext) {
  const w = ctx.world
  const c1 = fdiv(p.x + p.w - 1, TS)
  const r1 = fdiv(p.y + p.h - 1, TS)
  for (let r = Math.max(0, fdiv(p.y, TS)); r <= r1 && r < w.height; r++) {
    for (let c = Math.max(0, fdiv(p.x, TS)); c <= c1 && c < w.width; c++) {
      const i = r * w.width + c
      if (w.tiles[i] !== T.COIN) continue
      const claimed = p.claimedCoins.get(i)
      if (claimed !== undefined && claimed > ctx.tick) continue
      p.claimedCoins.set(i, ctx.tick + 30)
      ctx.emit({ t: 'coin', x: c, y: r })
    }
  }
}

function touchEntities(p: Player, ctx: PlayerContext, falling: boolean, startBottom: number) {
  const w = ctx.world
  const f = ctx.feel
  let stomped = false
  let hurt = false
  const pc = centerX(p)
  for (const e of w.entities) {
    if (e.rm || e.kind === EK.PLATFORM || e.kind === EK.COIN_POP || e.kind === EK.SPARK_SHOT) continue
    const until = p.ignore.get(e.id)
    if (until !== undefined && until > ctx.tick) continue
    // Enemies' hitboxes are a little forgiving.
    const inset = isItem(e) ? 0 : sub(2)
    if (!overlaps(p, { x: e.x + inset, y: e.y + inset, w: e.w - 2 * inset, h: e.h - inset })) continue
    if (isItem(e)) {
      if (e.state === ES.ACTIVE || e.state === ES.EMERGING) {
        ctx.emit({ t: 'take', id: e.id })
        p.ignore.set(e.id, ctx.tick + 60)
      }
      continue
    }
    if (!isKillable(e)) continue
    const away = (pc < centerX(e) ? 1 : -1) as 1 | -1
    const onTop = falling && startBottom <= e.oy + e.h / 2 + sub(2)
    if (e.kind === EK.SPIKY) {
      hurt = true
    } else if (e.kind === EK.SHELLBUG && e.state === ES.SHELL) {
      if (onTop) {
        ctx.emit({ t: 'stomp', id: e.id, dir: away })
        stomped = true
      } else {
        ctx.emit({ t: 'kick', id: e.id, dir: away })
        p.kick = 10
      }
      p.ignore.set(e.id, ctx.tick + 14)
    } else if (onTop) {
      ctx.emit({ t: 'stomp', id: e.id, dir: away })
      p.ignore.set(e.id, ctx.tick + 12)
      stomped = true
    } else {
      hurt = true
    }
  }
  if (stomped) {
    p.vy = -f.stompBounce
    p.jumpHold = f.hold[0]
    p.jumping = true
    p.onGround = false
  } else if (hurt) damage(p, ctx)
}

function touchOthers(p: Player, ctx: PlayerContext, falling: boolean, startBottom: number) {
  if (!falling || p.vy < 0) return
  for (const o of ctx.others) {
    if (p.x + p.w <= o.x || p.x >= o.x + o.w) continue
    const feet = p.y + p.h
    if (startBottom > o.y + sub(4) || feet < o.y) continue
    p.y = o.y - p.h
    p.vy = -ctx.feel.stompBounce
    p.jumpHold = ctx.feel.hold[0]
    p.jumping = true
    p.onGround = false
    ctx.sound('headbounce')
    ctx.bonk?.(o.num)
    return
  }
}

function touchCourse(p: Player, ctx: PlayerContext) {
  const w = ctx.world
  for (const o of w.design.objects) {
    if (o.kind === 'goal' && p.clearTime < 0) {
      const zone = { x: o.x * TS + sub(2), y: (o.y - 9) * TS, w: TS - sub(4), h: 10 * TS }
      if (overlaps(p, zone)) {
        p.clearTime = ctx.tick - p.runStart
        if (p.bestTime < 0 || p.clearTime < p.bestTime) p.bestTime = p.clearTime
        p.celebrate = CELEBRATE_TICKS
        p.vx = 0
        p.pmeter = 0
        ctx.sound('goal')
        return
      }
    } else if (o.kind === 'checkpoint' && p.checkpoint !== o.id) {
      const zone = { x: o.x * TS, y: (o.y - 1) * TS, w: TS, h: 2 * TS }
      if (overlaps(p, zone)) {
        p.checkpoint = o.id
        ctx.sound('checkpoint')
      }
    }
  }
}
