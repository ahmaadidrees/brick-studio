/**
 * Hackable 3D's blocks (docs/qa/hackable-3d/D1.md): the "3D" category, and Scratch's own blocks taught the third axis.
 *
 * Units (owner decision 2026-11-04): every distance on a block is in STUDS, 1 stud = 1 brick width, and every speed in
 * studs per second. The middle of the build plate is x 0, z 0; y 0 is the plate's top; x goes right, y up and z toward
 * you. The engine works in the classic builder's units (1 stud = 0.62), so each block converts at its edge.
 *
 * The Platformer's opcodes keep their meaning with a z added ("set [z] speed to"), so a kid who knows the Platformer
 * category already knows most of the 3D one. Nothing here uses Math.sin/cos/atan2: core/detmath only.
 */
import { YIELD, type PrimitiveCtx, type PrimitiveTable, type Target, type Value } from '../core/contracts'
import { atan2Deg, sinCosDeg } from '../core/detmath'
import { motionPrimitives } from '../core/motion'
import { sensingPrimitives } from '../core/sensing'
import { toNumber } from '../core/values'
import { STUD, isTarget3, plateOf, studsToWorld, worldToStuds, type Body3, type LevelDesign3, type Target3, type World3 } from './contracts3d'
import { JUMP_IGNORE, footprintOf, footprintsTouch, sendHome } from './physics3d'

type Axis = 'x' | 'y' | 'z'

/** A 3D target's body, made on first use like the Platformer's. */
function body3Of(t: Target): Body3 | null {
  if (t.isStage || !isTarget3(t)) return null
  if (!t.body3) t.body3 = { w: STUD, h: STUD, d: STUD, solid: false, gravity: false, vx: 0, vy: 0, vz: 0, onGround: false }
  return t.body3
}

const axis3 = (ctx: PrimitiveCtx): Axis => (ctx.field('AXIS') === 'y' ? 'y' : ctx.field('AXIS') === 'z' ? 'z' : 'x')

/** Speeds a script gives a character go where its controller reads them; an upward one launches it off the ground. */
function setVelocity(b: Body3, axis: Axis, v: number): void {
  const c = b.character
  if (axis === 'y') {
    b.vy = v
    if (c && v > 0) { c.grounded = false; c.coyote = 0; c.groundIgnore = JUMP_IGNORE; c.airborne = 0; b.onGround = false }
  } else if (c) {
    if (axis === 'x') c.velocityX = v
    else c.velocityZ = v
  } else if (axis === 'x') b.vx = v
  else b.vz = v
}

function velocity(b: Body3, axis: Axis): number {
  if (axis === 'y') return b.vy
  if (b.character) return axis === 'x' ? b.character.velocityX : b.character.velocityZ
  return axis === 'x' ? b.vx : b.vz
}

function speed(ctx: PrimitiveCtx, relative: boolean): void {
  const t = ctx.target
  const b = body3Of(t)
  const n = studsToWorld(toNumber(ctx.arg('SPEED')))
  if (!b || !Number.isFinite(n)) return
  const axis = axis3(ctx)
  setVelocity(b, axis, relative ? velocity(b, axis) + n : n)
  if (t.visible) ctx.runtime.requestRedraw()
}

const num = (v: Value): number => {
  const n = toNumber(v)
  return Number.isFinite(n) ? n : 0
}

/** Read an input (or its menu field) as a number of studs, in world units. */
const studs = (ctx: PrimitiveCtx, name: string): number => studsToWorld(num(ctx.arg(name) !== '' ? ctx.arg(name) : ctx.field(name)))

/** Move a 3D target (never the Stage). No fence: the build plate is the edge, and falling off it sends a body home. */
function place(ctx: PrimitiveCtx, x: number, y: number, z: number): void {
  const t = ctx.target
  if (t.isStage || !isTarget3(t)) return
  if (Number.isFinite(x)) t.x = x
  if (Number.isFinite(y)) t.y = y
  if (Number.isFinite(z)) t.z = z
  if (t.visible) ctx.runtime.requestRedraw()
}

/** A brick's middle, as "touching" and "distance to" see it. */
const centre = (t: Target3): [number, number, number] => [t.x, t.y + (t.body3?.h ?? 0) / 2, t.z]

