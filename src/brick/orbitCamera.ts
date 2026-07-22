import type { MutablePlanarVector } from './characterInput'

export const ORBIT_MIN_PITCH = 0.16
export const ORBIT_MAX_PITCH = 1.08
export const ORBIT_DEFAULT_PITCH = 0.55
export const ORBIT_DEFAULT_YAW = Math.PI
export const ORBIT_DAMPING = 15
export const ORBIT_MIN_DISTANCE = 3.4
export const ORBIT_MAX_DISTANCE = 10.5
export const ORBIT_DEFAULT_DISTANCE = 6.1

const TWO_PI = Math.PI * 2

export type OrbitState = {
  yaw: number
  pitch: number
  targetYaw: number
  targetPitch: number
}

export type MutableVector3 = MutablePlanarVector & {
  y: number
}

export function createOrbitState(
  yaw = ORBIT_DEFAULT_YAW,
  pitch = ORBIT_DEFAULT_PITCH,
): OrbitState {
  const clampedPitch = clampPitch(pitch)
  return { yaw, pitch: clampedPitch, targetYaw: yaw, targetPitch: clampedPitch }
}

export function clampPitch(pitch: number) {
  return Math.max(ORBIT_MIN_PITCH, Math.min(ORBIT_MAX_PITCH, pitch))
}

export function clampOrbitDistance(distance: number) {
  return Math.max(ORBIT_MIN_DISTANCE, Math.min(ORBIT_MAX_DISTANCE, distance))
}

export function recenterOrbit(state: OrbitState) {
  state.targetYaw = ORBIT_DEFAULT_YAW
  state.targetPitch = ORBIT_DEFAULT_PITCH
  return state
}

/** Adds look deltas to targets; pitch is clamped before the damping step. */
export function addOrbitLook(state: OrbitState, yawDelta: number, pitchDelta: number) {
  state.targetYaw += yawDelta
  state.targetPitch = clampPitch(state.targetPitch + pitchDelta)
  return state
}

export function shortestAngleDelta(from: number, to: number) {
  return ((to - from + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI
}

/** Exponential damping gives consistent orbit feel across frame rates. */
export function stepOrbit(state: OrbitState, delta: number, damping = ORBIT_DAMPING) {
  const safeDelta = Math.max(0, Math.min(0.05, Number.isFinite(delta) ? delta : 0))
  const alpha = 1 - Math.exp(-damping * safeDelta)
  state.yaw += shortestAngleDelta(state.yaw, state.targetYaw) * alpha
  state.pitch += (state.targetPitch - state.pitch) * alpha
  state.pitch = clampPitch(state.pitch)
  return state
}

/**
 * Produces the target-to-camera boom used by the existing sphere-cast
 * obstruction resolver. The orbit contains yaw and pitch only, so it cannot
 * introduce camera roll or inherit the avatar's visual flip.
 */
export function computeOrbitBoom(
  yaw: number,
  pitch: number,
  distance: number,
  out: MutableVector3,
) {
  const safePitch = clampPitch(pitch)
  const horizontalDistance = Math.cos(safePitch) * distance
  out.x = -Math.sin(yaw) * horizontalDistance
  out.y = Math.sin(safePitch) * distance
  out.z = -Math.cos(yaw) * horizontalDistance
  return out
}
