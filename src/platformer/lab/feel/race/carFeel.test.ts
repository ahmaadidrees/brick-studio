/**
 * Hackable Racing R1: the Car in open blocks drives like the race kit's car (engine/car.ts, DEFAULT_CAR_FEEL "Kart").
 * Same fields, same inputs, numbers in the same units; tolerances are the Hero's (feel/metrics.ts) and are not loosened
 * to make a number pass. RACE_FEEL.md is rewritten with both columns on every run.
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CAR_FEEL } from '@brick-studio/platformer-core/engine/car'
import { CAR_METRICS, hackableCarRunner, measureCar, oldCarRunner, withinTolerance, type CarMetrics } from './carMetrics'

const OLD: CarMetrics = measureCar(oldCarRunner)
const NEW: CarMetrics = measureCar(hackableCarRunner)

const round = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2))
const tol = (d: (typeof CAR_METRICS)[number]) => (d.tolerance.kind === 'rel' ? `±${d.tolerance.frac * 100}%` : `±${round(d.tolerance.amount)} ${d.unit}`)

describe('the race kit car, checked against car.ts', () => {
  it('top speeds are top, top x grass and top x dirt, times 60 (px/frame to px/s)', () => {
    expect(OLD.topSpeed).toBeCloseTo(DEFAULT_CAR_FEEL.top * 60, 6)
    expect(OLD.grassTop).toBeCloseTo(DEFAULT_CAR_FEEL.top * DEFAULT_CAR_FEEL.grass * 60, 6)
    expect(OLD.dirtTop).toBeCloseTo(DEFAULT_CAR_FEEL.top * DEFAULT_CAR_FEEL.dirt * 60, 6)
  })
  it('a boost pad lifts it to boostK x top speed, already one frame into the 45-frame fade when it moves', () => {
    const k = 44 / 45
    expect(OLD.boostPeak).toBeCloseTo(DEFAULT_CAR_FEEL.top * (DEFAULT_CAR_FEEL.boostK * k + (1 - k)) * 60, 6)
  })
})

describe('Car acceptance: the Hackable Car matches the race kit car', () => {
  for (const def of CAR_METRICS) {
    it(`${def.label} (${tol(def)})`, () => {
      const o = OLD[def.id], n = NEW[def.id]
      expect(withinTolerance(def, o, n), `${def.label}: race kit ${round(o)} ${def.unit}, Hackable ${round(n)} ${def.unit}`).toBe(true)
    })
  }
})

it('writes RACE_FEEL.md', () => {
  const rows = CAR_METRICS.map((d) => `| ${d.label} | ${d.unit} | ${round(OLD[d.id])} | ${round(NEW[d.id])} | ${tol(d)} | ${withinTolerance(d, OLD[d.id], NEW[d.id]) ? 'yes' : '**no**'} |`)
  const md = [
    '# Car feel: race kit car vs Hackable Car',
    '',
    'Written by `src/platformer/lab/feel/race/carFeel.test.ts`. The race kit car is `engine/car.ts` at 60 frames a second',
    'with DEFAULT_CAR_FEEL ("Kart"); the Hackable Car is the open-blocks Car (`studio/race/carBrick.ts`) at 30 ticks a second.',
    '',
    '| Measurement | Unit | Race kit | Hackable | Tolerance | Within |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
  writeFileSync(resolve(dirname(new URL(import.meta.url).pathname), '../../../../../docs/qa/hackable-modes/RACE_FEEL.md'), md)
})
