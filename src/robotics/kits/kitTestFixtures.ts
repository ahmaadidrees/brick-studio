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

