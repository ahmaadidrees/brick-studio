import { describe, expect, it } from 'vitest'
import { brickSpeedway } from '../levels/raceCourses'
import { CAR_RADIUS, DEFAULT_CAR_FEEL, createCar, gridSpots, solidUnder, stepCar, trackTileAt, type Car, type CarEvent, type CarFeel, type CarInput } from './car'
import { TILE } from './constants'
import { editDesign } from './designEdit'
import { isValidEvent, type WorldEvent } from './events'
import { DEFAULT_RACE } from './kits'
import { computeLoop, createLapState, raceProgress, trackLaps, type LapState, type RaceLoop } from './laps'
import { cloneLevel, createBlankLevel, createBlankRaceLevel, levelFromJson, levelToJson, type LevelDesign } from './level'
import { raceAutopilot } from './raceAutopilot'
import { RT } from './raceTiles'
import { T } from './tiles'
import { advanceWorld, applyEvent, createWorld, deserializeWorld, hashWorld, serializeWorld } from './world'

const GAS: CarInput = { steer: 0, gas: true, brake: false }

/** A straight east-west test strip: road rows 4..8 between barrier fences, the rest as given. */
function strip(width = 60, fill?: (x: number, y: number) => number | undefined): LevelDesign {
  const d = createBlankRaceLevel(width, 15, 'Strip')
  for (let y = 1; y < 14; y++) for (let x = 1; x < width - 1; x++) d.tiles[y * width + x] = y >= 4 && y <= 8 ? RT.ROAD : RT.GRASS
  if (fill) for (let y = 1; y < 14; y++) for (let x = 1; x < width - 1; x++) {
    const c = fill(x, y)
    if (c !== undefined) d.tiles[y * width + x] = c
  }
  return d
}
const carAt = (tx: number, ty: number, a = 0): Car => createCar({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, a })
function drive(car: Car, d: LevelDesign, frames: number, input: CarInput = GAS, feel: CarFeel = DEFAULT_CAR_FEEL, out?: CarEvent[]) {
  for (let i = 0; i < frames; i++) stepCar(car, input, d, feel, i, out)
}
const speed = (c: Car) => Math.hypot(c.vx, c.vy)

describe('race level format', () => {
  it('a race level round-trips with its kit, settings and race tile ids', () => {
    const d = brickSpeedway()
    d.race = { laps: 5, startDir: 3, finishDir: 2, items: false }
    const back = levelFromJson(JSON.parse(JSON.stringify(levelToJson(d))))
    expect(back.kit).toBe('race')
    expect(back.race).toEqual(d.race)
    expect(Array.from(back.tiles)).toEqual(Array.from(d.tiles))
    expect(Math.max(...back.tiles)).toBeGreaterThan(13) // ids a platformer could not store
  })

  it('platformer levels are saved exactly as before: no kit field, old saves still load', () => {
    const json = levelToJson(createBlankLevel(40, 20))
    expect('kit' in json).toBe(false)
    expect('race' in json).toBe(false)
    expect(levelFromJson(json).kit).toBeUndefined()
  })

  it('rejects unknown kits, bad settings and tiles from the other kit', () => {
    const json = levelToJson(brickSpeedway())
    expect(() => levelFromJson({ ...json, kit: 'boat' })).toThrow()
    expect(() => levelFromJson({ ...json, race: [0, 0, 0, 1] })).toThrow()
    expect(() => levelFromJson({ ...json, race: [3, 4, 0, 1] })).toThrow()
    // The same tiles read as a platformer use ids that do not exist there.
    expect(() => levelFromJson({ ...json, kit: undefined, race: undefined })).toThrow()
  })

  it('race levels never keep ? block contents', () => {
    const json = levelToJson(brickSpeedway())
    const contents = 'B' + 'A' + (72 * 44 - 1).toString(36)
    expect(levelFromJson({ ...json, contents }).contents.every((c) => c === 0)).toBe(true)
  })
})

