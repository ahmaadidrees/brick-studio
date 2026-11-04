/**
 * Cars bump each other, like the classic race (raceRun.ts bumpCars; parity bucket A, 2026-11-03): pushed apart half each,
 * never into a barrier, trading 0.6 of the speed they closed in with.
 */
import { describe, expect, it } from 'vitest'
import { play } from '../../core/index'
import { bumpRacers } from '../../core/race'
import type { Target } from '../../core/contracts'
import { CAR_BRICK_ID, RACER_BRICK_ID } from './carBrick'
import { createRaceStarterProject } from './raceProject'

function race() {
  const rt = play(createRaceStarterProject().design)
  rt.step()
  const car = rt.world.targets.find((t) => t.brickId === CAR_BRICK_ID && !t.isClone)!
  const racer = rt.world.targets.find((t) => t.brickId === RACER_BRICK_ID && !t.isClone)!
  return { rt, car, racer }
}
const gap = (a: Target, b: Target) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

describe('cars bump each other', () => {
  it('two overlapping cars are pushed apart to just touching, half each', () => {
    const { rt, car, racer } = race()
    car.x = 400; car.y = 120; car.direction = 90
    racer.x = 406; racer.y = 120; racer.direction = 90
    bumpRacers(rt.world)
    expect(gap(car, racer)).toBeCloseTo(11, 6)
    expect(car.x).toBeCloseTo(397.5, 6)
    expect(racer.x).toBeCloseTo(408.5, 6)
  })

  it('cars closing in trade 0.6 of that speed; cars moving apart keep theirs', () => {
    const { rt, car, racer } = race()
    car.x = 400; car.y = 120; car.body!.vx = 6; car.body!.vy = 0
    racer.x = 408; racer.y = 120; racer.body!.vx = 0; racer.body!.vy = 0
    bumpRacers(rt.world)
    expect(car.body!.vx).toBeCloseTo(6 - 6 * 0.6, 6)
    expect(racer.body!.vx).toBeCloseTo(6 * 0.6, 6)
    const apart = race()
    apart.car.x = 400; apart.car.y = 120; apart.car.body!.vx = -3
    apart.racer.x = 408; apart.racer.y = 120; apart.racer.body!.vx = 3
    bumpRacers(apart.rt.world)
    expect([apart.car.body!.vx, apart.racer.body!.vx]).toEqual([-3, 3])
  })

  it('cars further apart than their radii are left alone', () => {
    const { rt, car, racer } = race()
    car.x = 400; car.y = 120
    racer.x = 412; racer.y = 120
    bumpRacers(rt.world)
    expect([car.x, racer.x]).toEqual([400, 412])
  })

  it('never pushes a car into a barrier', () => {
    const { rt, car, racer } = race()
    const barrier = rt.world.targets.find((t) => t.brickId === 'brick_barrier')!
    // The car right against the barrier's side, the racer pressing into it from the other side.
    car.x = barrier.x + 8 + 5.5; car.y = barrier.y
    racer.x = car.x + 4; racer.y = car.y
    bumpRacers(rt.world)
    expect(car.x - 5.5).toBeGreaterThanOrEqual(barrier.x + 8 - 1e-9)
  })

  it('in a real race, the racers that start side by side never stay inside each other', { timeout: 30_000 }, () => {
    const { rt } = race()
    const racers = rt.world.targets.filter((t) => (t.brickId === RACER_BRICK_ID || t.brickId === CAR_BRICK_ID) && !t.isClone)
    rt.pressKey('up arrow')
    let worst = Infinity
    for (let i = 0; i < 900; i++) {
      rt.step()
      for (let a = 0; a < racers.length; a++) for (let b = a + 1; b < racers.length; b++) worst = Math.min(worst, gap(racers[a]!, racers[b]!))
    }
    expect(worst).toBeGreaterThan(11 - 0.5)
  })
})
