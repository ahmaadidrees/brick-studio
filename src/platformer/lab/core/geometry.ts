/**
 * Where a target's costume sits in the world. Shared by fencing (motion), edge checks and pixel touching.
 *
 * Costume space: pixels from the costume's top-left, y down. World space: steps, y up. At size 100 one costume
 * pixel is one step. Rotation follows Scratch: "all around" turns the art by (direction - 90) clockwise;
 * "left-right" mirrors it when direction < 0; "don't rotate" never turns it (§01 M-fixtures, L03).
 *
 * Bounds use the opaque rectangle's four rotated corners. Scratch's renderer uses the convex hull of opaque pixels,
 * so rotated bounds here can be slightly larger. Documented difference until the conformance suite says otherwise.
 */
import { sinCosDeg } from './detmath'
import type { Costume, StageBounds, Target, World } from './contracts'

export interface Transform {
  /** Position of the rotation center in world steps. */
  x: number
  y: number
  scale: number
  /** -1 when mirrored by the left-right rotation style. */
  flipX: number
  sin: number
  cos: number
}

export function costumeOf(world: World, target: Target): Costume | undefined {
  const brick = world.bricks[target.brickId]
  return brick?.costumes[target.costumeIndex]
}

export function transformOf(target: Target): Transform {
  let angle = 0
  let flipX = 1
  if (target.rotationStyle === 'all around') angle = target.direction - 90
  else if (target.rotationStyle === 'left-right' && target.direction < 0) flipX = -1
  const [sin, cos] = sinCosDeg(angle)
  return { x: target.x, y: target.y, scale: target.size / 100, flipX, sin, cos }
}

/** Costume pixel (cx, cy) → world point. */
export function costumeToWorld(t: Transform, costume: Costume, cx: number, cy: number): [number, number] {
  const lx = (cx - costume.rotationCenterX) * t.scale * t.flipX
  const ly = (costume.rotationCenterY - cy) * t.scale
  // Clockwise rotation in a y-up frame.
  return [t.x + lx * t.cos + ly * t.sin, t.y - lx * t.sin + ly * t.cos]
}

/** World point → costume pixel coordinates (fractional). */
export function worldToCostume(t: Transform, costume: Costume, wx: number, wy: number): [number, number] {
  const dx = wx - t.x
  const dy = wy - t.y
  // Inverse (counter-clockwise) rotation.
  const lx = dx * t.cos - dy * t.sin
  const ly = dx * t.sin + dy * t.cos
  if (t.scale === 0) return [NaN, NaN]
  return [lx / (t.scale * t.flipX) + costume.rotationCenterX, costume.rotationCenterY - ly / t.scale]
}

export function opaqueRect(costume: Costume): { left: number; top: number; right: number; bottom: number } {
  return costume.opaque ?? { left: 0, top: 0, right: costume.width, bottom: costume.height }
}

/** World-space axis-aligned bounds of the target's opaque costume area. */
export function targetBounds(world: World, target: Target): StageBounds | undefined {
  const costume = costumeOf(world, target)
  if (!costume) return undefined
  return boundsFor(transformOf(target), costume)
}

export function boundsFor(t: Transform, costume: Costume): StageBounds {
  const r = opaqueRect(costume)
  const corners: [number, number][] = [
    costumeToWorld(t, costume, r.left, r.top),
    costumeToWorld(t, costume, r.right, r.top),
    costumeToWorld(t, costume, r.left, r.bottom),
    costumeToWorld(t, costume, r.right, r.bottom),
  ]
  let left = Infinity
  let right = -Infinity
  let bottom = Infinity
  let top = -Infinity
  for (const [x, y] of corners) {
    if (x < left) left = x
    if (x > right) right = x
    if (y < bottom) bottom = y
    if (y > top) top = y
  }
  return { left, right, bottom, top }
}
