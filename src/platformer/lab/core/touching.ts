/**
 * Pixel touching for two targets, and the level-edge predicate.
 *
 * Sprite touching samples the center of every world unit step (i+0.5, j+0.5) that lies inside the
 * overlapping axis-aligned bounds, then asks both costumes whether that point is opaque. A costume
 * with no mask is solid inside its opaque rectangle. Ghost never rejects a hit; a hidden target does.
 *
 * Touching the edge is the bounds test from fixture M13: strict past `world.bounds`, so a costume
 * that merely sits on the boundary is not touching. Bounds come from `geometry.ts` (the opaque
 * rectangle's corners, which can be a little larger than a convex hull once rotated).
 */
import type { Costume, StageBounds, Target, World } from './contracts'
import { costumeOf, opaqueRect, targetBounds, transformOf, worldToCostume } from './geometry'

/** Integer indexes `i` whose step center `i + 0.5` lies in the closed interval [lo, hi]. */
function centerRange(lo: number, hi: number): [number, number] {
  if (!(lo < hi) || !Number.isFinite(lo) || !Number.isFinite(hi)) return [1, 0]
  return [Math.ceil(lo - 0.5), Math.floor(hi - 0.5)]
}

function intersect(a: StageBounds, b: StageBounds): StageBounds | undefined {
  const left = Math.max(a.left, b.left)
  const right = Math.min(a.right, b.right)
  const bottom = Math.max(a.bottom, b.bottom)
  const top = Math.min(a.top, b.top)
  if (!(left < right && bottom < top)) return undefined
  return { left, right, bottom, top }
}

function maskHit(costume: Costume, px: number, py: number): boolean {
  const rect = opaqueRect(costume)
  if (px < rect.left || px >= rect.right || py < rect.top || py >= rect.bottom) return false
  const mask = costume.mask
  if (!mask) return true
  if (px < 0 || py < 0 || px >= mask.width || py >= mask.height) return false
  return mask.data[py * mask.width + px] !== 0
}

/** True when the world point lands on an opaque costume pixel. Ignores visibility and ghost. */
export function opaqueAt(world: World, target: Target, wx: number, wy: number): boolean {
  const costume = costumeOf(world, target)
  if (!costume) return false
  const [cx, cy] = worldToCostume(transformOf(target), costume, wx, wy)
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false
  return maskHit(costume, Math.floor(cx), Math.floor(cy))
}

/**
 * Pixel overlap of two targets. Hidden targets do not touch. Ghost is ignored.
 * A target does not get a special case for itself; callers that mean "other sprites" skip self.
 */
export function targetsTouch(world: World, a: Target, b: Target): boolean {
  if (!a.visible || !b.visible) return false
  const boundsA = targetBounds(world, a)
  const boundsB = targetBounds(world, b)
  if (!boundsA || !boundsB) return false
  const overlap = intersect(boundsA, boundsB)
  if (!overlap) return false
  const [x0, x1] = centerRange(overlap.left, overlap.right)
  const [y0, y1] = centerRange(overlap.bottom, overlap.top)
  for (let ix = x0; ix <= x1; ix++) {
    const x = ix + 0.5
    for (let iy = y0; iy <= y1; iy++) {
      const y = iy + 0.5
      if (opaqueAt(world, a, x, y) && opaqueAt(world, b, x, y)) return true
    }
  }
  return false
}

/** Strictly outside the level. Equality with the boundary is not touching (M13). Hidden still counts. */
export function touchingEdge(world: World, target: Target): boolean {
  const bounds = targetBounds(world, target)
  if (!bounds) return false
  const stage = world.bounds
  return bounds.left < stage.left || bounds.right > stage.right || bounds.bottom < stage.bottom || bounds.top > stage.top
}

/** Point-in-costume test. Visibility is the caller's decision (the mouse pointer ignores it). */
export function touchingPoint(world: World, target: Target, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  return opaqueAt(world, target, x, y)
}
