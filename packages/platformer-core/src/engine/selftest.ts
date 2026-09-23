import { demoLevel } from '../levels/demo'
import { Timeline, type EventRecord } from '../net/timeline'
import type { WorldEvent } from './events'
import { advanceWorld, createWorld, hashWorld, type AppliedEvent } from './world'

/*
 * A fixed scenario whose final world fingerprint is known. Every JavaScript engine that runs it
 * must produce exactly REFERENCE_HASH; if Safari's engine and Chrome's disagree, mixed rooms of
 * iPads and Chromebooks would drift apart. Used by the Node tests and the in-browser self-test.
 */

export const SCENARIO_TICKS = 3000

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function runReferenceScenario(): number {
  const w = createWorld(demoLevel())
  const rnd = lcg(20260923)
  for (let t = 1; t <= SCENARIO_TICKS; t++) {
    const events: AppliedEvent[] = []
    if (rnd() < 0.2) {
      const x = Math.floor(rnd() * w.width)
      const y = Math.floor(rnd() * w.height)
      const r = rnd()
      const ents = w.entities
      let ev: WorldEvent
      if (r < 0.25) ev = { t: 'bump', x, y, big: rnd() < 0.5 ? 1 : 0, dir: rnd() < 0.5 ? 1 : -1 }
      else if (r < 0.4 && ents.length) ev = { t: 'stomp', id: ents[Math.floor(rnd() * ents.length)].id, dir: 1 }
      else if (r < 0.5 && ents.length) ev = { t: 'kick', id: ents[Math.floor(rnd() * ents.length)].id, dir: -1 }
      else if (r < 0.6) ev = { t: 'coin', x, y }
      else if (r < 0.7) ev = { t: 'spark', x: x * 4096, y: y * 4096, dir: 1 }
      else if (r < 0.97) ev = { t: 'edit', ops: [{ o: 'tile', x, y, t: Math.floor(rnd() * 14), c: Math.floor(rnd() * 4) }] }
      else ev = { t: 'reset' }
      events.push({ ev, by: 1 + Math.floor(rnd() * 4) })
    }
    advanceWorld(w, events)
  }
  return hashWorld(w)
}

/** The fingerprint the scenario must produce in every engine (computed in Node / V8). */
export const REFERENCE_HASH = 449399357

/**
 * Three players' timelines receive the same events after different random delays and rewind to
 * absorb them. Returns every player's final fingerprint; all must equal ROLLBACK_HASH.
 */
export function runRollbackScenario(): number[] {
  const rnd = lcg(42)
  const TICKS = 900
  const players = [0, 1, 2].map(() => new Timeline(createWorld(demoLevel()), () => {}))
  let seq = 0
  const inflight: [number, number, EventRecord][] = []
  for (let now = 1; now <= TICKS + 60; now++) {
    if (now <= TICKS) {
      players.forEach((tl, i) => {
        if (rnd() > 0.08) return
        const x = Math.floor(rnd() * 216)
        const y = Math.floor(rnd() * 22)
        const ev: WorldEvent = rnd() < 0.5 ? { t: 'bump', x, y, big: 1, dir: 1 } : { t: 'edit', ops: [{ o: 'tile', x, y, t: Math.floor(rnd() * 14), c: 0 }] }
        const rec: EventRecord = { tick: now + 1, seq: null, by: i + 1, ev, cid: `${i}:${now}` }
        tl.addLocal({ ...rec })
        const confirmed = { ...rec, seq: ++seq }
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
  }
  return players.map((tl) => hashWorld(tl.world))
}

export const ROLLBACK_HASH = 3987168231
