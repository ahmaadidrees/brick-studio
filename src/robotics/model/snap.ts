import { PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickDraft, BrickInstance, BrickPart } from '../../brick/types'
import { roboticsSpec } from '../parts/catalog'
import type { PartMap } from './grid'
import { deriveMechanisms, type AxleLink } from './mechanism'
import { add, distance, normalize, scale, sub, type Vec3 } from './vec'

/**
 * Connector snapping for the armed ghost (contract §3: "a wheel snaps onto a free
 * axle end", "a motor's output face accepts one axle"). When an axle hovers a motor
 * it goes into the socket; when it hovers a wheel it goes through the hole. When a
 * wheel hovers an axle (or a motor whose axle has a free end) it goes onto the
 * nearest free end. The pose is the one the mechanism reader (`mechanism.ts`) will
 * recognise, computed from the same connector geometry, so a snapped part is
 * connected by construction. Anything else — an occupied socket, a wheel already on
 * an axle, a connector that would put the part below the plate — answers null and
 * placement is the studio's own. Nothing here edits the document.
 */
export type SnapPose = { x: number; y: number; z: number; rotation: 0 | 1 | 2 | 3 }

export type SnapInput = {
  draft: Pick<BrickDraft, 'partId'>
  hitBrick: BrickInstance
  /** Where the pointer hit the part, world units: it picks between two free ends or faces. */
  hitPoint: Vec3
  bricks: readonly BrickInstance[]
  partMap: PartMap
  plateSize: number
}

/** Where the ghost's connector must touch, and which way the ghost's body extends from there. */
type SnapTarget = { point: Vec3; outward: Vec3 }

export function snapDraftToConnector(input: SnapInput): SnapPose | null {
  const { draft, hitBrick, hitPoint, bricks, partMap, plateSize } = input
  const draftSpec = roboticsSpec(draft.partId)
  const part = partMap[draft.partId]
  if (!draftSpec || !part || (!draftSpec.axle && !draftSpec.wheel)) return null
  const hitSpec = roboticsSpec(hitBrick.partId)
  if (!hitSpec || (!hitSpec.socket && !hitSpec.axle && !hitSpec.wheel)) return null
  const mechanisms = deriveMechanisms(bricks, partMap, plateSize)

  if (draftSpec.axle) {
    let target: SnapTarget | null = null
    if (hitSpec.socket) {
      const motor = mechanisms.motorById.get(hitBrick.id)
      if (!motor || motor.axleId) return null
      target = { point: motor.socket.point, outward: motor.socket.normal }
    } else if (hitSpec.wheel) {
      const wheel = mechanisms.wheelById.get(hitBrick.id)
      if (!wheel || wheel.axleId) return null
      const faces = [add(wheel.center, scale(wheel.axis, wheel.halfThickness)), sub(wheel.center, scale(wheel.axis, wheel.halfThickness))]
      const face = nearest(faces, hitPoint)
      target = { point: face, outward: normalize(sub(face, wheel.center)) }
    }
    return target ? poseFor(part, draftSpec.axle.center, target, draftSpec.axle.halfLength, plateSize) : null
  }

  // A wheel: onto a free end of the axle under the pointer, or of the axle in the motor under it.
  let axle: AxleLink | undefined
  if (hitSpec.axle) axle = mechanisms.axleById.get(hitBrick.id)
  else if (hitSpec.socket) {
    const motor = mechanisms.motorById.get(hitBrick.id)
    axle = motor?.axleId ? mechanisms.axleById.get(motor.axleId) : undefined
  }
  if (!axle) return null
  const free = axle.ends.filter((end) => end.motorId === null && end.wheelId === null)
  if (!free.length) return null
  const end = free.reduce((best, candidate) => (distance(candidate.point, hitPoint) < distance(best.point, hitPoint) ? candidate : best))
  return poseFor(part, draftSpec.wheel!.center, { point: end.point, outward: end.outward }, draftSpec.wheel!.halfThickness, plateSize)
}

function nearest(points: Vec3[], to: Vec3): Vec3 {
  return points.reduce((best, candidate) => (distance(candidate, to) < distance(best, to) ? candidate : best))
}

const onGrid = (value: number) => Math.abs(value - Math.round(value)) < 1e-6

/**
 * Grid pose whose connector (running along the part's local X through `localCenter`)
 * touches `target.point` with the body extending `reach` along `target.outward`.
 * Both connectors are centred on their footprint, so a quarter turn only swaps the
 * axis; a vertical connector has no stud-grid pose and answers null.
 */
function poseFor(part: BrickPart, localCenter: Vec3, target: SnapTarget, reach: number, plateSize: number): SnapPose | null {
  const rotation: 0 | 1 | null = Math.abs(target.outward.x) > 0.5 ? 0 : Math.abs(target.outward.z) > 0.5 ? 1 : null
  if (rotation === null) return null
  const center = add(target.point, scale(target.outward, reach))
  const size = rotatedSize(part, rotation)
  const x = center.x / STUD + plateSize / 2 - size.width / 2
  const z = center.z / STUD + plateSize / 2 - size.depth / 2
  const y = (center.y - localCenter.y) / PLATE_HEIGHT
  if (!onGrid(x) || !onGrid(y) || !onGrid(z)) return null
  const pose = { x: Math.round(x), y: Math.round(y), z: Math.round(z), rotation }
  if (pose.y < 0 || pose.x < 0 || pose.z < 0 || pose.x + size.width > plateSize || pose.z + size.depth > plateSize) return null
  return pose
}
