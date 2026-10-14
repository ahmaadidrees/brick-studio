import { describe, expect, it } from 'vitest'
import { DEFAULT_CAR_FEEL } from '@brick-studio/platformer-core/engine/car'
import { RACE_THROWN, type WorldEvent } from '@brick-studio/platformer-core/engine/events'
import { cloneLevel, createBlankRaceLevel } from '@brick-studio/platformer-core/engine/level'
import { RT } from '@brick-studio/platformer-core/engine/raceTiles'
import { SHIELD_TICKS } from '@brick-studio/platformer-core/engine/raceItems'
import { EK, advanceWorld, createWorld } from '@brick-studio/platformer-core/engine/world'
import { RaceRun, type RaceLink } from './raceRun'

const GAS = { steer: 0, gas: true, brake: false }
const IDLE = { steer: 0, gas: false, brake: false }

/** A straight road 60 tiles long; the grid at (6, 10) faces right. Columns get ? blocks or coins per test. */
function setup(paint: (set: (x: number, t: number) => void) => void = () => {}, items = true) {
  const d = createBlankRaceLevel(60, 20, 'Straight')
  for (let y = 1; y < 19; y++) for (let x = 1; x < 59; x++) d.tiles[y * 60 + x] = RT.ROAD
  paint((x, t) => {
    for (let y = 1; y < 19; y++) d.tiles[y * 60 + x] = t
  })
  d.race = { ...d.race!, items }
  const world = createWorld(d)
  const sent: WorldEvent[] = []
  let pending: WorldEvent[] = []
  const link: RaceLink = { world: () => world, emit: (ev) => { sent.push(ev); pending.push(ev) }, num: 1 }
  const run = new RaceRun(cloneLevel(d), 0, () => DEFAULT_CAR_FEEL, link)
  run.random = () => 0.6 // a bouncy ball
  run.restart(0, { practice: true })
  const step = (input = GAS, use = false, n = 1) => {
    for (let i = 0; i < n; i++) {
      advanceWorld(world, pending.map((ev) => ({ ev, by: 1 })))
      pending = []
      run.step(input, use)
    }
  }
  return { world, run, sent, step }
}

describe('items in a race', () => {
  it('a ? block hands you an item (one at a time) and is gone for you for a few seconds', () => {
    const h = setup((set) => { set(12, RT.ITEM); set(14, RT.ITEM) })
    h.step(GAS, false, 60)
    expect(h.run.you.item).toBe('ball')
    expect(h.run.sounds).not.toContain('item')
    const box = [...h.run.boxes.keys()]
    expect(box.length).toBeGreaterThanOrEqual(2)
    expect(h.run.showing(box[0])).toBe(false)
    h.step(IDLE, false, 200)
    expect(h.run.showing(box[0])).toBe(true)
  })

  it('throwing a ball sends it into the shared world, ahead of the car', () => {
    const h = setup((set) => set(12, RT.ITEM))
    h.step(GAS, false, 60)
    h.step(GAS, true)
    expect(h.run.you.item).toBeNull()
    const ev = h.sent.find((e) => e.t === 'item')
    expect(ev).toMatchObject({ t: 'item', k: RACE_THROWN.BALL, o: 0 })
    h.step(GAS)
    expect(h.world.entities.some((e) => e.kind === EK.RACE_BALL)).toBe(true)
  })

  it('Turbo is a burst of speed; Shield protects you', () => {
    const h = setup((set) => set(12, RT.ITEM))
    h.run.random = () => 0
    h.step(GAS, false, 60)
    expect(h.run.you.item).toBe('turbo')
    const before = Math.hypot(h.run.you.car.vx, h.run.you.car.vy)
    h.step(GAS, true)
    expect(Math.hypot(h.run.you.car.vx, h.run.you.car.vy)).toBeGreaterThan(before * 1.3)
    h.run.you.item = 'shield'
    h.step(GAS, true)
    expect(h.run.you.shield).toBe(SHIELD_TICKS - 1)
  })

  it('coins count up and come back later', () => {
    const h = setup((set) => { for (const x of [10, 12, 14]) set(x, RT.COIN) })
    h.step(GAS, false, 80)
    expect(h.run.you.coins).toBe(3)
    expect(h.run.hud().coins).toBe(3)
    const coin = [...h.run.coinsTaken.keys()][0]
    expect(h.run.showing(coin)).toBe(false)
    h.step(IDLE, false, 400)
    expect(h.run.showing(coin)).toBe(true)
  })

  it('someone else’s ball spins you out, drops coins and tells the room; a shield just takes the hit', () => {
    for (const shielded of [false, true]) {
      const h = setup()
      h.run.you.coins = 5
      if (shielded) h.run.you.shield = SHIELD_TICKS
      const c = h.run.you.car
      advanceWorld(h.world, [{ ev: { t: 'item', k: RACE_THROWN.BALL, x: Math.round(c.x + 40), y: Math.round(c.y), vx: -2 * 256, vy: 0, o: 0 }, by: 2 }])
      h.step(IDLE, false, 30)
      const hit = h.sent.find((e) => e.t === 'hit')
      expect(hit).toBeDefined()
      expect(h.run.you.car.spin > 0).toBe(!shielded)
      expect(h.run.you.coins).toBe(shielded ? 5 : 2)
      expect(h.sent.filter((e) => e.t === 'hit')).toHaveLength(1)
    }
  })

  it('with items off, ? blocks give nothing', () => {
    const h = setup((set) => set(12, RT.ITEM), false)
    h.step(GAS, false, 60)
    expect(h.run.you.item).toBeNull()
    expect(h.run.hud().itemsOn).toBe(false)
  })

  it('Walkers spin you out', () => {
    const h = setup()
    advanceWorld(h.world, [{ ev: { t: 'edit', ops: [{ o: 'add', obj: { id: 6, kind: 'walker', x: 14, y: 9, dir: 1, alt: 0 } }] }, by: 1 }])
    let spun = false
    for (let i = 0; i < 120 && !spun; i++) {
      h.step(GAS)
      spun = h.run.you.car.spin > 0
    }
    expect(spun).toBe(true)
  })
})