describe('race edits and events', () => {
  const race = brickSpeedway()
  const w = race.width, h = race.height
  const edit = (ops: unknown[]) => ({ t: 'edit', ops })

  it('tile edits are checked against the level’s own kit', () => {
    expect(isValidEvent(edit([{ o: 'tile', x: 3, y: 3, t: RT.STAND, c: 0 }]), w, h, 'race')).toBe(true)
    expect(isValidEvent(edit([{ o: 'tile', x: 3, y: 3, t: RT.STAND, c: 0 }]), w, h, 'platformer')).toBe(false)
    expect(isValidEvent(edit([{ o: 'tile', x: 3, y: 3, t: 19, c: 0 }]), w, h, 'race')).toBe(false)
    expect(isValidEvent(edit([{ o: 'tile', x: 3, y: 3, t: RT.ROAD, c: 1 }]), w, h, 'race')).toBe(false)
  })

  it('platformer-only events are refused in a race, and race settings only exist there', () => {
    for (const ev of [{ t: 'stomp', id: 1, dir: 1 }, { t: 'bump', x: 1, y: 1, big: 0, dir: 1 }, { t: 'coin', x: 1, y: 1 }, { t: 'spark', x: 1, y: 1, dir: 1 }]) {
      expect(isValidEvent(ev, w, h, 'platformer')).toBe(true)
      expect(isValidEvent(ev, w, h, 'race')).toBe(false)
    }
    const op = { o: 'race', race: { laps: 4, startDir: 1, finishDir: 1, items: false } }
    expect(isValidEvent(edit([op]), w, h, 'race')).toBe(true)
    expect(isValidEvent(edit([op]), w, h, 'platformer')).toBe(false)
    expect(isValidEvent(edit([{ o: 'race', race: { ...op.race, laps: 10 } }]), w, h, 'race')).toBe(false)
  })

  it('the world and the saved design apply race edits the same way, and the fingerprint follows them', () => {
    const world = createWorld(race)
    const design = cloneLevel(race)
    const before = hashWorld(world)
    const ev: WorldEvent = { t: 'edit', ops: [{ o: 'tile', x: 10, y: 10, t: RT.ICE, c: 3 }, { o: 'race', race: { laps: 2, startDir: 2, finishDir: 2, items: false } }] }
    expect(applyEvent(world, ev, 1)).toBe(true)
    for (const op of ev.t === 'edit' ? ev.ops : []) editDesign(design, op)
    expect(Array.from(world.design.tiles)).toEqual(Array.from(design.tiles))
    expect(world.design.race).toEqual(design.race)
    expect(world.design.contents[10 * w + 10]).toBe(0)
    expect(hashWorld(world)).not.toBe(before)
    // And a snapshot of it restores exactly.
    advanceWorld(world)
    expect(hashWorld(deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(world)))))).toBe(hashWorld(world))
  })

  it('a race world ignores platformer events even if one slips through', () => {
    const world = createWorld(race)
    expect(applyEvent(world, { t: 'bump', x: 20, y: 37, big: 1, dir: 1 }, 1)).toBe(false)
    expect(applyEvent(world, { t: 'coin', x: 20, y: 37 }, 1)).toBe(false)
  })
})

