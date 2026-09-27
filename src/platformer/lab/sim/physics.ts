import { SUB, TS, fdiv, sub } from '@brick-studio/platformer-core/engine/constants'
import { moveX, moveY, overlaps, tileAt, type Box } from '@brick-studio/platformer-core/engine/collide'
import type { FeelSub } from '@brick-studio/platformer-core/engine/feel'
import { T, isSolid } from '@brick-studio/platformer-core/engine/tiles'
import { LAB_LIMITS, type ProbeWhat, type ProbeWhere } from '../program/types'
import { findThing } from './things'
import { SOLID_ALL, SOLID_NONE, type LabInput, type LabWorld, type Thing } from './types'

/*
 * How things move. Every body, the player's included, goes through the same step with its own settings (gravity,
 * bounce, friction, solid); the player's "run and jump with the keys" only decides its speeds first, the way the
 * engine's player does (engine/player.ts: speed tiers, hold-to-jump-higher, coyote time, a jump buffer). Tiles use
 * the engine's collision; solid things and platforms are collided here.
 */

/** Things' gravity at 100% (the engine's creatures'), and their top fall speed. */
export const GRAVITY = sub(0.25)
export const MAX_FALL = sub(4)
/** Landing slower than this does not bounce. */
const BOUNCE_MIN = sub(0.75)
/** Moves are cut into steps of at most half a brick, so nothing skips through a tile or a thin platform. */
const STEP = 8 * SUB
const MAX_SPEED = sub(LAB_LIMITS.maxSpeed)
const SKID_MIN = sub(0.75)

const clampSpeed = (v: number) => Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v))

/** Solid things (and platforms) something may bump into or stand on. */
export function solidsFor(w: LabWorld): Thing[] {
  return w.things.filter((t) => !t.removed && t.solid !== SOLID_NONE && !t.riding)
}

const ignores = (t: Thing, s: Thing) => s === t || s.id === t.rider || s.id === t.riding

function moveAlongX(w: LabWorld, t: Thing, dx: number, solids: readonly Thing[]): boolean {
  let left = dx
  while (left !== 0) {
    const step = Math.max(-STEP, Math.min(STEP, left))
    left -= step
    const before = t.x
    if (moveX(w, t, step) !== null) return true
    for (const s of solids) {
      if (s.solid !== SOLID_ALL || ignores(t, s) || !overlaps(t, s)) continue
      // Already inside it before this step (it moved into me, or I was made there): let it be.
      if (before < s.x + s.w && s.x < before + t.w) continue
      t.x = step > 0 ? s.x - t.w : s.x + s.w
      return true
    }
  }
  return false
}

function moveAlongY(w: LabWorld, t: Thing, dy: number, solids: readonly Thing[]): 1 | -1 | 0 {
  let left = dy
  while (left !== 0) {
    const step = Math.max(-STEP, Math.min(STEP, left))
    left -= step
    const before = t.y
    const r = moveY(w, t, step)
    if (r !== 0) return r
    for (const s of solids) {
      if (ignores(t, s) || t.x + t.w <= s.x || t.x >= s.x + s.w) continue
      if (step > 0) {
        // Land on its top if my feet were at or above it (its lower top, when it moved this frame).
        if (before + t.h <= Math.max(s.y, s.oy) + sub(1) && t.y + t.h > s.y) {
          t.y = s.y - t.h
          t.ground = s.id
          return 1
        }
      } else if (s.solid === SOLID_ALL) {
        const bottom = s.y + s.h
        if (before >= Math.min(bottom, s.oy + s.h) - sub(1) && t.y < bottom) {
          t.y = bottom
          return -1
        }
      }
    }
  }
  return 0
}

/**
 * The player's controls (engine/player.ts's horizontal speed, jump and gravity, without crouching, the run meter
 * and wall jumps). Speeds are scaled by the thing's run speed and jump power; gravity and friction by its body.
 */
