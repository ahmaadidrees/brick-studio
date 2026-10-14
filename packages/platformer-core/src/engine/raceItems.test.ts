import { describe, expect, it } from 'vitest'
import { SUB } from './constants'
import { createCar } from './car'
import { RACE_THROWN, isValidEvent, type WorldEvent } from './events'
import { createBlankLevel, createBlankRaceLevel, type LevelDesign } from './level'
import { RT } from './raceTiles'
import { hazardAt, rollItem, throwEvent, walkersToDraw } from './raceItems'
import { DEFAULT_CAR_FEEL } from './car'
import { EK, ES, RACE_KNOCKED_TICKS, RACE_THROWN_LIFE, advanceWorld, createWorld, deserializeWorld, hashWorld, serializeWorld, type World } from './world'
import { brickSpeedway } from '../levels/raceCourses'

/** A 40×20 track: road everywhere inside a barrier fence, with a Walker at (10, 10). */
function track(walkerAlt: 0 | 1 = 0): LevelDesign {
  const d = createBlankRaceLevel(40, 20, 'Test')
  for (let y = 1; y < 19; y++) for (let x = 1; x < 39; x++) d.tiles[y * 40 + x] = RT.ROAD
  d.objects.push({ id: 7, kind: 'walker', x: 10, y: 10, dir: 1, alt: walkerAlt })
  return d
}

const step = (w: World, n = 1, events: WorldEvent[] = [], by = 1) => {
  for (let i = 0; i < n; i++) advanceWorld(w, i === 0 ? events.map((ev) => ({ ev, by })) : [])
}
const thrown = (w: World) => w.entities.filter((e) => e.kind === EK.RACE_BALL || e.kind === EK.RACE_SPARK || e.kind === EK.RACE_SLICK)
const walker = (w: World) => w.entities.find((e) => e.kind === EK.WALKER)!
const ball = (x: number, y: number, vx: number, vy = 0, o = 0): WorldEvent => ({ t: 'item', k: RACE_THROWN.BALL, x, y, vx, vy, o })

describe('race Walkers', () => {
  it('pace two and a half tiles each way across the road, and along it when turned', () => {
    for (const alt of [0, 1] as const) {
      const w = createWorld(track(alt))
      const start = walkersToDraw(w)[0]
      const seen: number[] = []
      for (let i = 0; i < 600; i++) {
        step(w)
        const k = walkersToDraw(w)[0]
        seen.push(alt ? k.y - start.y : k.x - start.x)
        expect(alt ? k.x : k.y).toBe(alt ? start.x : start.y)
      }
      expect(Math.max(...seen)).toBeGreaterThan(38)
      expect(Math.max(...seen)).toBeLessThanOrEqual(40)
      expect(Math.min(...seen)).toBeLessThan(-38)
    }
  })

  it('turn round at walls and water instead of walking into them', () => {
    const d = track()
    d.tiles[10 * 40 + 12] = RT.WATER
    d.tiles[10 * 40 + 8] = RT.BARRIER
    const w = createWorld(d)
    for (let i = 0; i < 600; i++) {
      step(w)
      const k = walkersToDraw(w)[0]
      expect(k.x).toBeGreaterThan(9 * 16 + 4)
      expect(k.x).toBeLessThan(12 * 16 - 4)
    }
  })

  it('are part of the shared state: snapshots carry them and fingerprints follow them', () => {
    const w = createWorld(brickSpeedway())
    expect(walkersToDraw(w)).toHaveLength(2)
    step(w, 50)
    const copy = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))))
    expect(hashWorld(copy)).toBe(hashWorld(w))
    step(w, 20)
    step(copy, 20)
    expect(hashWorld(copy)).toBe(hashWorld(w))
  })
})

