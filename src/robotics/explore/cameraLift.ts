import type RAPIER from '@dimforge/rapier3d-compat'
import { CAMERA_SURFACE_PADDING, findCameraObstruction } from '../../brick/scenePhysics'
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
 * Here a boom the build would cut hard rises over it instead: the least steep pitch, up to nearly
 * overhead, whose boom is clear at the distance the student zoomed to. Rising is quick and settling
 * back is slow, so it glides; the studio's arm still shortens whatever remains in the way, so the
 * camera never ends up inside anything. The zoomed distance is kept, so zoom and Recenter move the
 * camera again.
 */
export const LIFT = Object.freeze({
  /** Cut to under this fraction of the wanted distance… */
  blockedFraction: 0.45,
  /** …or under this many units (whichever is more, but never more than 80 % of the distance): blocked. */
  blockedUnder: 2.5,
  /** A risen boom this clear (fraction of the wanted distance) is good. */
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

/** Whether a boom cut to `clearance` of `distance` is cut hard enough to rise instead. */
export function isBlocked(clearance: number, distance: number): boolean {
  return clearance < Math.min(distance * 0.8, Math.max(LIFT.blockedUnder, distance * LIFT.blockedFraction))
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

/**
 * The camera's boom for this frame: the orbit's, or risen over a build and eased there and back.
 * Null while no rise is under way (the studio keeps its own boom). One per Explore visit.
 */
export function createCameraLift(world: CameraWorld, probe: RAPIER.Shape, exclude: () => RAPIER.RigidBody | undefined) {
  let risen: number | null = null
  const lift = (query: BoomQuery & { delta: number }): Vec3 | null => {
    const orbitPitch = pitchOf(query.direction)
    const wanted = liftPitch(world, query, probe, exclude()) ?? orbitPitch
    const from = risen ?? orbitPitch
    const rate = wanted > from ? LIFT.riseRate : LIFT.settleRate
    const next = from + (wanted - from) * (1 - Math.exp(-rate * Math.max(0, query.delta)))
    risen = wanted === orbitPitch && Math.abs(next - orbitPitch) < 0.01 ? null : next
    if (risen === null || risen <= orbitPitch) return null
    return boomAt(yawOf(query.direction), Math.min(LIFT.maxPitch, risen))
  }
  return Object.assign(lift, { reset: () => { risen = null }, risenPitch: () => risen })
}
