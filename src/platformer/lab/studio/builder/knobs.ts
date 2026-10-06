import type { Value } from '../../core/contracts'

export interface KnobRange {
  min: number
  max: number
  step: number
}

/**
 * Slider range for a number knob, picked from its starting value: 0 to twice the value (the other way for a negative
 * one), whole steps for whole numbers and 0.05 steps otherwise. A zero starts at 0 to 10. The range stretches to hold the
 * current value so a saved number is never clipped.
 */
export function knobRange(start: number, current: number = start): KnobRange {
  const step = Number.isInteger(start) ? 1 : 0.05
  let min = Math.min(0, start * 2)
  let max = Math.max(0, start * 2)
  if (start === 0) max = 10
  min = Math.min(min, current)
  max = Math.max(max, current)
  return { min, max, step }
}

export function isKnobNumber(v: Value): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Round to the slider's step so floating-point noise never lands in the saved knob. */
export function snapKnob(value: number, step: number): number {
  const decimals = step < 1 ? 2 : 0
  return Number(value.toFixed(decimals))
}
