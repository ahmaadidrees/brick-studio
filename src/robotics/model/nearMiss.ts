import { STUD } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import type { PartMap } from './grid'
import { deriveMechanisms, type Mechanisms, type MotorLink } from './mechanism'
import { distance, dot, parallel, sub, type Vec3 } from './vec'

/**
 * Near misses (docs/robotics/KID-UX.md §S: "a near miss never looks right"). An axle or a
 * wheel placed next to a connector without connecting gets a red gap marker until it is
 * fixed: a wheel whose hole sits near a free axle end but not on it, and an axle whose end
 * points into a free motor socket from close by without being in it (the classic is a
 * motor standing on the bare ground: its socket is one plate lower than an axle on the
 * ground can reach, so the rod points into the ring and is not in it). Read off the same
 * mechanism geometry the card uses; pure.
 */
export const NEAR_MISS_REACH_STUDS = 2

export type GapMarker = {
  key: string
  kind: 'wheel-axle' | 'axle-socket'
  /** The loose part the marker sits on: the wheel, or the axle. */
  brickId: string
  /** What it nearly reached: the axle, or the motor. */
  targetId: string
  /** The loose part's connector, world units (the marker). */
  at: Vec3
  /** The connector it should touch. */
  to: Vec3
  /** The axle's direction there (the marker ring faces along it). */
  axis: Vec3
  /** What to do, in a third grader's words. */
  text: string
}

export const GAP_TEXT = {
  wheel: 'Put the wheel on the axle',
  axle: 'Push the axle into the motor',
  motorTooLow: 'Put the motor on a plate',
} as const

export function gapMarkers(bricks: readonly BrickInstance[], partMap: PartMap, plateSize: number, mechanisms: Mechanisms = deriveMechanisms(bricks, partMap, plateSize)): GapMarker[] {
  const reach = NEAR_MISS_REACH_STUDS * STUD
  const markers: GapMarker[] = []
  for (const wheel of mechanisms.wheels) {
    if (wheel.axleId || !wheel.nearest) continue
    const axle = mechanisms.axleById.get(wheel.nearest.axleId)
    const end = axle?.ends[wheel.nearest.end]
    const gap = wheel.nearest.gap
    if (!axle || !end || Math.hypot(gap.x, gap.y, gap.z) > reach) continue
    markers.push({ key: `wheel:${wheel.wheelId}`, kind: 'wheel-axle', brickId: wheel.wheelId, targetId: axle.axleId, at: sub(end.point, gap), to: end.point, axis: end.outward, text: GAP_TEXT.wheel })
  }
  for (const axle of mechanisms.axles) {
    for (const end of axle.ends) {
      if (end.motorId || end.wheelId) continue
      let best: { motor: MotorLink; d: number } | null = null
      for (const motor of mechanisms.motors) {
        // Only a socket the end points into: parallel, facing each other, close by.
        if (motor.axleId || !parallel(axle.axis, motor.socket.normal) || dot(end.outward, motor.socket.normal) > -0.999) continue
        const d = distance(end.point, motor.socket.point)
        if (d <= reach && (!best || d < best.d)) best = { motor, d }
      }
      if (!best) continue
      const gap = sub(best.motor.socket.point, end.point)
      const motorTooLow = gap.y < -1e-3 && Math.hypot(gap.x, gap.z) < 1e-3
      markers.push({
        key: `axle:${axle.axleId}:${end.index}`,
        kind: 'axle-socket',
        brickId: axle.axleId,
        targetId: best.motor.motorId,
        at: end.point,
        to: best.motor.socket.point,
        axis: end.outward,
        text: motorTooLow ? GAP_TEXT.motorTooLow : GAP_TEXT.axle,
      })
    }
  }
  return markers
}
