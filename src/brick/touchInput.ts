import { ORBIT_MAX_PITCH, ORBIT_MIN_PITCH } from './orbitCamera'

export const TOUCH_STICK_DEAD_ZONE = 0.12
export const TOUCH_AUTO_RUN_THRESHOLD = 0.82
export const EXPLORE_MIN_PITCH = ORBIT_MIN_PITCH
export const EXPLORE_MAX_PITCH = ORBIT_MAX_PITCH

export type NormalizedTouchMove = {
  x: number
  z: number
  magnitude: number
  running: boolean
}

export function normalizeTouchStick(
  deltaX: number,
  deltaY: number,
  radius: number,
  deadZone = TOUCH_STICK_DEAD_ZONE,
  runThreshold = TOUCH_AUTO_RUN_THRESHOLD,
): NormalizedTouchMove {
  if (!Number.isFinite(radius) || radius <= 0) return { x: 0, z: 0, magnitude: 0, running: false }

  const rawX = deltaX / radius
  // Screen Y increases downward. Normalize that sign once here so +Z always means forward.
  const rawZ = -deltaY / radius
  const rawMagnitude = Math.min(1, Math.hypot(rawX, rawZ))
  if (rawMagnitude <= deadZone) return { x: 0, z: 0, magnitude: 0, running: false }

  const directionLength = Math.hypot(rawX, rawZ)
  const magnitude = Math.min(1, (rawMagnitude - deadZone) / Math.max(0.001, 1 - deadZone))
  const x = (rawX / directionLength) * magnitude
  const z = (rawZ / directionLength) * magnitude
  return {
    x: x || 0,
    z: z || 0,
    magnitude,
    running: rawMagnitude >= runThreshold,
  }
}

export function clampExplorePitch(pitch: number) {
  return Math.max(EXPLORE_MIN_PITCH, Math.min(EXPLORE_MAX_PITCH, pitch))
}