describe('thrown items in the shared world', () => {
  it('a bouncy ball flies, bounces off the fence and runs out', () => {
    const w = createWorld(track())
    step(w, 1, [ball(100, 40, 4 * SUB)])
    const b = thrown(w)[0]
    expect(b.kind).toBe(EK.RACE_BALL)
    let maxX = 0
    let bounced = false
    for (let i = 0; i < 200; i++) {
      step(w)
      const e = thrown(w)[0]
      maxX = Math.max(maxX, e.x / SUB)
      if (e.vx < 0) bounced = true
    }
    expect(bounced).toBe(true)
    expect(maxX).toBeLessThan(39 * 16)
    step(w, RACE_THROWN_LIFE[0])
    expect(thrown(w)).toHaveLength(0)
  })

  it('a spark bursts on the first wall; an oil slick stays put until it dries up', () => {
    const w = createWorld(track())
    step(w, 1, [{ t: 'item', k: RACE_THROWN.SPARK, x: 580, y: 40, vx: 8 * SUB, vy: 0, o: 0 }, { t: 'item', k: RACE_THROWN.OIL, x: 300, y: 200, vx: 500, vy: 500, o: 0 }])
    step(w, 20)
    const left = thrown(w)
    expect(left.map((e) => e.kind)).toEqual([EK.RACE_SLICK])
    expect([left[0].x + left[0].w / 2, left[0].y + left[0].h / 2]).toEqual([300 * SUB, 200 * SUB])
    step(w, RACE_THROWN_LIFE[2])
    expect(thrown(w)).toHaveLength(0)
  })

  it('a ball or spark knocks a Walker flat for a while', () => {
    const w = createWorld(track())
    const k = walkersToDraw(w)[0]
    step(w, 1, [ball(Math.round(k.x) - 30, Math.round(k.y), 3 * SUB)])
    step(w, 15)
    expect(walker(w).state).toBe(ES.SQUASHED)
    expect(thrown(w)).toHaveLength(0)
    step(w, RACE_KNOCKED_TICKS)
    expect(walker(w).state).toBe(ES.ACTIVE)
  })

  it('a hit uses the item up, once; a new race clears the track', () => {
    const w = createWorld(track())
    step(w, 1, [ball(100, 40, SUB), ball(100, 80, SUB)])
    const [a] = thrown(w)
    step(w, 1, [{ t: 'hit', id: a.id }], 2)
    expect(thrown(w)).toHaveLength(1)
    const again = advanceWorld(w, [{ ev: { t: 'hit', id: a.id }, by: 3 }])
    expect(again).toEqual([false])
    step(w, 1, [{ t: 'race' }])
    expect(thrown(w)).toHaveLength(0)
    expect(walkersToDraw(w)).toHaveLength(1)
  })

  it('each player has a limit, and tracks with items off take none', () => {
    const w = createWorld(track())
    const results = advanceWorld(w, Array.from({ length: 10 }, (_, i) => ({ ev: ball(100 + i * 10, 40, 0), by: 1 })))
    expect(results.filter(Boolean)).toHaveLength(8)
    expect(advanceWorld(w, [{ ev: ball(100, 100, 0), by: 2 }])).toEqual([true])
    const off = track()
    off.race = { ...off.race!, items: false }
    expect(advanceWorld(createWorld(off), [{ ev: ball(100, 40, 0), by: 1 }])).toEqual([false])
  })

  it('the same events give the same world everywhere', () => {
    const a = createWorld(brickSpeedway()), b = createWorld(brickSpeedway())
    const evs: WorldEvent[] = [ball(300, 600, 700, -300), { t: 'item', k: RACE_THROWN.SPARK, x: 500, y: 590, vx: -1500, vy: 40, o: 2 }]
    for (const w of [a, b]) {
      step(w, 1, evs)
      step(w, 300)
    }
    expect(hashWorld(a)).toBe(hashWorld(b))
  })
})

describe('race item events from players', () => {
  it('exist only on race tracks, within the level and speed limits', () => {
    expect(isValidEvent(ball(100, 40, 300), 40, 20, 'race')).toBe(true)
    expect(isValidEvent(ball(100, 40, 300), 40, 20, 'platformer')).toBe(false)
    expect(isValidEvent({ ...ball(100, 40, 300), k: 3 }, 40, 20, 'race')).toBe(false)
    expect(isValidEvent(ball(100, 40, 17 * 256), 40, 20, 'race')).toBe(false)
    expect(isValidEvent(ball(40 * 16 + 1, 40, 0), 40, 20, 'race')).toBe(false)
    expect(isValidEvent({ ...ball(100, 40, 0), o: 4 }, 40, 20, 'race')).toBe(false)
    expect(isValidEvent({ t: 'hit', id: 5 }, 40, 20, 'race')).toBe(true)
    expect(isValidEvent({ t: 'hit', id: 5 }, 40, 20, 'platformer')).toBe(false)
    const platformerWorld = createWorld(createBlankLevel(40, 20))
    expect(advanceWorld(platformerWorld, [{ ev: ball(100, 40, 0), by: 1 }])).toEqual([false])
  })

  it('race tracks hold only a grid and Walkers', () => {
    const add = (kind: string): WorldEvent => ({ t: 'edit', ops: [{ o: 'add', obj: { id: 9, kind, x: 3, y: 3, dir: 1, alt: 0 } as never }] })
    expect(isValidEvent(add('walker'), 40, 20, 'race')).toBe(true)
    expect(isValidEvent(add('goal'), 40, 20, 'race')).toBe(false)
    expect(isValidEvent(add('goal'), 40, 20, 'platformer')).toBe(true)
  })
})

describe('what a car runs into', () => {
  it('its own ball only after a moment; anyone else’s at once; Walkers unless knocked flat', () => {
    const w = createWorld(track())
    const car = createCar({ x: 200, y: 40, a: 0 })
    step(w, 1, [throwEvent(car, 'ball', DEFAULT_CAR_FEEL, 0)], 1)
    const id = thrown(w)[0].id
    const at = () => { const e = thrown(w)[0]; return [(e.x + e.w / 2) / SUB, (e.y + e.h / 2) / SUB] as const }
    expect(hazardAt(w, ...at(), 1, 0, new Set())).toBeNull()
    expect(hazardAt(w, ...at(), 1, 1, new Set())).toEqual({ kind: 'thrown', id })
    expect(hazardAt(w, ...at(), 2, 0, new Set())).toEqual({ kind: 'thrown', id })
    expect(hazardAt(w, ...at(), 2, 0, new Set([id]))).toBeNull()
    const k = walkersToDraw(w)[0]
    expect(hazardAt(w, k.x + 4, k.y, 1, 0, new Set())?.kind).toBe('walker')
    walker(w).state = ES.SQUASHED
    expect(hazardAt(w, k.x + 4, k.y, 1, 0, new Set())).toBeNull()
  })

  it('items come out by weight', () => {
    expect([0, 0.29, 0.31, 0.6, 0.75, 0.9, 0.999].map(rollItem)).toEqual(['turbo', 'turbo', 'oil', 'ball', 'spark', 'shield', 'shield'])
  })
})
