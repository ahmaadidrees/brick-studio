import { describe, it, expect } from 'vitest'
import { demoLevel } from '../levels/demo'
import type { WorldEvent } from '../engine/events'
import { createWorld, hashWorld } from '../engine/world'
import { Timeline, type EventRecord } from './timeline'

/**
 * Three simulated players each run their own Timeline. A fake server orders every event and
 * delivers it to each player after a random delay. Whatever the delays, once everything has
 * arrived all three worlds must be identical to a reference that saw every event on time.
 */

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomEvent(rnd: () => number): WorldEvent {
  const r = rnd()
  const x = Math.floor(rnd() * 216)
  const y = Math.floor(rnd() * 22)
  if (r < 0.3) return { t: 'bump', x, y, big: rnd() < 0.5 ? 1 : 0, dir: 1 }
  if (r < 0.5) return { t: 'stomp', id: 1 + Math.floor(rnd() * 30), dir: -1 }
  if (r < 0.6) return { t: 'coin', x, y }
  if (r < 0.8) return { t: 'edit', ops: [{ o: 'tile', x, y, t: Math.floor(rnd() * 14), c: 0 }] }
  return { t: 'kick', id: 1 + Math.floor(rnd() * 30), dir: 1 }
}

describe('Timeline', () => {
  it('converges with late, out-of-order delivery', () => {
    const rnd = mulberry32(42)
    const TICKS = 900
    const players = [1, 2, 3].map(() => new Timeline(createWorld(demoLevel()), () => {}))
    const reference = new Timeline(createWorld(demoLevel()), () => {})
    let seq = 0
    // Deliveries waiting in the "network": [deliverAtTick, playerIndex, record]
    const inflight: [number, number, EventRecord][] = []
    for (let now = 1; now <= TICKS + 60; now++) {
      // Each player sometimes creates an event for the next tick and applies it locally.
      if (now <= TICKS) {
        players.forEach((tl, i) => {
          if (rnd() > 0.08) return
          const rec: EventRecord = { tick: now + 1, seq: null, by: i + 1, ev: randomEvent(rnd), cid: `${i}:${now}` }
          tl.addLocal({ ...rec })
          // Server receives it a bit later, orders it, and sends the confirmation to everyone.
          const s = ++seq
          const confirmed = { ...rec, seq: s }
          reference.addRemote({ ...confirmed })
          players.forEach((_, j) => inflight.push([now + 1 + Math.floor(rnd() * 12), j, { ...confirmed }]))
        })
      }
      for (let k = inflight.length - 1; k >= 0; k--) {
        const [at, j, rec] = inflight[k]
        if (at > now) continue
        inflight.splice(k, 1)
        if (rec.by === j + 1) players[j].confirm(rec.cid, rec.tick, rec.seq!)
        else players[j].addRemote({ ...rec })
      }
      for (const tl of players) tl.advanceTo(now)
      reference.advanceTo(now)
    }
    const want = hashWorld(reference.world)
    for (const tl of players) expect(hashWorld(tl.world)).toBe(want)
    expect(players.some((p) => p.rollbacks > 0)).toBe(true)
  })

  it('does not rewind when an own event is confirmed unchanged', () => {
    const tl = new Timeline(createWorld(demoLevel()), () => {})
    tl.advanceTo(10)
    tl.addLocal({ tick: 11, seq: null, by: 1, ev: { t: 'coin', x: 22, y: 12 }, cid: 'a' })
    tl.advanceTo(12)
    tl.confirm('a', 11, 1)
    tl.advanceTo(13)
    expect(tl.rollbacks).toBe(0)
  })

  it('undoes a rejected event', () => {
    const effects: string[] = []
    const tl = new Timeline(createWorld(demoLevel()), (fx) => fx.forEach((f) => effects.push(f.k)))
    tl.advanceTo(10)
    const before = tl.world.tiles[12 * tl.world.width + 22]
    tl.addLocal({ tick: 11, seq: null, by: 1, ev: { t: 'coin', x: 22, y: 12 }, cid: 'a' })
    tl.advanceTo(12)
    expect(tl.world.tiles[12 * tl.world.width + 22]).not.toBe(before)
    tl.reject('a')
    tl.advanceTo(13)
    expect(tl.world.tiles[12 * tl.world.width + 22]).toBe(before)
  })
})
