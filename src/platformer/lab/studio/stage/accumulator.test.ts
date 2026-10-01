import { describe, expect, it } from 'vitest'
import { FixedStepAccumulator, TICK_MS } from './accumulator'

describe('fixed-step accumulator', () => {
  it('executes exactly 30 ticks across 1 second of uneven frames', () => {
    const acc = new FixedStepAccumulator()

    // Uneven frames summing to exactly 1000 ms.
    const frameDeltas = [
      16, 17, 33, 14, 20, 16, 8, 8, 35, 12, 16, 17, 34, 16, 16, 25, 25, 16, 17, 33,
      16, 17, 16, 17, 33, 16, 17, 16, 17, 33, 16, 17, 16, 17, 33, 16, 17, 16, 17, 33,
      16, 17, 16, 17, 33, 16, 17, 16, 17, 33, 12,
    ]
    const sum = frameDeltas.reduce((a, b) => a + b, 0)
    expect(sum).toBe(1000)

    let totalTicks = 0
    let now = 0

    // Initial frame initializes lastTime
    const initial = acc.advance(now)
    expect(initial.ticks).toBe(0)

    for (const dt of frameDeltas) {
      now += dt
      const res = acc.advance(now)
      totalTicks += res.ticks
    }

    // 1000 ms at 30 ticks/s = exactly 30 ticks
    expect(totalTicks).toBe(30)
    expect(acc.getRemainingMs()).toBeCloseTo(0, 3)
  })

  it('produces no burst after an explicit pause (e.g. tab hidden)', () => {
    const acc = new FixedStepAccumulator()
    let now = 1000

    acc.advance(now) // initialize
    now += 33.333333333333336
    const r1 = acc.advance(now)
    expect(r1.ticks).toBe(1)

    // User hides the tab for 60 seconds
    acc.pause()
    now += 60_000

    // While paused, advance produces 0 ticks
    const rPaused = acc.advance(now)
    expect(rPaused.ticks).toBe(0)

    // Tab becomes visible again
    acc.resume()
    const rResume = acc.advance(now)
    expect(rResume.ticks).toBe(0) // No burst on first frame after resume!

    // Next normal frame advances normally
    now += 34
    const rNext = acc.advance(now)
    expect(rNext.ticks).toBe(1)
  })

  it('clamps large unexpected lag spikes to maxDeltaMs to prevent burst', () => {
    // maxDeltaMs is 3 ticks (~100 ms)
    const acc = new FixedStepAccumulator()
    let now = 0

    acc.advance(now)

    // Sudden 10-second freeze without pause event
    now += 10_000
    const res = acc.advance(now)

    // Instead of 300 ticks, it clamps delta to maxDeltaMs (3 ticks)
    expect(res.ticks).toBe(3)
  })

  it('calculates interpolation alpha in [0, 1)', () => {
    const acc = new FixedStepAccumulator()
    let now = 0
    acc.advance(now)

    // Half of a tick passes
    now += TICK_MS * 0.5
    const rHalf = acc.advance(now)
    expect(rHalf.ticks).toBe(0)
    expect(rHalf.alpha).toBeCloseTo(0.5, 2)

    // Another 0.75 tick passes (total 1.25 ticks since start, 1 tick should fire, leaving 0.25 tick)
    now += TICK_MS * 0.75
    const rNext = acc.advance(now)
    expect(rNext.ticks).toBe(1)
    expect(rNext.alpha).toBeCloseTo(0.25, 2)
  })
})
