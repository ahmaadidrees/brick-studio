import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { STUD, createPartMap } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { deriveCreations, type DerivedCreation } from '../model/creations'
import { GATE_IDS, ROVER_IDS, SIGNAL_IDS, gateBricks, roverBricks, signalPostBricks } from '../model/fixtures'
import { emptyRoboticsSection, type RoboticsConnection } from '../model/section'
import { rotateByQuat, type Vec3 } from '../model/vec'
import { installRoboticsParts } from '../parts/install'
import { SENSOR_MAX_RANGE_STUDS, type DeviceId } from '../program/types'
import { VISITOR_PAUSE_SECONDS } from '../sim/mechanics'
import { createRunController, defaultProps, deriveCreationForSpace, type StageRunController } from './controller'
import type { ActuatorIntent, IntentSource, ProgramRuntime, RunSpace, TestProp, TickSnapshot } from './types'

/**
 * The run controller against the three spike builds and the five failures (CP2-PLAN §2),
 * with small hand-written runtimes standing in for the program lane's compiler.
 */
let partMap: ReturnType<typeof createPartMap>
beforeAll(async () => {
  await RAPIER.init()
  installRoboticsParts(true)
  partMap = createPartMap([])
})

const ROVER_WIRING: RoboticsConnection[] = [
  { deviceId: ROVER_IDS.leftMotor, hubId: ROVER_IDS.hub, port: 'A' },
  { deviceId: ROVER_IDS.rightMotor, hubId: ROVER_IDS.hub, port: 'B' },
  { deviceId: ROVER_IDS.sensor, hubId: ROVER_IDS.hub, port: 'C' },
]
const GATE_WIRING: RoboticsConnection[] = [
  { deviceId: GATE_IDS.hinge, hubId: GATE_IDS.hub, port: 'A' },
  { deviceId: GATE_IDS.sensor, hubId: GATE_IDS.hub, port: 'B' },
]
const SIGNAL_WIRING: RoboticsConnection[] = [
  { deviceId: SIGNAL_IDS.sensor, hubId: SIGNAL_IDS.hub, port: 'A' },
  { deviceId: SIGNAL_IDS.light, hubId: SIGNAL_IDS.hub, port: 'B' },
]

function stage(bricks: BrickInstance[], anchor: string, connections: RoboticsConnection[], space?: RunSpace, props?: TestProp[]): { creation: DerivedCreation; controller: StageRunController } {
  const section = { ...emptyRoboticsSection(), creations: [{ id: 'c', name: 'Test', anchorBrickIds: [anchor] }], connections }
  const input = { bricks, partMap, plateSize: 64, section }
  const resolved = space ?? deriveCreations(input)[0].testSpace
  const creation = deriveCreationForSpace(input, 'c', resolved)!
  return { creation, controller: createRunController({ rapier: RAPIER, bricks, partMap, plateSize: 64, creation, space: resolved, props }) }
}

type Fake = ProgramRuntime & { snapshots: TickSnapshot[]; stopped: boolean }
/** A runtime that answers each snapshot with `decide` and remembers what it read. */
function fake(decide: (snapshot: TickSnapshot) => ActuatorIntent[]): Fake {
  const runtime: Fake = {
    snapshots: [],
    stopped: false,
    tick(snapshot) {
      runtime.snapshots.push(snapshot)
      return { intents: runtime.stopped ? [] : decide(snapshot), activeBlockIds: [], diagnostics: [], variables: {}, idle: false }
    },
    stop() { runtime.stopped = true },
  }
  return runtime
}
const source = (scriptId = 's1', blockId = `${scriptId}-block`, controller = false): IntentSource => ({ scriptId, blockId, controller })
const power = (deviceId: DeviceId, percent: number, from = source()): ActuatorIntent => ({ kind: 'motorPower', deviceId, percent, source: from })
const stopMotor = (deviceId: DeviceId, from = source()): ActuatorIntent => ({ kind: 'motorStop', deviceId, source: from })

function frames(controller: StageRunController, seconds: number, fps = 60, each?: () => void) {
  const count = Math.round(seconds * fps)
  for (let frame = 0; frame < count; frame += 1) { controller.advance(1 / fps); each?.() }
}

