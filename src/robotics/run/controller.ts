import { PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { deriveCreations, type DeriveInput, type DerivedCreation } from '../model/creations'
import { brickFrame, toWorldPoint, type PartMap } from '../model/grid'
import { cross, dot, normalize, radiansToDegrees, rotateByQuat, type Vec3 } from '../model/vec'
import { roboticsSpec } from '../parts/catalog'
import { SENSOR_MAX_RANGE_STUDS, type BlockDiagnostic, type DeviceId, type ProgramKey } from '../program/types'
import type { RapierModule } from '../sim/colliders'
import { createMechanics, type ContactReport, type Mechanics } from '../sim/mechanics'
import { createArbiter, type ArbitratedCommand, type ArbiterDevice } from './arbiter'
import { createInputSampler } from './input'
import type { MotorReading, ProgramRuntime, RunController, RunObservation, RunPhase, RunSpace, SensorBeam, SensorReading, TestProp, TickSnapshot } from './types'

/**
 * The run controller (CP2-PLAN §4, contract §8): one mechanics world, one program at a
 * time, the tick order of `run/types.ts` once per fixed step:
 *
 *   before the step  1. sample inputs; the sensors and motors read back after the previous
 *                       step → `TickSnapshot` (exactly what the blocks read, and what `observe` shows)
 *                    2. `runtime.tick(snapshot)` → intents
 *                    3. arbitrate → at most one command per actuator, latched
 *                    4. apply the changed commands to the mechanics
 *   the step         physics
 *   after the step   5. read back sensors (rays), motors (speed, position) and the chassis speed
 *
 * The physics runs in every phase (a visitor can walk up before Run); the program ticks
 * only while running. Stop brakes every motor and holds every hinge where it is; Reset
 * is `dispose()` and another controller. Nothing here writes the document.
 */
export type RunControllerInput = {
  rapier: RapierModule
  bricks: readonly BrickInstance[]
  partMap: PartMap
  plateSize: number
  /** Derived for `space` (bodies are anchored in My world, free on the test plate); see `deriveCreationForSpace`. */
  creation: DerivedCreation
  space: RunSpace
  /** Test props; `defaultProps` when absent. */
  props?: readonly TestProp[]
  fixedStep?: number
}

/** The controller plus what the stage scene draws from. */
export type StageRunController = RunController & {
  readonly creation: DerivedCreation
  readonly mechanics: Mechanics
  /** The last snapshot handed to (or prepared for) the runtime. */
  readonly snapshot: TickSnapshot
}

const UP: Vec3 = { x: 0, y: 1, z: 0 }
const WALL_DISTANCE_STUDS = 12
const WALL_THICKNESS_STUDS = 1
const WALL_MIN_WIDTH_STUDS = 16
const WALL_HEIGHT = 12 * PLATE_HEIGHT
const VISITOR_STOP_STUDS = 3
const VISITOR_APPROACH_STUDS = 10
const VISITOR_SECONDS_PER_LEG = 2.5
const VISITOR_SIZE = { width: 1.1, height: 2.2, depth: 0.5 }
const HINGE_TOP_SPEED_DEG_PER_SEC = 90

const round = (value: number, places: number) => {
  const factor = 10 ** places
  const rounded = Math.round(value * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

/** The creation derived as it runs in `space` (bodies anchored to the plate in My world, free on the test plate). */
export function deriveCreationForSpace(input: DeriveInput, creationId: string, space: RunSpace): DerivedCreation | null {
  const record = input.section.creations.find((creation) => creation.id === creationId)
  if (!record) return null
  const section = { ...input.section, creations: [{ ...record, testSpace: space }] }
  return deriveCreations({ ...input, section })[0] ?? null
}

type Geometry = { bricks: readonly BrickInstance[]; partMap: PartMap; plateSize: number }

/** Footprint extent of the creation's bricks along `axis` (a horizontal grid axis), world units at the built pose. */
function extentAlong(creation: DerivedCreation, geometry: Geometry, axis: Vec3): { min: number; max: number } | null {
  const ids = new Set(creation.brickIds)
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const brick of geometry.bricks) {
    if (!ids.has(brick.id)) continue
    const part = geometry.partMap[brick.partId]
    if (!part) continue
    const origin = brickFrame(brick, part, geometry.plateSize).origin
    const size = rotatedSize(part, brick.rotation)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const value = dot({ x: origin.x + (sx * size.width * STUD) / 2, y: 0, z: origin.z + (sz * size.depth * STUD) / 2 }, axis)
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
  }
  return Number.isFinite(min) ? { min, max } : null
}

/**
 * The props a starter's stage gets (CP2-PLAN §4, contract §7.4). A creation with a drive
 * pair meets a wall 12 studs ahead of its front along the pair's forward, on the test plate
 * only (in My world the world is the scenery); the wall is wider than the creation and
 * taller than its sensors. A creation with a sensor and no drive pair gets a visitor that
 * walks in from the side to 3 studs in front of its first sensor and back, in either space.
 * Props are in world units: a wall's centre and full size, a visitor's box centre per path point.
 */
export function defaultProps(creation: DerivedCreation, space: RunSpace, geometry: Geometry): TestProp[] {
  const driveForward = creation.drivePair?.forward ?? creation.driveForward
  if (driveForward) {
    if (space !== 'testPlate') return []
    const forward = normalize({ ...driveForward, y: 0 })
    const lateral = cross(UP, forward)
    const along = extentAlong(creation, geometry, forward)
    const across = extentAlong(creation, geometry, lateral)
    if (!along || !across) return []
    const thickness = WALL_THICKNESS_STUDS * STUD
    const width = Math.max(WALL_MIN_WIDTH_STUDS * STUD, across.max - across.min + 8 * STUD)
    const ahead = along.max + WALL_DISTANCE_STUDS * STUD + thickness / 2
    const middle = (across.min + across.max) / 2
    const center = { x: forward.x * ahead + lateral.x * middle, y: WALL_HEIGHT / 2, z: forward.z * ahead + lateral.z * middle }
    const size = Math.abs(forward.x) > 0.5 ? { x: thickness, y: WALL_HEIGHT, z: width } : { x: width, y: WALL_HEIGHT, z: thickness }
    return [{ id: 'wall', kind: 'wall', center, size }]
  }
  const sensor = creation.sensors[0]
  if (!sensor) return []
  const brick = geometry.bricks.find((candidate) => candidate.id === sensor.brickId)
  const part = brick ? geometry.partMap[brick.partId] : undefined
  const spec = brick ? roboticsSpec(brick.partId) : null
  if (!brick || !part || !spec?.sensor) return []
  const point = toWorldPoint(brickFrame(brick, part, geometry.plateSize), spec.sensor.point)
  const normal = normalize(sensor.normal)
  const flat = normalize({ x: normal.x, y: 0, z: normal.z })
  const sideways = Math.hypot(flat.x, flat.z) > 0.5 ? cross(flat, UP) : { x: 1, y: 0, z: 0 }
  const height = Math.max(VISITOR_SIZE.height, point.y + 0.7)
  const reach = VISITOR_STOP_STUDS * STUD + VISITOR_SIZE.depth / 2
  const arrival = { x: point.x + normal.x * reach, y: height / 2, z: point.z + normal.z * reach }
  const start = { x: arrival.x + sideways.x * VISITOR_APPROACH_STUDS * STUD, y: height / 2, z: arrival.z + sideways.z * VISITOR_APPROACH_STUDS * STUD }
  const size = Math.abs(sideways.x) > 0.5 ? { x: VISITOR_SIZE.width, y: height, z: VISITOR_SIZE.depth } : { x: VISITOR_SIZE.depth, y: height, z: VISITOR_SIZE.width }
  const facing = Math.hypot(flat.x, flat.z) > 0.5 ? { x: -flat.x, y: 0, z: -flat.z } : { x: 0, y: 0, z: 1 }
  return [{ id: 'visitor', kind: 'visitor', path: [start, arrival], size, secondsPerLeg: VISITOR_SECONDS_PER_LEG, facing }]
}

type ReadBack = { sensors: Record<DeviceId, SensorReading>; motors: Record<DeviceId, MotorReading>; beams: SensorBeam[]; speedStudsPerSecond: number }

const diagnosticKey = (diagnostic: BlockDiagnostic) => [diagnostic.code, diagnostic.blockId ?? '', diagnostic.deviceId ?? '', diagnostic.scriptId ?? '', diagnostic.message].join('|')

export function createRunController(input: RunControllerInput): StageRunController {
  const { rapier, bricks, partMap, plateSize, creation, space } = input
  const geometry: Geometry = { bricks, partMap, plateSize }
  const props: readonly TestProp[] = input.props ?? defaultProps(creation, space, geometry)
  const mechanics = createMechanics({ rapier, bricks, partMap, plateSize, creation, scenery: space === 'testPlate' ? 'none' : 'world', props, fixedStep: input.fixedStep })
  const dt = mechanics.fixedStep
  const hiddenBrickIds: ReadonlySet<string> = space === 'testPlate' ? new Set(bricks.map((brick) => brick.id)) : mechanics.simulatedBrickIds

  const devices: ArbiterDevice[] = [
    ...creation.motors.map((motor) => ({ id: motor.brickId, kind: 'motor' as const, name: motor.name, plugged: motor.plugged })),
    ...creation.hinges.map((hinge) => ({ id: hinge.brickId, kind: 'hinge' as const, name: hinge.name, plugged: hinge.plugged })),
    ...creation.lights.map((light) => ({ id: light.brickId, kind: 'light' as const, name: light.name, plugged: light.plugged })),
  ]
  const arbiter = createArbiter(devices)
  const sampler = createInputSampler()
  const buttonsDown = new Map<DeviceId, boolean>(creation.buttons.map((button) => [button.brickId, false]))
  const hingeById = new Map(creation.hinges.map((hinge) => [hinge.brickId, hinge]))

  // The chassis: the hub's body, else a drive motor's, else the first body that can move.
  const chassisBody = (creation.hubs[0] && mechanics.bodyOfBrick(creation.hubs[0].brickId))
    ?? (creation.drivePair && mechanics.bodyOfBrick(creation.drivePair.leftId))
    ?? creation.bodies.find((body) => !body.anchored)?.id
    ?? null
  const driveSign = new Map(creation.motors.map((motor) => [motor.brickId, motor.drives === 'forward' ? 1 : motor.drives === 'backward' ? -1 : 0]))

  let phase: RunPhase = 'ready'
  let runtime: ProgramRuntime | null = null
  let tick = 0
  let disposed = false
  let motorOrigin = new Map<DeviceId, number>(creation.motors.map((motor) => [motor.brickId, mechanics.motorOutputAngle(motor.brickId)]))
  let activeBlockIds: string[] = []
  let variables: Record<string, number | boolean> = {}
  let idle = false
  const diagnostics: BlockDiagnostic[] = []
  const diagnosticKeys = new Set<string>()
  /** Locked hinges a program tried to move: their bridging joints are the stage's contact highlight. */
  const lockedCommanded = new Set<DeviceId>()

  const record = (items: readonly BlockDiagnostic[]) => {
    for (const item of items) {
      const key = diagnosticKey(item)
      if (diagnosticKeys.has(key)) continue
      diagnosticKeys.add(key)
      diagnostics.push(item)
    }
  }

  const readBack = (): ReadBack => {
    const sensors: Record<DeviceId, SensorReading> = {}
    const beams: SensorBeam[] = []
    for (const sensor of creation.sensors) {
      const ray = sensor.plugged ? mechanics.sensorRay(sensor.brickId, SENSOR_MAX_RANGE_STUDS * STUD) : null
      if (!ray) { sensors[sensor.brickId] = { distanceStuds: SENSOR_MAX_RANGE_STUDS, hit: false }; continue }
      const hit = ray.distance !== null
      sensors[sensor.brickId] = { distanceStuds: hit ? Math.min(SENSOR_MAX_RANGE_STUDS, round(ray.distance! / STUD, 2)) : SENSOR_MAX_RANGE_STUDS, hit }
      beams.push({ deviceId: sensor.brickId, from: ray.origin, to: ray.end, hit })
    }
    const motors: Record<DeviceId, MotorReading> = {}
    for (const motor of creation.motors) {
      const command = arbiter.motorCommand(motor.brickId)
      const speedPercent = round(mechanics.motorSpeed(motor.brickId) * 100, 1)
      const sign = driveSign.get(motor.brickId) ?? 0
      motors[motor.brickId] = {
        powerPercent: command.kind === 'power' ? command.percent : 0,
        speedPercent,
        positionDegrees: round(radiansToDegrees(mechanics.motorOutputAngle(motor.brickId) - (motorOrigin.get(motor.brickId) ?? 0)), 1),
        plugged: motor.plugged,
        forwardPercent: motor.wheelIds.length > 0 && sign !== 0 ? round(speedPercent * sign, 1) : null,
      }
    }
    for (const hinge of creation.hinges) {
      const command = arbiter.motorCommand(hinge.brickId)
      const report = mechanics.hingeReport(hinge.brickId)
      motors[hinge.brickId] = {
        powerPercent: command.kind === 'power' ? command.percent : 0,
        speedPercent: round((mechanics.hingeSpeed(hinge.brickId) / HINGE_TOP_SPEED_DEG_PER_SEC) * 100, 1),
        positionDegrees: round(report?.angle ?? 0, 1),
        plugged: hinge.plugged,
        stuck: hinge.locked ? 'locked' : report?.blocked ? 'blocked' : null,
      }
    }
    let speedStudsPerSecond = 0
    const velocity = chassisBody ? mechanics.bodyVelocity(chassisBody) : null
    if (velocity) {
      if (creation.drivePair) {
        const pose = mechanics.poses().get(chassisBody!)
        const forward = pose ? rotateByQuat(pose.rotation, creation.drivePair.forward) : creation.drivePair.forward
        speedStudsPerSecond = dot(velocity, forward) / STUD
      } else speedStudsPerSecond = Math.hypot(velocity.x, velocity.z) / STUD
    }
    return { sensors, motors, beams, speedStudsPerSecond: round(speedStudsPerSecond, 2) }
  }

  const buttonsNow = (): Record<DeviceId, boolean> => Object.fromEntries(creation.buttons.map((button) => [button.brickId, button.plugged && (buttonsDown.get(button.brickId) ?? false)]))

  let latest = readBack()
  let snapshotReadBack = latest
  let snapshot: TickSnapshot = { tick: 0, timeSeconds: 0, input: sampler.peek(), sensors: latest.sensors, motors: latest.motors, buttons: buttonsNow() }

  const lockedNote = (hingeId: DeviceId, intent: ArbitratedCommand['intent']) => {
    lockedCommanded.add(hingeId)
    const hinge = hingeById.get(hingeId)
    record([{ code: 'device.locked', severity: 'warning', message: `${hinge?.name ?? 'The arm motor'}'s arm is built into the frame, so it can't swing`, blockId: intent.source.blockId ?? null, deviceId: hingeId, scriptId: intent.source.scriptId }])
  }

  const apply = (commands: readonly ArbitratedCommand[]) => {
    for (const entry of commands) {
      if (entry.kind === 'light') continue // lights live in the arbiter's latches
      const { command, deviceId } = entry
      if (entry.kind === 'motor') {
        if (command.kind === 'power') mechanics.setMotorPower(deviceId, command.percent / 100)
        else if (command.kind === 'target') mechanics.setMotorTarget(deviceId, radiansToDegrees(motorOrigin.get(deviceId) ?? 0) + command.degrees)
        else mechanics.setMotorPower(deviceId, 0)
        continue
      }
      const hinge = hingeById.get(deviceId)
      if (hinge?.locked) {
        if (command.kind !== 'stop') lockedNote(deviceId, entry.intent)
        continue
      }
      if (command.kind === 'power') mechanics.setHingePower(deviceId, command.percent / 100)
      else if (command.kind === 'target') mechanics.setHingeTarget(deviceId, command.degrees)
      else mechanics.holdHinge(deviceId)
    }
  }

  const haltProgram = () => {
    const current = runtime
    runtime = null
    try { current?.stop() } catch { /* a runtime that fails to stop is stopped anyway */ }
  }

  const brakeEverything = () => {
    arbiter.stopAll()
    mechanics.stopAll()
  }

  mechanics.setStepHooks({
    before() {
      snapshotReadBack = latest
      snapshot = { tick, timeSeconds: round(tick * dt, 6), input: sampler.sample(), sensors: latest.sensors, motors: latest.motors, buttons: buttonsNow() }
      if (phase !== 'running') return
      if (runtime) {
        let result: ReturnType<ProgramRuntime['tick']> | null = null
        try {
          result = runtime.tick(snapshot)
        } catch (error) {
          record([{ code: 'runtime.error', severity: 'error', message: `The program stopped: ${error instanceof Error ? error.message : String(error)}`, blockId: null }])
          haltProgram()
          brakeEverything()
          phase = 'stopped'
          activeBlockIds = []
          return
        }
        const arbitration = arbiter.arbitrate(result.intents)
        record(result.diagnostics)
        record(arbitration.diagnostics)
        apply(arbitration.changed)
        activeBlockIds = result.activeBlockIds
        variables = result.variables
        idle = result.idle
      }
      tick += 1
    },
    after() {
      latest = readBack()
    },
  })

  const lockedContacts = (): ContactReport[] => {
    const reports: ContactReport[] = []
    for (const hingeId of lockedCommanded) {
      const hinge = hingeById.get(hingeId)
      if (!hinge) continue
      const arm = new Set(hinge.armBrickIds)
      for (const joint of hinge.bridging) {
        const cells = joint.cells.map((key) => key.split(',').map(Number))
        if (!cells.length) continue
        const cx = cells.reduce((sum, [x]) => sum + x, 0) / cells.length
        const cz = cells.reduce((sum, [, z]) => sum + z, 0) / cells.length
        const upper = bricks.find((brick) => brick.id === joint.upperBrickId)
        const point = { x: (cx + 0.5 - plateSize / 2) * STUD, y: (upper?.y ?? 0) * PLATE_HEIGHT, z: (cz + 0.5 - plateSize / 2) * STUD }
        const armSide = arm.has(joint.upperBrickId) ? joint.upperBrickId : joint.lowerBrickId ?? joint.upperBrickId
        const other = armSide === joint.upperBrickId ? joint.lowerBrickId : joint.upperBrickId
        reports.push({ brickId: armSide, otherBrickId: other, point })
      }
    }
    return reports
  }

  const controller: StageRunController = {
    space,
    creation,
    mechanics,
    props,
    simulatedBrickIds: mechanics.simulatedBrickIds,
    hiddenBrickIds,
    get phase() { return phase },
    get snapshot() { return snapshot },
    run(next) {
      if (disposed) return
      haltProgram()
      arbiter.reset()
      mechanics.stopAll()
      motorOrigin = new Map(creation.motors.map((motor) => [motor.brickId, mechanics.motorOutputAngle(motor.brickId)]))
      tick = 0
      activeBlockIds = []
      variables = {}
      idle = false
      diagnostics.length = 0
      diagnosticKeys.clear()
      lockedCommanded.clear()
      runtime = next
      phase = 'running'
      latest = readBack()
      snapshotReadBack = latest
      snapshot = { tick: 0, timeSeconds: 0, input: sampler.peek(), sensors: latest.sensors, motors: latest.motors, buttons: buttonsNow() }
    },
    stop() {
      if (disposed) return
      haltProgram()
      brakeEverything()
      if (phase === 'running') phase = 'stopped'
      activeBlockIds = []
    },
    advance(frameSeconds) {
      if (!disposed) mechanics.step(frameSeconds)
    },
    setKey: (key: ProgramKey, down: boolean) => sampler.setKey(key, down),
    setJoystick: (up, right) => sampler.setJoystick(up, right),
    setButton(deviceId, down) {
      if (buttonsDown.has(deviceId)) buttonsDown.set(deviceId, down)
    },
    triggerVisitor() {
      mechanics.triggerVisitor()
    },
    observe(): RunObservation {
      return {
        phase,
        tick: snapshot.tick,
        timeSeconds: snapshot.timeSeconds,
        sensors: snapshot.sensors,
        motors: snapshot.motors,
        lights: arbiter.lights(),
        buttons: snapshot.buttons,
        beams: snapshotReadBack.beams,
        contacts: disposed ? [] : [...mechanics.contacts(), ...lockedContacts()],
        activeBlockIds,
        diagnostics: [...diagnostics],
        speedStudsPerSecond: snapshotReadBack.speedStudsPerSecond,
        variables,
        idle,
        visitorPhase: mechanics.visitorPhase(),
      }
    },
    poses: () => mechanics.poses(),
    bodyOfBrick: (brickId) => mechanics.bodyOfBrick(brickId),
    propPoses: () => mechanics.propPoses(),
    dispose() {
      if (disposed) return
      disposed = true
      haltProgram()
      sampler.clearAll()
      mechanics.dispose()
    },
  }
  return controller
}
