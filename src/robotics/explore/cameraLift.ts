import type RAPIER from '@dimforge/rapier3d-compat'
import { CAMERA_PROBE_RADIUS, CAMERA_SURFACE_PADDING, findCameraObstruction } from '../../brick/scenePhysics'
import type { Vec3 } from '../model/vec'

/**
 * The Explore follow camera beside a big build (behind the robotics flag, through `rideBridge.ts`).
 *
 * The studio's camera is a spring arm: a collider between the character's head and the camera
 * pulls the camera in along the same line, down to 0.65 units. With a tall robot behind her (she
 * had just turned away from it), a novice tester's screen filled with the back of her head or a
 * wheel, and neither zooming out nor Recenter moved it: both keep the boom pointing into the robot,
 * and the arm cuts every distance to the same 0.65. The robot's own static bricks do this before it
 * is ever ridden, and a parked robot's solid mirror bodies do it after.
 *
 * Here a boom the build would cut short rises over it instead: the least steep pitch, up to nearly
 * overhead, whose boom is clear at the distance the student zoomed to. It rises quickly and settles
 * back gently, but goes straight there when an eased step would still be cut (the arm pulls in at
 * once); the studio's arm still shortens whatever remains in the way, so the camera never ends up
 * inside anything. The zoomed distance is kept, so zoom and Recenter move the camera again.
 */
export const LIFT = Object.freeze({
  /** A boom the arm would cut to under this fraction of the distance the student zoomed to is blocked: zooming out must show. */
  blockedFraction: 0.8,
  /** A risen boom this clear (fraction of the wanted distance) is good; the gap to `blockedFraction` keeps it from flickering. */
  clearFraction: 0.9,
  /** How steep it may rise, radians (the student's own orbit stops at 1.08; straight down is degenerate for lookAt). */
  maxPitch: 1.45,
  /** Pitches tried on the way up, radians apart. */
  step: 0.09,
  /** Easing rates, per second: up quickly, back down gently. */
  riseRate: 14,
  settleRate: 4,
})

export type CameraWorld = Pick<RAPIER.World, 'castShape' | 'intersectionsWithShape'>

/**
 * How far above her head the camera may look instead, when her head is wedged among parts (a wheel
 * well under an axle): the arm's cast starts within its padding of a wheel or motor there, so every
 * direction is cut at once and no rise helps (a tester's 048 and 050). Tried in these steps.
 */
export const UNWEDGE = Object.freeze({ maxUp: 1.5, step: 0.25 })
export type BoomQuery = { target: Vec3; direction: Vec3; distance: number }

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }

const pitchOf = (direction: Vec3) => Math.asin(Math.max(-1, Math.min(1, direction.y)))
/** The orbit's yaw from its boom (the studio's `computeOrbitBoom`: x = -sin(yaw)·h, z = -cos(yaw)·h). */
const yawOf = (direction: Vec3) => Math.atan2(-direction.x, -direction.z)

/** The unit boom at `pitch` for the orbit's `yaw`. */
export function boomAt(yaw: number, pitch: number): Vec3 {
  const horizontal = Math.cos(pitch)
  return { x: -Math.sin(yaw) * horizontal, y: Math.sin(pitch), z: -Math.cos(yaw) * horizontal }
}

/** How much of the boom is clear (world units): the whole distance, or up to where the arm would cut it. */
export function boomClearance(world: CameraWorld, query: BoomQuery, probe: RAPIER.Shape, exclude?: RAPIER.RigidBody): number {
  const hit = findCameraObstruction(world, query.target, IDENTITY, query.direction, probe, query.distance, exclude)
  return hit ? Math.max(0, hit.time_of_impact - CAMERA_SURFACE_PADDING) : query.distance
}

/** Whether a boom cut to `clearance` of `distance` is cut enough to rise instead. */
export function isBlocked(clearance: number, distance: number): boolean {
  return clearance < distance * LIFT.blockedFraction
}

