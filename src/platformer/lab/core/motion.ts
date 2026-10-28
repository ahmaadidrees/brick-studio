/**
 * Motion primitives (Scratch opcodes `motion_*`).
 *
 * Coordinates are the world's: y up, direction 90 = right, fence = `world.bounds`
 * (the level is the stage). Trig goes through detmath. A visible move asks the
 * scheduler to redraw; a hidden one does not.
 */
import { atan2Deg, sinCosDeg } from './detmath'
import { targetBounds } from './geometry'
import { YIELD } from './contracts'
import type { Primitive, PrimitiveCtx, PrimitiveTable, RuntimeApi, Target, World } from './contracts'

const FENCE_MARGIN = 15

/** Directions wrap into (-180, 180], with -180 landing on 180. Non-finite values are rejected by the caller. */
export function wrapDirection(direction: number): number {
  const wrapped = direction - 360 * Math.ceil((direction - 180) / 360)
  return wrapped + 0
}

/** Own x/y reporters snap a value that is already within 1e-9 of an integer. The stored coordinate is left alone. */
export function reportCoordinate(n: number): number {
  const rounded = Math.round(n)
  return Math.abs(n - rounded) < 1e-9 ? rounded : n
}

/**
 * Strict edge test: a costume past the level rectangle, not merely flush with it.
 * Bounce treats a flush edge as contact; this predicate does not (M13).
 */
export function isPastEdge(world: World, target: Target): boolean {
  const bounds = targetBounds(world, target)
  if (!bounds) return false
  const stage = world.bounds
  return bounds.left < stage.left || bounds.right > stage.right || bounds.bottom < stage.bottom || bounds.top > stage.top
}

/** Editor drag lock (Target.dragging). Block motion ignores a locked sprite unless `placeTarget` is forced. */
export function setDragging(target: Target, locked: boolean): void {
  target.dragging = locked
}

export function isDragging(target: Target): boolean {
  return target.dragging === true
}

/**
 * Partial-costume fence. At least `min(15, floor(min(width, height) / 2))` steps of the
 * costume stay inside the level. Right/top clamps floor the center; left/bottom clamps ceil it,
 * so a fractional result is pulled back inside.
 */
export function fencePosition(world: World, target: Target, x: number, y: number): [number, number] {
  const bounds = targetBounds(world, target)
  if (!bounds || target.isStage) return [x, y]
  const dx = x - target.x
  const dy = y - target.y
  const span = Math.min(bounds.right - bounds.left, bounds.top - bounds.bottom)
  const inset = Math.min(FENCE_MARGIN, Math.floor(span / 2))
  const stage = world.bounds
  const minRight = stage.left + inset
  const maxLeft = stage.right - inset
  const minTop = stage.bottom + inset
  const maxBottom = stage.top - inset

  let nx = x
  let ny = y
  if (bounds.right + dx < minRight) nx = Math.ceil(target.x - (bounds.right - minRight))
  else if (bounds.left + dx > maxLeft) nx = Math.floor(target.x + (maxLeft - bounds.left))
  if (bounds.top + dy < minTop) ny = Math.ceil(target.y - (bounds.top - minTop))
  else if (bounds.bottom + dy > maxBottom) ny = Math.floor(target.y + (maxBottom - bounds.bottom))
  return [nx, ny]
}

/** Pull the whole costume rectangle inside the level. Used after a bounce, before the looser partial fence. */
function keepInside(world: World, target: Target, x: number, y: number): [number, number] {
  const bounds = targetBounds(world, target)
  if (!bounds) return [x, y]
  const stage = world.bounds
  const left = bounds.left + (x - target.x)
  const right = bounds.right + (x - target.x)
  const bottom = bounds.bottom + (y - target.y)
  const top = bounds.top + (y - target.y)
  let dx = 0
  let dy = 0
  if (left < stage.left) dx += stage.left - left
  if (right > stage.right) dx += stage.right - right
  if (top > stage.top) dy += stage.top - top
  if (bottom < stage.bottom) dy += stage.bottom - bottom
  return [x + dx, y + dy]
}

