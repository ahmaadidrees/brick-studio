/**
 * The Spring like the classic one (parity bucket A, 2026-11-03): it throws the Hero up at springHigh with jump held and
 * springLow without, and the throw counts as a jump, so holding jump floats the Hero much higher. Heights are compared
 * with the classic numbers (feel.ts springHigh 6.75, springLow 4.5, holdSlow 0.125, fallGravity 0.375 px/frame).
 */
import { describe, expect, it } from 'vitest'
import { play } from '../../core/index'
import { createStarterProject, STARTER_SPRING } from '../starter'

/** The classic Hero thrown up at `v0` px/frame, 60 frames a second: how high it rises (the engine's own gravity rule). */
function classicRise(v0: number, held: boolean): number {
  let vy = -v0
  let y = 0
  let top = 0
  let jumping = true
  for (let frame = 0; frame < 600 && (jumping || vy < 0); frame++) {
    vy += jumping && vy < 0 && held ? 0.125 : 0.375
    if (vy >= 0) jumping = false
    y += vy
    top = Math.min(top, y)
  }
  return -top
}

/**
 * Drop the starter Hero onto the Spring, holding `keys` once it is in the air (so they never start a jump of their own),
 * and measure how far it rises from its lowest point.
 */
function springRise(keys: string[]): number {
  const rt = play(createStarterProject().design)
  for (let i = 0; i < 20; i++) rt.step()
  const hero = rt.world.targets.find((t) => t.copyId === 'copy_hero')!
  hero.x = STARTER_SPRING.x
  hero.y = 60
  let low = Infinity
  let high = -Infinity
  for (let i = 0; i < 90; i++) {
    if (i === 4) for (const k of keys) rt.pressKey(k)
    rt.step()
    if (high === -Infinity && hero.y <= low) low = hero.y
    else high = Math.max(high, hero.y)
  }
  return high - low
}

describe('the Spring', () => {
  // The Spring is not solid: the Hero hears boing a tick after it touches it and has sunk into it by then, so it is
  // thrown from a little lower than the classic Hero (which lands on the spring's top) and rises a little more.
  it('without jump held: a short throw, like the classic springLow', () => {
    expect(Math.abs(springRise([]) - classicRise(4.5, false))).toBeLessThanOrEqual(5)
  })

  it('with jump held: much higher, like the classic springHigh with float gravity', () => {
    const held = springRise(['space'])
    expect(Math.abs(held - classicRise(6.75, true))).toBeLessThanOrEqual(6)
    expect(held).toBeGreaterThan(springRise([]) * 3)
    // X and K hold jump too.
    expect(springRise(['x'])).toBe(held)
  })
})
