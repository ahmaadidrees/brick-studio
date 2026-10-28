import type { VariableDecl } from '../../core/contracts'
import { HERO_KNOB_GROUPS, HERO_KNOBS } from '../hero/heroBrick'

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

/**
 * What the Knobs card lists for a brick: its `showInBuild` number variables on top, then (for the Hero) the rest of the
 * tuning numbers under "More tuning", grouped Walking / Running / Jumping / Falling / Walls (HERO_KNOB_GROUPS). Another
 * brick has no "more" group.
 */
export interface KnobList {
  main: VariableDecl[]
  groups: Array<{ id: string; label: string; knobs: VariableDecl[] }>
  /** How many sliders sit under "More tuning". */
  moreCount: number
}

export function knobList(variables: readonly VariableDecl[]): KnobList {
  const isNumber = (v: VariableDecl) => typeof v.value === 'number'
  const main = variables.filter((v) => v.showInBuild && isNumber(v))
  const groups = HERO_KNOB_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    knobs: g.knobIds.map((id) => variables.find((v) => v.id === id && !v.showInBuild && isNumber(v))).filter((v): v is VariableDecl => v !== undefined),
  })).filter((g) => g.knobs.length > 0)
  return { main, groups, moreCount: groups.reduce((n, g) => n + g.knobs.length, 0) }
}

/**
 * The value a slider's range is built from: the Hero's own tuning numbers use their built-in value, so the range does
 * not stretch as you drag (a range made from the current value would double itself at the right end). Anything else uses
 * the current value, as before.
 */
export function knobStart(v: VariableDecl): number {
  const hero = HERO_KNOBS.find((k) => k.id === v.id)
  return hero ? hero.value : (v.value as number)
}

/** The slider range for one knob: from its start value, stretched to hold the current value. */
export function sliderRange(v: VariableDecl): KnobRange {
  const start = knobRange(knobStart(v))
  const current = v.value as number
  return { min: Math.min(start.min, current), max: Math.max(start.max, current), step: start.step }
}