/** Move a sprite, fencing unless it is the stage or an editor drag is in progress. `force` bypasses the drag lock. */
export function placeTarget(runtime: RuntimeApi, target: Target, x: number, y: number, force = false): void {
  if (target.isStage) return
  if (isDragging(target) && !force) return
  const [fx, fy] = fencePosition(runtime.world, target, x, y)
  target.x = fx
  target.y = fy
  if (target.visible) runtime.requestRedraw()
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  const n = Number(value)
  return Number.isNaN(n) ? 0 : n
}

function read(ctx: PrimitiveCtx, name: string): unknown {
  const value = ctx.arg(name)
  return value !== '' ? value : ctx.field(name)
}

function setDirection(runtime: RuntimeApi, target: Target, direction: number): void {
  if (target.isStage || !Number.isFinite(direction)) return
  target.direction = wrapDirection(direction)
  if (target.visible) runtime.requestRedraw()
}

interface Glide {
  t0: number
  ms: number
  x0: number
  y0: number
  x1: number
  y1: number
}

function randomPoint(runtime: RuntimeApi): [number, number] {
  const stage = runtime.world.bounds
  const width = stage.right - stage.left
  const height = stage.top - stage.bottom
  const cx = (stage.left + stage.right) / 2
  const cy = (stage.bottom + stage.top) / 2
  return [
    Math.round(cx + width * (runtime.random() - 0.5)),
    Math.round(cy + height * (runtime.random() - 0.5)),
  ]
}

/** Where a go-to / glide-to menu points, or undefined when a named sprite does not exist. */
function resolveMenuPoint(ctx: PrimitiveCtx, menu: string): [number, number] | undefined {
  if (menu === '_mouse_') return [ctx.runtime.world.mouse.x, ctx.runtime.world.mouse.y]
  if (menu === '_random_') return randomPoint(ctx.runtime)
  const other = ctx.runtime.findOriginal(menu)
  if (!other) return undefined
  return [other.x, other.y]
}

function glideTo(ctx: PrimitiveCtx, x1: number, y1: number): ReturnType<Primitive> {
  const frame = ctx.frame
  let glide = frame.glide as Glide | undefined
  if (!glide) {
    const ms = asNumber(read(ctx, 'SECS')) * 1000
    if (!(ms > 0)) {
      placeTarget(ctx.runtime, ctx.target, x1, y1)
      return
    }
    glide = { t0: ctx.runtime.nowMs(), ms, x0: ctx.target.x, y0: ctx.target.y, x1, y1 }
    frame.glide = glide
    return YIELD
  }
  const elapsed = ctx.runtime.nowMs() - glide.t0
  if (elapsed < glide.ms) {
    const t = elapsed / glide.ms
    placeTarget(ctx.runtime, ctx.target, glide.x0 + t * (glide.x1 - glide.x0), glide.y0 + t * (glide.y1 - glide.y0))
    return YIELD
  }
  placeTarget(ctx.runtime, ctx.target, glide.x1, glide.y1)
}

type Edge = 'left' | 'top' | 'right' | 'bottom'

function nearestEdge(world: World, target: Target): Edge | undefined {
  const bounds = targetBounds(world, target)
  if (!bounds) return undefined
  const stage = world.bounds
  // Distance to each side, clamped at 0 once the costume is flush or past.
  // Ties keep the earlier side: left, then top, then right, then bottom.
  const sides: [Edge, number][] = [
    ['left', Math.max(0, bounds.left - stage.left)],
    ['top', Math.max(0, stage.top - bounds.top)],
    ['right', Math.max(0, stage.right - bounds.right)],
    ['bottom', Math.max(0, bounds.bottom - stage.bottom)],
  ]
  let best: Edge = 'left'
  let bestDist = Infinity
  for (const [edge, dist] of sides) {
    if (dist < bestDist) {
      best = edge
      bestDist = dist
    }
  }
  return bestDist > 0 ? undefined : best
}

function bounce(ctx: PrimitiveCtx): void {
  const edge = nearestEdge(ctx.runtime.world, ctx.target)
  if (!edge) return
  // In Scratch's y-up frame (0 up, 90 right): vx = sin(direction), vy = cos(direction).
  const [sinD, cosD] = sinCosDeg(ctx.target.direction)
  let vx = sinD
  let vy = cosD
  if (edge === 'left') vx = Math.max(0.2, Math.abs(vx))
  else if (edge === 'right') vx = -Math.max(0.2, Math.abs(vx))
  else if (edge === 'bottom') vy = Math.max(0.2, Math.abs(vy))
  else if (edge === 'top') vy = -Math.max(0.2, Math.abs(vy))
  setDirection(ctx.runtime, ctx.target, atan2Deg(vx, vy))
  const [x, y] = keepInside(ctx.runtime.world, ctx.target, ctx.target.x, ctx.target.y)
  placeTarget(ctx.runtime, ctx.target, x, y)
}

