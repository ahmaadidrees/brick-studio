import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { createPartMap } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { deriveCreations, type DerivedCreation } from '../model/creations'
import { GATE_IDS, ROVER_IDS, gateBricks, roverBricks } from '../model/fixtures'
import { emptyRoboticsSection, type RoboticsConnection, type RoboticsSection } from '../model/section'
import { rotateByQuat, type Vec3 } from '../model/vec'
import { installRoboticsParts } from '../parts/install'
import { FIXED_STEP, MAX_BACKLOG_SECONDS, createMechanics, type Mechanics } from './mechanics'

beforeAll(async () => {
  await RAPIER.init()
  installRoboticsParts(true)
  partMap = createPartMap([])
})

let partMap: ReturnType<typeof createPartMap>

function build(bricks: BrickInstance[], anchor: string, connections: RoboticsConnection[]): { creation: DerivedCreation; mechanics: Mechanics } {
  const section: RoboticsSection = { ...emptyRoboticsSection(), creations: [{ id: 'c', name: 'Test', anchorBrickIds: [anchor] }], connections }
  const [creation] = deriveCreations({ bricks, partMap, plateSize: 64, section })
  return { creation, mechanics: createMechanics({ rapier: RAPIER, bricks, partMap, plateSize: 64, creation }) }
}

const ROVER_WIRING: RoboticsConnection[] = [
  { deviceId: ROVER_IDS.leftMotor, hubId: ROVER_IDS.hub, port: 'A' },
  { deviceId: ROVER_IDS.rightMotor, hubId: ROVER_IDS.hub, port: 'B' },
  { deviceId: ROVER_IDS.sensor, hubId: ROVER_IDS.hub, port: 'C' },
]

function chassisPose(mechanics: Mechanics) {
  return mechanics.poses().get(mechanics.bodyOfBrick(ROVER_IDS.plate)!)!
}

function yawDegrees(rotation: { x: number; y: number; z: number; w: number }) {
  const forward = rotateByQuat(rotation, { x: 0, y: 0, z: -1 })
  return (Math.atan2(-forward.x, -forward.z) * 180) / Math.PI
}

function run(mechanics: Mechanics, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) mechanics.step(1 / 60)
}

