import { clamp } from '../model/vec'

/**
 * The hinge motor's control law, ported from `codex/robotics-workshop`
 * (`simulation/hinge.ts`, lane L2). It survived because it is pure and fits the
 * joint model unchanged: the physics is Rapier's, this is the target/setpoint rule
 * and the `reached`/`blocked` reports.
 *
 *   1. Angle 0 is the built pose. Positive angles are a right-hand turn about the
 *      hinge axis. The angle is clamped to `[min, max]`.
 *   2. `moveTo(degrees)` sets the target; the motor setpoint chases it at
 *      `maxDegPerSec`, at most `HINGE_LEAD_DEGREES` ahead of the measured angle, so a
 *      blocked arm pushes gently instead of winding the motor up.
 *   3. `reached` after 3 ticks within 2°; `blocked` when the target is away and the
 *      angle has not advanced 0.1° in the last 30 ticks (the arm is against something).
 */
export const HINGE_REACHED_TOLERANCE_DEGREES = 2
export const HINGE_REACHED_TICKS = 3
export const HINGE_BLOCKED_TICKS = 30
export const HINGE_BLOCKED_MIN_ADVANCE_DEGREES = 0.1
export const HINGE_LEAD_DEGREES = 6
export const HINGE_MOTOR_STIFFNESS = 4000
export const HINGE_MOTOR_DAMPING = 126

export type HingeSpec = { min: number; max: number; maxDegPerSec: number }
export const DEFAULT_HINGE_SPEC: HingeSpec = { min: -120, max: 120, maxDegPerSec: 90 }

export type HingeState = {
  target: number
  setpoint: number
  angle: number
  withinTicks: number
  history: number[]
}

export const createHingeState = (): HingeState => ({ target: 0, setpoint: 0, angle: 0, withinTicks: 0, history: [] })

export function requestHingeTarget(state: HingeState, spec: HingeSpec, degrees: number): HingeState {
  if (!Number.isFinite(degrees)) return state
  const target = clamp(degrees, spec.min, spec.max)
  if (target === state.target) return state
  return { ...state, target, withinTicks: 0, history: [] }
}

export function holdHinge(state: HingeState, spec: HingeSpec): HingeState {
  const target = clamp(state.angle, spec.min, spec.max)
  return { ...state, target, setpoint: target, withinTicks: 0, history: [] }
}

export function nextHingeSetpoint(state: HingeState, spec: HingeSpec, dt: number): number {
  const step = Math.max(0, spec.maxDegPerSec) * Math.max(0, dt)
  const chased = state.setpoint + clamp(state.target - state.setpoint, -step, step)
  const led = clamp(chased, state.angle - HINGE_LEAD_DEGREES, state.angle + HINGE_LEAD_DEGREES)
  return clamp(led, spec.min, spec.max)
}

export function observeHingeAngle(state: HingeState, setpoint: number, measuredDegrees: number): HingeState {
  const angle = Number.isFinite(measuredDegrees) ? measuredDegrees : state.angle
  const within = Math.abs(angle - state.target) <= HINGE_REACHED_TOLERANCE_DEGREES
  const history = [...state.history, angle]
  if (history.length > HINGE_BLOCKED_TICKS + 1) history.splice(0, history.length - (HINGE_BLOCKED_TICKS + 1))
  return { ...state, setpoint, angle, withinTicks: within ? state.withinTicks + 1 : 0, history }
}

export const isHingeReached = (state: HingeState): boolean => state.withinTicks >= HINGE_REACHED_TICKS

export function isHingeBlocked(state: HingeState): boolean {
  if (Math.abs(state.angle - state.target) <= HINGE_REACHED_TOLERANCE_DEGREES) return false
  if (state.history.length < HINGE_BLOCKED_TICKS + 1) return false
  return Math.abs(state.angle - state.history[0]) < HINGE_BLOCKED_MIN_ADVANCE_DEGREES
}
