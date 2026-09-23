import { rotatedSize } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { isDevicePart, roboticsSpec } from '../parts/catalog'
import { creationComponent, deviceName, type DeriveInput, type DerivedCreation } from './creations'

/**
 * What to tell a student right after a device lands somewhere it cannot work
 * (docs/robotics/KID-UX.md §S), in one line, where they are looking:
 *
 * - **Not attached**: a device beside a robot (within a few studs) but not on it names the
 *   robot and how to attach it: "Right motor isn't on Buggy yet. Put it on Buggy's plate."
 *   A device whose own bricks carry a hub is a robot of its own and is left alone.
 * - **Bare ground**: a motor standing on the baseplate can never take an axle and a wheel
 *   (its socket is one plate lower than an axle on the ground), so it says
 *   "Put motors on a plate so wheels reach the ground".
 *
 * Pure: read from the bricks, the creations and the component the device joined.
 */
export const NEAR_ROBOT_STUDS = 4
export const BARE_GROUND_TEXT = 'Put motors on a plate so wheels reach the ground'

export type PlacementAdvice =
  | { kind: 'not-attached'; brickId: string; creationId: string; text: string }
  | { kind: 'bare-ground'; brickId: string; text: string }

type Robot = Pick<DerivedCreation, 'id' | 'name' | 'brickIds'>

export function placementAdvice(input: DeriveInput, robots: readonly Robot[], brickId: string, component: readonly string[] = creationComponent(input, brickId)): PlacementAdvice | null {
  const byId = new Map(input.bricks.map((brick) => [brick.id, brick]))
  const brick = byId.get(brickId)
  const spec = brick ? roboticsSpec(brick.partId) : null
  if (!brick || !spec || !isDevicePart(brick.partId)) return null
  const members = new Set(component)
  const attached = robots.some((robot) => robot.brickIds.some((id) => members.has(id)))
  const ownHub = component.some((id) => roboticsSpec(byId.get(id)?.partId ?? '')?.role === 'hub')
  if (!attached && !ownHub) {
    const robot = nearestRobot(input, robots, brick)
    if (robot) return { kind: 'not-attached', brickId, creationId: robot.id, text: notAttachedText(input, robot, brick) }
  }
  if (spec.role === 'motor' && brick.y === 0) return { kind: 'bare-ground', brickId, text: BARE_GROUND_TEXT }
  return null
}

/** Motors standing on the baseplate: each can never take an axle and a wheel where it is. */
export function motorsOnBareGround(bricks: readonly BrickInstance[]): string[] {
  return bricks.filter((brick) => brick.y === 0 && roboticsSpec(brick.partId)?.role === 'motor').map((brick) => brick.id)
}

function notAttachedText(input: DeriveInput, robot: Robot, device: BrickInstance): string {
  const name = deviceName(input, device)
  const hasPlate = robot.brickIds.some((id) => {
    const brick = input.bricks.find((candidate) => candidate.id === id)
    return brick ? input.partMap[brick.partId]?.kind === 'plate' : false
  })
  const how = hasPlate ? `Put it on ${robot.name}'s plate.` : roboticsSpec(device.partId)?.role === 'motor' ? 'Put them both on a plate.' : `Stack it on ${robot.name}.`
  return `${name} isn't on ${robot.name} yet. ${how}`
}

type Rect = { x0: number; x1: number; z0: number; z1: number }

function footprint(brick: BrickInstance, input: DeriveInput): Rect | null {
  const part = input.partMap[brick.partId]
  if (!part) return null
  const size = rotatedSize(part, brick.rotation)
  return { x0: brick.x, x1: brick.x + size.width, z0: brick.z, z1: brick.z + size.depth }
}

const gapBetween = (a: Rect, b: Rect) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1))

/** The robot whose bricks come nearest the device, within a few studs. */
function nearestRobot(input: DeriveInput, robots: readonly Robot[], device: BrickInstance): Robot | null {
  const own = footprint(device, input)
  if (!own) return null
  let best: { robot: Robot; gap: number } | null = null
  for (const robot of robots) {
    for (const id of robot.brickIds) {
      const brick = input.bricks.find((candidate) => candidate.id === id)
      const rect = brick ? footprint(brick, input) : null
      if (!rect) continue
      const gap = gapBetween(own, rect)
      if (gap <= NEAR_ROBOT_STUDS && (!best || gap < best.gap)) best = { robot, gap }
    }
  }
  return best?.robot ?? null
}