/** The first visible copy of the brick named `name` (not `me`), as Scratch's menus find a sprite. */
function named(ctx: PrimitiveCtx, name: string): Target3[] {
  const world = ctx.runtime.world
  const out: Target3[] = []
  for (const t of world.targets) if (t !== ctx.target && !t.isStage && isTarget3(t) && world.bricks[t.brickId]?.name === name) out.push(t)
  return out
}

const menu = (ctx: PrimitiveCtx, name: string): string => {
  const arg = ctx.arg(name)
  return arg !== '' ? String(arg) : ctx.field(name)
}

interface Glide3 { t0: number; ms: number; x0: number; y0: number; x1: number; y1: number }

/** A glide in 3D: x and y in studs, z kept (Scratch's glide, without its 2D fence). */
function glide(ctx: PrimitiveCtx, x1: number, y1: number) {
  const t = ctx.target
  if (!isTarget3(t)) return
  let g = ctx.frame.glide as Glide3 | undefined
  if (!g) {
    const secs = num(ctx.arg('SECS'))
    g = { t0: ctx.runtime.nowMs(), ms: Math.max(0, secs * 1000), x0: t.x, y0: t.y, x1, y1 }
    ctx.frame.glide = g
    if (g.ms <= 0) { place(ctx, x1, y1, NaN); return }
    return YIELD
  }
  const k = (ctx.runtime.nowMs() - g.t0) / g.ms
  if (k >= 1) { place(ctx, g.x1, g.y1, NaN); return }
  place(ctx, g.x0 + (g.x1 - g.x0) * k, g.y0 + (g.y1 - g.y0) * k, NaN)
  return YIELD
}

/**
 * Scratch's Motion blocks in 3D. Positions are in studs; "move (10) steps" moves 10 studs the way the brick faces, flat
 * along the plate (direction 90 is +x, 0 is away from you, 180 toward you); turning spins a brick about the up axis.
 */
const motion3dPrimitives: PrimitiveTable = {
  motion_movesteps(ctx) {
    const t = ctx.target
    if (!isTarget3(t)) return
    const n = studs(ctx, 'STEPS')
    const [s, c] = sinCosDeg(t.direction)
    place(ctx, t.x + n * s, NaN, t.z - n * c)
  },
  motion_gotoxy: (ctx) => place(ctx, studs(ctx, 'X'), studs(ctx, 'Y'), NaN),
  motion_setx: (ctx) => place(ctx, studs(ctx, 'X'), NaN, NaN),
  motion_sety: (ctx) => place(ctx, NaN, studs(ctx, 'Y'), NaN),
  motion_changexby: (ctx) => place(ctx, ctx.target.x + studs(ctx, 'DX'), NaN, NaN),
  motion_changeyby: (ctx) => place(ctx, NaN, ctx.target.y + studs(ctx, 'DY'), NaN),
  motion_xposition: (ctx) => worldToStuds(ctx.target.x),
  motion_yposition: (ctx) => worldToStuds(ctx.target.y),
  motion_goto(ctx) {
    const to = menu(ctx, 'TO')
    if (to === '_random_') {
      const half = (plateOf(ctx.runtime.world.design as LevelDesign3 | undefined) / 2 - 1) * STUD
      place(ctx, (ctx.runtime.random() * 2 - 1) * half, NaN, (ctx.runtime.random() * 2 - 1) * half)
      return
    }
    const other = named(ctx, to)[0]
    if (other) place(ctx, other.x, other.y, other.z)
  },
  motion_glidesecstoxy(ctx) {
    const g = ctx.frame.glide as Glide3 | undefined
    return g ? glide(ctx, g.x1, g.y1) : glide(ctx, studs(ctx, 'X'), studs(ctx, 'Y'))
  },
  motion_glideto(ctx) {
    const g = ctx.frame.glide as Glide3 | undefined
    if (g) return glide(ctx, g.x1, g.y1)
    const other = named(ctx, menu(ctx, 'TO'))[0]
    if (!other) return
    return glide(ctx, other.x, other.y)
  },
  motion_pointtowards(ctx) {
    const t = ctx.target
    const other = named(ctx, menu(ctx, 'TOWARDS'))[0]
    if (!isTarget3(t) || !other || t.isStage) return
    // Direction 0 looks away from you (−z), 90 along +x.
    const d = atan2Deg(other.x - t.x, -(other.z - t.z))
    motionPrimitives.motion_pointindirection({ ...ctxWith(ctx, { DIRECTION: d }) })
  },
  // The 2D edge means nothing on a build plate.
  motion_ifonedgebounce: () => undefined,
}

