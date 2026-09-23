import { PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickInstance, BrickPart } from '../../brick/types'
import { add, scale, type Vec3 } from './vec'

/**
 * Plate-edge and connector geometry shared by the snapper (`snap.ts`), the socket-room reader
 * (`socketRoom.ts`) and the one-tap fixes (`fixPlans.ts`): where a motor sits flush on a plate's
 * edge facing out, where an axle or a wheel sits on a connector, and where the other side of a
 * plate is. Pure, stud-grid only.
 */
export type SnapPose = { x: number; y: number; z: number; rotation: 0 | 1 | 2 | 3 }

export type PlateEdge = 'left' | 'right' | 'far' | 'near'
export const PLATE_EDGES: readonly PlateEdge[] = ['left', 'right', 'far', 'near']
/** Quarter turns that face a motor's socket out over each edge (rotation 0 faces +X, the right). */
export const EDGE_ROTATION: Readonly<Record<PlateEdge, 0 | 1 | 2 | 3>> = { right: 0, far: 1, left: 2, near: 3 }
export const EDGE_OUTWARD: Readonly<Record<PlateEdge, Vec3>> = {
  right: { x: 1, y: 0, z: 0 }, far: { x: 0, y: 0, z: -1 }, left: { x: -1, y: 0, z: 0 }, near: { x: 0, y: 0, z: 1 },
}
export const OPPOSITE_EDGE: Readonly<Record<PlateEdge, PlateEdge>> = { left: 'right', right: 'left', far: 'near', near: 'far' }

export const isPlatePart = (part: BrickPart | undefined): part is BrickPart => part?.kind === 'plate'

export type Rect = { x0: number; x1: number; z0: number; z1: number }

export function plateRect(plate: BrickInstance, part: BrickPart): Rect {
  const size = rotatedSize(part, plate.rotation)
  return { x0: plate.x, x1: plate.x + size.width, z0: plate.z, z1: plate.z + size.depth }
}

/** Long sides first: a car's motors go on its long sides (on a square plate, left and right). */
export function preferredEdges(rect: Rect): readonly PlateEdge[] {
  return rect.x1 - rect.x0 > rect.z1 - rect.z0 ? ['far', 'near'] : ['left', 'right']
}

/** The edge a socket facing `normal` looks out over. */
export function edgeFacing(normal: Pick<Vec3, 'x' | 'z'>): PlateEdge {
  if (Math.abs(normal.x) > 0.5) return normal.x > 0 ? 'right' : 'left'
  return normal.z > 0 ? 'near' : 'far'
}

export type EdgeSlots = { rotation: 0 | 1 | 2 | 3; y: number; lo: number; hi: number; pose: (slot: number) => SnapPose; slotOf: (px: number, pz: number) => number }

/** Where a motor can sit flush along an edge: one grid slot per stud along it. */
export function edgeSlots(plate: BrickInstance, platePart: BrickPart, motorPart: BrickPart, edge: PlateEdge): EdgeSlots {
  const rect = plateRect(plate, platePart)
  const rotation = EDGE_ROTATION[edge]
  const size = rotatedSize(motorPart, rotation)
  const y = plate.y + platePart.height
  const alongZ = edge === 'left' || edge === 'right'
  const x = edge === 'left' ? rect.x0 : rect.x1 - size.width
  const z = edge === 'far' ? rect.z0 : rect.z1 - size.depth
  // A plate narrower than the motor: it overhangs both ends, still studded onto the plate.
  const [lo, hi] = alongZ ? [rect.z0, rect.z1 - size.depth].sort((a, b) => a - b) : [rect.x0, rect.x1 - size.width].sort((a, b) => a - b)
  return {
    rotation,
    y,
    lo,
    hi,
    pose: (slot) => (alongZ ? { x, y, z: slot, rotation } : { x: slot, y, z, rotation }),
    slotOf: (px, pz) => Math.min(hi, Math.max(lo, Math.round(alongZ ? pz - size.depth / 2 : px - size.width / 2))),
  }
}

/**
 * A motor standing on a plate, mirrored across the plate's middle and turned to face out over the
 * opposite edge: where the second motor of a car goes ("the other side").
 */
export function mirroredMotorPose(motor: Pick<BrickInstance, 'x' | 'y' | 'z' | 'rotation'>, motorPart: BrickPart, rect: Rect, facing: PlateEdge): SnapPose {
  const size = rotatedSize(motorPart, motor.rotation)
  const opposite = OPPOSITE_EDGE[facing]
  return facing === 'left' || facing === 'right'
    ? { x: rect.x0 + rect.x1 - (motor.x + size.width), y: motor.y, z: motor.z, rotation: EDGE_ROTATION[opposite] }
    : { x: motor.x, y: motor.y, z: rect.z0 + rect.z1 - (motor.z + size.depth), rotation: EDGE_ROTATION[opposite] }
}

const onGrid = (value: number) => Math.abs(value - Math.round(value)) < 1e-6

/**
 * Grid pose whose connector (running along the part's local X through `localCenter`)
 * touches `point` with the body extending `reach` along `outward`. Both connectors are
 * centred on their footprint, so a quarter turn only swaps the axis; a vertical connector
 * has no stud-grid pose and answers null. The pose may lie below the ground or off the
 * plate (`validPose` says whether it can be placed).
 */
export function rawPose(part: BrickPart, localCenter: Vec3, point: Vec3, outward: Vec3, reach: number, plateSize: number): SnapPose | null {
  const rotation: 0 | 1 | null = Math.abs(outward.x) > 0.5 ? 0 : Math.abs(outward.z) > 0.5 ? 1 : null
  if (rotation === null) return null
  const center = add(point, scale(outward, reach))
  const size = rotatedSize(part, rotation)
  const x = center.x / STUD + plateSize / 2 - size.width / 2
  const z = center.z / STUD + plateSize / 2 - size.depth / 2
  const y = (center.y - localCenter.y) / PLATE_HEIGHT
  if (!onGrid(x) || !onGrid(y) || !onGrid(z)) return null
  return { x: Math.round(x), y: Math.round(y), z: Math.round(z), rotation }
}

export function validPose(pose: SnapPose | null, part: BrickPart, plateSize: number): SnapPose | null {
  if (!pose) return null
  const size = rotatedSize(part, pose.rotation)
  if (pose.y < 0 || pose.x < 0 || pose.z < 0 || pose.x + size.width > plateSize || pose.z + size.depth > plateSize) return null
  return pose
}

/**
 * The grid pose a part takes when its connector (along its local X through `localCenter`) touches
 * `point` and its body extends `reach` along `outward`; null when that pose is off the stud grid,
 * below the ground or off the build plate. The same rule every snap target uses, shared with the
 * one-tap fixes (`fixPlans.ts`) so a fixed wheel is connected by construction too.
 */
export function connectorPose(part: BrickPart, localCenter: Vec3, point: Vec3, outward: Vec3, reach: number, plateSize: number): SnapPose | null {
  return validPose(rawPose(part, localCenter, point, outward, reach, plateSize), part, plateSize)
}
