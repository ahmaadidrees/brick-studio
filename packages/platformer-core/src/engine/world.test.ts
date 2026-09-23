import { describe, it, expect } from 'vitest'
import { demoLevel } from '../levels/demo'
import { isValidEvent, type WorldEvent } from './events'
import { createBlankLevel, levelFromJson, levelToJson } from './level'
import { T } from './tiles'
import {
  EK,
  advanceWorld,
  createWorld,
  deserializeWorld,
  hashWorld,
  restoreWorld,
  serializeWorld,
  snapshotWorld,
  type AppliedEvent,
  type World,
} from './world'

/** Small deterministic PRNG for generating test event streams. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A plausible stream of events a room full of players might produce. */
function randomEvents(seed: number, world: World, ticks: number): Map<number, AppliedEvent[]> {
  const rnd = mulberry32(seed)
  const out = new Map<number, AppliedEvent[]>()
  for (let t = 1; t <= ticks; t++) {
    if (rnd() > 0.15) continue
    const list: AppliedEvent[] = []
    const n = 1 + Math.floor(rnd() * 3)
    for (let k = 0; k < n; k++) {
      const by = 1 + Math.floor(rnd() * 4)
      const x = Math.floor(rnd() * world.width)
      const y = Math.floor(rnd() * world.height)
      const id = 1 + Math.floor(rnd() * 40)
      const r = rnd()
      let ev: WorldEvent
      if (r < 0.2) ev = { t: 'bump', x, y, big: rnd() < 0.5 ? 1 : 0, dir: rnd() < 0.5 ? 1 : -1 }
      else if (r < 0.35) ev = { t: 'stomp', id, dir: 1 }
      else if (r < 0.45) ev = { t: 'kick', id, dir: -1 }
      else if (r < 0.55) ev = { t: 'coin', x, y }
      else if (r < 0.6) ev = { t: 'take', id }
      else if (r < 0.7) ev = { t: 'spark', x: x * 4096, y: y * 4096, dir: 1 }
      else if (r < 0.95) ev = { t: 'edit', ops: [{ o: 'tile', x, y, t: Math.floor(rnd() * 14), c: Math.floor(rnd() * 4) }] }
      else ev = { t: 'reset' }
      list.push({ ev, by })
    }
    out.set(t, list)
  }
  return out
}

describe('determinism', () => {
  it('two worlds fed the same events stay identical', () => {
    const a = createWorld(demoLevel())
    const b = createWorld(demoLevel())
    const events = randomEvents(7, a, 1200)
    for (let t = 1; t <= 1200; t++) {
      advanceWorld(a, events.get(t) ?? [])
      advanceWorld(b, events.get(t) ?? [])
      if (t % 100 === 0) expect(hashWorld(a)).toBe(hashWorld(b))
    }
    expect(hashWorld(a)).toBe(hashWorld(b))
  })

  it('rolling back and replaying a late event gives the same world as applying it on time', () => {
    const onTime = createWorld(demoLevel())
    const late = createWorld(demoLevel())
    const events = randomEvents(11, onTime, 400)
    const lateEvent: AppliedEvent = { ev: { t: 'bump', x: 21, y: 16, big: 1, dir: 1 }, by: 2 }
    const snapshots = new Map<number, World>()
    let live = late
    for (let t = 1; t <= 400; t++) {
      const now = events.get(t) ?? []
      advanceWorld(onTime, t === 250 ? [...now, lateEvent] : now)
      advanceWorld(live, now)
      snapshots.set(live.tick, snapshotWorld(live))
    }
    // The bump arrives late: rewind to tick 249 and replay with it.
    live = restoreWorld(snapshots.get(249)!)
    for (let t = 250; t <= 400; t++) {
      const now = events.get(t) ?? []
      advanceWorld(live, t === 250 ? [...now, lateEvent] : now)
    }
    expect(hashWorld(live)).toBe(hashWorld(onTime))
  })

  it('snapshots are not changed by later writes to the live world', () => {
    const w = createWorld(demoLevel())
    for (let t = 0; t < 30; t++) advanceWorld(w)
    const snap = snapshotWorld(w)
    const before = hashWorld(snap)
    advanceWorld(w, [
      { ev: { t: 'edit', ops: [{ o: 'tile', x: 5, y: 5, t: T.BRICK, c: 0 }] }, by: 1 },
      { ev: { t: 'coin', x: 22, y: 12 }, by: 1 },
      { ev: { t: 'reset' }, by: 1 },
    ])
    for (let t = 0; t < 30; t++) advanceWorld(w)
    expect(hashWorld(snap)).toBe(before)
    expect(snap.design.tiles[5 * snap.width + 5]).toBe(T.EMPTY)
  })

  it('serialises and restores exactly', () => {
    const w = createWorld(demoLevel())
    const events = randomEvents(3, w, 300)
    for (let t = 1; t <= 300; t++) advanceWorld(w, events.get(t) ?? [])
    const copy = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))))
    expect(hashWorld(copy)).toBe(hashWorld(w))
    for (let t = 0; t < 200; t++) {
      advanceWorld(w)
      advanceWorld(copy)
    }
    expect(hashWorld(copy)).toBe(hashWorld(w))
  })
})