describe('rover mechanics', () => {
  it('bodies come from assembly: chassis plus two axle+wheel bodies, none anchored on the test plate', () => {
    const { creation, mechanics } = build(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    expect(creation.testSpace).toBe('testPlate')
    expect(mechanics.bodyIds).toHaveLength(3)
    expect(mechanics.bodyOfBrick(ROVER_IDS.leftWheel)).toBe(mechanics.bodyOfBrick(ROVER_IDS.leftAxle))
    expect(mechanics.bodyOfBrick(ROVER_IDS.leftWheel)).not.toBe(mechanics.bodyOfBrick(ROVER_IDS.plate))
    expect(mechanics.simulatedBrickIds.size).toBe(9)
    mechanics.dispose()
  })

  it('driving the pair forward at 40% rolls the body forward, roughly straight', () => {
    const { mechanics } = build(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    expect(mechanics.setMotorPower(ROVER_IDS.leftMotor, 0.4)).toBe(true)
    expect(mechanics.setMotorPower(ROVER_IDS.rightMotor, -0.4)).toBe(true)
    run(mechanics, 2.5)
    const pose = chassisPose(mechanics)
    expect(pose.position.z).toBeLessThan(-1.2)
    expect(Math.abs(pose.position.x)).toBeLessThan(0.5)
    expect(Math.abs(yawDegrees(pose.rotation))).toBeLessThan(12)
    expect(Math.abs(mechanics.motorOutputAngle(ROVER_IDS.leftMotor))).toBeGreaterThan(2)
    mechanics.dispose()
  })

  it('both motors at the same sign turn the body instead of driving it', () => {
    const { mechanics } = build(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    mechanics.setMotorPower(ROVER_IDS.leftMotor, 0.4)
    mechanics.setMotorPower(ROVER_IDS.rightMotor, 0.4)
    run(mechanics, 2.5)
    const pose = chassisPose(mechanics)
    // It pivots in place (a dragging nose lets it creep a little) instead of driving off.
    expect(Math.hypot(pose.position.x, pose.position.z)).toBeLessThan(1)
    expect(Math.abs(yawDegrees(pose.rotation))).toBeGreaterThan(25)
    mechanics.dispose()
  })

  it('a wheel left off its axle: the motor and axle spin, the wheel stays, the body barely moves', () => {
    const bricks = roverBricks({ leftWheelOff: true })
    const { creation, mechanics } = build(bricks, ROVER_IDS.hub, ROVER_WIRING)
    expect(creation.wheels.find((wheel) => wheel.brickId === ROVER_IDS.leftWheel)?.note).toContain('Not on an axle')
    expect(mechanics.simulatedBrickIds.has(ROVER_IDS.leftWheel)).toBe(false)
    mechanics.setMotorPower(ROVER_IDS.leftMotor, 0.4)
    run(mechanics, 1.5)
    expect(Math.abs(mechanics.motorOutputAngle(ROVER_IDS.leftMotor))).toBeGreaterThan(2)
    const pose = chassisPose(mechanics)
    expect(Math.hypot(pose.position.x, pose.position.z)).toBeLessThan(0.15)
    mechanics.dispose()
  })

  it('a motor with nothing in its socket spins its output only', () => {
    const bricks = roverBricks().filter((brick) => brick.id !== ROVER_IDS.leftAxle && brick.id !== ROVER_IDS.leftWheel)
    const { mechanics } = build(bricks, ROVER_IDS.hub, ROVER_WIRING)
    mechanics.setMotorPower(ROVER_IDS.leftMotor, 0.4)
    run(mechanics, 1)
    expect(mechanics.motorOutputAngle(ROVER_IDS.leftMotor)).toBeCloseTo(0.4 * 8, 0)
    const pose = chassisPose(mechanics)
    expect(Math.hypot(pose.position.x, pose.position.z)).toBeLessThan(0.1)
    mechanics.dispose()
  })

  it('an unplugged motor is inert', () => {
    const { mechanics } = build(roverBricks(), ROVER_IDS.hub, ROVER_WIRING.filter((connection) => connection.deviceId !== ROVER_IDS.rightMotor))
    expect(mechanics.setMotorPower(ROVER_IDS.rightMotor, 0.4)).toBe(false)
    run(mechanics, 1)
    expect(mechanics.motorOutputAngle(ROVER_IDS.rightMotor)).toBeCloseTo(0, 1)
    const pose = chassisPose(mechanics)
    expect(Math.hypot(pose.position.x, pose.position.z)).toBeLessThan(0.1)
    mechanics.dispose()
  })

  it('with no hub in the creation nothing is powered', () => {
    const { mechanics } = build(roverBricks().filter((brick) => brick.id !== ROVER_IDS.hub), ROVER_IDS.plate, [])
    expect(mechanics.setMotorPower(ROVER_IDS.leftMotor, 0.4)).toBe(false)
    mechanics.dispose()
  })

  it('a fresh simulation is the built pose, stood on its wheels: no rotation, no drift, one small lift', () => {
    const { mechanics } = build(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    for (const pose of mechanics.poses().values()) {
      expect(pose.position.x).toBe(0)
      expect(pose.position.z).toBe(0)
      expect(pose.position.y).toBeCloseTo(0.042, 3)
      expect(pose.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 })
    }
    mechanics.dispose()
  })
})

const GATE_WIRING: RoboticsConnection[] = [
  { deviceId: GATE_IDS.hinge, hubId: GATE_IDS.hub, port: 'A' },
  { deviceId: GATE_IDS.sensor, hubId: GATE_IDS.hub, port: 'B' },
]

function pivotStays(mechanics: Mechanics, armBody: string, pivot: Vec3) {
  const pose = mechanics.poses().get(armBody)!
  const moved = rotateByQuat(pose.rotation, pivot)
  return { x: moved.x + pose.position.x - pivot.x, y: moved.y + pose.position.y - pivot.y, z: moved.z + pose.position.z - pivot.z }
}

describe('gate mechanics', () => {
  it('the frame is fixed in my world; the door swings about the turntable axis and nothing else', () => {
    const { creation, mechanics } = build(gateBricks(), GATE_IDS.hinge, GATE_WIRING)
    expect(creation.testSpace).toBe('myWorld')
    const frameBody = mechanics.bodyOfBrick(GATE_IDS.leftPost)!
    const armBody = mechanics.bodyOfBrick(GATE_IDS.door)!
    expect(frameBody).not.toBe(armBody)
    expect(mechanics.setHingeTarget(GATE_IDS.hinge, 60)).toBe(true)
    run(mechanics, 2.5)
    const report = mechanics.hingeReport(GATE_IDS.hinge)!
    expect(report.angle).toBeGreaterThan(55)
    expect(report.angle).toBeLessThan(65)
    expect(report.reached).toBe(true)
    expect(report.blocked).toBe(false)
    const frame = mechanics.poses().get(frameBody)!
    expect(frame.position).toEqual({ x: 0, y: 0, z: 0 })
    const arm = mechanics.poses().get(armBody)!
    // Pure yaw: no tilt about x or z.
    expect(Math.abs(arm.rotation.x)).toBeLessThan(0.02)
    expect(Math.abs(arm.rotation.z)).toBeLessThan(0.02)
    const pivot = { x: (22 - 32) * 0.62, y: 2 * 0.18 + 0.72, z: (22 - 32) * 0.62 }
    const drift = pivotStays(mechanics, armBody, pivot)
    expect(Math.hypot(drift.x, drift.y, drift.z)).toBeLessThan(0.05)
    mechanics.dispose()
  })

  it('back to zero returns the door to its built pose', () => {
    const { mechanics } = build(gateBricks(), GATE_IDS.hinge, GATE_WIRING)
    mechanics.setHingeTarget(GATE_IDS.hinge, 60)
    run(mechanics, 2)
    mechanics.setHingeTarget(GATE_IDS.hinge, 0)
    run(mechanics, 2.5)
    expect(Math.abs(mechanics.hingeReport(GATE_IDS.hinge)!.angle)).toBeLessThan(3)
    mechanics.dispose()
  })

  it('a door built into the frame does not move and reports locked', () => {
    const { creation, mechanics } = build(gateBricks({ builtIntoFrame: true }), GATE_IDS.hinge, GATE_WIRING)
    expect(creation.hinges[0].locked).toBe(true)
    expect(mechanics.bodyOfBrick(GATE_IDS.door)).toBe(mechanics.bodyOfBrick(GATE_IDS.leftPost))
    expect(mechanics.setHingeTarget(GATE_IDS.hinge, 60)).toBe(false)
    run(mechanics, 1)
    const report = mechanics.hingeReport(GATE_IDS.hinge)!
    expect(report.locked).toBe(true)
    expect(report.angle).toBe(0)
    mechanics.dispose()
  })

  it('an unplugged hinge motor is inert', () => {
    const { mechanics } = build(gateBricks(), GATE_IDS.hinge, [])
    expect(mechanics.setHingeTarget(GATE_IDS.hinge, 60)).toBe(false)
    run(mechanics, 1)
    expect(Math.abs(mechanics.hingeReport(GATE_IDS.hinge)!.angle)).toBeLessThan(1)
    mechanics.dispose()
  })
})

describe('the clock', () => {
  const rover = () => build(roverBricks(), ROVER_IDS.hub, ROVER_WIRING).mechanics

  it.each([30, 60, 90, 144, 240])('one elapsed second supplied as %i frames advances one simulated second', (fps) => {
    const mechanics = rover()
    for (let frame = 0; frame < fps; frame += 1) mechanics.step(1 / fps)
    expect(mechanics.elapsed).toBeCloseTo(1, 2)
    expect(mechanics.backlog).toBeLessThan(FIXED_STEP)
    expect(mechanics.droppedSeconds).toBe(0)
    mechanics.dispose()
  })

  it('the motion is the same at 60 and 144 fps', () => {
    const poses = [60, 144].map((fps) => {
      const mechanics = rover()
      mechanics.setMotorPower(ROVER_IDS.leftMotor, 0.4)
      mechanics.setMotorPower(ROVER_IDS.rightMotor, -0.4)
      for (let frame = 0; frame < fps * 2; frame += 1) mechanics.step(1 / fps)
      const pose = chassisPose(mechanics)
      mechanics.dispose()
      return pose
    })
    expect(poses[1].position.z).toBeCloseTo(poses[0].position.z, 3)
    expect(poses[1].position.x).toBeCloseTo(poses[0].position.x, 3)
  })

  it('a stall is dropped, not replayed: one long frame runs at most the cap and the rest is forgotten', () => {
    const mechanics = rover()
    mechanics.step(5)
    expect(mechanics.elapsed).toBeCloseTo(MAX_BACKLOG_SECONDS, 6)
    expect(mechanics.backlog).toBeLessThan(1e-9)
    expect(mechanics.droppedSeconds).toBeCloseTo(5 - MAX_BACKLOG_SECONDS, 6)
    mechanics.step(1 / 60)
    expect(mechanics.elapsed).toBeCloseTo(MAX_BACKLOG_SECONDS + 1 / 60, 6)
    mechanics.dispose()
  })

  it('ignores nonsense frame times and everything after dispose', () => {
    const mechanics = rover()
    mechanics.step(Number.NaN)
    mechanics.step(-1)
    mechanics.step(Number.POSITIVE_INFINITY)
    expect(mechanics.elapsed).toBe(0)
    mechanics.dispose()
    expect(mechanics.disposed).toBe(true)
    mechanics.step(1 / 60)
    expect(mechanics.elapsed).toBe(0)
    expect(mechanics.poses().size).toBe(0)
    expect(mechanics.contacts()).toEqual([])
    expect(mechanics.setMotorPower(ROVER_IDS.leftMotor, 0.4)).toBe(false)
    expect(mechanics.setHingeTarget(GATE_IDS.hinge, 10)).toBe(false)
  })
})
