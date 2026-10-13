import { describe, expect, it } from 'vitest'
import { TICK_MS } from '../engine/constants'
import { isValidEvent } from '../engine/events'
import { advanceWorld, applyEvent, createWorld, deserializeWorld, hashWorld, resetWorld, serializeWorld } from '../engine/world'
import { createBlankLevel } from '../engine/level'
import { brickSpeedway } from '../levels/raceCourses'
import { PROTOCOL, isValidPose, type ServerMsg } from './protocol'
import { RACE_RESTART_TICKS, RoomCore, type RoomSocket } from './roomCore'

class FakeSocket implements RoomSocket {
  inbox: ServerMsg[] = []
  send(data: string) {
    this.inbox.push(JSON.parse(data))
  }
  close() {}
  last<T extends ServerMsg['type']>(type: T): Extract<ServerMsg, { type: T }> | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) if (this.inbox[i].type === type) return this.inbox[i] as Extract<ServerMsg, { type: T }>
    return undefined
  }
}

const HOST_KEY = 'host-secret'

function raceRoom() {
  let now = 1_000_000
  const core = new RoomCore('racetrack1', brickSpeedway(), { now: () => now, hostKey: HOST_KEY })
  let keys = 0
  const join = (name: string, host = false) => {
    const s = new FakeSocket()
    core.connect(s)
    core.message(s, JSON.stringify({ type: 'hello', v: PROTOCOL, name, key: `key${++keys}`, ...(host ? { host: HOST_KEY } : {}) }))
    return s
  }
  return { core, join, advance: (ms: number) => (now += ms), send: (s: FakeSocket, m: unknown) => core.message(s, JSON.stringify(m)) }
}

describe('race start in the shared world', () => {
  it('exists only on race tracks', () => {
    expect(isValidEvent({ t: 'race' }, 72, 44, 'race')).toBe(true)
    expect(isValidEvent({ t: 'race' }, 72, 44, 'platformer')).toBe(false)
    const platformer = createWorld(createBlankLevel(40, 20))
    expect(applyEvent(platformer, { t: 'race' }, 1)).toBe(false)
    expect(platformer.raceAt).toBe(-1)
  })

  it('records the tick everyone’s countdown starts from; the fingerprint and snapshots follow it', () => {
    const w = createWorld(brickSpeedway())
    for (let i = 0; i < 10; i++) advanceWorld(w)
    const before = hashWorld(w)
    advanceWorld(w, [{ ev: { t: 'race' }, by: 2 }])
    expect(w.raceAt).toBe(11)
    expect(hashWorld(w)).not.toBe(before)
    const copy = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))))
    expect(copy.raceAt).toBe(11)
    expect(hashWorld(copy)).toBe(hashWorld(w))
    resetWorld(w)
    expect(w.raceAt).toBe(-1)
  })

  it('platformer snapshots and fingerprints are unchanged', () => {
    const w = createWorld(createBlankLevel(40, 20))
    expect('ra' in serializeWorld(w)).toBe(false)
  })

  it('refuses a snapshot whose race start is in the future or on a platformer', () => {
    const w = createWorld(brickSpeedway())
    advanceWorld(w)
    const j = serializeWorld(w)
    expect(() => deserializeWorld({ ...j, ra: j.tick + 5 })).toThrow()
    const p = serializeWorld(createWorld(createBlankLevel(40, 20)))
    expect(() => deserializeWorld({ ...p, ra: 0 })).toThrow()
  })
})

describe('race poses', () => {
  const base = { m: 0, x: 100, y: 200, f: 1, a: 'stand', s: 0, v: 1, q: 0, t: 5 }
  it('carry heading, jump height, laps, distance, gates, race and finish time within range', () => {
    expect(isValidPose({ ...base, hd: 64, lf: 200, rl: 2, rp: 140, rg: 6, ra: 300, rf: 2400 })).toBe(true)
    expect(isValidPose({ ...base, ra: -1 })).toBe(true)
    for (const bad of [{ hd: 256 }, { lf: -1 }, { rl: 10 }, { rp: 70000 }, { rg: 16 }, { ra: -2 }, { rf: -1 }, { hd: 1.5 }]) expect(isValidPose({ ...base, ...bad })).toBe(false)
  })

  it('the room passes race fields on, and nothing else', () => {
    const r = raceRoom()
    const a = r.join('A')
    r.join('B')
    r.send(a, { type: 'pose', p: { ...base, hd: 64, lf: 0, rl: 1, rp: 90, rg: 2, ra: 120, rf: 3000, sneaky: 1 } })
    r.core.flushPoses()
    expect(a.last('poses')?.list).toEqual([[1, { ...base, hd: 64, lf: 0, rl: 1, rp: 90, rg: 2, ra: 120, rf: 3000 }]])
  })
})

describe('starting races in a room', () => {
  it('anyone can start the first race; after that only the host may restart until the last one has had time to run', () => {
    const r = raceRoom()
    const host = r.join('Teacher', true)
    const kid = r.join('Kid')
    r.advance(100 * TICK_MS)
    r.send(kid, { type: 'ev', cid: 'k:1', tick: r.core.serverTick(), ev: { t: 'race' } })
    expect(host.last('ev')?.e.cid).toBe('k:1')
    r.advance(30_000)
    r.send(kid, { type: 'ev', cid: 'k:2', tick: r.core.serverTick(), ev: { t: 'race' } })
    expect(kid.last('reject')).toMatchObject({ cid: 'k:2', reason: 'race_busy' })
    r.send(host, { type: 'ev', cid: 't:1', tick: r.core.serverTick(), ev: { t: 'race' } })
    expect(kid.last('ev')?.e.cid).toBe('t:1')
    r.advance(RACE_RESTART_TICKS * TICK_MS + 1000)
    r.send(kid, { type: 'ev', cid: 'k:3', tick: r.core.serverTick(), ev: { t: 'race' } })
    expect(host.last('ev')?.e.cid).toBe('k:3')
  })

  it('platformer events are refused on a race track', () => {
    const r = raceRoom()
    const a = r.join('A')
    r.send(a, { type: 'ev', cid: 'a:1', tick: 5, ev: { t: 'bump', x: 20, y: 37, big: 1, dir: 1 } })
    expect(a.last('reject')).toMatchObject({ cid: 'a:1', reason: 'invalid' })
  })
})
