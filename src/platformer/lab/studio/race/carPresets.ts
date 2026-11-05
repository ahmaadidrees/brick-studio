/**
 * The Car's feel presets and slider words (docs/qa/hackable-modes/R1-SCREENS.md, lane 2): Kart, Drifty and On rails,
 * the race kit's three (packages/platformer-core engine/car.ts CAR_FEEL_PRESETS), converted to ticks the way
 * carBrick.ts converts Kart (R1-engine.md): speeds x 2, accelerations x 4, steering x 2, "keep k of it every frame"
 * becomes "keep k x k every tick". Kart is exactly CAR_KNOBS (carBrick.test and carPresets.test check it).
 *
 * Also the Car's and the Computer racer's slider specs for the Knobs card: plain names, one-line hints, fixed ranges
 * and the "More sliders" groups.
 */
import { CAR_FEEL_PRESETS, type CarFeel } from '@brick-studio/platformer-core/engine/car'
import { CAR_KNOBS, carVariableId } from './carBrick'

/** Keep k of it every frame -> keep k x k every tick; as a share removed: 1 - (1 - share)^2 (carBrick.ts's perTick). */
const perTick = (sharePerFrame: number): number => 1 - (1 - sharePerFrame) ** 2

/** The Car's knobs (CAR_KNOBS ids) a preset sets, from the race kit's feel numbers. Nothing else is touched. */
export function carKnobsFromFeel(feel: CarFeel): Record<string, number> {
  return {
    top: feel.top * 2,
    accel: feel.accel * 4,
    brakes: feel.brake * 4,
    steering: feel.steer * 2,
    grip: perTick(feel.grip),
    bounce: feel.bounce,
    grass: feel.grass,
    dirt: feel.dirt,
    ice_grip: perTick(feel.ice),
    boost: feel.boostK,
  }
}

export interface CarPreset {
  id: string
  name: string
  /** One line for the button's title. */
  hint: string
  /** CAR_KNOBS id -> value. */
  knobs: Readonly<Record<string, number>>
}

export const CAR_PRESETS: readonly CarPreset[] = [
  { id: 'kart', name: 'Kart', hint: 'The normal car: quick, and slides a little in the corners.', knobs: carKnobsFromFeel(CAR_FEEL_PRESETS.Kart) },
  { id: 'drifty', name: 'Drifty', hint: 'Faster, with less grip: it slides round the corners.', knobs: carKnobsFromFeel(CAR_FEEL_PRESETS.Drifty) },
  { id: 'rails', name: 'On rails', hint: 'Slower, and it hardly slides at all.', knobs: carKnobsFromFeel(CAR_FEEL_PRESETS['On rails']) },
]

// -----------------------------------------------------------------------------
// Slider specs (workshop/knobs.ts BRICK_KNOB_SPECS)
// -----------------------------------------------------------------------------

interface KnobWords {
  /** Shown instead of the variable's name, when the code still uses that name. */
  name?: string
  hint: string
  min: number
  max: number
  step: number
}

/**
 * Every Car knob's words and range. Ranges are the race kit's Feel panel ranges (car.ts CAR_FEEL_GROUPS) converted like
 * the numbers, so every preset sits inside them; the rest are shares (0 to 1) or close to their value.
 */
