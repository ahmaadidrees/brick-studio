import { describe, expect, it } from 'vitest'
import type { CopyPlacement, LevelDesign } from './contracts'
import { createRuntime, type Runtime } from './index'
import { addPlayer, playerHero, removePlayer } from './players'
import { worldFingerprint, worldFromJson, worldToJson } from './snapshot'
import { createStarterProject } from '../studio/starter'
import { createRaceStarterProject } from '../studio/race/raceProject'

const HERO = 'brick_hero'

function start(design: LevelDesign = createStarterProject().design): { rt: Runtime; spawn: CopyPlacement; design: LevelDesign } {
  const rt = createRuntime(design)
  rt.greenFlag()
  const spawn = design.copies.find((c) => c.brickId === HERO)!
  return { rt, spawn, design }
}

const run = (rt: Runtime, ticks: number) => { for (let i = 0; i < ticks; i++) rt.step() }

describe('players in a room (docs/qa/hackable-rooms M0)', () => {
  it('the first player takes the painted Hero; the next gets a copy beside it, started like everyone else', () => {
    const { rt, spawn } = start()
    run(rt, 5)
    const one = addPlayer(rt, { num: 1, name: 'Maya' }, spawn)!
    expect(one.copyId).toBe(spawn.id)
    expect(one.player).toBe(1)
    const two = addPlayer(rt, { num: 2, name: 'Sam' }, spawn)!
    expect(two.id).toBe('player:2')
    expect(two.player).toBe(2)
    expect(two.x).toBeGreaterThan(spawn.x)
    expect(rt.world.players?.map((p) => p.name)).toEqual(['Maya', 'Sam'])
    // Joining again changes nothing.
    expect(addPlayer(rt, { num: 2, name: 'Sam' }, spawn)).toBe(two)
    expect(rt.world.targets.filter((t) => t.brickId === HERO)).toHaveLength(2)
    // Sam's Hero runs the Hero's scripts: it stands on the ground after a moment, like Maya's.
    run(rt, 30)
    expect(two.y).toBeCloseTo(one.y, 5)
  })

  it("each Hero hears only its own player's keys", () => {
    const { rt, spawn } = start()
    const one = addPlayer(rt, { num: 1, name: 'Maya' }, spawn)!
    const two = addPlayer(rt, { num: 2, name: 'Sam' }, spawn)!
    run(rt, 20)
    const x1 = one.x, x2 = two.x
    rt.pressKey('right arrow', 1)
    rt.pressKey('left arrow', 2)
    run(rt, 30)
    expect(one.x).toBeGreaterThan(x1 + 10)
    expect(two.x).toBeLessThan(x2 - 10)
  })

  it('a key stays down for everyone else while another player still holds it', () => {
    const { rt, spawn } = start()
    addPlayer(rt, { num: 1, name: 'Maya' }, spawn)
    addPlayer(rt, { num: 2, name: 'Sam' }, spawn)
    rt.pressKey('space', 1)
    rt.pressKey('space', 2)
    rt.releaseKey('space', 1)
    expect(rt.world.keysDown.has('space')).toBe(true)
    expect(rt.world.players?.find((p) => p.num === 1)?.keys).toEqual([])
    rt.releaseKey('space', 2)
    expect(rt.world.keysDown.has('space')).toBe(false)
  })

  it('a player who leaves takes their Hero and keys with them', () => {
    const { rt, spawn } = start()
    addPlayer(rt, { num: 1, name: 'Maya' }, spawn)
    addPlayer(rt, { num: 2, name: 'Sam' }, spawn)
    rt.pressKey('right arrow', 2)
    run(rt, 3)
    removePlayer(rt, 2)
    expect(playerHero(rt.world, 2)).toBeUndefined()
    expect(rt.world.keysDown.has('right arrow')).toBe(false)
    expect(rt.world.players?.map((p) => p.num)).toEqual([1])
    run(rt, 10)
    expect(rt.threads().every((t) => t.target.player !== 2)).toBe(true)
  })

  it('a game with players carries on exactly after a save to JSON', () => {
    const timeline = (rt: Runtime, spawn: CopyPlacement, tick: number) => {
      if (tick === 0) addPlayer(rt, { num: 1, name: 'Maya' }, spawn)
      if (tick === 10) addPlayer(rt, { num: 2, name: 'Sam' }, spawn)
      if (tick === 12) { rt.pressKey('right arrow', 1); rt.pressKey('left arrow', 2) }
      if (tick === 40) { rt.pressKey('space', 2) }
      if (tick === 50) { rt.releaseKey('space', 2); rt.pressKey('right arrow', 2) }
      if (tick === 70) addPlayer(rt, { num: 3, name: 'Lee' }, spawn)
      if (tick === 90) removePlayer(rt, 1)
    }
    const play = (saveAt?: number): number[] => {
      let { rt, spawn, design } = start()
      const prints: number[] = []
      for (let tick = 0; tick < 150; tick++) {
        if (tick === saveAt) {
          const fresh = createRuntime(design)
          fresh.restoreWorld(worldFromJson(worldToJson(rt.world), fresh.world.bricks))
          rt = fresh
        }
        timeline(rt, spawn, tick)
        rt.step()
        prints.push(worldFingerprint(rt.world))
      }
      void spawn
      return prints
    }
    const kept = play()
    for (const at of [11, 60, 95]) expect(play(at).slice(at), `saved at ${at}`).toEqual(kept.slice(at))
  }, 30_000)

  it('Racing: each player drives their own Car', () => {
    const design = createRaceStarterProject().design
    const rt = createRuntime(design)
    rt.greenFlag()
    const spawn = design.copies.find((c) => c.brickId === 'brick_car')!
    const one = addPlayer(rt, { num: 1, name: 'Maya' }, spawn)!
    const two = addPlayer(rt, { num: 2, name: 'Sam' }, spawn)!
    rt.pressKey('up arrow', 1)
    run(rt, 150)
    const moved = (t: typeof one) => Math.hypot(t.x - spawn.x, t.y - spawn.y)
    expect(moved(one)).toBeGreaterThan(40)
    // Sam pressed nothing: still near the start, wherever the countdown left it.
    expect(moved(two)).toBeLessThan(moved(one) / 2)
  })
})
