import type RAPIER from '@dimforge/rapier3d-compat'
import { STUD } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { brickIdOfNode, isArmNode } from '../model/assembly'
import type { DerivedCreation } from '../model/creations'
import { brickFrame, toWorldPoint, type PartMap } from '../model/grid'
import { axisAngleQuat, conjugate, degreesToRadians, multiplyQuat, radiansToDegrees, rotateByQuat, twistAboutAxis, wrapAngle, type Quat, type Vec3 } from '../model/vec'
import { roboticsSpec } from '../parts/catalog'
import { addPhysicalShapeColliders, brickPhysicalShapesFor, type RapierModule } from './colliders'
import { DEFAULT_HINGE_SPEC, HINGE_MOTOR_DAMPING, HINGE_MOTOR_STIFFNESS, createHingeState, holdHinge, isHingeBlocked, isHingeReached, nextHingeSetpoint, observeHingeAngle, requestHingeTarget, type HingeState } from './hingeLaw'

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
 * Clock policy. Frame time accumulates and the world advances in whole fixed steps,
 * so one elapsed second is one simulated second at 60, 90, 144 or 240 fps alike;
 * the fraction of a step left over carries into the next frame. The backlog is
 * capped at `MAX_BACKLOG_SECONDS`: a stall (a hidden tab, a long frame, a paused
 * debugger) never replays as a burst of steps — the simulation simply pauses for
 * the time that was dropped. `step` therefore runs at most `MAX_SUBSTEPS` steps.
 */
export const MAX_SUBSTEPS = 12
export const MAX_BACKLOG_SECONDS = MAX_SUBSTEPS * FIXED_STEP
/** Floating-point slack when deciding a step is due (a 1/90 s frame must not lose its third step to rounding). */
const STEP_EPSILON = FIXED_STEP * 1e-6

export type MechanicsInput = {
  rapier: RapierModule
  bricks: readonly BrickInstance[]
  partMap: PartMap
  plateSize: number
  creation: DerivedCreation
}

export type BodyPose = { position: Vec3; rotation: Quat }
export type ContactReport = { brickId: string; otherBrickId: string | null; point: Vec3 }
export type HingeReport = { angle: number; target: number; reached: boolean; blocked: boolean; locked: boolean }

