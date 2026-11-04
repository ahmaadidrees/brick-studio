import { describe, expect, it } from 'vitest'
import type { CopyPlacement, LevelDesign } from './contracts'
import { createRuntime, type Runtime } from './index'
import { addPlayer, gridSlot, playerHero, removePlayer } from './players'
import { TILE_SIZE } from './contracts'
import { racerRadius } from './race'
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
    const one = addPlayer(rt, { num: 1, name: 'Maya' }, spawn, 'race')!
    const two = addPlayer(rt, { num: 2, name: 'Sam' }, spawn, 'race')!
    rt.pressKey('up arrow', 1)
    // Sam pressed nothing: his Car never has the gas on. (Cars bump each other, parity bucket A, and the Computer
    // racers can still shove his along, so where it ends up says nothing about his keys.)
    let samGas = 0
    for (let i = 0; i < 150; i++) {
      rt.step()
      samGas = Math.max(samGas, Number(two.variables.car_gas))
    }
    const moved = (t: typeof one) => Math.hypot(t.x - spawn.x, t.y - spawn.y)
    expect(moved(one)).toBeGreaterThan(40)
    expect(Number(one.variables.car_gas)).toBe(1)
    expect(samGas).toBe(0)
  })

  describe("Racing's starting grid (room Cars side by side, like classic Racing)", () => {
    const raceStart = () => {
      const design = createRaceStarterProject().design
      const rt = createRuntime(design)
      const spawn = design.copies.find((c) => c.brickId === 'brick_car')!
      return { design, rt, spawn }
    }
    const names = ['Maya', 'Sam', 'Lee', 'Ana', 'Ben', 'Kit']

    it('slots go two by two behind the painted Car, the second of each row to its right', () => {
      const right = { x: 100, y: 100, direction: 90 }
      expect(gridSlot(right, 0)).toEqual({ x: 100, y: 100 })
      expect(gridSlot(right, 1)).toEqual({ x: 100 - 0.6 * TILE_SIZE, y: 100 - 1.4 * TILE_SIZE })
      expect(gridSlot(right, 2)).toEqual({ x: 100 - 1.6 * TILE_SIZE, y: 100 })
      expect(gridSlot(right, 3)).toEqual({ x: 100 - 2.2 * TILE_SIZE, y: 100 - 1.4 * TILE_SIZE })
      // Pointing up, "behind" is down and "right" is +x.
      const up = { x: 100, y: 100, direction: 0 }
      expect(gridSlot(up, 1)).toEqual({ x: 100 + 1.4 * TILE_SIZE, y: 100 - 0.6 * TILE_SIZE })
      expect(gridSlot(up, 2)).toEqual({ x: 100, y: 100 - 1.6 * TILE_SIZE })
    })

    it('every Car gets its own clear spot on the road, none straight ahead of another', () => {
      const { design, rt, spawn } = raceStart()
      const cars = names.map((name, i) => addPlayer(rt, { num: i + 1, name }, spawn, 'race')!)
      rt.greenFlag()
      expect(cars[0]!.copyId).toBe(spawn.id)
      const racers = rt.world.targets.filter((t) => t.brickId === 'brick_car' || t.brickId === 'brick_racer')
      expect(racers).toHaveLength(names.length + 2)
      const road = 'R'
      for (const car of cars) {
        // On the road (rows[0] is the bottom row), facing the painted Car's way.
        const tiles = design.tiles!
        expect(tiles.data[Math.floor(car.y / TILE_SIZE)]![Math.floor(car.x / TILE_SIZE)], `${car.id} on the road`).toBe(road)
        expect(car.direction).toBe(spawn.direction)
        // Behind or beside the painted Car, never in front of it.
        expect(car.x).toBeLessThanOrEqual(spawn.x)
        for (const other of racers) {
          if (other === car) continue
          const gap = Math.hypot(other.x - car.x, other.y - car.y)
          expect(gap, `${car.id} vs ${other.id}`).toBeGreaterThanOrEqual(racerRadius(rt.world, car) + racerRadius(rt.world, other))
        }
      }
      // Player 2 is beside player 1 (not on its race line), so the two never touch when both floor it at "go".
      const [one, two] = cars as [typeof cars[0], typeof cars[0]]
      expect(Math.abs(two.y - one.y)).toBeCloseTo(1.4 * TILE_SIZE, 5)
      rt.pressKey('up arrow', 1)
      rt.pressKey('up arrow', 2)
      let closest = Infinity
      for (let i = 0; i < 6 * 30; i++) {
        rt.step()
        closest = Math.min(closest, Math.hypot(two.x - one.x, two.y - one.y))
      }
      expect(one.x - spawn.x).toBeGreaterThan(40)
      expect(closest).toBeGreaterThanOrEqual(racerRadius(rt.world, one) + racerRadius(rt.world, two))
    })

    it('every game of a room picks the same spots, joining before or during the race', () => {
      const play = () => {
        const { rt, spawn } = raceStart()
        addPlayer(rt, { num: 1, name: 'Maya' }, spawn, 'race')
        addPlayer(rt, { num: 2, name: 'Sam' }, spawn, 'race')
        rt.greenFlag()
        rt.pressKey('up arrow', 1)
        rt.pressKey('up arrow', 2)
        for (let i = 0; i < 200; i++) rt.step()
        // A late joiner takes the first free slot: the front ones are empty again once the race is under way.
        const late = addPlayer(rt, { num: 3, name: 'Lee' }, spawn, 'race')!
        const at = { x: late.x, y: late.y }
        for (let i = 0; i < 30; i++) rt.step()
        return { at, print: worldFingerprint(rt.world), spawn }
      }
      const a = play()
      const b = play()
      expect(b.at).toEqual(a.at)
      expect(b.print).toBe(a.print)
      expect(a.at).toEqual(gridSlot(a.spawn, 0))
    })

    it('slots skip a Computer racer parked on the grid', () => {
      const { rt, spawn } = raceStart()
      const cars = names.slice(0, 4).map((name, i) => addPlayer(rt, { num: i + 1, name }, spawn, 'race')!)
      // Slot 3 of the beginner track is 10 steps from the second Computer racer, closer than two radii (11).
      expect(cars.map((c) => ({ x: c.x, y: c.y }))).toEqual([0, 1, 2, 4].map((i) => gridSlot(spawn, i)))
    })

    it('the Platformer still puts later Heroes beside the first, along x', () => {
      const { rt, spawn } = start()
      addPlayer(rt, { num: 1, name: 'Maya' }, spawn)
      const two = addPlayer(rt, { num: 2, name: 'Sam' }, spawn, 'platformer')!
      expect([two.x, two.y]).toEqual([spawn.x + 20, spawn.y])
    })
  })
})
