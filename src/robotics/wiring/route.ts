import { PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { brickFrame, toWorldDirection, toWorldPoint, type PartMap } from '../model/grid'
import type { Vec3 } from '../model/vec'
import { roboticsSpec, type HubPort, type RoboticsDeviceKind } from '../parts/catalog'

/**
 * Where cables leave parts and how they run (contract §5: cables route automatically,
 * there is no cable positioning). Pure, so the routing is tested without a renderer.
 *
 * Each device part has one cable anchor, fixed per part in its local frame (rotation 0:
 * origin at the footprint centre of the bottom face, +Y up), so a cable always leaves
 * the same place. Parts that are built side by side (motors back to back in a rover, a
 * sensor against the hub) have theirs on the top face, toward the back: the motor
 * away from its output, the sensor away from its eyes. Parts whose top is working
 * surface (the hinge motor's turntable, the light's lens, the button's cap) have
 * theirs on the back face, low on the housing. The other end is the hub port's socket
 * from the catalog.
 */
export type CableEnd = {
  point: Vec3
  normal: Vec3
  /**
   * Top anchors only: where an unplugged cable's end hangs, as a horizontal offset from the
   * anchor that keeps it over the part's own top (so it never pokes into a neighbour).
   */
  looseEnd?: Vec3
}

const studs = (count: number) => count * STUD
const plates = (count: number) => count * PLATE_HEIGHT
const UP: Vec3 = { x: 0, y: 1, z: 0 }

export const CABLE_ANCHORS: Record<Exclude<RoboticsDeviceKind, 'hub'>, CableEnd> = {
  // Motor: 3×3, 6 plates, output on +X. The cable leaves the top, a stud from the back edge.
  motor: { point: { x: -studs(0.9), y: plates(6), z: 0 }, normal: UP, looseEnd: { x: -studs(0.5), y: 0, z: 0 } },
  // Hinge motor: 2×2; the cable leaves the fixed housing's back (the lower 4 plates), never the turntable.
  'hinge-motor': { point: { x: 0, y: plates(2), z: studs(1) }, normal: { x: 0, y: 0, z: 1 } },
  // Distance sensor: 2×1, 3 plates, eyes on -Z. The cable leaves the top, behind the eyes.
  'distance-sensor': { point: { x: 0, y: plates(3), z: studs(0.2) }, normal: UP, looseEnd: { x: studs(0.5), y: 0, z: studs(0.2) } },
  // Light: 1×1, lens on top. The cable leaves the back, low.
  light: { point: { x: 0, y: plates(1), z: studs(0.5) }, normal: { x: 0, y: 0, z: 1 } },
  // Button: 2×2, cap on top. The cable leaves the back.
  button: { point: { x: 0, y: plates(1.5), z: studs(1) }, normal: { x: 0, y: 0, z: 1 } },
}

export function deviceCableEnd(brick: BrickInstance, partMap: PartMap, plateSize: number): CableEnd | null {
  const spec = roboticsSpec(brick.partId)
  const part = partMap[brick.partId]
  if (!spec || !part || spec.role === 'hub' || !(spec.role in CABLE_ANCHORS)) return null
  const anchor = CABLE_ANCHORS[spec.role as keyof typeof CABLE_ANCHORS]
  const frame = brickFrame(brick, part, plateSize)
  return { point: toWorldPoint(frame, anchor.point), normal: toWorldDirection(frame, anchor.normal), ...(anchor.looseEnd ? { looseEnd: toWorldDirection(frame, anchor.looseEnd) } : {}) }
}

export function hubPortEnd(hub: BrickInstance, port: HubPort, partMap: PartMap, plateSize: number): CableEnd | null {
  const spec = roboticsSpec(hub.partId)
  const part = partMap[hub.partId]
  const socket = spec?.ports?.find((candidate) => candidate.label === port)
  if (!socket || !part) return null
  const frame = brickFrame(hub, part, plateSize)
  return { point: toWorldPoint(frame, socket.point), normal: toWorldDirection(frame, socket.normal) }
}

/** A brick's world box, for lifting cables clear of it. */
export type Obstacle = { id: string; minX: number; maxX: number; minZ: number; maxZ: number; top: number }

export function brickObstacles(bricks: readonly BrickInstance[], partMap: PartMap, plateSize: number): Obstacle[] {
  const result: Obstacle[] = []
  for (const brick of bricks) {
    const part = partMap[brick.partId]
    if (!part) continue
    const size = rotatedSize(part, brick.rotation)
    const minX = (brick.x - plateSize / 2) * STUD
    const minZ = (brick.z - plateSize / 2) * STUD
    result.push({ id: brick.id, minX, maxX: minX + size.width * STUD, minZ, maxZ: minZ + size.depth * STUD, top: (brick.y + part.height) * PLATE_HEIGHT })
  }
  return result
}

/** How far a cable runs straight out of a socket before it turns. */
export const LEAD_OUT = 0.24
/** Air between a cable's lifted run and the tallest brick under it. */
export const CLEARANCE = 0.14
/** Even with nothing in the way a cable sags upward a little, so it reads as a cable and not a rod. */
const MIN_ARC = 0.12
/** Half the cable's thickness plus a hair: a brick this close to the run counts as under it. */
const SIDE_MARGIN = 0.06

const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => ({ x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale })
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })

/** The tallest obstacle top under the straight run from `a` to `b` (plan view), or -Infinity. */
export function highestUnder(a: Vec3, b: Vec3, obstacles: readonly Obstacle[], samples = 16): number {
  let highest = -Infinity
  for (let index = 0; index <= samples; index += 1) {
    const point = lerp(a, b, index / samples)
    for (const box of obstacles) {
      if (point.x < box.minX - SIDE_MARGIN || point.x > box.maxX + SIDE_MARGIN || point.z < box.minZ - SIDE_MARGIN || point.z > box.maxZ + SIDE_MARGIN) continue
      if (box.top > highest) highest = box.top
    }
  }
  return highest
}

/**
 * The control points of a cable from a device to a hub port: straight out of each
 * socket, up, across at a height clear of every brick under the run (the two parts it
 * joins included, so a cable into the far side of the hub goes over the hub, not
 * through it), and down into the other socket. The rise happens outside the socket's
 * face, so the rounded corner never cuts the part it leaves. The renderer draws a
 * smooth curve through these points.
 */
export function routeCable(from: CableEnd, to: CableEnd, obstacles: readonly Obstacle[]): Vec3[] {
  const start = add(from.point, from.normal, 0.02)
  const end = add(to.point, to.normal, 0.02)
  const outA = add(from.point, from.normal, LEAD_OUT)
  const outB = add(to.point, to.normal, LEAD_OUT)
  const under = highestUnder(outA, outB, obstacles)
  const lift = Math.max(under + CLEARANCE, Math.max(outA.y, outB.y) + MIN_ARC)
  const upA = add({ ...outA, y: lift }, from.normal, 0.06)
  const upB = add({ ...outB, y: lift }, to.normal, 0.06)
  return [start, outA, upA, upB, outB, end]
}

/** The highest point of a route: where the run crosses. */
export const routeLift = (points: readonly Vec3[]) => Math.max(...points.map((point) => point.y))

/**
 * An unplugged device's loose cable: a short stub out of its socket ending in the red
 * plug. From a top anchor it rises and curls over, its end hanging above the part's own
 * top (never over a neighbour built against it); from a back anchor it droops.
 */
export function looseCable(from: CableEnd): Vec3[] {
  const start = add(from.point, from.normal, 0.02)
  if (from.normal.y > 0.5) {
    const offset = from.looseEnd ?? { x: 0, y: 0, z: 0 }
    const out = add(from.point, from.normal, 0.24)
    const bend = add(add(from.point, from.normal, 0.4), offset, 0.5)
    const tip = add(add(from.point, from.normal, 0.3), offset)
    return [start, out, bend, tip]
  }
  const out = add(from.point, from.normal, 0.2)
  const bend = add(add(from.point, from.normal, 0.36), { x: 0, y: -1, z: 0 }, 0.08)
  const tip = add(add(from.point, from.normal, 0.44), { x: 0, y: -1, z: 0 }, 0.22)
  return [start, out, bend, { ...tip, y: Math.max(tip.y, 0.06) }]
}