describe('world rules', () => {
  it('defeated enemies come back after 8 seconds', () => {
    const w = createWorld(demoLevel())
    const walker = w.entities.find((e) => e.kind === EK.WALKER)!
    const spawn = walker.spawn
    advanceWorld(w, [{ ev: { t: 'stomp', id: walker.id, dir: 1 }, by: 1 }])
    for (let t = 0; t < 40; t++) advanceWorld(w)
    expect(w.entities.some((e) => e.spawn === spawn)).toBe(false)
    for (let t = 0; t < 8 * 60; t++) advanceWorld(w)
    expect(w.entities.some((e) => e.spawn === spawn)).toBe(true)
  })

  it('an edit that removes an object removes its enemy for good', () => {
    const w = createWorld(demoLevel())
    const walker = w.entities.find((e) => e.kind === EK.WALKER)!
    advanceWorld(w, [{ ev: { t: 'edit', ops: [{ o: 'del', id: walker.spawn }] }, by: 1 }])
    for (let t = 0; t < 9 * 60; t++) advanceWorld(w)
    expect(w.entities.some((e) => e.spawn === walker.spawn)).toBe(false)
  })

  it('reset brings back coins and blocks', () => {
    const w = createWorld(demoLevel())
    const i = 12 * w.width + 22
    expect(w.tiles[i]).toBe(T.COIN)
    advanceWorld(w, [{ ev: { t: 'coin', x: 22, y: 12 }, by: 1 }])
    expect(w.tiles[i]).toBe(T.EMPTY)
    advanceWorld(w, [{ ev: { t: 'reset' }, by: 1 }])
    expect(w.tiles[i]).toBe(T.COIN)
  })
})

describe('level format', () => {
  it('the demo level is well formed', () => {
    const d = demoLevel()
    expect(d.width).toBe(216)
    expect(d.height).toBe(22)
    expect(d.objects.filter((o) => o.kind === 'start')).toHaveLength(1)
    expect(d.objects.filter((o) => o.kind === 'goal')).toHaveLength(1)
  })

  it('round-trips through JSON', () => {
    const d = demoLevel()
    const back = levelFromJson(JSON.parse(JSON.stringify(levelToJson(d))))
    expect(createWorld(back) && hashWorld(createWorld(back))).toBe(hashWorld(createWorld(d)))
  })

  it('rejects malformed levels', () => {
    const j = levelToJson(demoLevel())
    expect(() => levelFromJson({ ...j, w: 5000 })).toThrow()
    expect(() => levelFromJson({ ...j, tiles: 'Z' })).toThrow()
    expect(() => levelFromJson({ ...j, objects: [[1, 99, 0, 0, 1, 0]] })).toThrow()
  })

  it('keeps the look: new levels are cartoon, levels saved before looks existed are pixel', () => {
    expect(createBlankLevel(40, 20).style).toBe('cartoon')
    const j = levelToJson(createBlankLevel(40, 20))
    expect(j.style).toBe('cartoon')
    expect(levelFromJson(JSON.parse(JSON.stringify(j))).style).toBe('cartoon')
    const { style: _dropped, ...old } = j
    expect(levelFromJson(old).style).toBe('pixel')
    expect(levelFromJson({ ...j, style: 'watercolor' }).style).toBe('pixel')
  })
})

describe('looks', () => {
  it('an edit changes the look, and the fingerprint follows it', () => {
    const w = createWorld(createBlankLevel(40, 20))
    const before = hashWorld(w)
    const ev: WorldEvent = { t: 'edit', ops: [{ o: 'style', style: 'pixel' }] }
    expect(isValidEvent(ev, w.width, w.height)).toBe(true)
    advanceWorld(w, [{ ev, by: 1 }])
    expect(w.design.style).toBe('pixel')
    expect(hashWorld(w)).not.toBe(before)
  })

  it('rejects looks that do not exist', () => {
    expect(isValidEvent({ t: 'edit', ops: [{ o: 'style', style: 'watercolor' }] }, 40, 20)).toBe(false)
  })
})
