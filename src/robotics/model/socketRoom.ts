import type { BrickInstance } from '../../brick/types'
import { ROBOTICS_PART_IDS, roboticsSpec } from '../parts/catalog'
import { overlappingBricks } from './blocked'
import { brickFrame, toWorldDirection, toWorldPoint, type PartMap } from './grid'
import { connectorPose, type SnapPose } from './snap'
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