describe('driving', () => {
  it('speeds up to top speed on road and no further', () => {
    const d = strip(120), car = carAt(3, 6)
    drive(car, d, 240)
    expect(speed(car)).toBeCloseTo(DEFAULT_CAR_FEEL.top, 5)
  })

  it('grass and dirt cap the speed to their share of it', () => {
    const grass = strip(120, (_x, y) => (y >= 4 && y <= 8 ? RT.GRASS : undefined))
    const dirt = strip(120, (_x, y) => (y >= 4 && y <= 8 ? RT.DIRT : undefined))
    const a = carAt(3, 6), b = carAt(3, 6)
    drive(a, grass, 240)
    drive(b, dirt, 240)
    expect(speed(a)).toBeCloseTo(DEFAULT_CAR_FEEL.top * DEFAULT_CAR_FEEL.grass, 5)
    expect(speed(b)).toBeCloseTo(DEFAULT_CAR_FEEL.top * DEFAULT_CAR_FEEL.dirt, 5)
  })

  it('a boost pad driven the arrow’s way goes past top speed, then eases back; against the arrow it does nothing', () => {
    const d = strip(120, (x, y) => (x === 30 && y >= 4 && y <= 8 ? RT.BOOST_R : x === 60 && y >= 4 && y <= 8 ? RT.BOOST_L : undefined))
    const car = carAt(3, 6), out: CarEvent[] = []
    let peak = 0
    for (let i = 0; i < 200; i++) {
      stepCar(car, GAS, d, DEFAULT_CAR_FEEL, i, out)
      peak = Math.max(peak, speed(car))
    }
    expect(out).toContain('boost')
    expect(peak).toBeGreaterThan(DEFAULT_CAR_FEEL.top * DEFAULT_CAR_FEEL.boostK * 0.95)
    expect(out.filter((e) => e === 'boost')).toHaveLength(1) // the left-pointing pad at x = 60 ignored us
    drive(car, d, 120)
    expect(speed(car)).toBeCloseTo(DEFAULT_CAR_FEEL.top, 5)
  })

  it('never tunnels through a barrier, even boosted', () => {
    const d = strip(60, (x, y) => (x === 40 ? RT.BARRIER : x === 20 && y >= 4 && y <= 8 ? RT.BOOST_R : undefined))
    const car = carAt(3, 6), out: CarEvent[] = []
    drive(car, d, 300, GAS, { ...DEFAULT_CAR_FEEL, top: 6, boostK: 2.5 }, out)
    expect(car.x).toBeLessThan(40 * TILE)
    expect(out).toContain('barrier')
    expect(solidUnder(d, car.x, car.y, CAR_RADIUS)).toBe(-1)
  })

  it('a bumper throws the car back harder than a barrier, and tire stacks hardly at all', () => {
    const hitSpeed = (c: number) => {
      const d = strip(60, (x) => (x === 30 ? c : undefined))
      const car = carAt(3, 6)
      let back = 0
      for (let i = 0; i < 400; i++) {
        stepCar(car, GAS, d, DEFAULT_CAR_FEEL, i)
        if (car.vx < 0) back = Math.max(back, -car.vx)
      }
      return back
    }
    expect(hitSpeed(RT.BUMPER)).toBeGreaterThan(hitSpeed(RT.BARRIER))
    expect(hitSpeed(RT.BARRIER)).toBeGreaterThan(hitSpeed(RT.TIRES))
  })

  it('ice slides: the same turn leaves far more sideways speed than on road', () => {
    const slide = (c: number) => {
      const d = strip(120, (_x, y) => (y >= 4 && y <= 8 ? c : undefined))
      const car = carAt(3, 6)
      drive(car, d, 120)
      let most = 0
      for (let i = 0; i < 20; i++) {
        stepCar(car, { steer: 1, gas: true, brake: false }, d, DEFAULT_CAR_FEEL, 120 + i)
        most = Math.max(most, car.slip)
      }
      return most
    }
    expect(slide(RT.ICE)).toBeGreaterThan(slide(RT.ROAD) * 3)
  })

  it('a jump ramp carries the car over water; driving into water drops it back before the ramp', () => {
    const gap = (x: number, y: number) => (y >= 4 && y <= 8 ? (x === 30 ? RT.RAMP : x >= 32 && x <= 34 ? RT.WATER : undefined) : undefined)
    const jumper = carAt(3, 6), out: CarEvent[] = []
    drive(jumper, strip(80, gap), 320, GAS, DEFAULT_CAR_FEEL, out)
    expect(out).toContain('jump')
    expect(out).not.toContain('splash')
    expect(jumper.x).toBeGreaterThan(40 * TILE)

    // Water with no ramp: splash, then back on the road before the water, facing the same way.
    const pond = strip(80, (x, y) => (y >= 4 && y <= 8 && x >= 32 && x <= 34 ? RT.WATER : undefined))
    const wet = carAt(3, 6), events: CarEvent[] = []
    for (let i = 0; i < 600 && !events.includes('respawn'); i++) stepCar(wet, GAS, pond, DEFAULT_CAR_FEEL, i, events)
    expect(events).toContain('splash')
    expect(events).toContain('respawn')
    expect(trackTileAt(pond, wet.x, wet.y)).toBe(RT.ROAD)
    expect(wet.x).toBeLessThan(32 * TILE)
    expect(wet.a).toBe(0)
  })

  it('the same inputs drive the same way every time', () => {
    const run = () => {
      const d = brickSpeedway(), loop = computeLoop(d), car = createCar(gridSpots(d, 1)[0]), lap = createLapState()
      for (let i = 0; i < 1500; i++) {
        stepCar(car, raceAutopilot(car, loop, d, lap.d), d, DEFAULT_CAR_FEEL, i)
        trackLaps(lap, loop, d, car.x, car.y, i, 3)
      }
      return [car.x, car.y, car.a, car.vx, car.vy, lap.d]
    }
    expect(run()).toEqual(run())
  })
})

