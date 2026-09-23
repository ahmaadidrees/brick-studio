import { beforeAll, describe, expect, it } from 'vitest'
import type { BrickInstance } from '../../brick/types'
import { readiness } from '../drive/readiness'
import { rideStatus } from '../explore/rideModel'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { compileContextFor } from '../program/compile'
import { wiredCreation, wiredFourWheel, wiredRover } from '../program/testFixtures'
import { deriveCreations, driveSidesOf } from './creations'
import { FOUR_WHEEL_IDS, ROVER_IDS, fixtureInput, fourWheelBricks, roverBricks } from './fixtures'
import { emptyRoboticsSection } from './section'

/**
 * Drive sides (KID-UX, "every motor drives"): every motor with a wheel on the drive axis is on the
 * left or the right, by where its wheel stands; the drive pair is the first of each side.
 */
beforeAll(() => { installRoboticsParts(true) })

const ids = FOUR_WHEEL_IDS
const FORWARD = { x: 0, y: 0, z: -1 }
const brick = (id: string, partId: string, x: number, y: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): BrickInstance => ({ id, partId, x, y, z, rotation, color: '#52636c' })
const derive = (bricks: BrickInstance[], anchor: string) => deriveCreations(fixtureInput(bricks, { ...emptyRoboticsSection(), creations: [{ id: 'c1', name: 'Test', anchorBrickIds: [anchor] }] }))[0]

/**
 * Contract failure F2d: the right motor hangs outboard of the chassis from a beam, turned like the
 * left one, so both sockets face -X, one on each side; neither is reversed.
 */
function outboardBricks(rightFirst = false): BrickInstance[] {
  const right = [
    brick('right-motor', ROBOTICS_PART_IDS.motor, 37, 1, 31, 2),
    brick('right-axle', ROBOTICS_PART_IDS.axleShort, 35, 0, 32),
    brick('right-wheel', ROBOTICS_PART_IDS.wheel, 34, 0, 31),
  ]
  const rest = [
    brick('plate', 'plate_6x8', 28, 0, 26),
    brick('hub', ROBOTICS_PART_IDS.hub, 29, 1, 27),
    brick('left-motor', ROBOTICS_PART_IDS.motor, 28, 1, 31, 2),
    brick('left-axle', ROBOTICS_PART_IDS.axleShort, 26, 0, 32),
    brick('left-wheel', ROBOTICS_PART_IDS.wheel, 25, 0, 31),
    brick('pillar', 'pillar_1x1', 33, 1, 32),
    brick('beam', 'brick_1x6', 33, 10, 32, 1),
    brick('riser', 'brick_1x1', 37, 7, 32),
    brick('sensor', ROBOTICS_PART_IDS.distanceSensor, 30, 1, 26),
  ]
  return rightFirst ? [...right, ...rest] : [...rest, ...right]
}

