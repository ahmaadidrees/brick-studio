import { createBrickStudioDocument, type BrickStudioDocument } from '../../brick/brickDocument'
import { createPartMap } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import type { DeriveInput } from './creations'
import { emptyRoboticsSection, writeRoboticsSection, type RoboticsSection } from './section'

/**
 * The three spike builds (contract §9) as loose parts on a 64-stud plate, exactly as
 * a student could place them: no overlay, no hidden joints. Tests and the QA harness
 * both build from these so the evidence and the unit tests describe the same bricks.
 *
 * Rover: a 6×8 plate carries the hub, two mirror-mounted motors and a forward-facing
 * sensor; each motor's socket faces outward, a short axle sits in it and a wheel
 * stands on the ground at the axle's far end. Forward is -Z (the far side).
 */
const GREY = '#52636c'
const BLUE = '#3e83d7'
const CORAL = '#e7473c'
const YELLOW = '#f4ca3a'
const WHITE = '#f5eee0'

const brick = (id: string, partId: string, x: number, y: number, z: number, rotation: 0 | 1 | 2 | 3, color: string): BrickInstance => ({ id, partId, x, y, z, rotation, color })

export const ROVER_IDS = {
  plate: 'rover-plate', hub: 'rover-hub', leftMotor: 'rover-left-motor', rightMotor: 'rover-right-motor',
  leftAxle: 'rover-left-axle', rightAxle: 'rover-right-axle', leftWheel: 'rover-left-wheel', rightWheel: 'rover-right-wheel', sensor: 'rover-sensor',
} as const

export function roverBricks(options: { leftWheelOff?: boolean; rightMotorSocketInward?: boolean; sensorSideways?: boolean } = {}): BrickInstance[] {
  const bricks = [
    brick(ROVER_IDS.plate, 'plate_6x8', 28, 0, 26, 0, BLUE),
    brick(ROVER_IDS.hub, ROBOTICS_PART_IDS.hub, 29, 1, 27, 0, WHITE),
    brick(ROVER_IDS.leftMotor, ROBOTICS_PART_IDS.motor, 28, 1, 31, 2, GREY),
    brick(ROVER_IDS.rightMotor, ROBOTICS_PART_IDS.motor, 31, 1, 31, options.rightMotorSocketInward ? 2 : 0, GREY),
    brick(ROVER_IDS.leftAxle, ROBOTICS_PART_IDS.axleShort, 26, 0, 32, 0, GREY),
    brick(ROVER_IDS.rightAxle, ROBOTICS_PART_IDS.axleShort, 34, 0, 32, 0, GREY),
    // A wheel left off its axle sits one stud further out: the axle end no longer reaches its hole.
    brick(ROVER_IDS.leftWheel, ROBOTICS_PART_IDS.wheel, options.leftWheelOff ? 24 : 25, 0, 31, 0, '#1f2a33'),
    brick(ROVER_IDS.rightWheel, ROBOTICS_PART_IDS.wheel, 36, 0, 31, 0, '#1f2a33'),
    brick(ROVER_IDS.sensor, ROBOTICS_PART_IDS.distanceSensor, 30, 1, 26, options.sensorSideways ? 1 : 0, YELLOW),
  ]
  if (options.sensorSideways) {
    // Rotated a quarter turn the 2×1 sensor becomes 1×2; keep it on the plate at its far edge.
    const sensor = bricks.find((candidate) => candidate.id === ROVER_IDS.sensor)!
    sensor.x = 33
    sensor.z = 26
  }
  return bricks
}

export const GATE_IDS = {
  plate: 'gate-plate', leftPost: 'gate-left-post', leftPostTop: 'gate-left-post-top', rightPost: 'gate-right-post', rightPostTop: 'gate-right-post-top', lintel: 'gate-lintel',
  sill: 'gate-sill', hinge: 'gate-hinge', door: 'gate-door', hub: 'gate-hub', sensor: 'gate-sensor', bridge: 'gate-bridge',
} as const

/**
 * Gate: two posts and a lintel stand on the plate; a sill brick between the posts
 * carries the hinge motor (fixed side studded to the sill); a 1×4 door lies across
 * the turntable's studs and overhangs toward the right post, so it swings about the
 * turntable's vertical axis. The lintel is high enough for the door to pass under.
 * `builtIntoFrame` stands a pillar under the door's far end: a stud joint that ties
 * the door to the frame, so the arm can no longer swing.
 */
export function gateBricks(options: { builtIntoFrame?: boolean } = {}): BrickInstance[] {
  const bricks = [
    brick(GATE_IDS.plate, 'plate_6x8', 20, 0, 20, 0, BLUE),
    brick(GATE_IDS.leftPost, 'pillar_1x1', 20, 1, 20, 0, GREY),
    brick(GATE_IDS.leftPostTop, 'brick_1x1', 20, 10, 20, 0, GREY),
    brick(GATE_IDS.rightPost, 'pillar_1x1', 25, 1, 20, 0, GREY),
    brick(GATE_IDS.rightPostTop, 'brick_1x1', 25, 10, 20, 0, GREY),
    brick(GATE_IDS.lintel, 'brick_1x6', 20, 13, 20, 1, GREY),
    brick(GATE_IDS.sill, 'plate_2x4', 21, 1, 21, 1, GREY),
    brick(GATE_IDS.hinge, ROBOTICS_PART_IDS.hingeMotor, 21, 2, 21, 0, CORAL),
    brick(GATE_IDS.door, 'brick_1x4', 21, 8, 21, 1, YELLOW),
    brick(GATE_IDS.hub, ROBOTICS_PART_IDS.hub, 20, 1, 24, 0, WHITE),
    brick(GATE_IDS.sensor, ROBOTICS_PART_IDS.distanceSensor, 21, 7, 27, 0, YELLOW),
  ]
  if (options.builtIntoFrame) bricks.push(brick(GATE_IDS.bridge, 'brick_2x2', 23, 2, 21, 0, GREY), brick(`${GATE_IDS.bridge}-2`, 'brick_2x2', 23, 5, 21, 0, GREY))
  return bricks
}

export const SIGNAL_IDS = { hub: 'signal-hub', sensor: 'signal-sensor', light: 'signal-light' } as const

/** Signal post: a hub on the plate with a sensor and a light on its studs. No motor. */
export function signalPostBricks(): BrickInstance[] {
  return [
    brick(SIGNAL_IDS.hub, ROBOTICS_PART_IDS.hub, 40, 0, 40, 0, WHITE),
    brick(SIGNAL_IDS.sensor, ROBOTICS_PART_IDS.distanceSensor, 41, 6, 40, 0, YELLOW),
    brick(SIGNAL_IDS.light, ROBOTICS_PART_IDS.light, 43, 6, 43, 0, CORAL),
  ]
}

export function fixtureInput(bricks: BrickInstance[], section: RoboticsSection = emptyRoboticsSection()): DeriveInput {
  return { bricks, partMap: createPartMap([]), plateSize: 64, section }
}

export function fixtureDocument(bricks: BrickInstance[], section?: RoboticsSection): BrickStudioDocument {
  return createBrickStudioDocument(bricks, section ? { robotics: writeRoboticsSection(section) } : {})
}