describe('laps', () => {
  it('the starter track loops, and its loop is the length of the lap', () => {
    const loop = computeLoop(brickSpeedway())
    expect(loop.ok).toBe(true)
    if (loop.ok) expect(loop.length).toBeGreaterThan(150)
  })

  it('says why laps cannot count: no finish line, a road that does not loop, a finish line that misses part of the road', () => {
    const noFinish = brickSpeedway()
    for (let i = 0; i < noFinish.tiles.length; i++) if (noFinish.tiles[i] === RT.FINISH) noFinish.tiles[i] = RT.ROAD
    expect(computeLoop(noFinish)).toEqual({ ok: false, reason: 'no-finish' })

    const blocked = brickSpeedway()
    for (let y = 1; y < 22; y++) for (let x = 60; x < 71; x++) blocked.tiles[y * 72 + x] = RT.BARRIER
    expect(computeLoop(blocked)).toEqual({ ok: false, reason: 'no-loop' })

    const gap = brickSpeedway()
    gap.tiles[35 * 72 + 20] = RT.ROAD // one lane of the line missing: traffic leaks round its end
    expect(computeLoop(gap)).toEqual({ ok: false, reason: 'finish-gap' })
  })

  it('a computer driver goes round the starter track and finishes 3 laps', () => {
    const d = brickSpeedway(), loop = computeLoop(d)
    const car = createCar(gridSpots(d, 1)[0]), lap = createLapState()
    const results: string[] = []
    for (let i = 0; i < 60 * 120 && lap.done < 0; i++) {
      stepCar(car, raceAutopilot(car, loop, d, lap.d), d, DEFAULT_CAR_FEEL, i)
      const r = trackLaps(lap, loop, d, car.x, car.y, i, DEFAULT_RACE.laps)
      if (r) results.push(r)
    }
    expect(results).toEqual(['lap', 'lap', 'finish'])
    expect(lap.lapTimes).toHaveLength(3)
    // A lap of Brick Speedway takes the computer driver roughly 12 to 25 seconds.
    for (const t of lap.lapTimes.slice(1)) expect(t / 60).toBeGreaterThan(12)
    for (const t of lap.lapTimes.slice(1)) expect(t / 60).toBeLessThan(25)
  })

  it('crossing the line the wrong way, or back and forth, never counts', () => {
    const d = brickSpeedway(), loop = computeLoop(d) as Extract<RaceLoop, { ok: true }>
    const lap = createLapState()
    const y = 37.5 * TILE
    // Wiggle across the finish line (x = 20) twenty times.
    for (let i = 0; i < 40; i++) trackLaps(lap, loop, d, (i % 2 ? 21.5 : 19.5) * TILE, y, i, 3)
    expect(lap.lap).toBe(0)
  })

  it('standings: a car still behind the line at the start ranks behind one that crossed it', () => {
    const d = brickSpeedway(), loop = computeLoop(d)
    const behind: LapState = createLapState(), ahead: LapState = createLapState()
    trackLaps(behind, loop, d, 17.5 * TILE, 37.5 * TILE, 1, 3)
    trackLaps(ahead, loop, d, 23.5 * TILE, 37.5 * TILE, 1, 3)
    expect(raceProgress(ahead, loop)).toBeGreaterThan(raceProgress(behind, loop))
  })
})

describe('starting grid', () => {
  it('lines cars up behind the start, facing the grid’s direction, on the road', () => {
    const d = brickSpeedway()
    const spots = gridSpots(d, 4)
    for (const s of spots) {
      expect(s.a).toBe(0)
      expect(trackTileAt(d, s.x, s.y)).toBe(RT.ROAD)
      expect(s.x).toBeLessThanOrEqual(15.5 * TILE)
    }
    d.race = { ...DEFAULT_RACE, startDir: 1 }
    expect(gridSpots(d, 1)[0].a).toBeCloseTo(Math.PI / 2)
  })

  it('a blank race level is a fenced field with a start and default settings', () => {
    const d = createBlankRaceLevel()
    expect(d.kit).toBe('race')
    expect(d.race).toEqual(DEFAULT_RACE)
    expect(d.tiles[0]).toBe(RT.BARRIER)
    expect(d.tiles[5 * d.width + 5]).toBe(RT.GRASS)
    expect(d.objects.map((o) => o.kind)).toEqual(['start'])
    expect(T.EMPTY).toBe(RT.GRASS) // an untouched cell means "nothing here" in both kits
  })
})