function chassis(controller: StageRunController) {
  return controller.poses().get(controller.bodyOfBrick(ROVER_IDS.plate)!)!
}

/** The furthest point of the rover's plate along the wall's direction, world units (the plate's front corners in its current pose). */
function frontAlong(controller: StageRunController, forward: Vec3) {
  const pose = chassis(controller)
  const corners = [{ x: (28 - 32) * STUD, z: (26 - 32) * STUD }, { x: (34 - 32) * STUD, z: (26 - 32) * STUD }]
  return Math.max(...corners.map((corner) => {
    const moved = rotateByQuat(pose.rotation, { x: corner.x, y: 0, z: corner.z })
    return (moved.x + pose.position.x) * forward.x + (moved.z + pose.position.z) * forward.z
  }))
}

function driveUntilWall(creation: DerivedCreation, threshold = 3) {
  const pair = creation.drivePair!
  const reversed = new Set(pair.reversedIds)
  const sensor = creation.sensors[0].brickId
  const state = { braking: false }
  const runtime = fake((snapshot) => {
    const reading = snapshot.sensors[sensor]
    if (reading.hit && reading.distanceStuds < threshold) state.braking = true
    return [pair.leftId, pair.rightId].map((id) => (state.braking ? stopMotor(id) : power(id, reversed.has(id) ? -40 : 40)))
  })
  return { runtime, state, sensor }
}

describe('default props', () => {
  it('a rover on the test plate meets a wall 12 studs ahead of its front, wide and tall; none in my world', () => {
    const bricks = roverBricks()
    const { creation, controller } = stage(bricks, ROVER_IDS.hub, ROVER_WIRING)
    const [wall] = controller.props
    expect(controller.space).toBe('testPlate')
    expect(wall.kind).toBe('wall')
    if (wall.kind !== 'wall') return
    // Front of the plate is z = (26 - 32) studs; the wall's near face 12 studs further along -Z.
    expect(wall.center.z + wall.size.z / 2).toBeCloseTo((26 - 32) * STUD - 12 * STUD, 5)
    expect(wall.size.x).toBeGreaterThanOrEqual(16 * STUD)
    expect(wall.size.y).toBeGreaterThan(2)
    expect(defaultProps(creation, 'myWorld', { bricks, partMap, plateSize: 64 })).toEqual([])
    controller.dispose()
  })

  it('a gate and a signal post get a visitor that walks to 3 studs in front of the first sensor, in either space', () => {
    for (const [bricks, anchor, wiring] of [[gateBricks(), GATE_IDS.hinge, GATE_WIRING], [signalPostBricks(), SIGNAL_IDS.hub, SIGNAL_WIRING]] as const) {
      for (const space of ['myWorld', 'testPlate'] as const) {
        const { controller } = stage([...bricks], anchor, [...wiring], space)
        const [visitor] = controller.props
        expect(visitor.kind).toBe('visitor')
        controller.triggerVisitor()
        frames(controller, 3)
        expect(controller.observe().visitorPhase).toBe('here')
        const [reading] = Object.values(controller.observe().sensors)
        expect(reading.hit).toBe(true)
        expect(reading.distanceStuds).toBeCloseTo(3, 1)
        controller.dispose()
      }
    }
  })
})