export const motionPrimitives: PrimitiveTable = {
  motion_movesteps(ctx) {
    const steps = asNumber(read(ctx, 'STEPS'))
    // dx = steps·cos(90−direction), dy = steps·sin(90−direction).
    const [dy, dx] = sinCosDeg(90 - ctx.target.direction)
    placeTarget(ctx.runtime, ctx.target, ctx.target.x + steps * dx, ctx.target.y + steps * dy)
  },

  motion_turnright(ctx) {
    setDirection(ctx.runtime, ctx.target, ctx.target.direction + asNumber(read(ctx, 'DEGREES')))
  },

  motion_turnleft(ctx) {
    setDirection(ctx.runtime, ctx.target, ctx.target.direction - asNumber(read(ctx, 'DEGREES')))
  },

  motion_pointindirection(ctx) {
    setDirection(ctx.runtime, ctx.target, asNumber(read(ctx, 'DIRECTION')))
  },

  motion_pointtowards(ctx) {
    const menu = String(read(ctx, 'TOWARDS'))
    if (menu === '_random_') {
      setDirection(ctx.runtime, ctx.target, Math.round(ctx.runtime.random() * 360) - 180)
      return
    }
    const point = resolveMenuPoint(ctx, menu)
    if (!point) return
    const dx = point[0] - ctx.target.x
    const dy = point[1] - ctx.target.y
    setDirection(ctx.runtime, ctx.target, 90 - atan2Deg(dy, dx))
  },

  motion_gotoxy(ctx) {
    placeTarget(ctx.runtime, ctx.target, asNumber(read(ctx, 'X')), asNumber(read(ctx, 'Y')))
  },

  motion_goto(ctx) {
    const point = resolveMenuPoint(ctx, String(read(ctx, 'TO')))
    if (!point) return
    placeTarget(ctx.runtime, ctx.target, point[0], point[1])
  },

  motion_glidesecstoxy(ctx) {
    const glide = ctx.frame.glide as Glide | undefined
    // Re-read the inputs only while the endpoint is still being captured.
    if (glide) return glideTo(ctx, glide.x1, glide.y1)
    return glideTo(ctx, asNumber(read(ctx, 'X')), asNumber(read(ctx, 'Y')))
  },

  motion_glideto(ctx) {
    const glide = ctx.frame.glide as Glide | undefined
    if (glide) return glideTo(ctx, glide.x1, glide.y1)
    const point = resolveMenuPoint(ctx, String(read(ctx, 'TO')))
    if (!point) return
    return glideTo(ctx, point[0], point[1])
  },

  motion_changexby(ctx) {
    placeTarget(ctx.runtime, ctx.target, ctx.target.x + asNumber(read(ctx, 'DX')), ctx.target.y)
  },

  motion_setx(ctx) {
    placeTarget(ctx.runtime, ctx.target, asNumber(read(ctx, 'X')), ctx.target.y)
  },

  motion_changeyby(ctx) {
    placeTarget(ctx.runtime, ctx.target, ctx.target.x, ctx.target.y + asNumber(read(ctx, 'DY')))
  },

  motion_sety(ctx) {
    placeTarget(ctx.runtime, ctx.target, ctx.target.x, asNumber(read(ctx, 'Y')))
  },

  motion_ifonedgebounce(ctx) {
    bounce(ctx)
  },

  motion_setrotationstyle(ctx) {
    const style = String(read(ctx, 'STYLE'))
    if (style !== 'all around' && style !== 'left-right' && style !== "don't rotate") return
    if (ctx.target.isStage) return
    ctx.target.rotationStyle = style
    if (ctx.target.visible) ctx.runtime.requestRedraw()
  },

  motion_xposition(ctx) {
    return reportCoordinate(ctx.target.x)
  },

  motion_yposition(ctx) {
    return reportCoordinate(ctx.target.y)
  },

  motion_direction(ctx) {
    return ctx.target.direction
  },
}
