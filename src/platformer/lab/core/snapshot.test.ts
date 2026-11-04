import { describe, expect, it } from 'vitest'
import type { LevelDesign } from './contracts'
import { createRuntime, type Runtime } from './index'
import { copyWorld, worldFingerprint, worldFromJson, worldToJson } from './snapshot'
import { createStarterProject } from '../studio/starter'
import { createRaceStarterProject } from '../studio/race/raceProject'

/** A kid's keys from a seed: mostly forward, sometimes back, with jumps (Platformer) or steering (Racing). */
function keysFor(kit: 'platformer' | 'race', ticks: number): Map<number, [string, boolean][]> {
  let s = 99
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32 }
  const out = new Map<number, [string, boolean][]>()
  const keys = kit === 'race' ? ['up arrow', 'left arrow', 'right arrow', 'down arrow'] : ['right arrow', 'space', 'x', 'left arrow']
  for (let t = 0; t < ticks; t += 4) out.set(t, keys.map((k, i) => [k, rand() < [0.8, 0.3, 0.3, 0.1][i]]))
  return out
}

function play(design: LevelDesign, kit: 'platformer' | 'race', ticks: number, onTick?: (tick: number, rt: Runtime) => Runtime): number[] {
  let rt = createRuntime(design)
  rt.greenFlag()
  const keys = keysFor(kit, ticks)
  const prints: number[] = []
  for (let tick = 0; tick < ticks; tick++) {
    if (onTick) rt = onTick(tick, rt)
    for (const [key, down] of keys.get(tick) ?? []) {
      if (down && !rt.world.keysDown.has(key)) rt.pressKey(key)
      else if (!down && rt.world.keysDown.has(key)) rt.releaseKey(key)
    }
    rt.step()
    prints.push(worldFingerprint(rt.world))
  }
  return prints
}

const STARTERS = [
  { kit: 'platformer' as const, design: () => createStarterProject().design },
  { kit: 'race' as const, design: () => createRaceStarterProject().design },
]

describe('a saved game carries on exactly (docs/qa/hackable-rooms M0)', () => {
  for (const { kit, design } of STARTERS) {
    it(`${kit}: restored from JSON at any tick, it matches the game that never stopped`, () => {
      const ticks = 240
      const kept = play(design(), kit, ticks)
      for (const at of [1, 37, 90, 151, 200]) {
        const d = design()
        const rejoined = play(d, kit, ticks, (tick, rt) => {
          if (tick !== at) return rt
          const fresh = createRuntime(d)
          fresh.restoreWorld(worldFromJson(worldToJson(rt.world), fresh.world.bricks))
          return fresh
        })
        expect(rejoined.slice(at), `restored at tick ${at}`).toEqual(kept.slice(at))
      }
    }, 60_000)

    it(`${kit}: rewinding to a copy and replaying the same keys lands on the same game`, () => {
      const d = design()
      const rt = createRuntime(d)
      rt.greenFlag()
      for (let i = 0; i < 60; i++) rt.step()
      const saved = copyWorld(rt.world)
      rt.pressKey(kit === 'race' ? 'up arrow' : 'right arrow')
      for (let i = 0; i < 30; i++) rt.step()
      const first = worldFingerprint(rt.world)

      // Back to the copy (a late key arrived) and play the same 30 ticks again.
      rt.restoreWorld(copyWorld(saved))
      rt.pressKey(kit === 'race' ? 'up arrow' : 'right arrow')
      for (let i = 0; i < 30; i++) rt.step()
      expect(worldFingerprint(rt.world)).toBe(first)
      // The copy itself was not changed by playing on from it.
      expect(saved.tick).toBe(60)
    })
  }

  it('keeps numbers JSON cannot: Infinity, -Infinity, NaN and -0', () => {
    const rt = createRuntime(createStarterProject().design)
    rt.step()
    rt.world.stage.variables.coins = Infinity
    rt.world.stage.lists.odd = [-Infinity, NaN, -0, 0, 'Infinity']
    const back = worldFromJson(worldToJson(rt.world), rt.world.bricks)
    expect(back.stage.variables.coins).toBe(Infinity)
    expect(back.stage.lists.odd[0]).toBe(-Infinity)
    expect(back.stage.lists.odd[1]).toBeNaN()
    expect(Object.is(back.stage.lists.odd[2], -0)).toBe(true)
    expect(Object.is(back.stage.lists.odd[3], 0)).toBe(true)
    expect(back.stage.lists.odd[4]).toBe('Infinity')
    expect(worldFingerprint(back)).toBe(worldFingerprint(rt.world))
  })

  it('the fingerprint sees one bit of drift, and only real state', () => {
    const rt = createRuntime(createStarterProject().design)
    rt.greenFlag()
    rt.step()
    const before = worldFingerprint(rt.world)
    const hero = rt.world.targets.find((t) => t.brickId === 'brick_hero')!
    const x = hero.x
    hero.x = x + Number.EPSILON * Math.max(1, Math.abs(x))
    expect(worldFingerprint(rt.world)).not.toBe(before)
    hero.x = x
    expect(worldFingerprint(rt.world)).toBe(before)
    // A copy fingerprints the same as the original.
    expect(worldFingerprint(copyWorld(rt.world))).toBe(before)
  })
})
