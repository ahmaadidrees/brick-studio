import { describe, expect, it } from 'vitest'
import { play } from './index'
import type { PrimitiveCtx } from './contracts'
import { isRacer, racePlace, racePrimitives } from './race'
import { createBeginnerRace } from '../studio/race/raceTrack'

describe('racePlace', () => {
  it('is what `my place` reports, for every racer, all race long', { timeout: 30_000 }, () => {
    const runtime = play(createBeginnerRace())
    let checked = 0
    for (let tick = 1; tick <= 1500; tick++) {
      runtime.step()
      if (tick % 30) continue
      for (const t of runtime.world.targets) {
        if (t.isStage) continue
        const block = racePrimitives.race_myplace({ target: t, runtime } as unknown as PrimitiveCtx)
        expect(racePlace(runtime.world, t)).toBe(block)
        if (isRacer(t)) checked++
      }
    }
    // Three racers, checked 50 times each (well into the second lap).
    expect(checked).toBe(3 * 50)
  })

  it('is 0 for a brick that is not a racer', () => {
    const runtime = play(createBeginnerRace())
    runtime.step()
    const starter = runtime.world.targets.find((t) => t.copyId === 'copy_starter')!
    expect(racePlace(runtime.world, starter)).toBe(0)
  })
})
