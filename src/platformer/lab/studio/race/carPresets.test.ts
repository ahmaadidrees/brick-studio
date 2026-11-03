/**
 * The Car's presets: Kart is exactly CAR_KNOBS, and Drifty and On rails are the race kit's (CAR_FEEL_PRESETS) converted
 * to ticks the same way (speeds x 2, accelerations x 4, steering x 2, per-frame keep k -> k x k per tick).
 */
import { describe, expect, it } from 'vitest'
import { CAR_FEEL_PRESETS } from '@brick-studio/platformer-core/engine/car'
import { CAR_BUILD_KNOB_IDS, CAR_KNOBS, RACER_TOP_SPEED, carVariableId } from './carBrick'
import { CAR_PRESETS, driverKnobSpec } from './carPresets'

const preset = (id: string) => CAR_PRESETS.find((p) => p.id === id)!
const knob = (id: string) => CAR_KNOBS.find((k) => k.id === id)!.value
const BANNED = /\b(tick|ticks|sprite|kit)\b/i

describe('Car presets', () => {
  it('are Kart, Drifty and On rails, in that order', () => {
    expect(CAR_PRESETS.map((p) => p.name)).toEqual(['Kart', 'Drifty', 'On rails'])
  })

  it('Kart is exactly the Car’s own numbers', () => {
    for (const [id, value] of Object.entries(preset('kart').knobs)) expect(value, id).toBe(knob(id))
  })

  it('Drifty and On rails follow the conversion', () => {
    const keep = (k: number) => 1 - (1 - k) * (1 - k)
    for (const [id, name] of [['drifty', 'Drifty'], ['rails', 'On rails']] as const) {
      const feel = CAR_FEEL_PRESETS[name]
      const got = preset(id).knobs
      expect(got.top).toBeCloseTo(feel.top * 2, 12)
      expect(got.accel).toBeCloseTo(feel.accel * 4, 12)
      expect(got.brakes).toBeCloseTo(feel.brake * 4, 12)
      expect(got.steering).toBeCloseTo(feel.steer * 2, 12)
      expect(got.grip).toBeCloseTo(keep(feel.grip), 12)
      expect(got.ice_grip).toBeCloseTo(keep(feel.ice), 12)
      expect([got.bounce, got.grass, got.dirt, got.boost]).toEqual([feel.bounce, feel.grass, feel.dirt, feel.boostK])
    }
    // Spot checks against the numbers by hand.
    expect(preset('drifty').knobs.top).toBeCloseTo(7.2, 12)
    expect(preset('drifty').knobs.grip).toBeCloseTo(0.1164, 12)
    expect(preset('rails').knobs.grip).toBeCloseTo(0.99, 12)
    expect(preset('rails').knobs.steering).toBeCloseTo(6, 12)
  })

  it('every preset number is a Car knob and sits inside its slider', () => {
    const spec = driverKnobSpec('car')
    for (const p of spec.presets!) {
      for (const [id, value] of Object.entries(p.values)) {
        const k = spec.knobs.find((x) => x.id === id)!
        expect(k, id).toBeDefined()
        expect(value, `${p.name} ${id}`).toBeGreaterThanOrEqual(k.min)
        expect(value, `${p.name} ${id}`).toBeLessThanOrEqual(k.max)
      }
    }
  })
})

describe('the Car’s and a Computer racer’s sliders', () => {
  it('four up front, every other number in exactly one "More sliders" group', () => {
    const spec = driverKnobSpec('car')
    const grouped = spec.groups.flatMap((g) => g.knobIds)
    expect(new Set(grouped).size).toBe(grouped.length)
    expect(grouped.sort()).toEqual(CAR_KNOBS.filter((k) => !CAR_BUILD_KNOB_IDS.includes(k.id)).map((k) => carVariableId('car', k.id)).sort())
  })

  it('every knob has a plain hint and a range that holds its built-in value', () => {
    for (const spec of [driverKnobSpec('car'), driverKnobSpec('racer', RACER_TOP_SPEED)]) {
      for (const k of spec.knobs) {
        expect(k.hint, k.id).not.toMatch(BANNED)
        expect(k.name, k.id).not.toMatch(BANNED)
        expect(k.value, k.id).toBeGreaterThanOrEqual(k.min)
        expect(k.value, k.id).toBeLessThanOrEqual(k.max)
        expect(k.step, k.id).toBeGreaterThan(0)
      }
    }
  })

  it('a Computer racer has its own ids and top speed, and no presets', () => {
    const spec = driverKnobSpec('racer', RACER_TOP_SPEED)
    expect(spec.knobs.find((k) => k.id === 'racer_top')!.value).toBe(RACER_TOP_SPEED)
    expect(spec.presets).toBeUndefined()
  })
})
