import { rotatedSize, supportHeightForFootprint } from '../../brick/parts'
import { draftIsValid } from '../../brick/store'
import type { BrickDraft, BrickInstance } from '../../brick/types'
import { deriveCreations, type DeriveInput } from '../model/creations'

/**
 * Where a part from a "Make it yours" idea goes on its robot (lane P; Ava, 8, whose first seat
 * landed loose on the ground in front of the car): the highest free spot on the robot where the
 * part rests on the robot's own bricks and joins it, the one nearest the robot's middle first.
 * Pure: whether it would join is the model's own answer (the studio's stud rules), asked of the
 * robot with the part added.
 */
export type Spot = { x: number; y: number; z: number }

/** How many spots are tried, highest first, before giving up (each one is a derivation). */
const MAX_TRIES = 60

export function attachSpot(input: DeriveInput, creationId: string, draft: Pick<BrickDraft, 'partId' | 'rotation' | 'color'>): Spot | null {
  const part = input.partMap[draft.partId]
  const robot = deriveCreations(input).find((creation) => creation.id === creationId)
  if (!part || !robot) return null
  const { width, depth } = rotatedSize(part, draft.rotation)
  // The studio's helpers take mutable arrays; neither writes to them.
  const bricks = [...input.bricks]
  const byId = new Map(bricks.map((brick) => [brick.id, brick]))
  const members = robot.brickIds.map((id) => byId.get(id)).filter((brick): brick is BrickInstance => brick !== undefined)
  const sizeOf = (brick: BrickInstance) => ({ ...rotatedSize(input.partMap[brick.partId], brick.rotation), height: input.partMap[brick.partId].height })
  if (!members.length) return null
  // The robot's middle, for choosing among spots of the same height.
  let sumX = 0
  let sumZ = 0
  for (const brick of members) { const size = sizeOf(brick); sumX += brick.x + size.width / 2; sumZ += brick.z + size.depth / 2 }
  const middle = { x: sumX / members.length, z: sumZ / members.length }

  const seen = new Set<string>()
  const spots: (Spot & { away: number })[] = []
  for (const member of members) {
    const size = sizeOf(member)
    for (let sx = member.x; sx < member.x + size.width; sx += 1) {
      for (let sz = member.z; sz < member.z + size.depth; sz += 1) {
        // Every footprint of the part that covers this stud of the robot.
        for (let x = sx - width + 1; x <= sx; x += 1) {
          for (let z = sz - depth + 1; z <= sz; z += 1) {
            const key = `${x},${z}`
            if (seen.has(key)) continue
            seen.add(key)
            if (x < 0 || z < 0 || x + width > input.plateSize || z + depth > input.plateSize) continue
            const y = supportHeightForFootprint(bricks, x, z, width, depth)
            // It rests on one of the robot's own bricks, not on the ground or on someone else's.
            const restsOnRobot = members.some((brick) => {
              const s = sizeOf(brick)
              return brick.y + s.height === y && x < brick.x + s.width && x + width > brick.x && z < brick.z + s.depth && z + depth > brick.z
            })
            if (!restsOnRobot) continue
            spots.push({ x, y, z, away: Math.hypot(x + width / 2 - middle.x, z + depth / 2 - middle.z) })
          }
        }
      }
    }
  }
  spots.sort((a, b) => b.y - a.y || a.away - b.away)
  for (const spot of spots.slice(0, MAX_TRIES)) {
    const candidate: BrickInstance = { id: 'lane-p-attach-candidate', partId: draft.partId, rotation: draft.rotation, color: draft.color, x: spot.x, y: spot.y, z: spot.z }
    if (!draftIsValid(candidate, bricks, null, input.plateSize)) continue
    const joined = deriveCreations({ ...input, bricks: [...bricks, candidate] }).find((creation) => creation.id === creationId)
    if (joined?.brickIds.includes(candidate.id)) return { x: spot.x, y: spot.y, z: spot.z }
  }
  return null
}

/** True when this placed brick is part of some robot (the model's own membership). */
export function onARobot(input: DeriveInput, brickId: string): boolean {
  return deriveCreations(input).some((creation) => creation.brickIds.includes(brickId))
}
