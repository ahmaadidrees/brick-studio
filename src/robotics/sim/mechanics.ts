import type RAPIER from '@dimforge/rapier3d-compat'
import { STUD } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { brickIdOfNode, isArmNode } from '../model/assembly'
import type { DerivedCreation } from '../model/creations'
import { brickFrame, toWorldPoint, type PartMap } from '../model/grid'
import type { TestProp } from '../run/types'
import { axisAngleQuat, clamp, conjugate, degreesToRadians, multiplyQuat, radiansToDegrees, rotateByQuat, twistAboutAxis, wrapAngle, type Quat, type Vec3 } from '../model/vec'
import { roboticsSpec } from '../parts/catalog'
import { addPhysicalShapeColliders, brickPhysicalShapesFor, type RapierModule } from './colliders'
import { DEFAULT_HINGE_SPEC, HINGE_MOTOR_DAMPING, HINGE_MOTOR_STIFFNESS, createHingeState, holdHinge, isHingeBlocked, isHingeReached, nextHingeSetpoint, observeHingeAngle, requestHingeTarget, type HingeSpec, type HingeState } from './hingeLaw'

/**
 * Mechanical simulation of one creation, no code yet (checkpoint 1). Every rigid
 * body comes from `deriveBodies` (assembly), every joint from `deriveMechanisms`:
 * a motor drives the axle in its socket through a revolute joint, so a wheel keyed
 * to that axle turns and a body standing on two such wheels rolls; a hinge motor
 * turns its arm body about the turntable axis and nothing else. A motor with no
 * axle only spins its output. A motor with no cable is inert. Bodies that are
 * anchored (studded to the plate in My world) are fixed; everything that is not
 * part of the creation is static scenery. The document is never written: Reset is
 * `dispose()` and a fresh `createMechanics`. Time is a fixed-step accumulator (see
 * the clock policy below), so the motion is the same at every frame rate.
 *
 * Checkpoint 2 adds what a program needs (docs/robotics/CP2-PLAN.md §4): step hooks so
 * the run controller ticks the program once per fixed step, a target (position) mode
 * beside power mode on the same motor joint, speed readings, distance-sensor rays,
 * test props (a wall, a visitor) and the choice to leave the rest of the world out
 * (`scenery: 'none'`, the test plate).
 *
 * What did not survive from `codex/robotics-workshop`: the raycast vehicle
 * (`simulation/models/raycastVehicle.ts`) — it fakes wheels with rays and needs a
 * compiled "rover" with left/right slots, which is exactly the rover-shaped
 * assumption contract §10 retires. Real joints make a wheel left off its axle stay
 * still for the right reason.
 */
export const FIXED_STEP = 1 / 120
/** Output speed at 100% power. 40% on a 0.7-unit wheel is about 3.6 studs per second. */
export const MAX_MOTOR_RAD_PER_SEC = 8
/** Rapier acceleration-based velocity motor gain. */
export const MOTOR_VELOCITY_FACTOR = 80
export const WHEEL_FRICTION = 1.6
/** Low so a chassis that drags a plate skids instead of gripping. */
export const CHASSIS_FRICTION = 0.12
export const SCENERY_FRICTION = 0.6
/**
 * Target (position) mode: the output chases its target through the same velocity
 * motor, at most this fraction of full speed, with a proportional law (rad/s per
 * radian of error) that settles without overshoot. A held target resists load.
 */
export const MOTOR_TARGET_SPEED_FRACTION = 0.75
export const MOTOR_TARGET_GAIN = 10
/** A visitor waits this long at the end of its walk before it walks back, unless its prop says how long (`pauseSeconds`). */
export const VISITOR_PAUSE_SECONDS = 2
/**
 * Clock policy. Frame time accumulates and the world advances in whole fixed steps,
 * so one elapsed second is one simulated second at 60, 90, 144 or 240 fps alike;
 * the fraction of a step left over carries into the next frame. The backlog is
 * capped at `MAX_BACKLOG_SECONDS`: a stall (a hidden tab, a long frame, a paused
 * debugger) never replays as a burst of steps — the simulation simply pauses for
 * the time that was dropped. `step` therefore runs at most `MAX_SUBSTEPS` steps.
 */
export const MAX_SUBSTEPS = 12
export const MAX_BACKLOG_SECONDS = MAX_SUBSTEPS * FIXED_STEP