describe('the rover journey and its failures', () => {
  it('drives until the front sensor reads under 3 studs, stops before the wall and never touches it', () => {
    const { creation, controller } = stage(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    const wall = controller.props[0] as Extract<TestProp, { kind: 'wall' }>
    const nearFace = wall.center.z + wall.size.z / 2
    const { runtime, state, sensor } = driveUntilWall(creation)
    controller.run(runtime)
    const distances: number[] = []
    let deepest = Number.NEGATIVE_INFINITY
    frames(controller, 7, 60, () => {
      distances.push(controller.observe().sensors[sensor].distanceStuds)
      deepest = Math.max(deepest, frontAlong(controller, { x: 0, y: 0, z: -1 }))
    })
    expect(state.braking).toBe(true)
    // The readings the stage shows are the ones the program read.
    const observation = controller.observe()
    expect(observation.sensors).toBe(runtime.snapshots.at(-1)!.sensors)
    expect(observation.motors).toBe(runtime.snapshots.at(-1)!.motors)
    // Distance shrinks from about 12 studs to under 3, then holds.
    expect(distances[0]).toBeGreaterThan(11)
    expect(distances[0]).toBeLessThan(13)
    const final = observation.sensors[sensor].distanceStuds
    expect(final).toBeLessThan(3)
    expect(final).toBeGreaterThan(1)
    for (let index = 1; index < distances.length; index += 1) expect(distances[index]).toBeLessThanOrEqual(distances[index - 1] + 0.05)
    expect(Math.abs(observation.speedStudsPerSecond)).toBeLessThan(0.1)
    expect(observation.beams).toHaveLength(1)
    expect(observation.beams[0].hit).toBe(true)
    // Never touched: the plate's front stayed short of the wall's near face the whole run.
    expect(deepest).toBeLessThan(-nearFace - 0.5 * STUD)
    expect(observation.contacts).toEqual([])
    controller.dispose()
  })

  it('reads the chassis speed in studs per second while it drives', () => {
    const { creation, controller } = stage(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    controller.run(driveUntilWall(creation).runtime)
    frames(controller, 1.5)
    const speed = controller.observe().speedStudsPerSecond
    // 40% of 8 rad/s on a 0.76-unit wheel is about 3.9 studs per second.
    expect(speed).toBeGreaterThan(3)
    expect(speed).toBeLessThan(4.5)
    controller.dispose()
  })

  it('sensor sideways: the wall is never seen and the readings show no hit', () => {
    const { creation, controller } = stage(roverBricks({ sensorSideways: true }), ROVER_IDS.hub, ROVER_WIRING)
    expect(creation.sensors[0].facing).not.toBe('forward')
    const { runtime, state, sensor } = driveUntilWall(creation)
    controller.run(runtime)
    let everHit = false
    frames(controller, 6, 60, () => { everHit ||= controller.observe().sensors[sensor].hit })
    expect(everHit).toBe(false)
    expect(state.braking).toBe(false)
    expect(runtime.snapshots.every((snapshot) => snapshot.sensors[sensor].distanceStuds === SENSOR_MAX_RANGE_STUDS && !snapshot.sensors[sensor].hit)).toBe(true)
    // The beam is still drawn, sideways, so the stage shows where it looks.
    const [beam] = controller.observe().beams
    expect(beam.hit).toBe(false)
    expect(Math.abs(beam.to.x - beam.from.x)).toBeGreaterThan(20)
    // It drove all the way up to the wall (whatever happened there).
    expect(chassis(controller).position.z).toBeLessThan(-5)
    controller.dispose()
  })

  it('one motor backwards with raw power: it turns, and the readings say the two motors push opposite ways', () => {
    const { creation, controller } = stage(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    expect(creation.drivePair!.reversedIds).toEqual([ROVER_IDS.rightMotor])
    const runtime = fake(() => [power(ROVER_IDS.leftMotor, 40), power(ROVER_IDS.rightMotor, 40)])
    controller.run(runtime)
    frames(controller, 2)
    const { motors } = controller.observe()
    const left = motors[ROVER_IDS.leftMotor]
    const right = motors[ROVER_IDS.rightMotor]
    // Each motor turns its own output at +40% (a little less under load while the rover pivots):
    // the block values have the same sign...
    expect(left.powerPercent).toBe(40)
    expect(right.powerPercent).toBe(40)
    expect(left.speedPercent).toBeGreaterThan(20)
    expect(right.speedPercent).toBeGreaterThan(20)
    // ...but as the creation feels them they are opposite: one pushes forward, the other backward.
    expect(left.forwardPercent!).toBeGreaterThan(20)
    expect(right.forwardPercent!).toBeLessThan(-20)
    const pose = chassis(controller)
    const forward = rotateByQuat(pose.rotation, { x: 0, y: 0, z: -1 })
    expect(Math.abs((Math.atan2(-forward.x, -forward.z) * 180) / Math.PI)).toBeGreaterThan(25)
    controller.dispose()
  })

  it('an unplugged motor: its commands are dropped with one warning, the other motor still runs', () => {
    const wiring = ROVER_WIRING.filter((connection) => connection.deviceId !== ROVER_IDS.leftMotor)
    const { creation, controller } = stage(roverBricks(), ROVER_IDS.hub, wiring)
    const reversed = new Set(creation.drivePair!.reversedIds)
    const runtime = fake(() => [ROVER_IDS.leftMotor, ROVER_IDS.rightMotor].map((id) => power(id, reversed.has(id) ? -40 : 40, source('s1', `drive-${id}`))))
    controller.run(runtime)
    frames(controller, 1.5)
    const observation = controller.observe()
    const unplugged = observation.diagnostics.filter((diagnostic) => diagnostic.code === 'device.unplugged')
    expect(unplugged).toEqual([{ code: 'device.unplugged', severity: 'warning', message: 'Left motor is not plugged in, so it did nothing', blockId: `drive-${ROVER_IDS.leftMotor}`, deviceId: ROVER_IDS.leftMotor, scriptId: 's1' }])
    expect(observation.motors[ROVER_IDS.leftMotor].plugged).toBe(false)
    expect(observation.motors[ROVER_IDS.leftMotor].powerPercent).toBe(0)
    expect(observation.motors[ROVER_IDS.rightMotor].powerPercent).toBe(-40)
    expect(Math.abs(observation.motors[ROVER_IDS.rightMotor].speedPercent)).toBeGreaterThan(20)
    controller.dispose()
  })

  it('Stop brakes the motors and keeps the pose; Run starts a fresh program from there', () => {
    const { creation, controller } = stage(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    controller.run(driveUntilWall(creation, 0).runtime)
    frames(controller, 1)
    const first = fake(() => [])
    controller.stop()
    expect(controller.phase).toBe('stopped')
    frames(controller, 1)
    const stoppedAt = chassis(controller).position.z
    expect(stoppedAt).toBeLessThan(-1)
    frames(controller, 1)
    expect(chassis(controller).position.z).toBeCloseTo(stoppedAt, 2)
    expect(controller.observe().motors[ROVER_IDS.leftMotor].powerPercent).toBe(0)
    controller.run(first)
    expect(controller.phase).toBe('running')
    expect(controller.observe().tick).toBe(0)
    expect(controller.observe().motors[ROVER_IDS.leftMotor].positionDegrees).toBe(0)
    frames(controller, 0.5)
    expect(first.snapshots[0].tick).toBe(0)
    expect(first.snapshots[1].timeSeconds).toBeCloseTo(1 / 120, 5)
    expect(chassis(controller).position.z).toBeCloseTo(stoppedAt, 2)
    controller.dispose()
  })
})

describe('the gate and the signal post in my world', () => {
  function gateProgram(creation: DerivedCreation) {
    const sensor = creation.sensors[0].brickId
    const hinge = creation.hinges[0].brickId
    return fake((snapshot) => (snapshot.sensors[sensor].hit && snapshot.sensors[sensor].distanceStuds < 5 ? [{ kind: 'motorTarget', deviceId: hinge, degrees: 90, source: source('s1', 'turn-arm') }] : []))
  }

  it('the visitor walks up, the arm turns to about 90° about the hinge axis only, and Reset returns it to zero', () => {
    const bricks = gateBricks()
    const { creation, controller } = stage(bricks, GATE_IDS.hinge, GATE_WIRING)
    expect(controller.space).toBe('myWorld')
    controller.run(gateProgram(creation))
    frames(controller, 1)
    expect(controller.observe().motors[GATE_IDS.hinge].positionDegrees).toBeCloseTo(0, 0)
    controller.triggerVisitor()
    frames(controller, 4)
    const observation = controller.observe()
    const arm = observation.motors[GATE_IDS.hinge]
    expect(arm.positionDegrees).toBeGreaterThan(87)
    expect(arm.positionDegrees).toBeLessThan(93)
    expect(arm.stuck).toBeNull()
    const armPose = controller.poses().get(controller.bodyOfBrick(GATE_IDS.door)!)!
    // Pure yaw about the turntable's vertical axis: no tilt, and the pivot stays put.
    expect(Math.abs(armPose.rotation.x)).toBeLessThan(0.02)
    expect(Math.abs(armPose.rotation.z)).toBeLessThan(0.02)
    const pivot = { x: (22 - 32) * STUD, y: 2 * 0.18 + 0.72, z: (22 - 32) * STUD }
    const moved = rotateByQuat(armPose.rotation, pivot)
    expect(Math.hypot(moved.x + armPose.position.x - pivot.x, moved.y + armPose.position.y - pivot.y, moved.z + armPose.position.z - pivot.z)).toBeLessThan(0.05)
    const frame = controller.poses().get(controller.bodyOfBrick(GATE_IDS.leftPost)!)!
    expect(frame.position).toEqual({ x: 0, y: 0, z: 0 })
    controller.dispose()
    // Reset: a fresh controller at the built pose.
    const { controller: fresh } = stage(bricks, GATE_IDS.hinge, GATE_WIRING)
    expect(fresh.observe().motors[GATE_IDS.hinge].positionDegrees).toBe(0)
    expect(fresh.poses().get(fresh.bodyOfBrick(GATE_IDS.door)!)!.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 })
    fresh.dispose()
  })

  it('the visitor pauses about two seconds, walks back, and the sensor clears', () => {
    const { controller } = stage(gateBricks(), GATE_IDS.hinge, GATE_WIRING)
    controller.triggerVisitor()
    frames(controller, 2.6)
    expect(controller.observe().visitorPhase).toBe('here')
    frames(controller, VISITOR_PAUSE_SECONDS)
    expect(controller.observe().visitorPhase).toBe('leaving')
    frames(controller, 3)
    expect(controller.observe().visitorPhase).toBe('away')
    expect(controller.observe().sensors[GATE_IDS.sensor].hit).toBe(false)
    controller.dispose()
  })

  it('an arm built into the frame: the target changes nothing and the observation says why', () => {
    const { creation, controller } = stage(gateBricks({ builtIntoFrame: true }), GATE_IDS.hinge, GATE_WIRING)
    expect(creation.hinges[0].locked).toBe(true)
    controller.run(gateProgram(creation))
    controller.triggerVisitor()
    frames(controller, 4)
    const observation = controller.observe()
    const arm = observation.motors[GATE_IDS.hinge]
    expect(Math.abs(arm.positionDegrees)).toBeLessThan(0.5)
    expect(arm.stuck).toBe('locked')
    expect(observation.diagnostics).toContainEqual(expect.objectContaining({ code: 'device.locked', severity: 'warning', deviceId: GATE_IDS.hinge, blockId: 'turn-arm', message: "Arm motor's arm is built into the frame, so it can't swing" }))
    // The contact the stage highlights is the joint that ties the door to the frame.
    expect(observation.contacts).toContainEqual(expect.objectContaining({ brickId: GATE_IDS.door }))
    controller.dispose()
  })

  it('in my world a sensor sees the world: a brick standing on the plate in front of it is seen, and stays in the studio', () => {
    // The signal post's sensor looks along -Z from grid z = 40, 7.5 plates up; a stack of three loose
    // bricks 4 studs ahead (near face at z = 36) is tall enough to be in its way.
    const loose = (id: string, y: number) => ({ id, partId: 'brick_2x4', x: 41, y, z: 32, rotation: 0 as const, color: '#888888' })
    const bricks = [...signalPostBricks(), loose('loose', 0), loose('loose-2', 3), loose('loose-3', 6)]
    const { controller } = stage(bricks, SIGNAL_IDS.hub, SIGNAL_WIRING)
    expect(controller.hiddenBrickIds.has('loose')).toBe(false)
    expect(controller.simulatedBrickIds.has('loose')).toBe(false)
    frames(controller, 0.1)
    const reading = controller.observe().sensors[SIGNAL_IDS.sensor]
    expect(reading.hit).toBe(true)
    expect(reading.distanceStuds).toBeCloseTo(4, 1)
    controller.dispose()
  })

  it('the signal post turns its light red when the visitor arrives', () => {
    const { creation, controller } = stage(signalPostBricks(), SIGNAL_IDS.hub, SIGNAL_WIRING)
    expect(controller.space).toBe('myWorld')
    const sensor = creation.sensors[0].brickId
    controller.run(fake((snapshot) => (snapshot.sensors[sensor].hit && snapshot.sensors[sensor].distanceStuds < 5 ? [{ kind: 'light', deviceId: SIGNAL_IDS.light, color: 'red', source: source() }] : [])))
    frames(controller, 1)
    expect(controller.observe().lights[SIGNAL_IDS.light]).toBeNull()
    controller.triggerVisitor()
    frames(controller, 3)
    expect(controller.observe().lights[SIGNAL_IDS.light]).toBe('red')
    // Commands latch: the light stays red after the visitor leaves.
    frames(controller, 5)
    expect(controller.observe().sensors[sensor].hit).toBe(false)
    expect(controller.observe().lights[SIGNAL_IDS.light]).toBe('red')
    controller.dispose()
  })
})

describe('motors in target mode and buttons', () => {
  it('a free-spinning motor turns to a target in degrees since Run and reports its speed while it goes', () => {
    const bricks = roverBricks().filter((brick) => brick.id !== ROVER_IDS.leftAxle && brick.id !== ROVER_IDS.leftWheel)
    const { controller } = stage(bricks, ROVER_IDS.hub, ROVER_WIRING)
    const speeds: number[] = []
    controller.run(fake(() => [{ kind: 'motorTarget', deviceId: ROVER_IDS.leftMotor, degrees: 180, source: source() }]))
    frames(controller, 1.5, 60, () => speeds.push(controller.observe().motors[ROVER_IDS.leftMotor].speedPercent))
    const reading = controller.observe().motors[ROVER_IDS.leftMotor]
    expect(reading.positionDegrees).toBeCloseTo(180, 0)
    expect(reading.powerPercent).toBe(0)
    expect(Math.max(...speeds)).toBeGreaterThan(50)
    expect(reading.speedPercent).toBeCloseTo(0, 0)
    controller.dispose()
  })

  it('a wheel motor in target mode turns its wheel to the target and holds it there', () => {
    const { controller } = stage(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    controller.run(fake(() => [{ kind: 'motorTarget', deviceId: ROVER_IDS.leftMotor, degrees: 360, source: source() }, { kind: 'motorTarget', deviceId: ROVER_IDS.rightMotor, degrees: -360, source: source() }]))
    frames(controller, 3)
    const { motors } = controller.observe()
    expect(motors[ROVER_IDS.leftMotor].positionDegrees).toBeGreaterThan(350)
    expect(motors[ROVER_IDS.leftMotor].positionDegrees).toBeLessThan(370)
    expect(motors[ROVER_IDS.rightMotor].positionDegrees).toBeLessThan(-350)
    // One wheel turn forward on a 0.76-unit wheel is about 7.7 studs.
    expect(-chassis(controller).position.z / STUD).toBeGreaterThan(6.5)
    controller.dispose()
  })

  it('a hinge motor in power mode swings toward the end of its range; a target is clamped to it; the post blocks it', () => {
    const { controller } = stage(gateBricks(), GATE_IDS.hinge, GATE_WIRING)
    controller.run(fake((snapshot) => [snapshot.timeSeconds < 0.5 ? power(GATE_IDS.hinge, 50) : { kind: 'motorTarget', deviceId: GATE_IDS.hinge, degrees: 400, source: source() }]))
    frames(controller, 0.4)
    const early = controller.observe().motors[GATE_IDS.hinge]
    expect(early.positionDegrees).toBeGreaterThan(8)
    expect(early.speedPercent).toBeGreaterThan(30)
    expect(early.powerPercent).toBe(50)
    frames(controller, 3)
    expect(controller.mechanics.hingeReport(GATE_IDS.hinge)!.target).toBe(120)
    // Past about 90° the door meets the left post: the reading says blocked, and the stage sees the contact.
    const late = controller.observe()
    expect(late.motors[GATE_IDS.hinge].positionDegrees).toBeGreaterThan(88)
    expect(late.motors[GATE_IDS.hinge].positionDegrees).toBeLessThan(100)
    expect(late.motors[GATE_IDS.hinge].stuck).toBe('blocked')
    expect(late.contacts).toContainEqual(expect.objectContaining({ brickId: GATE_IDS.door, otherBrickId: GATE_IDS.leftPost }))
    controller.dispose()
  })

  it('a button pressed on the stage is what the program reads', () => {
    const bricks = [...signalPostBricks(), { id: 'signal-button', partId: 'robo_button', x: 40, y: 6, z: 42, rotation: 0 as const, color: '#ef8d32' }]
    const { creation, controller } = stage(bricks, SIGNAL_IDS.hub, [...SIGNAL_WIRING, { deviceId: 'signal-button', hubId: SIGNAL_IDS.hub, port: 'C' }])
    expect(creation.buttons.map((button) => button.brickId)).toEqual(['signal-button'])
    const runtime = fake((snapshot) => (snapshot.buttons['signal-button'] ? [{ kind: 'light', deviceId: SIGNAL_IDS.light, color: 'green', source: source() }] : []))
    controller.run(runtime)
    frames(controller, 0.2)
    expect(controller.observe().lights[SIGNAL_IDS.light]).toBeNull()
    controller.setButton('signal-button', true)
    frames(controller, 0.1)
    expect(controller.observe().buttons['signal-button']).toBe(true)
    expect(controller.observe().lights[SIGNAL_IDS.light]).toBe('green')
    controller.dispose()
  })
})

describe('the clock', () => {
  it('the same program and inputs at 60 and 144 fps end in the same pose', () => {
    const poses = [60, 144].map((fps) => {
      const { creation, controller } = stage(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
      controller.run(driveUntilWall(creation).runtime)
      frames(controller, 6, fps)
      const pose = chassis(controller)
      const reading = controller.observe().sensors[ROVER_IDS.sensor].distanceStuds
      const elapsed = controller.mechanics.elapsed
      controller.dispose()
      return { pose, reading, elapsed }
    })
    expect(poses[1].elapsed).toBeCloseTo(poses[0].elapsed, 1)
    expect(poses[1].pose.position.z).toBeCloseTo(poses[0].pose.position.z, 2)
    expect(poses[1].pose.position.x).toBeCloseTo(poses[0].pose.position.x, 2)
    expect(poses[1].reading).toBeCloseTo(poses[0].reading, 1)
  })

  it('one program tick per fixed step, and none while ready or stopped', () => {
    const { controller } = stage(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    frames(controller, 0.5)
    expect(controller.observe().tick).toBe(0)
    const runtime = fake(() => [])
    controller.run(runtime)
    frames(controller, 1)
    expect(runtime.snapshots).toHaveLength(120)
    expect(runtime.snapshots.map((snapshot) => snapshot.tick)).toEqual([...Array(120).keys()])
    controller.stop()
    expect(runtime.stopped).toBe(true)
    frames(controller, 0.5)
    expect(runtime.snapshots).toHaveLength(120)
    controller.dispose()
  })

  it('a runtime that throws stops the run with a diagnostic and brakes', () => {
    const { controller } = stage(roverBricks(), ROVER_IDS.hub, ROVER_WIRING)
    let ticks = 0
    controller.run({ tick() { ticks += 1; if (ticks > 3) throw new Error('boom'); return { intents: [power(ROVER_IDS.leftMotor, 40)], activeBlockIds: [], diagnostics: [], variables: {}, idle: false } }, stop() {} })
    frames(controller, 0.5)
    expect(controller.phase).toBe('stopped')
    expect(controller.observe().diagnostics).toContainEqual(expect.objectContaining({ code: 'runtime.error', severity: 'error' }))
    expect(controller.observe().motors[ROVER_IDS.leftMotor].powerPercent).toBe(0)
    controller.dispose()
  })
})