/** The same block context, with some inputs replaced. */
function ctxWith(ctx: PrimitiveCtx, args: Record<string, Value>): PrimitiveCtx {
  return {
    target: ctx.target,
    runtime: ctx.runtime,
    thread: ctx.thread,
    frame: ctx.frame,
    warp: ctx.warp,
    arg: (name) => (name in args ? args[name] : ctx.arg(name)),
    field: (name) => ctx.field(name),
  }
}

/** "touching (brick)?" in 3D: turned footprints that meet or overlap, with heights that overlap. */
function touching(ctx: PrimitiveCtx): boolean {
  const me = ctx.target
  if (!isTarget3(me) || !me.body3 || !me.visible) return false
  const name = menu(ctx, 'TOUCHINGOBJECTMENU')
  if (!name || name === '_mouse_' || name === '_edge_') return false
  const mine = footprintOf(me, me.body3)
  for (const t of named(ctx, name)) {
    if (!t.visible || !t.body3) continue
    if (footprintsTouch(mine, footprintOf(t, t.body3))) return true
  }
  return false
}

/** "distance to (brick)" in 3D, in studs, middle to middle. */
function distanceTo(ctx: PrimitiveCtx): number {
  const me = ctx.target
  if (!isTarget3(me)) return 10000
  const others = named(ctx, menu(ctx, 'DISTANCETOMENU'))
  const other = others[0]
  if (!other) return 10000
  const [ax, ay, az] = centre(me)
  const [bx, by, bz] = centre(other)
  const dx = bx - ax, dy = by - ay, dz = bz - az
  return worldToStuds(Math.sqrt(dx * dx + dy * dy + dz * dz))
}

/** "[x position] of (brick)": positions in studs; everything else as in Scratch. */
function sensingOf(ctx: PrimitiveCtx): Value | void {
  const property = menu(ctx, 'PROPERTY')
  if (property === 'x position' || property === 'y position') {
    const other = named(ctx, menu(ctx, 'OBJECT'))[0]
    if (!other) return 0
    return worldToStuds(property === 'x position' ? other.x : other.y)
  }
  return sensingPrimitives.sensing_of(ctx) as Value | void
}

/**
 * The 3D category's own blocks, and the Platformer's with a z. Everything in studs and studs per second.
 */
export const kit3dPrimitives: PrimitiveTable = {
  ...motion3dPrimitives,
  sensing_touchingobject: touching,
  sensing_distanceto: distanceTo,
  sensing_of: sensingOf,
  platformer_setspeed: (ctx) => speed(ctx, false),
  platformer_changespeed: (ctx) => speed(ctx, true),
  platformer_speed(ctx) {
    const b = isTarget3(ctx.target) ? ctx.target.body3 : undefined
    return b ? worldToStuds(velocity(b, axis3(ctx))) : 0
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
  kit3d_gotoxyz: (ctx) => place(ctx, studs(ctx, 'X'), studs(ctx, 'Y'), studs(ctx, 'Z')),
  kit3d_changez: (ctx) => place(ctx, NaN, NaN, ctx.target.isStage || !isTarget3(ctx.target) ? NaN : ctx.target.z + studs(ctx, 'DZ')),
  kit3d_setz: (ctx) => place(ctx, NaN, NaN, studs(ctx, 'Z')),
  kit3d_zposition: (ctx) => (isTarget3(ctx.target) ? worldToStuds(ctx.target.z) : 0),
  /** launch who landed on me up at (speed): every body that came down on this brick's top in the last physics step. */
  kit3d_launchlanders(ctx) {
    const n = studsToWorld(num(ctx.arg('SPEED')))
    const world = ctx.runtime.world as World3
    if (!world.bumps3d) return
    for (const bump of world.bumps3d) {
      if (bump.otherId !== ctx.target.id || bump.side !== 'top') continue
      const mover = world.targets.find((t) => t.id === bump.moverId)
      if (mover?.body3) setVelocity(mover.body3, 'y', n)
    }
  },
  /** go back to where I started: this copy's place in the project, standing still. */
  kit3d_gohome(ctx) {
    const t = ctx.target
    if (t.isStage || !isTarget3(t)) return
    sendHome(ctx.runtime.world as World3, t)
    if (t.visible) ctx.runtime.requestRedraw()
  },
}