export type MechanicsInput = {
  rapier: RapierModule
  bricks: readonly BrickInstance[]
  partMap: PartMap
  plateSize: number
  creation: DerivedCreation
  /** `world` (default): every brick outside the creation is static scenery. `none`: they are left out (the test plate). */
  scenery?: 'world' | 'none'
  /** Test props (contract §7.4): a wall is a fixed box; a visitor a kinematic box sensors see, that walks its path when triggered and pushes nothing. */
  props?: readonly TestProp[]
  /** Seconds per fixed step (default `FIXED_STEP`). The backlog cap stays `MAX_SUBSTEPS` steps. */
  fixedStep?: number
}

export type BodyPose = { position: Vec3; rotation: Quat }
/** `otherPropId` is set when the other collider is a test prop (a wall or a visitor). */
export type ContactReport = { brickId: string; otherBrickId: string | null; point: Vec3; otherPropId?: string }
export type HingeReport = { angle: number; target: number; reached: boolean; blocked: boolean; locked: boolean }
export type MotorMode = 'power' | 'target'
/** One distance-sensor ray in world units: from the face along its facing, in the body's current pose. */
export type SensorRay = { origin: Vec3; direction: Vec3; distance: number | null; end: Vec3 }
/** Where a visitor is in its walk: at its start, walking up, waiting at the end, walking back. */
export type VisitorPhase = 'away' | 'arriving' | 'here' | 'leaving'
export type StepHooks = { before?: () => void; after?: () => void }

export type Mechanics = {
  readonly bodyIds: string[]
  /** Bricks whose pose the simulation owns while it runs (the scene hides the studio's copies). */
  readonly simulatedBrickIds: ReadonlySet<string>
  /** Seconds per fixed step. */
  readonly fixedStep: number
  /** Fixed steps taken. */
  readonly steps: number
  /** Simulated time: the number of fixed steps taken times the fixed step. */
  readonly elapsed: number
  /** Frame time received but not yet simulated, always less than one fixed step after `step`. */
  readonly backlog: number
  /** Wall time dropped by the backlog cap (see the clock policy), for diagnostics. */
  readonly droppedSeconds: number
  readonly disposed: boolean
  bodyOfBrick(brickId: string): string | null
  /** Advances the clock by `seconds` of frame time (non-finite or negative input is ignored). */
  step(seconds: number): void
  /** One fixed step now, hooks included, outside the frame clock (tests, deterministic drivers). */
  stepOnce(): void
  /** Code that runs immediately before and after every fixed step (the run controller's program tick and read-back). */
  setStepHooks(hooks: StepHooks | null): void
  /** Power mode, -1..1. Returns false when the motor is inert (not plugged in, or not this creation's). */
  setMotorPower(motorId: string, power: number): boolean
  /** Target mode: turn the output to this angle, degrees, measured like `motorOutputAngle` (since the mechanics began). */
  setMotorTarget(motorId: string, degrees: number): boolean
  setHingeTarget(hingeId: string, degrees: number): boolean
  /** Power mode for a hinge motor: the arm turns toward the end of its range at this fraction of its top speed; 0 holds it. */
  setHingePower(hingeId: string, power: number): boolean
  /** Hold the arm where it is now. */
  holdHinge(hingeId: string): boolean
  stopAll(): void
  poses(): Map<string, BodyPose>
  /** Linear velocity of a body, world units per second. */
  bodyVelocity(bodyId: string): Vec3 | null
  /** Rotation of the motor's output relative to its housing, radians (free spin when no axle is in the socket). */
  motorOutputAngle(motorId: string): number
  /** The power command in force (0 in target mode). */
  motorPower(motorId: string): number
  motorMode(motorId: string): MotorMode
  /** Measured output speed relative to the housing over the last step, fraction of full speed, signed. */
  motorSpeed(motorId: string): number
  hingeReport(hingeId: string): HingeReport | null
  /** Measured arm speed over the last step, degrees per second, signed. */
  hingeSpeed(hingeId: string): number
  /**
   * Casts a sensor's ray up to `maxDistance` world units, ignoring the creation's own colliders.
   * Null for an unknown sensor. Rapier builds its scene queries during a step, so a ray sees the
   * world as of the last step (before the first step it sees nothing).
   */
  sensorRay(sensorId: string, maxDistance: number): SensorRay | null
  /** Sends a visitor on its walk (the first visitor when no id is given). A visitor already on its way is left alone. */
  triggerVisitor(propId?: string): boolean
  visitorPhase(propId?: string): VisitorPhase | null
  propPoses(): Map<string, BodyPose>
  /** Contacts between an arm body and anything else, after the last step. */
  contacts(): ContactReport[]
  dispose(): void
}

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 }
const Y_AXIS: Vec3 = { x: 0, y: 1, z: 0 }
const Z_AXIS: Vec3 = { x: 0, y: 0, z: 1 }
const X_AXIS: Vec3 = { x: 1, y: 0, z: 0 }

