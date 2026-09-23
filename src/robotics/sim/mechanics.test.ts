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

describe('checkpoint 2 additions', () => {
  const roverCreation = (bricks = roverBricks()) => build(bricks, ROVER_IDS.hub, ROVER_WIRING).creation

  it('step hooks run once before and once after every fixed step, and stepOnce takes exactly one', () => {
    const { mechanics } = build(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    const calls: string[] = []
    mechanics.setStepHooks({ before: () => calls.push(`b${mechanics.steps}`), after: () => calls.push(`a${mechanics.steps}`) })
    mechanics.step(2 / 120 + 1e-9)
    expect(calls).toEqual(['b0', 'a1', 'b1', 'a2'])
    mechanics.stepOnce()
    expect(mechanics.steps).toBe(3)
    mechanics.setStepHooks(null)
    mechanics.stepOnce()
    expect(calls).toHaveLength(6)
    mechanics.dispose()
  })

  it('power mode and target mode share the joint; speed is measured, signed, as a fraction of full speed', () => {
    const { mechanics } = build(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    mechanics.setMotorPower(ROVER_IDS.leftMotor, 0.4)
    mechanics.setMotorPower(ROVER_IDS.rightMotor, -0.4)
    run(mechanics, 1)
    expect(mechanics.motorMode(ROVER_IDS.leftMotor)).toBe('power')
    // A little under the command: the wheels carry the rover and its dragging nose.
    expect(mechanics.motorSpeed(ROVER_IDS.leftMotor)).toBeGreaterThan(0.3)
    expect(mechanics.motorSpeed(ROVER_IDS.leftMotor)).toBeLessThan(0.42)
    expect(mechanics.motorSpeed(ROVER_IDS.rightMotor)).toBeLessThan(-0.3)
    const start = mechanics.motorOutputAngle(ROVER_IDS.leftMotor)
    expect(mechanics.setMotorTarget(ROVER_IDS.leftMotor, (start * 180) / Math.PI + 90)).toBe(true)
    expect(mechanics.motorMode(ROVER_IDS.leftMotor)).toBe('target')
    expect(mechanics.motorPower(ROVER_IDS.leftMotor)).toBe(0)
    mechanics.setMotorPower(ROVER_IDS.rightMotor, 0)
    run(mechanics, 1.5)
    expect(((mechanics.motorOutputAngle(ROVER_IDS.leftMotor) - start) * 180) / Math.PI).toBeCloseTo(90, -1)
    expect(Math.abs(mechanics.motorSpeed(ROVER_IDS.leftMotor))).toBeLessThan(0.05)
    mechanics.dispose()
  })

  it("scenery 'none' leaves every other brick out; 'world' keeps it as static scenery the sensor sees", () => {
    const bricks = [...roverBricks(), { id: 'block', partId: 'brick_2x4', x: 30, y: 0, z: 18, rotation: 0 as const, color: '#888888' }]
    const creation = roverCreation(bricks)
    const world = createMechanics({ rapier: RAPIER, bricks, partMap, plateSize: 64, creation })
    const bare = createMechanics({ rapier: RAPIER, bricks, partMap, plateSize: 64, creation, scenery: 'none' })
    // Rapier builds its scene queries in a step: rays see the world as of the last step.
    world.stepOnce()
    bare.stepOnce()
    const inWorld = world.sensorRay(ROVER_IDS.sensor, 40 * 0.62)!
    const onPlate = bare.sensorRay(ROVER_IDS.sensor, 40 * 0.62)!
    // The block's near face is at z = (22 - 32) studs; the sensor face at (26 - 32) studs: 4 studs.
    expect(inWorld.distance! / 0.62).toBeCloseTo(4, 1)
    expect(onPlate.distance).toBeNull()
    expect(onPlate.end.z).toBeCloseTo(onPlate.origin.z - 40 * 0.62, 5)
    world.dispose()
    bare.dispose()
  })

  it('the sensor ray ignores the creation itself and follows the body it rides on', () => {
    const { mechanics } = build(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    const before = mechanics.sensorRay(ROVER_IDS.sensor, 10)!
    expect(before.distance).toBeNull()
    expect(before.direction).toEqual({ x: 0, y: 0, z: -1 })
    mechanics.setMotorPower(ROVER_IDS.leftMotor, 0.4)
    mechanics.setMotorPower(ROVER_IDS.rightMotor, 0.4)
    run(mechanics, 1.5)
    const after = mechanics.sensorRay(ROVER_IDS.sensor, 10)!
    expect(Math.abs(after.direction.x)).toBeGreaterThan(0.3)
    mechanics.dispose()
  })

  it('a wall prop stops a rover; a visitor walks up, waits, walks back and pushes nothing', () => {
    const creation = roverCreation()
    const wall = { id: 'wall', kind: 'wall' as const, center: { x: 0, y: 1, z: -6 }, size: { x: 10, y: 2, z: 0.62 } }
    // The sensor looks along -Z from (-0.62, ~0.49, -3.72).
    const visitor = { id: 'visitor', kind: 'visitor' as const, path: [{ x: 6, y: 1.1, z: -5 }, { x: -0.62, y: 1.1, z: -5 }], size: { x: 1.1, y: 2.2, z: 0.5 }, secondsPerLeg: 1 }
    const mechanics = createMechanics({ rapier: RAPIER, bricks: roverBricks(), partMap, plateSize: 64, creation, scenery: 'none', props: [wall, visitor] })
    expect(mechanics.visitorPhase()).toBe('away')
    expect(mechanics.triggerVisitor()).toBe(true)
    run(mechanics, 1.2)
    expect(mechanics.visitorPhase()).toBe('here')
    expect(mechanics.propPoses().get('visitor')!.position.x).toBeCloseTo(-0.62, 3)
    expect(mechanics.sensorRay(ROVER_IDS.sensor, 20)!.distance).toBeCloseTo(5 - 0.25 - 3.72, 2)
    // Nothing was pushed: the rover has not moved.
    expect(Math.abs(chassisPose(mechanics).position.z)).toBeLessThan(0.01)
    run(mechanics, 2)
    expect(mechanics.visitorPhase()).toBe('leaving')
    run(mechanics, 1.2)
    expect(mechanics.visitorPhase()).toBe('away')
    // Drive into the wall: the chassis stops at it.
    mechanics.setMotorPower(ROVER_IDS.leftMotor, 0.4)
    mechanics.setMotorPower(ROVER_IDS.rightMotor, -0.4)
    run(mechanics, 4)
    // The plate's front edge (z = -3.72 as built) ends at the wall's near face (z = -5.69), not through it.
    const front = chassisPose(mechanics).position.z - 3.72
    expect(front).toBeGreaterThan(-5.69 - 0.05)
    expect(front).toBeLessThan(-5.69 + 0.3)
    expect(mechanics.propPoses().get('wall')!.position).toEqual({ x: 0, y: 1, z: -6 })
    mechanics.dispose()
  })

  it('a visitor with its own leg times and pause: quick then slow, waits as long as it says, and walks back the same way', () => {
    const creation = roverCreation()
    const path = [{ x: 6, y: 1.1, z: -5 }, { x: 0, y: 1.1, z: -5 }, { x: -0.62, y: 1.1, z: -5 }]
    const visitor = { id: 'visitor', kind: 'visitor' as const, path, size: { x: 1.1, y: 2.2, z: 0.5 }, secondsPerLeg: 1, legSeconds: [0.5, 1], pauseSeconds: 0.5 }
    const mechanics = createMechanics({ rapier: RAPIER, bricks: roverBricks(), partMap, plateSize: 64, creation, scenery: 'none', props: [visitor] })
    // Whole fixed steps, so the phases land exactly.
    const seconds = (count: number) => { for (let step = 0; step < Math.round(count / FIXED_STEP); step += 1) mechanics.stepOnce() }
    const x = () => mechanics.propPoses().get('visitor')!.position.x
    mechanics.triggerVisitor()
    seconds(0.5)
    // The quick leg (6 units in half a second) is done; the slow one (0.62 in a second) begins.
    expect(x()).toBeCloseTo(0, 3)
    seconds(0.5)
    expect(x()).toBeCloseTo(-0.31, 3)
    expect(mechanics.visitorPhase()).toBe('arriving')
    seconds(0.5)
    expect(mechanics.visitorPhase()).toBe('here')
    seconds(0.5)
    expect(mechanics.visitorPhase()).toBe('leaving')
    // Back out slowly first: half a second later it is halfway out of the slow leg.
    seconds(0.5)
    expect(x()).toBeCloseTo(-0.31, 3)
    seconds(1)
    expect(mechanics.visitorPhase()).toBe('away')
    expect(x()).toBeCloseTo(6, 3)
    mechanics.dispose()
  })

  it('a hinge in power mode turns toward its range end at a fraction of top speed; 0 holds it', () => {
    const { mechanics } = build(gateBricks(), GATE_IDS.hinge, GATE_WIRING)
    expect(mechanics.setHingePower(GATE_IDS.hinge, 0.5)).toBe(true)
    run(mechanics, 1)
    const moving = mechanics.hingeReport(GATE_IDS.hinge)!.angle
    expect(moving).toBeGreaterThan(35)
    expect(moving).toBeLessThan(50)
    expect(mechanics.hingeSpeed(GATE_IDS.hinge)).toBeCloseTo(45, -1)
    mechanics.setHingePower(GATE_IDS.hinge, 0)
    run(mechanics, 1)
    expect(mechanics.hingeReport(GATE_IDS.hinge)!.angle).toBeCloseTo(moving, -1)
    expect(Math.abs(mechanics.hingeSpeed(GATE_IDS.hinge))).toBeLessThan(2)
    mechanics.dispose()
  })
})
