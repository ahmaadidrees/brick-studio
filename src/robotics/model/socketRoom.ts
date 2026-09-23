import { PLATE_HEIGHT, rotatedSize } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { ROBOTICS_PART_IDS, roboticsSpec } from '../parts/catalog'
import { overlappingBricks } from './blocked'
import { brickFrame, toWorldDirection, toWorldPoint, type PartMap } from './grid'
import { connectorPose, type SnapPose } from './plateEdges'
import type { Vec3 } from './vec'

/**
 * Is there room for an axle in a motor's socket? (kid-UX lane W.) A motor in the middle of a
 * plate, or at its edge facing in, has its socket over the plate or against another part: no
 * axle can go in, so no wheel can ever turn there. "Motors go on the sides so the wheels touch
 * the ground." Loose wheels and axles standing in the way do not count: they move (and a loose
 * wheel has its own fix). Pure.
 */
export type SocketFrame = { point: Vec3; normal: Vec3 }

/** A motor's socket in the world, or null for a part without one. */
export function socketOf(motor: Pick<BrickInstance, 'partId' | 'x' | 'y' | 'z' | 'rotation'>, partMap: PartMap, plateSize: number): SocketFrame | null {
  const spec = roboticsSpec(motor.partId)
  const part = partMap[motor.partId]
  if (!spec?.socket || !part) return null
  const frame = brickFrame({ ...motor, id: 'socket-of', color: '' }, part, plateSize)
  return { point: toWorldPoint(frame, spec.socket.point), normal: toWorldDirection(frame, spec.socket.normal) }
}

/** Where a short axle in this socket would stand, or null when none can (below the ground, off the plate, pointing up or down). */
export function axlePoseAt(socket: SocketFrame, partMap: PartMap, plateSize: number, axlePartId: string = ROBOTICS_PART_IDS.axleShort): SnapPose | null {
  const part = partMap[axlePartId]
  const axle = roboticsSpec(axlePartId)?.axle
  if (!part || !axle) return null
  return connectorPose(part, axle.center, socket.point, socket.normal, axle.halfLength, plateSize)
}

const movable = (brick: BrickInstance) => {
  const role = roboticsSpec(brick.partId)?.role
  return role === 'wheel' || role === 'axle'
}

/**
 * The bricks that sit where an axle in this motor's socket would go (empty: the socket faces open
 * space). Null when no axle can stand there at all. `bricks` are the others to check against; the
 * motor itself, loose wheels and axles never count.
 */
export function socketCoveredBy(motor: Pick<BrickInstance, 'partId' | 'x' | 'y' | 'z' | 'rotation'> & { id?: string }, bricks: readonly BrickInstance[], partMap: PartMap, plateSize: number): string[] | null {
  const socket = socketOf(motor, partMap, plateSize)
  if (!socket || Math.abs(socket.normal.y) > 0.5) return null
  const pose = axlePoseAt(socket, partMap, plateSize)
  if (!pose) return null
  const others = bricks.filter((brick) => brick.id !== motor.id && !movable(brick))
  return overlappingBricks({ partId: ROBOTICS_PART_IDS.axleShort, ...pose }, others, partMap).map((brick) => brick.id)
}

/**
 * Where a motor's axle could go, for driving (kid-UX lane W):
 * - `open`: at the side of the plate it stands on, facing out: an axle goes in and its wheel reaches the ground.
 * - `covered`: its socket is over the plate or against a part (a motor in the middle of the plate).
 * - `facing-in`: at an edge of its plate but facing into it (turned around).
 * - `high`: standing on something taller than a plate (the hub): its wheel would never reach the ground.
 * - `low`: standing on the bare ground: its socket is too low for an axle on the ground.
 * - `none`: no socket, or one that faces up or down, or an axle there would leave the build plate.
 */
export type SocketRoom = 'open' | 'covered' | 'facing-in' | 'high' | 'low' | 'none'

/** An axle on the ground has its rod this many plates up (`catalog.ts`): a motor's socket must be there. */
const ROD_PLATES = 4

export function socketRoomOf(motor: Pick<BrickInstance, 'partId' | 'x' | 'y' | 'z' | 'rotation'> & { id?: string }, bricks: readonly BrickInstance[], partMap: PartMap, plateSize: number): SocketRoom {
  const socket = socketOf(motor, partMap, plateSize)
  if (!socket || Math.abs(socket.normal.y) > 0.5) return 'none'
  const plates = Math.round(socket.point.y / PLATE_HEIGHT)
  if (plates < ROD_PLATES) return 'low'
  if (plates > ROD_PLATES) return 'high'
  const covered = socketCoveredBy(motor, bricks, partMap, plateSize)
  if (covered === null) return 'none'
  if (!covered.length) return 'open'
  // Turned around at an edge: its back is to the plate's edge and its socket faces the middle.
  const part = partMap[motor.partId]
  const plate = part ? bricks.find((brick) => {
    const platePart = partMap[brick.partId]
    if (!platePart || platePart.kind !== 'plate' || brick.id === motor.id || motor.y !== brick.y + platePart.height) return false
    const a = rotatedSize(part, motor.rotation)
    const b = rotatedSize(platePart, brick.rotation)
    return motor.x < brick.x + b.width && brick.x < motor.x + a.width && motor.z < brick.z + b.depth && brick.z < motor.z + a.depth
  }) : undefined
  if (!plate || !part) return 'covered'
  const platePart = partMap[plate.partId]!
  const plateSize2 = rotatedSize(platePart, plate.rotation)
  const motorSize = rotatedSize(part, motor.rotation)
  const along = Math.abs(socket.normal.x) > 0.5 ? 'x' : 'z'
  const [lo, hi, edge0, edge1] = along === 'x'
    ? [motor.x, motor.x + motorSize.width, plate.x, plate.x + plateSize2.width]
    : [motor.z, motor.z + motorSize.depth, plate.z, plate.z + plateSize2.depth]
  const outward = along === 'x' ? socket.normal.x : socket.normal.z
  // Its back (the face opposite the socket) is at or beyond the plate's edge on that side.
  const backAtEdge = outward > 0 ? lo <= edge0 : hi >= edge1
  return backAtEdge ? 'facing-in' : 'covered'
}