const WORDS: Readonly<Record<string, KnobWords>> = {
  top: { hint: 'How fast I go on the road.', min: 3, max: 12, step: 0.1 },
  accel: { hint: 'How quickly I get up to top speed.', min: 0.08, max: 1, step: 0.01 },
  brakes: { hint: 'How hard the brakes stop me.', min: 0.16, max: 1.6, step: 0.01 },
  steering: { hint: 'How fast I turn.', min: 2, max: 14, step: 0.1 },
  grip: { hint: 'Low grip slides round corners. 1 is on rails.', min: 0.05, max: 1, step: 0.01 },
  bounce: { hint: 'How much speed a barrier gives back when I hit it.', min: 0, max: 1, step: 0.05 },
  side_keep: { hint: 'How much speed I keep sliding along a barrier.', min: 0, max: 1, step: 0.05 },
  grass: { hint: 'My top speed on grass, as a share of my road speed.', min: 0.2, max: 1, step: 0.05 },
  grass_ease: { hint: 'How quickly I slow down when I drive onto grass.', min: 0.04, max: 1.6, step: 0.02 },
  dirt: { hint: 'My top speed on dirt, as a share of my road speed.', min: 0.4, max: 1, step: 0.05 },
  ice_grip: { hint: 'My grip on ice. Low is slippery.', min: 0.02, max: 0.51, step: 0.01 },
  ice_push: { hint: 'How much of my speed-up works on ice.', min: 0.1, max: 1, step: 0.05 },
  boost: { hint: 'A boost pad’s speed, as a share of my top speed.', min: 1, max: 2.5, step: 0.05 },
  boost_ticks: { name: 'boost time', hint: 'How long a boost lasts. 30 is one second.', min: 5, max: 60, step: 0.5 },
  ease: { hint: 'How quickly I slow back down after a boost.', min: 0.04, max: 1, step: 0.02 },
  coast: { hint: 'How much speed I keep with no gas. 1 never slows down.', min: 0.9, max: 1, step: 0.001 },
  reverse_top: { hint: 'How fast I can reverse, as a share of my top speed.', min: 0, max: 1, step: 0.05 },
  reverse_from: { hint: 'How slow I must be before the brakes start reversing.', min: 0, max: 1, step: 0.05 },
  roll: { hint: 'Below this share of my top speed, I steer less.', min: 0.05, max: 1, step: 0.05 },
  tires_bounce: { hint: 'How much speed a tire stack gives back. Low soaks it up.', min: 0, max: 1, step: 0.01 },
  tires_keep: { hint: 'How much speed I keep sliding along a tire stack.', min: 0, max: 1, step: 0.05 },
  bumper_push: { hint: 'How hard a bumper kicks me back.', min: 0, max: 12, step: 0.1 },
  scenery_bounce: { hint: 'How much speed a tree or a grandstand gives back.', min: 0, max: 1, step: 0.05 },
}

/** "More sliders" for a driver, by CAR_KNOBS id. The four Build sliders are up front, not in a group. */
const GROUPS: ReadonlyArray<{ id: string; label: string; keys: readonly string[] }> = [
  { id: 'speed', label: 'Speed', keys: ['brakes', 'coast', 'reverse_top', 'reverse_from'] },
  { id: 'handling', label: 'Steering', keys: ['roll', 'bounce', 'side_keep'] },
  { id: 'ground', label: 'Grass, dirt and ice', keys: ['grass', 'grass_ease', 'dirt', 'ice_grip', 'ice_push'] },
  { id: 'boost', label: 'Boost pads', keys: ['boost', 'boost_ticks', 'ease'] },
  { id: 'bumps', label: 'Bumping into things', keys: ['tires_bounce', 'tires_keep', 'bumper_push', 'scenery_bounce'] },
]

export interface DriverKnobSpec {
  knobs: Array<{ id: string; name: string; hint: string; value: number; min: number; max: number; step: number }>
  groups: Array<{ id: string; label: string; knobIds: string[] }>
  oldNames: Record<string, string>
  quietOldNames: true
  presets?: Array<{ id: string; name: string; hint: string; values: Record<string, number> }>
}

/** The slider spec for the Car ('car') or a Computer racer ('racer'), with its variable ids. */
export function driverKnobSpec(prefix: 'car' | 'racer', topSpeed?: number): DriverKnobSpec {
  const id = (key: string) => carVariableId(prefix, key)
  const oldNames: Record<string, string> = {}
  const knobs = CAR_KNOBS.map((k) => {
    const words = WORDS[k.id]
    if (words.name) oldNames[id(k.id)] = k.name
    return { id: id(k.id), name: words.name ?? k.name, hint: words.hint, value: k.id === 'top' && topSpeed !== undefined ? topSpeed : k.value, min: words.min, max: words.max, step: words.step }
  })
  return {
    knobs,
    groups: GROUPS.map((g) => ({ id: g.id, label: g.label, knobIds: g.keys.map(id) })),
    oldNames,
    quietOldNames: true,
    ...(prefix === 'car'
      ? { presets: CAR_PRESETS.map((p) => ({ id: p.id, name: p.name, hint: p.hint, values: Object.fromEntries(Object.entries(p.knobs).map(([k, v]) => [id(k), v])) })) }
      : {}),
  }
}