/** Rotation taking Rapier's cylinder axis (+Y) onto `axis` (a grid axis). */
function cylinderRotation(axis: Vec3): Quat {
  if (Math.abs(axis.y) > 0.5) return IDENTITY
  if (Math.abs(axis.x) > 0.5) return axisAngleQuat(Z_AXIS, -Math.PI / 2)
  return axisAngleQuat(X_AXIS, Math.PI / 2)
}

const lerp = (a: Vec3, b: Vec3, f: number): Vec3 => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f })

export function createMechanics(input: MechanicsInput): Mechanics {
  const { rapier, bricks, partMap, plateSize, creation } = input
  const dt = input.fixedStep && Number.isFinite(input.fixedStep) && input.fixedStep > 0 ? input.fixedStep : FIXED_STEP
  const maxBacklog = MAX_SUBSTEPS * dt
  /** Floating-point slack when deciding a step is due (a 1/90 s frame must not lose its third step to rounding). */
  const stepEpsilon = dt * 1e-6
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = dt
  const bricksById = new Map(bricks.map((brick) => [brick.id, brick]))
  const brickOfCollider = new Map<number, string | null>()
  const propOfCollider = new Map<number, string>()

  // Ground: the build plate, wide enough that nothing rolls off during a nudge.
  const half = (plateSize * STUD) / 2 + 20
  const ground = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0))
  const groundCollider = world.createCollider(rapier.ColliderDesc.cuboid(half, 0.5, half).setFriction(1), ground)
  brickOfCollider.set(groundCollider.handle, null)

  // Creation bodies. Every body sits at the world origin with identity rotation, so
  // body-local coordinates ARE world coordinates at the built pose: joint anchors and
  // axes need no transform, and a body's pose is exactly the transform to draw its bricks with.
  const rapierBodies = new Map<string, RAPIER.RigidBody>()
  const bodyOfBrick = new Map<string, string>()
  const armBodyIds = new Set(creation.armBodyIds)
  const simulatedBrickIds = new Set<string>()
  const collidersOfBody = new Map<string, RAPIER.Collider[]>()
  const ownColliders = new Set<number>()
  for (const body of creation.bodies) {
    const description = body.anchored
      ? rapier.RigidBodyDesc.fixed()
      : rapier.RigidBodyDesc.dynamic().setCcdEnabled(true).setCanSleep(false).setAngularDamping(0.25).setLinearDamping(0.05)
    const rigid = world.createRigidBody(description)
    rapierBodies.set(body.id, rigid)
    const colliders: RAPIER.Collider[] = []
    for (const node of body.nodes) {
      const brickId = brickIdOfNode(node)!
      const brick = bricksById.get(brickId)
      const part = brick ? partMap[brick.partId] : undefined
      if (!brick || !part) continue
      if (!isArmNode(node)) bodyOfBrick.set(brickId, body.id)
      simulatedBrickIds.add(brickId)
      const spec = roboticsSpec(brick.partId)
      const frame = brickFrame(brick, part, plateSize)
      const created: RAPIER.Collider[] = []
      if (spec?.hinge) {
        const pivot = toWorldPoint(frame, spec.hinge.pivot)
        if (isArmNode(node)) {
          const turntableHeight = part.height * 0.18 - spec.hinge.housingHeight
          const halfHeight = turntableHeight / 2 - 0.006
          created.push(world.createCollider(rapier.ColliderDesc.cylinder(halfHeight, spec.hinge.turntableRadius).setTranslation(pivot.x, pivot.y + turntableHeight / 2 + 0.006, pivot.z).setFriction(CHASSIS_FRICTION), rigid))
        } else {
          const { x, y, z } = frame.origin
          const halfHeight = spec.hinge.housingHeight / 2 - 0.006
          created.push(world.createCollider(rapier.ColliderDesc.cuboid(part.width * STUD / 2 - 0.02, halfHeight, part.depth * STUD / 2 - 0.02).setTranslation(x, y + halfHeight, z).setFriction(CHASSIS_FRICTION), rigid))
        }
      } else if (spec?.wheel) {
        const center = toWorldPoint(frame, spec.wheel.center)
        const axis = rotateByQuat(axisAngleQuat(Y_AXIS, (brick.rotation * Math.PI) / 2), spec.wheel.axis)
        const rotation = cylinderRotation(axis)
        created.push(world.createCollider(rapier.ColliderDesc.cylinder(0.24, spec.wheel.radius).setTranslation(center.x, center.y, center.z).setRotation(rotation).setFriction(WHEEL_FRICTION).setDensity(1.2), rigid))
      } else if (spec?.axle) {
        const center = toWorldPoint(frame, spec.axle.center)
        const axis = rotateByQuat(axisAngleQuat(Y_AXIS, (brick.rotation * Math.PI) / 2), spec.axle.axis)
        created.push(world.createCollider(rapier.ColliderDesc.capsule(spec.axle.halfLength, spec.axle.radius).setTranslation(center.x, center.y, center.z).setRotation(cylinderRotation(axis)).setFriction(CHASSIS_FRICTION).setDensity(0.4), rigid))
      } else {
        created.push(...addPhysicalShapeColliders(rapier, world, rigid, brickPhysicalShapesFor(brick, part, plateSize), { friction: CHASSIS_FRICTION }))
      }
      for (const collider of created) { brickOfCollider.set(collider.handle, brickId); ownColliders.add(collider.handle) }
      colliders.push(...created)
    }
    collidersOfBody.set(body.id, colliders)
  }

  // On the test plate the creation stands on its wheels: lift every body just enough that
  // the lowest wheel rests on the ground instead of the chassis plate (a wheel's radius is a
  // little more than its hole height, so a rolling body clears the ground by that much).
  // A creation with an anchored body stays exactly where it was built.
  let lift = 0
  if (!creation.bodies.some((body) => body.anchored)) {
    for (const brickId of simulatedBrickIds) {
      const brick = bricksById.get(brickId)!
      const spec = roboticsSpec(brick.partId)
      if (!spec?.wheel) continue
      const center = toWorldPoint(brickFrame(brick, partMap[brick.partId], plateSize), spec.wheel.center)
      lift = Math.max(lift, spec.wheel.radius - center.y + 0.002)
    }
    if (lift > 0) for (const body of rapierBodies.values()) body.setTranslation({ x: 0, y: lift, z: 0 }, true)
  }

  // Everything else stays where it was built (My world), or is left out (the test plate).
  if (input.scenery !== 'none') {
    const scenery = world.createRigidBody(rapier.RigidBodyDesc.fixed())
    for (const brick of bricks) {
      if (simulatedBrickIds.has(brick.id)) continue
      const part = partMap[brick.partId]
      if (!part) continue
      for (const collider of addPhysicalShapeColliders(rapier, world, scenery, brickPhysicalShapesFor(brick, part, plateSize), { friction: SCENERY_FRICTION })) brickOfCollider.set(collider.handle, brick.id)
    }
  }

  // Test props. A wall is fixed. A visitor is a kinematic body with a sensor collider: rays see it
  // (so a distance sensor reads it), but it never shoves anything. Its stop point is usually over
  // the creation's own base, and a free creation on the test plate must not be pushed about by it.
  type Visitor = { prop: Extract<TestProp, { kind: 'visitor' }>; body: RAPIER.RigidBody; phase: VisitorPhase; t: number; position: Vec3 }
  const propBodies = new Map<string, RAPIER.RigidBody>()
  const visitors: Visitor[] = []
  for (const prop of input.props ?? []) {
    if (propBodies.has(prop.id)) continue
    const halfSize = { x: Math.max(0.01, prop.size.x / 2), y: Math.max(0.01, prop.size.y / 2), z: Math.max(0.01, prop.size.z / 2) }
    if (prop.kind === 'wall') {
      const body = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(prop.center.x, prop.center.y, prop.center.z))
      const collider = world.createCollider(rapier.ColliderDesc.cuboid(halfSize.x, halfSize.y, halfSize.z).setFriction(SCENERY_FRICTION), body)
      propOfCollider.set(collider.handle, prop.id)
      propBodies.set(prop.id, body)
    } else if (prop.path.length > 0) {
      const start = prop.path[0]
      const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y, start.z))
      const collider = world.createCollider(rapier.ColliderDesc.cuboid(halfSize.x, halfSize.y, halfSize.z).setSensor(true), body)
      propOfCollider.set(collider.handle, prop.id)
      propBodies.set(prop.id, body)
      visitors.push({ prop, body, phase: 'away', t: 0, position: { ...start } })
    }
  }
  /** Seconds each leg takes: the prop's own list (the walk-up test's quick steps, then slow ones into the beam), else `secondsPerLeg` each. */
  const legTimes = (visitor: Visitor): number[] => {
    const legs = Math.max(0, visitor.prop.path.length - 1)
    const own = visitor.prop.legSeconds
    return Array.from({ length: legs }, (_, index) => Math.max(dt, own && own.length === legs && Number.isFinite(own[index]) ? own[index] : visitor.prop.secondsPerLeg))
  }
  const walkDuration = (visitor: Visitor) => legTimes(visitor).reduce((sum, seconds) => sum + seconds, 0)
  const walkPoint = (visitor: Visitor, s: number): Vec3 => {
    const path = visitor.prop.path
    if (path.length < 2) return { ...path[0] }
    let left = clamp(s, 0, walkDuration(visitor))
    const times = legTimes(visitor)
    for (let leg = 0; leg < times.length; leg += 1) {
      if (left <= times[leg] || leg === times.length - 1) return lerp(path[leg], path[leg + 1], clamp(left / times[leg], 0, 1))
      left -= times[leg]
    }
    return { ...path[path.length - 1] }
  }
  const pauseOf = (visitor: Visitor) => (Number.isFinite(visitor.prop.pauseSeconds) ? Math.max(0, visitor.prop.pauseSeconds!) : VISITOR_PAUSE_SECONDS)
  const advanceVisitor = (visitor: Visitor) => {
    if (visitor.phase === 'away') return
    visitor.t += dt
    const duration = walkDuration(visitor)
    // Whole fixed steps add up with rounding: a phase ends on the step that reaches its time.
    if (visitor.phase === 'arriving') {
      visitor.position = walkPoint(visitor, visitor.t)
      if (visitor.t >= duration - stepEpsilon) { visitor.phase = 'here'; visitor.t = 0 }
    } else if (visitor.phase === 'here') {
      if (visitor.t >= pauseOf(visitor) - stepEpsilon) { visitor.phase = 'leaving'; visitor.t = 0 }
    } else {
      visitor.position = walkPoint(visitor, duration - visitor.t)
      if (visitor.t >= duration - stepEpsilon) { visitor.phase = 'away'; visitor.t = 0 }
    }
    visitor.body.setNextKinematicTranslation(visitor.position)
  }

  // Motor → axle joints. Power mode drives the joint's velocity motor; target mode drives the
  // same motor with a proportional law on the accumulated output angle (it counts whole turns).
  type MotorDrive = {
    joint: RAPIER.RevoluteImpulseJoint | null; axis: Vec3; motorBody: string; axleBody: string | null
    mode: MotorMode; power: number; target: number; freeSpin: number; plugged: boolean; lastTwist: number; turned: number; speed: number
  }
  const drives = new Map<string, MotorDrive>()
  for (const motor of creation.motors) {
    const motorBody = bodyOfBrick.get(motor.brickId)
    if (!motorBody) continue
    const link = { axis: motor.socketNormal, socket: null as Vec3 | null }
    const brick = bricksById.get(motor.brickId)!
    const spec = roboticsSpec(brick.partId)!
    link.socket = toWorldPoint(brickFrame(brick, partMap[brick.partId], plateSize), spec.socket!.point)
    const axleBody = motor.axleId ? bodyOfBrick.get(motor.axleId) ?? null : null
    let joint: RAPIER.RevoluteImpulseJoint | null = null
    if (axleBody && axleBody !== motorBody) {
      const data = rapier.JointData.revolute({ ...link.socket }, { ...link.socket }, { ...link.axis })
      joint = world.createImpulseJoint(data, rapierBodies.get(motorBody)!, rapierBodies.get(axleBody)!, true) as RAPIER.RevoluteImpulseJoint
      joint.setContactsEnabled(false)
      joint.configureMotorModel(rapier.MotorModel.AccelerationBased)
      joint.configureMotorVelocity(0, MOTOR_VELOCITY_FACTOR)
    }
    drives.set(motor.brickId, { joint, axis: link.axis, motorBody, axleBody, mode: 'power', power: 0, target: 0, freeSpin: 0, plugged: motor.plugged, lastTwist: 0, turned: 0, speed: 0 })
  }

  // Hinge joints. `speedScale` < 1 when a power command asks for less than the top speed.
  type HingeDrive = { joint: RAPIER.RevoluteImpulseJoint | null; axis: Vec3; pivot: Vec3; baseBody: string | null; armBody: string | null; state: HingeState; locked: boolean; plugged: boolean; speedScale: number; speed: number }
  const hinges = new Map<string, HingeDrive>()
  for (const hinge of creation.hinges) {
    const brick = bricksById.get(hinge.brickId)!
    const spec = roboticsSpec(brick.partId)!
    const frame = brickFrame(brick, partMap[brick.partId], plateSize)
    const pivot = toWorldPoint(frame, spec.hinge!.pivot)
    const axis = spec.hinge!.axis
    const baseBody = hinge.baseBodyId
    const armBody = hinge.armBodyId
    let joint: RAPIER.RevoluteImpulseJoint | null = null
    if (!hinge.locked && baseBody && armBody && baseBody !== armBody && rapierBodies.has(baseBody) && rapierBodies.has(armBody)) {
      const data = rapier.JointData.revolute({ ...pivot }, { ...pivot }, { ...axis })
      joint = world.createImpulseJoint(data, rapierBodies.get(baseBody)!, rapierBodies.get(armBody)!, true) as RAPIER.RevoluteImpulseJoint
      joint.setLimits(degreesToRadians(DEFAULT_HINGE_SPEC.min), degreesToRadians(DEFAULT_HINGE_SPEC.max))
      joint.configureMotorModel(rapier.MotorModel.AccelerationBased)
      joint.configureMotorPosition(0, HINGE_MOTOR_STIFFNESS, HINGE_MOTOR_DAMPING)
    }
    hinges.set(hinge.brickId, { joint, axis, pivot, baseBody, armBody, state: createHingeState(), locked: hinge.locked, plugged: hinge.plugged, speedScale: 1, speed: 0 })
  }
  const hingeSpec = (drive: HingeDrive): HingeSpec => (drive.speedScale === 1 ? DEFAULT_HINGE_SPEC : { ...DEFAULT_HINGE_SPEC, maxDegPerSec: DEFAULT_HINGE_SPEC.maxDegPerSec * drive.speedScale })

  // Distance sensors: the face point and facing at the built pose, which is the body-local frame.
  type SensorMount = { point: Vec3; normal: Vec3; bodyId: string }
  const sensors = new Map<string, SensorMount>()
  for (const sensor of creation.sensors) {
    const brick = bricksById.get(sensor.brickId)
    const spec = brick ? roboticsSpec(brick.partId) : null
    const bodyId = bodyOfBrick.get(sensor.brickId)
    if (!brick || !spec?.sensor || !bodyId) continue
    sensors.set(sensor.brickId, { point: toWorldPoint(brickFrame(brick, partMap[brick.partId], plateSize), spec.sensor.point), normal: sensor.normal, bodyId })
  }

  const rotationOf = (bodyId: string | null): Quat => {
    if (!bodyId) return IDENTITY
    const body = rapierBodies.get(bodyId)
    if (!body) return IDENTITY
    const q = body.rotation()
    return { x: q.x, y: q.y, z: q.z, w: q.w }
  }
  const relativeTwist = (fromBody: string | null, toBody: string | null, axis: Vec3): number => twistAboutAxis(multiplyQuat(conjugate(rotationOf(fromBody)), rotationOf(toBody)), axis)

  const measureHinge = (drive: HingeDrive) => radiansToDegrees(relativeTwist(drive.baseBody, drive.armBody, drive.axis))

  const outputAngle = (drive: MotorDrive) => (drive.joint ? drive.turned : drive.freeSpin)
  /** Commanded output velocity, rad/s: the power, or the target law. */
  const commandVelocity = (drive: MotorDrive): number => {
    if (drive.mode === 'power') return drive.power * MAX_MOTOR_RAD_PER_SEC
    const limit = MAX_MOTOR_RAD_PER_SEC * MOTOR_TARGET_SPEED_FRACTION
    return clamp((drive.target - outputAngle(drive)) * MOTOR_TARGET_GAIN, -limit, limit)
  }

  let steps = 0
  let backlog = 0
  let droppedSeconds = 0
  let disposed = false
  let hooks: StepHooks | null = null

  const substep = () => {
    hooks?.before?.()
    if (disposed) return
    for (const visitor of visitors) advanceVisitor(visitor)
    for (const drive of hinges.values()) {
      if (!drive.joint) continue
      const setpoint = nextHingeSetpoint(drive.state, hingeSpec(drive), dt)
      drive.joint.configureMotorPosition(degreesToRadians(setpoint), HINGE_MOTOR_STIFFNESS, HINGE_MOTOR_DAMPING)
      drive.state = { ...drive.state, setpoint }
    }
    for (const drive of drives.values()) {
      const velocity = commandVelocity(drive)
      if (!drive.joint) {
        const before = drive.freeSpin
        // A free-spinning output in target mode lands exactly on its target instead of oscillating about it.
        const stepAngle = drive.mode === 'target' ? clamp(velocity * dt, -Math.abs(drive.target - before), Math.abs(drive.target - before)) : velocity * dt
        drive.freeSpin += stepAngle
        drive.speed = stepAngle / dt / MAX_MOTOR_RAD_PER_SEC
        continue
      }
      drive.joint.configureMotorVelocity(velocity, MOTOR_VELOCITY_FACTOR)
    }
    world.step()
    steps += 1
    for (const drive of hinges.values()) {
      if (!drive.joint) continue
      const previous = drive.state.angle
      drive.state = observeHingeAngle(drive.state, drive.state.setpoint, measureHinge(drive))
      drive.speed = (drive.state.angle - previous) / dt
    }
    for (const drive of drives.values()) {
      if (!drive.joint) continue
      // The twist wraps at ±π; accumulate the per-step change so the output angle counts whole turns.
      const twist = relativeTwist(drive.motorBody, drive.axleBody, drive.axis)
      const change = wrapAngle(twist - drive.lastTwist)
      drive.turned += change
      drive.lastTwist = twist
      drive.speed = change / dt / MAX_MOTOR_RAD_PER_SEC
    }
    hooks?.after?.()
  }

  const firstVisitor = (propId?: string) => (propId ? visitors.find((visitor) => visitor.prop.id === propId) : visitors[0]) ?? null

  return {
    bodyIds: [...rapierBodies.keys()],
    simulatedBrickIds,
    fixedStep: dt,
    get steps() { return steps },
    get elapsed() { return steps * dt },
    get backlog() { return backlog },
    get droppedSeconds() { return droppedSeconds },
    get disposed() { return disposed },
    bodyOfBrick: (brickId) => bodyOfBrick.get(brickId) ?? null,
    step(seconds) {
      if (disposed || !Number.isFinite(seconds) || seconds <= 0) return
      const wanted = backlog + seconds
      backlog = Math.min(wanted, maxBacklog)
      droppedSeconds += wanted - backlog
      let count = 0
      while (backlog >= dt - stepEpsilon && count < MAX_SUBSTEPS && !disposed) {
        substep()
        backlog = Math.max(0, backlog - dt)
        count += 1
      }
    },
    stepOnce() {
      if (!disposed) substep()
    },
    setStepHooks(next) {
      hooks = next
    },
    setMotorPower(motorId, power) {
      const drive = drives.get(motorId)
      if (disposed || !drive || !drive.plugged || !Number.isFinite(power)) return false
      drive.mode = 'power'
      drive.power = Math.max(-1, Math.min(1, power))
      return true
    },
    setMotorTarget(motorId, degrees) {
      const drive = drives.get(motorId)
      if (disposed || !drive || !drive.plugged || !Number.isFinite(degrees)) return false
      drive.mode = 'target'
      drive.power = 0
      drive.target = degreesToRadians(degrees)
      return true
    },
    setHingeTarget(hingeId, degrees) {
      const drive = hinges.get(hingeId)
      if (disposed || !drive || !drive.plugged || drive.locked || !drive.joint) return false
      drive.speedScale = 1
      drive.state = requestHingeTarget(drive.state, DEFAULT_HINGE_SPEC, degrees)
      return true
    },
    setHingePower(hingeId, power) {
      const drive = hinges.get(hingeId)
      if (disposed || !drive || !drive.plugged || drive.locked || !drive.joint || !Number.isFinite(power)) return false
      const amount = clamp(power, -1, 1)
      if (amount === 0) {
        drive.speedScale = 1
        drive.state = holdHinge(drive.state, DEFAULT_HINGE_SPEC)
        return true
      }
      drive.speedScale = Math.abs(amount)
      drive.state = requestHingeTarget(drive.state, DEFAULT_HINGE_SPEC, amount > 0 ? DEFAULT_HINGE_SPEC.max : DEFAULT_HINGE_SPEC.min)
      return true
    },
    holdHinge(hingeId) {
      const drive = hinges.get(hingeId)
      if (disposed || !drive || !drive.joint) return false
      drive.speedScale = 1
      drive.state = holdHinge(drive.state, DEFAULT_HINGE_SPEC)
      return true
    },
    stopAll() {
      for (const drive of drives.values()) { drive.mode = 'power'; drive.power = 0 }
      for (const drive of hinges.values()) if (drive.joint) { drive.speedScale = 1; drive.state = holdHinge(drive.state, DEFAULT_HINGE_SPEC) }
    },
    poses() {
      const result = new Map<string, BodyPose>()
      if (disposed) return result
      for (const [id, body] of rapierBodies) {
        const t = body.translation()
        const r = body.rotation()
        result.set(id, { position: { x: t.x, y: t.y, z: t.z }, rotation: { x: r.x, y: r.y, z: r.z, w: r.w } })
      }
      return result
    },
    bodyVelocity(bodyId) {
      const body = rapierBodies.get(bodyId)
      if (disposed || !body) return null
      const v = body.linvel()
      return { x: v.x, y: v.y, z: v.z }
    },
    motorOutputAngle(motorId) {
      const drive = drives.get(motorId)
      return drive ? outputAngle(drive) : 0
    },
    motorPower: (motorId) => { const drive = drives.get(motorId); return drive && drive.mode === 'power' ? drive.power : 0 },
    motorMode: (motorId) => drives.get(motorId)?.mode ?? 'power',
    motorSpeed: (motorId) => drives.get(motorId)?.speed ?? 0,
    hingeReport(hingeId) {
      const drive = hinges.get(hingeId)
      if (!drive) return null
      if (!drive.joint) return { angle: 0, target: drive.state.target, reached: true, blocked: drive.locked, locked: drive.locked }
      return { angle: drive.state.angle, target: drive.state.target, reached: isHingeReached(drive.state), blocked: isHingeBlocked(drive.state), locked: false }
    },
    hingeSpeed: (hingeId) => hinges.get(hingeId)?.speed ?? 0,
    sensorRay(sensorId, maxDistance) {
      const mount = sensors.get(sensorId)
      const body = mount ? rapierBodies.get(mount.bodyId) : undefined
      if (disposed || !mount || !body) return null
      const t = body.translation()
      const q = body.rotation()
      const rotation = { x: q.x, y: q.y, z: q.z, w: q.w }
      const offset = rotateByQuat(rotation, mount.point)
      const origin = { x: t.x + offset.x, y: t.y + offset.y, z: t.z + offset.z }
      const direction = rotateByQuat(rotation, mount.normal)
      const reach = Math.max(0, maxDistance)
      const hit = world.castRay(new rapier.Ray(origin, direction), reach, true, undefined, undefined, undefined, undefined, (collider) => !ownColliders.has(collider.handle))
      const distance = hit && hit.timeOfImpact >= 0 && hit.timeOfImpact <= reach ? hit.timeOfImpact : null
      const length = distance ?? reach
      return { origin, direction, distance, end: { x: origin.x + direction.x * length, y: origin.y + direction.y * length, z: origin.z + direction.z * length } }
    },
    triggerVisitor(propId) {
      const visitor = firstVisitor(propId)
      if (disposed || !visitor || visitor.prop.path.length < 2) return false
      if (visitor.phase === 'away') { visitor.phase = 'arriving'; visitor.t = 0; return true }
      if (visitor.phase === 'leaving') {
        // Turn round where it is: continue the walk up from the same point.
        visitor.phase = 'arriving'
        visitor.t = walkDuration(visitor) - visitor.t
        return true
      }
      if (visitor.phase === 'here') { visitor.t = 0; return true }
      return false
    },
    visitorPhase: (propId) => firstVisitor(propId)?.phase ?? null,
    propPoses() {
      const result = new Map<string, BodyPose>()
      if (disposed) return result
      for (const [id, body] of propBodies) {
        const t = body.translation()
        const r = body.rotation()
        result.set(id, { position: { x: t.x, y: t.y, z: t.z }, rotation: { x: r.x, y: r.y, z: r.z, w: r.w } })
      }
      return result
    },
    contacts() {
      const reports: ContactReport[] = []
      if (disposed) return reports
      for (const bodyId of armBodyIds) {
        for (const collider of collidersOfBody.get(bodyId) ?? []) {
          world.contactPairsWith(collider, (other) => {
            world.contactPair(collider, other, (manifold) => {
              for (let index = 0; index < manifold.numContacts(); index += 1) {
                if (manifold.contactDist(index) > 0.01) continue
                const point = manifold.localContactPoint1(index)
                const report: ContactReport = { brickId: brickOfCollider.get(collider.handle) ?? '', otherBrickId: brickOfCollider.get(other.handle) ?? null, point: point ? { x: point.x, y: point.y, z: point.z } : { x: 0, y: 0, z: 0 } }
                const propId = propOfCollider.get(other.handle)
                if (propId) report.otherPropId = propId
                reports.push(report)
                break
              }
            })
          })
        }
      }
      return reports
    },
    dispose() {
      if (disposed) return
      disposed = true
      hooks = null
      world.free()
    },
  }
}
