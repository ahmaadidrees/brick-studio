import type { BrickInstance } from '../../brick/types'
import { ROVER_IDS, roverBricks } from '../model/fixtures'
import { emptyRoboticsSection, type RoboticsConnection, type RoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS } from '../parts/catalog'

/**
 * Test support (not shipped): the spike's rover (`model/fixtures.ts`) with a seat on its
 * hub, named "Mars buggy" and wired like the stage tests (left motor A, right motor B,
 * front sensor C). The seat faces the rover's forward (-Z).
 */
export const SEAT_ID = 'rover-seat'
export const RIDE_CREATION_ID = 'rover'

export function seatedRoverBricks(options: Parameters<typeof roverBricks>[0] = {}): BrickInstance[] {
  return [...roverBricks(options), { id: SEAT_ID, partId: ROBOTICS_PART_IDS.seat, x: 30, y: 7, z: 28, rotation: 0, color: '#3e83d7' }]
}

/**
 * A novice tester's Buggy: five 2 × 2 bricks stacked on the hub, the seat on top of them, about
 * four units up (the rider sits far above the ground beside it).
 */
export const TOWER_BRICK_IDS = ['tower-1', 'tower-2', 'tower-3', 'tower-4', 'tower-5'] as const
export function towerRoverBricks(): BrickInstance[] {
  const tower = TOWER_BRICK_IDS.map((id, index) => ({ id, partId: 'brick_2x2', x: 30, y: 7 + 3 * index, z: 28, rotation: 0 as const, color: '#e27fbf' }))
  return [...roverBricks(), ...tower, { id: SEAT_ID, partId: ROBOTICS_PART_IDS.seat, x: 30, y: 22, z: 28, rotation: 0, color: '#3e83d7' }]
}

export const ROVER_WIRING: RoboticsConnection[] = [
  { deviceId: ROVER_IDS.leftMotor, hubId: ROVER_IDS.hub, port: 'A' },
  { deviceId: ROVER_IDS.rightMotor, hubId: ROVER_IDS.hub, port: 'B' },
  { deviceId: ROVER_IDS.sensor, hubId: ROVER_IDS.hub, port: 'C' },
]

export function seatedRoverSection(overrides: Partial<RoboticsSection> = {}): RoboticsSection {
  return {
    ...emptyRoboticsSection(),
    creations: [{ id: RIDE_CREATION_ID, name: 'Mars buggy', anchorBrickIds: [ROVER_IDS.hub] }],
    connections: ROVER_WIRING,
    ...overrides,
  }
}