export function heroStep(t: Thing, input: LabInput, f: FeelSub) {
  const hs = t.hs
  const run = input.held.x
  const dir = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0)
  const speedK = t.speedPct / 100
  const cap = Math.round((run ? f.runMax : f.walkMax) * speedK)
  const grip = t.friction / 100
  if (dir !== 0) {
    if (t.vx === 0 || Math.sign(t.vx) === dir) {
      const speed = Math.abs(t.vx)
      if (speed < cap) {
        const acc = !t.onGround ? f.airAccel : run ? f.runAccel : f.walkAccel
        t.vx = dir * Math.min(speed + Math.round(acc * Math.max(0.2, speedK)), cap)
      } else if (t.onGround && speed > cap) {
        t.vx = dir * Math.max(speed - Math.round(f.releaseDecel * grip), cap)
      }
      hs.skid = false
    } else {
      t.vx += dir * Math.round((t.onGround ? f.skidDecel * Math.max(0.1, grip) : f.airTurn))
      hs.skid = t.onGround && Math.abs(t.vx) > SKID_MIN && Math.sign(t.vx) !== dir
    }
    t.facing = dir as 1 | -1
  } else {
    hs.skid = false
    if (t.onGround) {
      const speed = Math.max(0, Math.abs(t.vx) - Math.round(f.releaseDecel * grip))
      t.vx = Math.sign(t.vx) * speed
    }
  }
  if (input.pressed.includes('space')) hs.buffer = f.bufferFrames + 1
  if (t.onGround) hs.coyote = f.coyoteFrames
  else if (hs.coyote > 0) hs.coyote--
  if (hs.buffer > 0 && (t.onGround || hs.coyote > 0)) {
    const speed = Math.abs(t.vx)
    const tier = speed < sub(1) ? 0 : speed < sub(2.25) ? 1 : speed < sub(3.25) ? 2 : 3
    t.vy = -Math.round((f.jump[tier] * t.jumpPct) / 100)
    hs.jumpHold = f.hold[tier]
    hs.jumping = true
    t.onGround = false
    t.ground = 0
    hs.coyote = 0
    hs.buffer = 0
  }
  if (hs.buffer > 0) hs.buffer--
  // Holding jump while rising is floatier; letting go or falling is heavier.
  const g = t.gravity / 100
  if (hs.jumping && t.vy < 0 && input.held.space) t.vy += Math.round(hs.jumpHold * g)
  else t.vy += Math.round(f.fallGravity * g)
  if (t.vy >= 0) hs.jumping = false
  const maxFall = Math.round(f.maxFall * Math.max(1, g))
  if (g > 0 && t.vy > maxFall) t.vy = Math.max(maxFall, t.vy - sub(0.5))
}

/** A fresh jump for a hero launched upward by a script: holding space carries it higher, like a normal jump. */
export function heroLaunched(t: Thing, f: FeelSub) {
  if (!t.hero || t.vy >= 0) return
  t.hs.jumping = true
  t.hs.jumpHold = f.hold[0]
  t.hs.coyote = 0
  t.onGround = false
  t.ground = 0
}

/** Move one thing for one frame. Returns true when it landed this frame (after being in the air). */
export function stepBody(w: LabWorld, t: Thing, solids: readonly Thing[]): boolean {
  // Carried by what I stand on.
  if (t.ground) {
    const g = findThing(w, t.ground)
    if (g) {
      const dx = g.x - g.ox
      const dy = g.y - g.oy
      if (dx) moveAlongX(w, t, dx, solids)
      if (dy && t.vy >= 0) t.y += dy
    }
  }
  if (!t.hero) {
    const g = Math.round((GRAVITY * t.gravity) / 100)
    if (g > 0 && t.vy < MAX_FALL) t.vy = Math.min(t.vy + g, MAX_FALL)
    else if (g < 0 && t.vy > -MAX_FALL) t.vy = Math.max(t.vy + g, -MAX_FALL)
  }
  t.vx = clampSpeed(t.vx)
  t.vy = clampSpeed(t.vy)

  if (moveAlongX(w, t, t.vx, solids)) t.vx = t.bounce > 0 && Math.abs(t.vx) > BOUNCE_MIN ? -Math.round((t.vx * t.bounce) / 100) : 0

  const wasOnGround = t.onGround
  t.onGround = false
  t.ground = 0
  const vy = t.vy
  const r = moveAlongY(w, t, vy, solids)
  let landed = false
  if (r === 1) {
    if (t.bounce > 0 && vy > BOUNCE_MIN) t.vy = -Math.round((vy * t.bounce) / 100)
    else {
      t.vy = 0
      t.onGround = true
    }
    landed = !wasOnGround
  } else if (r === -1) {
    t.vy = t.bounce > 0 && -vy > BOUNCE_MIN ? -Math.round((vy * t.bounce) / 100) : 0
    t.hs.jumping = false
  }
  if (t.onGround) {
    if (t.hero) t.hs.anim += Math.abs(t.vx)
    else if (t.friction > 0) {
      const drag = (t.friction / 100) * 0.12
      t.vx = Math.trunc(t.vx * (1 - drag))
      if (Math.abs(t.vx) < 8) t.vx = 0
    }
  }
  return landed
}

