import type { BrickInstance } from '../../brick/types'
import { emptyRoboticsSection, type RoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { kitAt, kitById } from './kits'

const PLATE = 64

/**
 * A saved Signal light with a 1 × 4 arm on its hub's top reaching out over bare ground, and a
 * Robot base placed beside it so that its hub's top meets the arm's underside: the only way a
 * kit, which stands on the ground, can end up studded to another robot.
 */
export function kitUnderAnOverhang(): { existing: BrickInstance[]; section: RoboticsSection; base: BrickInstance[] } {
  const signal = kitAt(kitById('signal-light'), { x: 20, z: 20 }, PLATE).map((brick) => ({ ...brick, id: `old-${brick.id}` }))
  const hub = signal.find((brick) => brick.partId === ROBOTICS_PART_IDS.hub)!
  const arm: BrickInstance = { id: 'old-arm', partId: 'brick_1x4', x: hub.x + 3, y: 7, z: hub.z + 2, rotation: 1, color: '#52636c' }
  const section: RoboticsSection = { ...emptyRoboticsSection(), creations: [{ id: 'old', name: 'Signal light', anchorBrickIds: signal.map((brick) => brick.id) }] }
  const base = kitById('robot-base').bricks.map((brick) => ({ ...brick, x: brick.x + hub.x + 4, z: brick.z + hub.z - 1 }))
  return { existing: [...signal, arm], section, base }
}


/**
 * Two saved robots (a hub with an arm on its top each) and a Robot base placed between them so
 * that both arms rest on its hub: a kit that joins two robots at once.
 */
export function kitBetweenTwoRobots(): { existing: BrickInstance[]; section: RoboticsSection; base: BrickInstance[] } {
  const brick = (id: string, partId: string, x: number, y: number, z: number, rotation: 0 | 1 = 0): BrickInstance => ({ id, partId, x, y, z, rotation, color: '#52636c' })
  const existing = [
    brick('a-hub', ROBOTICS_PART_IDS.hub, 17, 1, 18),
    brick('a-arm', 'brick_1x4', 20, 7, 20, 1),
    brick('b-hub', ROBOTICS_PART_IDS.hub, 29, 1, 18),
    brick('b-arm', 'brick_1x4', 26, 7, 21, 1),
  ]
  const section: RoboticsSection = {
    ...emptyRoboticsSection(),
    creations: [{ id: 'a', name: 'Arm A', anchorBrickIds: ['a-hub', 'a-arm'] }, { id: 'b', name: 'Arm B', anchorBrickIds: ['b-hub', 'b-arm'] }],
  }
  const base = kitById('robot-base').bricks.map((candidate) => ({ ...candidate, x: candidate.x + 22, z: candidate.z + 17 }))
  return { existing, section, base }
}
