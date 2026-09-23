import { BRICK_PART_MAP, GRID_SIZE, PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { isConnectorPart } from './support'

/**
 * Kid basics (Robot Workshop prototype only): no surprise far-away drops. Near the top edge of the
 * view a ray aimed at the top of a build can skim past it and hit the ground far behind; the brick
 * then lands so far away it is a few pixels big (a tester clicked on top of a gate and his brick
 * went 30 studs behind it; the count went up and nothing showed where).
 *
 * A pointer spot is "far" when either rule holds; both are deliberately conservative, so building
 * on and next to a build, anywhere after panning or zooming there, or on an empty plate the camera
 * looks at, never trips them:
 *   A. Deep and away: the spot is more than FAR_DEPTH_RATIO times as far from the camera as the orbit
 *      target (a part there is drawn at under 60 % of the build's scale) AND more than
 *      FAR_OUTSIDE_STUDS studs outside the rectangle around the placed bricks and the orbit target.
 *   B. Skimmed past a brick: the pointer ray passes through a placed brick's box stretched
 *      GRAZE_UP_PLATES above its top (and GRAZE_SIDE_STUDS to its sides), i.e. it only just missed that
 *      brick, AND lands more than GRAZE_BEHIND_STUDS studs outside that brick's footprint. Axles and
 *      wheels are left out: their grid boxes are much bigger than the thin rod or tyre a student sees.
 * A far spot does not move the ghost and a click there places nothing; the student is told to zoom in.
 */
export const FAR_DEPTH_RATIO = 1.6
export const FAR_OUTSIDE_STUDS = 10
export const GRAZE_UP_PLATES = 2
export const GRAZE_SIDE_STUDS = 0.5
export const GRAZE_BEHIND_STUDS = 4

export type Point3 = { x: number; y: number; z: number }

/** The rectangle (world units, x/z) around the placed bricks and the orbit target. */
export type BuildArea = { minX: number; maxX: number; minZ: number; maxZ: number }
/** A placed brick's box in world units. */
export type BuildBox = BuildArea & { minY: number; maxY: number }

type Footprinted = Pick<BrickInstance, 'partId' | 'x' | 'y' | 'z' | 'rotation'>

function boxOf(brick: Footprinted, plateSize: number): BuildBox | null {
  const part = BRICK_PART_MAP[brick.partId]
  if (!part) return null
  const size = rotatedSize(part, brick.rotation)
  const x0 = (brick.x - plateSize / 2) * STUD
  const z0 = (brick.z - plateSize / 2) * STUD
  return { minX: x0, maxX: x0 + size.width * STUD, minZ: z0, maxZ: z0 + size.depth * STUD, minY: brick.y * PLATE_HEIGHT, maxY: (brick.y + part.height) * PLATE_HEIGHT }
}

export function buildAreaOf(bricks: readonly Footprinted[], target: Point3, plateSize: number = GRID_SIZE): BuildArea {
  const area = { minX: target.x, maxX: target.x, minZ: target.z, maxZ: target.z }
  for (const brick of bricks) {
    const box = boxOf(brick, plateSize)
    if (!box) continue
    area.minX = Math.min(area.minX, box.minX)
    area.maxX = Math.max(area.maxX, box.maxX)
    area.minZ = Math.min(area.minZ, box.minZ)
    area.maxZ = Math.max(area.maxZ, box.maxZ)
  }
  return area
}

/** Studs from `point` to the nearest edge of `area` on the ground plane (0 inside). */
export function studsOutside(point: Point3, area: BuildArea): number {
  const dx = Math.max(area.minX - point.x, 0, point.x - area.maxX)
  const dz = Math.max(area.minZ - point.z, 0, point.z - area.maxZ)
  return Math.hypot(dx, dz) / STUD
}

const distance = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/** Does the segment from `from` to `to` pass through `box` (slab test)? */
export function segmentCrossesBox(from: Point3, to: Point3, box: BuildBox): boolean {
  let enter = 0
  let leave = 1
  for (const [start, end, min, max] of [[from.x, to.x, box.minX, box.maxX], [from.y, to.y, box.minY, box.maxY], [from.z, to.z, box.minZ, box.maxZ]] as const) {
    const delta = end - start
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return false
      continue
    }
    let near = (min - start) / delta
    let far = (max - start) / delta
    if (near > far) [near, far] = [far, near]
    enter = Math.max(enter, near)
    leave = Math.min(leave, far)
    if (enter > leave) return false
  }
  return true
}

/** Rule B: the ray only just missed a placed brick and landed well behind it. */
export function skimsPastBrick(camera: Point3, point: Point3, bricks: readonly Footprinted[], plateSize: number = GRID_SIZE): boolean {
  const side = GRAZE_SIDE_STUDS * STUD
  for (const brick of bricks) {
    if (isConnectorPart(brick.partId)) continue
    const box = boxOf(brick, plateSize)
    if (!box || studsOutside(point, box) <= GRAZE_BEHIND_STUDS) continue
    const stretched: BuildBox = { minX: box.minX - side, maxX: box.maxX + side, minZ: box.minZ - side, maxZ: box.maxZ + side, minY: box.minY, maxY: box.maxY + GRAZE_UP_PLATES * PLATE_HEIGHT }
    if (segmentCrossesBox(camera, point, stretched)) return true
  }
  return false
}

/** Rule A: much deeper than what the camera looks at, and well away from everything built. */
export function deepAndAway(camera: Point3, target: Point3, point: Point3, area: BuildArea): boolean {
  const toTarget = distance(camera, target)
  if (!(toTarget > 1e-6)) return false
  return distance(camera, point) / toTarget > FAR_DEPTH_RATIO && studsOutside(point, area) > FAR_OUTSIDE_STUDS
}

export function isFarDrop(camera: Point3, target: Point3, point: Point3, bricks: readonly Footprinted[], plateSize: number = GRID_SIZE): boolean {
  return deepAndAway(camera, target, point, buildAreaOf(bricks, target, plateSize)) || skimsPastBrick(camera, point, bricks, plateSize)
}