export type Mechanics = {
  readonly bodyIds: string[]
  /** Bricks whose pose the simulation owns while it runs (the scene hides the studio's copies). */
  readonly simulatedBrickIds: ReadonlySet<string>
  /** Simulated time: the number of fixed steps taken times `FIXED_STEP`. */
  readonly elapsed: number
  /** Frame time received but not yet simulated, always less than one fixed step after `step`. */
  readonly backlog: number
  /** Wall time dropped by the backlog cap (see the clock policy), for diagnostics. */
  readonly droppedSeconds: number
  readonly disposed: boolean
  bodyOfBrick(brickId: string): string | null
  /** Advances the clock by `seconds` of frame time (non-finite or negative input is ignored). */
  step(seconds: number): void
  /** Returns false when the motor is inert (not plugged in, or not this creation's). */
  setMotorPower(motorId: string, power: number): boolean
  setHingeTarget(hingeId: string, degrees: number): boolean
  stopAll(): void
  poses(): Map<string, BodyPose>
  /** Rotation of the motor's output relative to its housing, radians (free spin when no axle is in the socket). */
  motorOutputAngle(motorId: string): number
  motorPower(motorId: string): number
  hingeReport(hingeId: string): HingeReport | null
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

export function createMechanics(input: MechanicsInput): Mechanics {
  const { rapier, bricks, partMap, plateSize, creation } = input
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = FIXED_STEP
  const bricksById = new Map(bricks.map((brick) => [brick.id, brick]))
  const brickOfCollider = new Map<number, string | null>()

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
      for (const collider of created) brickOfCollider.set(collider.handle, brickId)
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

  // Everything else stays where it was built.
  const scenery = world.createRigidBody(rapier.RigidBodyDesc.fixed())
  for (const brick of bricks) {
    if (simulatedBrickIds.has(brick.id)) continue
    const part = partMap[brick.partId]
    if (!part) continue
    for (const collider of addPhysicalShapeColliders(rapier, world, scenery, brickPhysicalShapesFor(brick, part, plateSize), { friction: SCENERY_FRICTION })) brickOfCollider.set(collider.handle, brick.id)
  }

  // Motor → axle joints.
  type MotorDrive = { joint: RAPIER.RevoluteImpulseJoint | null; axis: Vec3; motorBody: string; axleBody: string | null; power: number; freeSpin: number; plugged: boolean; lastTwist: number; turned: number }
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
    drives.set(motor.brickId, { joint, axis: link.axis, motorBody, axleBody, power: 0, freeSpin: 0, plugged: motor.plugged, lastTwist: 0, turned: 0 })
  }

  // Hinge joints.
  type HingeDrive = { joint: RAPIER.RevoluteImpulseJoint | null; axis: Vec3; pivot: Vec3; baseBody: string | null; armBody: string | null; state: HingeState; locked: boolean; plugged: boolean }
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
    hinges.set(hinge.brickId, { joint, axis, pivot, baseBody, armBody, state: createHingeState(), locked: hinge.locked, plugged: hinge.plugged })
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

  let elapsed = 0
  let backlog = 0
  let droppedSeconds = 0
  let disposed = false

  const substep = () => {
    for (const drive of hinges.values()) {
      if (!drive.joint) continue
      const setpoint = nextHingeSetpoint(drive.state, DEFAULT_HINGE_SPEC, FIXED_STEP)
      drive.joint.configureMotorPosition(degreesToRadians(setpoint), HINGE_MOTOR_STIFFNESS, HINGE_MOTOR_DAMPING)
      drive.state = { ...drive.state, setpoint }
    }
    for (const drive of drives.values()) {
      if (!drive.joint) { drive.freeSpin += drive.power * MAX_MOTOR_RAD_PER_SEC * FIXED_STEP; continue }
      drive.joint.configureMotorVelocity(drive.power * MAX_MOTOR_RAD_PER_SEC, MOTOR_VELOCITY_FACTOR)
    }
    world.step()
    elapsed += FIXED_STEP
    for (const drive of hinges.values()) {
      if (!drive.joint) continue
      drive.state = observeHingeAngle(drive.state, drive.state.setpoint, measureHinge(drive))
    }
    for (const drive of drives.values()) {
      if (!drive.joint) continue
      // The twist wraps at ±π; accumulate the per-step change so the output angle counts whole turns.
      const twist = relativeTwist(drive.motorBody, drive.axleBody, drive.axis)
      drive.turned += wrapAngle(twist - drive.lastTwist)
      drive.lastTwist = twist
    }
  }

  return {
    bodyIds: [...rapierBodies.keys()],
    simulatedBrickIds,
    get elapsed() { return elapsed },
    get backlog() { return backlog },
    get droppedSeconds() { return droppedSeconds },
    get disposed() { return disposed },
    bodyOfBrick: (brickId) => bodyOfBrick.get(brickId) ?? null,
    step(seconds) {
      if (disposed || !Number.isFinite(seconds) || seconds <= 0) return
      const wanted = backlog + seconds
      backlog = Math.min(wanted, MAX_BACKLOG_SECONDS)
      droppedSeconds += wanted - backlog
      let count = 0
      while (backlog >= FIXED_STEP - STEP_EPSILON && count < MAX_SUBSTEPS) {
        substep()
        backlog = Math.max(0, backlog - FIXED_STEP)
        count += 1
      }
    },
    setMotorPower(motorId, power) {
      const drive = drives.get(motorId)
      if (disposed || !drive || !drive.plugged || !Number.isFinite(power)) return false
      drive.power = Math.max(-1, Math.min(1, power))
      return true
    },
    setHingeTarget(hingeId, degrees) {
      const drive = hinges.get(hingeId)
      if (disposed || !drive || !drive.plugged || drive.locked || !drive.joint) return false
      drive.state = requestHingeTarget(drive.state, DEFAULT_HINGE_SPEC, degrees)
      return true
    },
    stopAll() {
      for (const drive of drives.values()) drive.power = 0
      for (const drive of hinges.values()) if (drive.joint) drive.state = holdHinge(drive.state, DEFAULT_HINGE_SPEC)
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
    motorOutputAngle(motorId) {
      const drive = drives.get(motorId)
      if (!drive) return 0
      if (!drive.joint) return drive.freeSpin
      return drive.turned
    },
    motorPower: (motorId) => drives.get(motorId)?.power ?? 0,
    hingeReport(hingeId) {
      const drive = hinges.get(hingeId)
      if (!drive) return null
      if (!drive.joint) return { angle: 0, target: drive.state.target, reached: true, blocked: drive.locked, locked: drive.locked }
      return { angle: drive.state.angle, target: drive.state.target, reached: isHingeReached(drive.state), blocked: isHingeBlocked(drive.state), locked: false }
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
                reports.push({ brickId: brickOfCollider.get(collider.handle) ?? '', otherBrickId: brickOfCollider.get(other.handle) ?? null, point: point ? { x: point.x, y: point.y, z: point.z } : { x: 0, y: 0, z: 0 } })
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
      world.free()
    },
  }
}
