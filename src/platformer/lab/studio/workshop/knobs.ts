import type { BrickDef, VariableDecl } from '../../core/contracts'
import { HERO_KNOB_GROUPS, HERO_KNOBS, HERO_OLD_VARIABLE_NAMES } from '../hero/heroBrick'
import { CAR_BRICK_ID, RACER_BRICK_ID, RACER_TOP_SPEED } from '../race/carBrick'
import { driverKnobSpec } from '../race/carPresets'

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
/** Rounded for kids to read: 8.125 shows as 8.1, 0.21875 as 0.22. The value itself is unchanged. */
export function formatKnob(value: number): string {
  if (Number.isInteger(value)) return String(value)
  const places = Math.abs(value) >= 10 ? 0 : Math.abs(value) >= 1 ? 1 : 2
  return String(Math.round(value * 10 ** places) / 10 ** places)
}

/**
 * A built-in brick's tuning numbers (docs/qa/hackable-modes/R1-SCREENS.md B.4): each one's plain name, hint and built-in
 * value, the "More sliders" groups, and names an older version of the brick used in its code.
 */
export interface BrickKnobSpec {
  /**
   * `min`, `max` and `step` fix a knob's slider range (the Car's); without them the range is built from the built-in
   * value (knobRange), as for the Hero.
   */
  knobs: ReadonlyArray<{ id: string; name: string; hint?: string; value: number; min?: number; max?: number; step?: number }>
  groups: ReadonlyArray<{ id: string; label: string; knobIds: readonly string[] }>
  oldNames?: Readonly<Record<string, string>>
  /** Don't say a knob's old code name under its slider (the Car's "boost ticks" is shown as "boost time"). */
  quietOldNames?: boolean
  /** Buttons that set several knobs at once (the Car's Kart / Drifty / On rails): variable id -> value. */
  presets?: ReadonlyArray<{ id: string; name: string; hint?: string; values: Readonly<Record<string, number>> }>
}

/** Keyed by catalog brick id. A remix ("My Hero") uses its original's entry. */
export const BRICK_KNOB_SPECS: Readonly<Record<string, BrickKnobSpec>> = {
  brick_hero: { knobs: HERO_KNOBS, groups: HERO_KNOB_GROUPS, oldNames: HERO_OLD_VARIABLE_NAMES },
  [CAR_BRICK_ID]: driverKnobSpec('car'),
  [RACER_BRICK_ID]: driverKnobSpec('racer', RACER_TOP_SPEED),
}

/**
 * The spec for a brick: its own (or its original's), else the Hero's, as before the registry. Matching is by variable
 * id, so the Hero's spec changes nothing for a brick without the Hero's variables.
 */
export function knobSpecFor(brick?: Pick<BrickDef, 'id' | 'remixOf'>): BrickKnobSpec {
  return (brick && (BRICK_KNOB_SPECS[brick.remixOf ?? brick.id] ?? BRICK_KNOB_SPECS[brick.id])) || BRICK_KNOB_SPECS.brick_hero
}

/**
 * What the Knobs card lists for a brick: its `showInBuild` number variables on top, then the rest of its spec's tuning
 * numbers under "More sliders", grouped (the Hero: Walking / Running / Jumping / Falling / Walls, HERO_KNOB_GROUPS). A
 * brick with none of its spec's numbers has no "more" group.
 */
export interface KnobList {
  main: VariableDecl[]
  groups: Array<{ id: string; label: string; knobs: VariableDecl[] }>
  /** How many sliders sit under "More sliders". */
  moreCount: number
}

export function knobList(variables: readonly VariableDecl[], spec: BrickKnobSpec = knobSpecFor()): KnobList {
  const isNumber = (v: VariableDecl) => typeof v.value === 'number'
  const main = variables.filter((v) => v.showInBuild && isNumber(v))
  const groups = spec.groups.map((g) => ({
    id: g.id,
    label: g.label,
    knobs: g.knobIds.map((id) => variables.find((v) => v.id === id && !v.showInBuild && isNumber(v))).filter((v): v is VariableDecl => v !== undefined),
  })).filter((g) => g.knobs.length > 0)
  return { main, groups, moreCount: groups.reduce((n, g) => n + g.knobs.length, 0) }
}

/**
 * The value a slider's range is built from: a spec's own tuning numbers use their built-in value, so the range does
 * not stretch as you drag (a range made from the current value would double itself at the right end). Anything else uses
 * the current value, as before.
 */
export function knobStart(v: VariableDecl, spec: BrickKnobSpec = knobSpecFor()): number {
  const known = spec.knobs.find((k) => k.id === v.id)
  return known ? known.value : (v.value as number)
}

/**
 * The slider range for one knob: the spec's own range when it has one, else one from its start value; either way
 * stretched to hold the current value, so a saved number is never clipped. Dragging stays inside it, so it never grows.
 */
export function sliderRange(v: VariableDecl, spec: BrickKnobSpec = knobSpecFor()): KnobRange {
  const known = spec.knobs.find((k) => k.id === v.id)
  const start = known && known.min !== undefined && known.max !== undefined
    ? { min: known.min, max: known.max, step: known.step ?? knobRange(known.value).step }
    : knobRange(knobStart(v, spec))
  const current = v.value as number
  return { min: Math.min(start.min, current), max: Math.max(start.max, current), step: start.step }
}

/** The preset every one of whose numbers the brick has now, if any (that button shows as pressed). */
export function activePreset(variables: readonly VariableDecl[], spec: BrickKnobSpec = knobSpecFor()): string | null {
  const found = spec.presets?.find((p) => Object.entries(p.values).every(([id, value]) => variables.find((v) => v.id === id)?.value === value))
  return found?.id ?? null
}

/**
 * The words next to a slider. A spec's tuning number shows its plain name and a one-line hint, also when the kid's
 * brick still calls it by its old name in the code (the Hero's "p speed"); then the hint says so. Any other variable,
 * or one the kid renamed, shows its own name.
 */
export function knobWords(v: VariableDecl, spec: BrickKnobSpec = knobSpecFor()): { label: string; hint?: string } {
  const known = spec.knobs.find((k) => k.id === v.id)
  const oldName = spec.oldNames?.[v.id]
  if (!known || (v.name !== known.name && v.name !== oldName)) return { label: v.name }
  if (!known.hint) return { label: known.name }
  return { label: known.name, hint: v.name === known.name || spec.quietOldNames ? known.hint : `${known.hint} In the code it is called “${v.name}”.` }
}