/** Something solid (a tile, a solid thing or, for ground, a platform's top) in the box? */
function solidIn(w: LabWorld, box: Box, me: Thing, platforms: boolean): boolean {
  const c1 = fdiv(box.x + box.w - 1, TS)
  const r1 = fdiv(box.y + box.h - 1, TS)
  for (let r = fdiv(box.y, TS); r <= r1; r++) {
    for (let c = fdiv(box.x, TS); c <= c1; c++) {
      const tile = tileAt(w, c, r)
      if (isSolid(tile)) return true
      if (platforms && tile === T.SEMI) return true
    }
  }
  for (const s of w.things) {
    if (s.removed || s.riding || s === me || s.id === me.rider || s.id === me.riding) continue
    if (s.solid === SOLID_NONE || (s.solid !== SOLID_ALL && !platforms)) continue
    if (overlaps(box, s)) return true
  }
  return false
}

function tileIn(w: LabWorld, box: Box, tile: number): boolean {
  const c1 = fdiv(box.x + box.w - 1, TS)
  const r1 = fdiv(box.y + box.h - 1, TS)
  for (let r = fdiv(box.y, TS); r <= r1; r++) for (let c = fdiv(box.x, TS); c <= c1; c++) if (tileAt(w, c, r) === tile) return true
  return false
}

/** Look next to me: "is there ground ahead and down?" */
export function probe(w: LabWorld, me: Thing, what: ProbeWhat, where: ProbeWhere): boolean {
  const reach = sub(2)
  const front = me.facing > 0 ? me.x + me.w : me.x - reach
  const back = me.facing > 0 ? me.x - reach : me.x + me.w
  const cx = Math.round(me.x + me.w / 2)
  let box: Box
  switch (where) {
    case 'ahead':
      box = { x: front, y: me.y + sub(2), w: reach, h: Math.max(sub(1), me.h - sub(4)) }
      break
    case 'behind':
      box = { x: back, y: me.y + sub(2), w: reach, h: Math.max(sub(1), me.h - sub(4)) }
      break
    case 'aheadDown':
      box = { x: front, y: me.y + me.h, w: reach, h: reach }
      break
    case 'below':
      box = { x: cx - SUB, y: me.y + me.h, w: 2 * SUB, h: reach }
      break
    case 'above':
      box = { x: cx - SUB, y: me.y - reach, w: 2 * SUB, h: reach }
      break
  }
  switch (what) {
    case 'ground':
      return solidIn(w, box, me, true)
    case 'wall':
      return solidIn(w, box, me, false)
    case 'spikes':
      return tileIn(w, box, T.SPIKES)
    case 'lava':
      return tileIn(w, box, T.LAVA)
    case 'thing':
      return w.things.some((s) => !s.removed && !s.riding && s !== me && s.id !== w.playerId && overlaps(box, s))
    case 'player': {
      const p = findThing(w, w.playerId)
      return !!p && p !== me && !p.riding && overlaps(box, p)
    }
  }
}