describe('drive sides', () => {
  it('the two-motor rover: one motor a side, the pair exactly as before', () => {
    const { creation } = wiredRover()
    expect(creation.drivePair).toEqual({ leftId: ROVER_IDS.leftMotor, rightId: ROVER_IDS.rightMotor, reversedIds: [ROVER_IDS.rightMotor], forward: FORWARD })
    expect(creation.driveSides).toEqual({ left: [ROVER_IDS.leftMotor], right: [ROVER_IDS.rightMotor], reversedIds: [ROVER_IDS.rightMotor], forward: FORWARD })
    expect(driveSidesOf(creation)).toBe(creation.driveSides)
  })

  it('a four-wheel car: both motors of each side, every right motor reversed, the pair the front two', () => {
    const { creation } = wiredFourWheel()
    // One creation, one chassis: the hub standing across the seam joins the two plates.
    expect(creation.brickIds).toHaveLength(15)
    expect(creation.bodies).toHaveLength(5)
    expect(creation.kind).toBe('rover')
    expect(creation.driveSides).toEqual({ left: [ids.frontLeftMotor, ids.backLeftMotor], right: [ids.frontRightMotor, ids.backRightMotor], reversedIds: [ids.frontRightMotor, ids.backRightMotor], forward: FORWARD })
    expect(creation.drivePair).toEqual({ leftId: ids.frontLeftMotor, rightId: ids.frontRightMotor, reversedIds: [ids.frontRightMotor], forward: FORWARD })
    expect(creation.motors.map((motor) => [motor.brickId, motor.drives])).toEqual([
      [ids.frontLeftMotor, 'forward'], [ids.frontRightMotor, 'backward'], [ids.backLeftMotor, 'forward'], [ids.backRightMotor, 'backward'],
    ])
    expect(creation.lines.ready).toBe('Axles and wheels on all motors, so it can roll')
  })

  it('built one side first, the pair is still the first left and the first right motor', () => {
    const leftFirst: string[] = [ids.frontLeftMotor, ids.backLeftMotor, ids.frontRightMotor, ids.backRightMotor]
    const all = fourWheelBricks()
    const bricks = [...all.filter((candidate) => !leftFirst.includes(candidate.id)), ...leftFirst.map((id) => all.find((candidate) => candidate.id === id)!)]
    const creation = derive(bricks, ids.hub)
    expect(creation.motors.map((motor) => motor.brickId)).toEqual(leftFirst)
    expect(creation.drivePair).toMatchObject({ leftId: ids.frontLeftMotor, rightId: ids.frontRightMotor, reversedIds: [ids.frontRightMotor] })
    expect(creation.driveSides).toMatchObject({ left: [ids.frontLeftMotor, ids.backLeftMotor], right: [ids.frontRightMotor, ids.backRightMotor] })
  })

  it('a motor facing the wrong way (its wheel rolls sideways) is on neither side', () => {
    const creation = wiredFourWheel({ backRightFacingBack: true }).creation
    const back = creation.motors.find((motor) => motor.brickId === ids.backRightMotor)!
    expect(back.wheelIds).toEqual([ids.backRightWheel])
    expect(back.socketNormal).toEqual({ x: 0, y: 0, z: 1 })
    expect(back.drives).toBe('sideways')
    expect(creation.driveSides).toEqual({ left: [ids.frontLeftMotor, ids.backLeftMotor], right: [ids.frontRightMotor], reversedIds: [ids.frontRightMotor], forward: FORWARD })
  })

  it('a motor without a wheel is on neither side; the other three still drive', () => {
    const { creation } = wiredFourWheel({ backLeftWheelOff: true })
    expect(creation.motors.find((motor) => motor.brickId === ids.backLeftMotor)!.wheelIds).toEqual([])
    expect(creation.driveSides).toEqual({ left: [ids.frontLeftMotor], right: [ids.frontRightMotor, ids.backRightMotor], reversedIds: [ids.frontRightMotor, ids.backRightMotor], forward: FORWARD })
    expect(creation.drivePair).toMatchObject({ leftId: ids.frontLeftMotor, rightId: ids.frontRightMotor })
  })

  it('sides go by where the wheels stand: an outboard motor facing in is on the right, and not reversed', () => {
    for (const rightFirst of [false, true]) {
      const creation = derive(outboardBricks(rightFirst), 'hub')
      expect(creation.driveSides, `right motor placed first: ${rightFirst}`).toEqual({ left: ['left-motor'], right: ['right-motor'], reversedIds: [], forward: FORWARD })
      expect(creation.drivePair).toEqual({ leftId: 'left-motor', rightId: 'right-motor', reversedIds: [], forward: FORWARD })
      expect(creation.motors.map((motor) => motor.drives)).toEqual(['forward', 'forward'])
    }
  })

  it('wheels all in one line, one behind the other, make no sides and no pair', () => {
    const left = new Set<string>([ids.frontPlate, ids.backPlate, ids.hub, ids.frontLeftMotor, ids.backLeftMotor, ids.frontLeftAxle, ids.backLeftAxle, ids.frontLeftWheel, ids.backLeftWheel])
    const creation = derive(fourWheelBricks().filter((candidate) => left.has(candidate.id)), ids.hub)
    expect(creation.driveSides).toBeNull()
    expect(creation.drivePair).toBeNull()
    // Still a rover: it knows which way it would drive.
    expect(creation.kind).toBe('rover')
    expect(creation.driveForward).toEqual(FORWARD)
    expect(compileContextFor(creation).drivePairMissing).toBe('its wheels are all on one side')
    expect(driveSidesOf(creation)).toBeNull()
  })

  it('rides when any motor that drives is plugged in, not only the pair', () => {
    const { creation } = wiredFourWheel({ unplug: [ids.frontLeftMotor, ids.frontRightMotor] })
    expect(rideStatus(creation)).toBe('rideable')
    expect(rideStatus(wiredFourWheel({ unplug: [ids.frontLeftMotor, ids.frontRightMotor, ids.backLeftMotor, ids.backRightMotor] }).creation)).toBe('unplugged')
    expect(rideStatus({ ...creation, drivePair: null })).toBe('no-drive-pair')
  })

  it('a creation whose pair is taken away cannot drive through its sides', () => {
    const { creation } = wiredFourWheel()
    expect(driveSidesOf({ ...creation, drivePair: null })).toBeNull()
    // A pair without sides drives just the pair.
    expect(driveSidesOf({ drivePair: creation.drivePair })).toEqual({ left: [ids.frontLeftMotor], right: [ids.frontRightMotor], reversedIds: [ids.frontRightMotor], forward: FORWARD })
  })
})

