import type { BrickInstance } from '../../brick/types'
import { isDevicePart, roboticsSpec, type RoboticsPartRole } from '../parts/catalog'
import { creationComponent, type DeriveInput, type DerivedCreation } from './creations'
import { planPutOnRobot, type FixOutcome } from './fixPlans'
import { rotatedSize } from '../../brick/parts'

/**
 * What to tell a student right after a device lands somewhere it cannot work
 * (docs/robotics/KID-UX.md §S; kid-UX lane W), in one line, where they are looking:
 *
 * - **Not attached**: a device beside a robot (within a few studs) but not on it names the
 *   robot, and a one-tap fix puts it on: "This motor isn't on Buggy yet." [Put it on Buggy]
 *   (`fix`, planned by `planPutOnRobot`: a motor to a free edge spot facing out, the other side
 *   of a robot with one motor first; a sensor or a light on top). When there is no room the
 *   line says so. A robot with no plate yet gets "Put them both on a plate." A device whose own
 *   bricks carry a hub is a robot of its own and is left alone.
 * - **Bare ground**: a motor standing on the baseplate can never take an axle and a wheel
 *   (its socket is one plate lower than an axle on the ground), so it says
 *   "Put motors on a plate so wheels reach the ground".
 *
 * Pure: read from the bricks, the creations and the component the device joined.
 */
export const NEAR_ROBOT_STUDS = 4
export const BARE_GROUND_TEXT = 'Put motors on a plate so wheels reach the ground'
export const BOTH_ON_A_PLATE = 'Put them both on a plate.'

export type PlacementAdvice =
  | { kind: 'not-attached'; brickId: string; creationId: string; text: string; fix: FixOutcome | null; needsPlate: boolean }
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
    if (robot) return notAttached(input, robot, brick)
  }
  if (spec.role === 'motor' && brick.y === 0) return { kind: 'bare-ground', brickId, text: BARE_GROUND_TEXT }
  return null
}

/** Motors standing on the baseplate: each can never take an axle and a wheel where it is. */
export function motorsOnBareGround(bricks: readonly BrickInstance[]): string[] {
  return bricks.filter((brick) => brick.y === 0 && roboticsSpec(brick.partId)?.role === 'motor').map((brick) => brick.id)
}

/** What a third grader calls the part: "motor", "sensor", "light". */
export function partWord(role: RoboticsPartRole | undefined): string {
  switch (role) {
    case 'motor': case 'hinge-motor': return 'motor'
    case 'distance-sensor': return 'sensor'
    case 'light': return 'light'
    case 'button': return 'button'
    case 'hub': return 'hub'
    case 'seat': return 'seat'
    case 'wheel': return 'wheel'
    case 'axle': return 'axle'
    default: return 'part'
  }
}

/** "This motor isn't on Buggy yet." and the one-tap fix that puts it on, or why it can't. */
export function notAttached(input: DeriveInput, robot: Robot, device: BrickInstance): Extract<PlacementAdvice, { kind: 'not-attached' }> {
  const what = `This ${partWord(roboticsSpec(device.partId)?.role)} isn't on ${robot.name} yet.`
  const plates = robot.brickIds.map((id) => input.bricks.find((candidate) => candidate.id === id)).filter((brick): brick is BrickInstance => Boolean(brick && input.partMap[brick.partId]?.kind === 'plate'))
  const motor = roboticsSpec(device.partId)?.role === 'motor'
  const base = { kind: 'not-attached' as const, brickId: device.id, creationId: robot.id }
  // A motor beside a robot with no plate: it has nowhere to go that works until there is one.
  if (motor && !plates.length) return { ...base, text: `${what} ${BOTH_ON_A_PLATE}`, fix: null, needsPlate: true }
  const fix = planPutOnRobot(input, robot, device.id)
  return { ...base, text: fix.ok ? what : `${what} ${fix.text}`.trim(), fix, needsPlate: false }
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
export function nearestRobot<T extends Robot>(input: DeriveInput, robots: readonly T[], device: BrickInstance, reach = NEAR_ROBOT_STUDS): T | null {
  const own = footprint(device, input)
  if (!own) return null
  let best: { robot: T; gap: number } | null = null
  for (const robot of robots) {
    for (const id of robot.brickIds) {
      if (id === device.id) continue
      const brick = input.bricks.find((candidate) => candidate.id === id)
      const rect = brick ? footprint(brick, input) : null
      if (!rect) continue
      const gap = gapBetween(own, rect)
      if (gap <= reach && (!best || gap < best.gap)) best = { robot, gap }
    }
  }
  return best?.robot ?? null
}