/**
 * The pitch the boom should rise to, or null when the orbit's own boom is fine. The least steep
 * clear pitch; when none is clear, the one with the most room if that is a real view (1.5 units,
 * and a unit more than the arm allows): not a top-down close-up under a roof or against a wall
 * taller than her.
 */
export function liftPitch(world: CameraWorld, query: BoomQuery, probe: RAPIER.Shape, exclude?: RAPIER.RigidBody): number | null {
  const own = boomClearance(world, query, probe, exclude)
  if (!isBlocked(own, query.distance)) return null
  const yaw = yawOf(query.direction)
  let best = { pitch: pitchOf(query.direction), clearance: own }
  for (let pitch = best.pitch + LIFT.step; pitch <= LIFT.maxPitch + 1e-9; pitch += LIFT.step) {
    const clearance = boomClearance(world, { ...query, direction: boomAt(yaw, pitch) }, probe, exclude)
    if (clearance >= query.distance * LIFT.clearFraction) return pitch
    if (clearance > best.clearance) best = { pitch, clearance }
  }
  return best.clearance >= Math.max(own + 1, 1.5) ? best.pitch : null
}

/** Whether the arm's padded probe at `at` already touches something (not her own body, nothing made not solid). */
export function touchesAt(world: CameraWorld, rapier: Pick<typeof RAPIER, 'Ball'>, at: Vec3, exclude?: RAPIER.RigidBody): boolean {
  let touching = false
  world.intersectionsWithShape(at, IDENTITY, new rapier.Ball(CAMERA_PROBE_RADIUS + CAMERA_SURFACE_PADDING), (collider) => {
    if (!collider.isEnabled()) return true
    touching = true
    return false
  }, undefined, undefined, undefined, exclude)
  return touching
}

/**
 * Where the camera should look when her head (`head`, the studio's usual target) is wedged among
 * parts: the lowest point up to `UNWEDGE.maxUp` above it that is clear, or null when her head is
 * clear (keep looking at it) or nothing above is.
 */
export function unwedgedTarget(world: CameraWorld, rapier: Pick<typeof RAPIER, 'Ball'>, head: Vec3, exclude?: RAPIER.RigidBody): Vec3 | null {
  if (!touchesAt(world, rapier, head, exclude)) return null
  for (let up = UNWEDGE.step; up <= UNWEDGE.maxUp + 1e-9; up += UNWEDGE.step) {
    const at = { x: head.x, y: head.y + up, z: head.z }
    if (!touchesAt(world, rapier, at, exclude)) return at
  }
  return null
}

/**
 * The camera's boom for this frame: the orbit's, or risen over a build and eased there and back.
 * Null while no rise is under way (the studio keeps its own boom). One per Explore visit.
 */
export function createCameraLift(world: CameraWorld, probe: RAPIER.Shape, exclude: () => RAPIER.RigidBody | undefined) {
  let risen: number | null = null
  const lift = (query: BoomQuery & { delta: number }): Vec3 | null => {
    const body = exclude()
    const orbitPitch = pitchOf(query.direction)
    const yaw = yawOf(query.direction)
    const wanted = liftPitch(world, query, probe, body) ?? orbitPitch
    const from = risen ?? orbitPitch
    const rising = wanted > from
    let next = from + (wanted - from) * (1 - Math.exp(-(rising ? LIFT.riseRate : LIFT.settleRate) * Math.max(0, query.delta)))
    // Never linger where the arm would cut the boom short (it pulls in at once; the ease takes a few frames):
    // if the eased pitch is still blocked, go straight to the wanted one, up or down. That one is the orbit's
    // own boom (clear), a clear risen one, or the one with the most room.
    if (Math.abs(next - wanted) > 1e-3 && next > orbitPitch && isBlocked(boomClearance(world, { ...query, direction: boomAt(yaw, next) }, probe, body), query.distance)) next = wanted
    risen = wanted === orbitPitch && Math.abs(next - orbitPitch) < 0.01 ? null : next
    if (risen === null || risen <= orbitPitch) return null
    return boomAt(yaw, Math.min(LIFT.maxPitch, risen))
  }
  return Object.assign(lift, { reset: () => { risen = null }, risenPitch: () => risen })
}