describe('readiness of a four-wheel car', () => {
  const FRONT_SENSOR = brick('4wd-sensor', ROBOTICS_PART_IDS.distanceSensor, 30, 1, 18)

  it('drives when all four motors have wheels and are plugged in', () => {
    expect(readiness(wiredFourWheel().creation)).toEqual({ kind: 'drive', ready: true, reason: null })
  })

  it('every motor with a wheel must be plugged in, not only the first two', () => {
    expect(readiness(wiredFourWheel({ unplug: [ids.backRightMotor] }).creation)).toEqual({ kind: 'drive', ready: false, reason: 'Plug Right motor into the hub.' })
    expect(readiness(wiredFourWheel({ unplug: [ids.backLeftMotor] }).creation).reason).toBe('Plug Left motor into the hub.')
  })

  it('a motor facing the wrong way says which way it faces and how to fix it', () => {
    const { creation } = wiredFourWheel({ backRightFacingBack: true })
    expect(readiness(creation)).toEqual({ kind: 'drive', ready: false, reason: 'Back motor faces backward. Turn it to face out to the side.' })
    // A motor that faced up or down would say so too.
    const up = { ...creation, motors: creation.motors.map((motor) => (motor.brickId === ids.backRightMotor ? { ...motor, socketNormal: { x: 0, y: 1, z: 0 } } : motor)) }
    expect(readiness(up).reason).toBe('Back motor faces up. Turn it to face out to the side.')
  })

  it('a motor without its wheel comes first', () => {
    expect(readiness(wiredFourWheel({ backLeftWheelOff: true }).creation).reason).toBe('Put a wheel on Left motor’s axle.')
  })

  it('wheels all on one side ask for motors on opposite sides', () => {
    const left = new Set<string>([ids.frontPlate, ids.backPlate, ids.hub, ids.frontLeftMotor, ids.backLeftMotor, ids.frontLeftAxle, ids.backLeftAxle, ids.frontLeftWheel, ids.backLeftWheel])
    const { creation } = wiredCreation(fourWheelBricks().filter((candidate) => left.has(candidate.id)), ids.hub, ids.hub, [[ids.frontLeftMotor, 'A'], [ids.backLeftMotor, 'B']])
    expect(readiness(creation).reason).toBe('Put the motors on opposite sides, facing out.')
  })

  it('a full hub: unplug a part that does not drive to make room, or add a hub', () => {
    // A Buggy with its sensor and four motors: the fourth motor finds no free port.
    const withSensor = wiredCreation([...fourWheelBricks(), FRONT_SENSOR], ids.hub, ids.hub, [[ids.frontLeftMotor, 'A'], [ids.frontRightMotor, 'B'], [FRONT_SENSOR.id, 'C'], [ids.backLeftMotor, 'D']])
    expect(readiness(withSensor.creation).reason).toBe('The hub is full. Unplug Front sensor to plug in Right motor.')
    // Five motors on four ports: nothing to unplug that does not drive.
    const fifth = [
      brick('4wd-corner-motor', ROBOTICS_PART_IDS.motor, 28, 1, 18, 2),
      brick('4wd-corner-axle', ROBOTICS_PART_IDS.axleShort, 26, 0, 19),
      brick('4wd-corner-wheel', ROBOTICS_PART_IDS.wheel, 25, 0, 18),
    ]
    const five = wiredCreation([...fourWheelBricks(), ...fifth], ids.hub, ids.hub, [[ids.frontLeftMotor, 'A'], [ids.frontRightMotor, 'B'], [ids.backLeftMotor, 'C'], [ids.backRightMotor, 'D']])
    expect(five.creation.driveSides?.left).toEqual([ids.frontLeftMotor, ids.backLeftMotor, '4wd-corner-motor'])
    expect(readiness(five.creation).reason).toBe('The hub is full. Add another hub for Left motor.')
  })

  it('the rover reads as it always did', () => {
    expect(readiness(wiredRover().creation)).toEqual({ kind: 'drive', ready: true, reason: null })
    expect(readiness(wiredRover({ unplug: [ROVER_IDS.rightMotor] }).creation).reason).toBe('Plug Right motor into the hub.')
    expect(readiness(derive(roverBricks({ leftWheelOff: true }), ROVER_IDS.hub)).reason).toBe('Put a wheel on Left motor’s axle.')
  })
})
