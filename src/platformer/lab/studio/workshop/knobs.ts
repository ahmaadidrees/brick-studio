/** Slider ranges for Knobs: picked from the variable's current value. */
export interface KnobRange {
  min: number
  max: number
  step: number
}

/**
 * Rule: 0 to 2x the value (mirrored for negatives; 0..10 when the value is 0).
 * Whole numbers step by 1. Other numbers step by 0.05, or by a tenth of their size when smaller than 1, so tiny knobs
 * (0.22) still move smoothly. The range always contains the value.
 */
export function knobRange(value: number): KnobRange {
  const v = Number.isFinite(value) ? value : 0
  const span = v === 0 ? 10 : v * 2
  const min = Math.min(0, span)
  const max = Math.max(0, span)
  if (Number.isInteger(v)) return { min, max, step: 1 }
  const mag = Math.abs(v)
  const step = mag >= 1 ? 0.05 : Math.max(0.001, 10 ** (Math.floor(Math.log10(mag)) - 1))
  return { min, max, step }
}

/** Tidy number for the label next to a slider. */
export function formatKnob(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000)
}
