import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { designText } from '../core/save'
import { playerHero } from '../core/players'
import { worldFingerprint } from '../core/snapshot'
import { createStarterProject } from '../studio/starter'
import { createRaceStarterProject } from '../studio/race/raceProject'
import { TICK_MS } from '../core/contracts'
import type { LinkSocket } from './link'
import { HASH_EVERY, KEYFRAME_EVERY, RECONNECT_GRACE_MS, type ServerMsg } from './protocol'
import { HackableRoomCore, checkProject, type RoomSocket } from './roomCore'
import { RoomSession } from './session'
import { designOfText } from './game'

/**
 * Hackable rooms M1 (docs/qa/hackable-rooms): the room logic and players' sessions, in one process. Each player's
 * messages reach the room after `lag` ms and the room's reach them after `lag` ms, on fake timers, so the games really
 * do get each other's keys late and go back for them.
 */

let now = 0
const clock = () => now

class Net {
  room: HackableRoomCore
  lag: number
  queue: { at: number; fn: () => void }[] = []
  constructor(room: HackableRoomCore, lag = 60) {
    this.room = room
    this.lag = lag
  }
  later(fn: () => void, lag = this.lag) {
    this.queue.push({ at: now + lag, fn })
  }
  /** A socket for a session: open at once, every message delayed both ways. */
  socket = (): LinkSocket => {
    const net = this
    const server: RoomSocket = {
      send: (data) => net.later(() => client.onmessage?.({ data })),
      close: () => net.later(() => { client.readyState = 3; client.onclose?.() }),
    }
    const client = {
      readyState: 1,
      onopen: null as (() => void) | null,
      onmessage: null as ((e: { data: unknown }) => void) | null,
      onclose: null as (() => void) | null,
      send: (data: string) => net.later(() => net.room.message(server, data)),
      close: () => {
        client.readyState = 3
        net.later(() => net.room.disconnect(server), 0)
      },
    }
    this.room.connect(server)
    queueMicrotask(() => client.onopen?.())
    return client
  }
  /** Run time forward in `step` ms steps (1 by default), delivering messages and playing every session's frames. */
  async run(ms: number, sessions: RoomSession[], step = 1) {
    const end = now + ms
    while (now < end) {
      now += step
      await Promise.resolve()
      const due = this.queue.filter((m) => m.at <= now)
      this.queue = this.queue.filter((m) => m.at > now)
      for (const m of due) m.fn()
      if (now % 16 < step) for (const s of sessions) s.frame(now)
    }
  }
}

function join(net: Net, name: string, host = false, key?: string) {
  const s = new RoomSession({ name, url: 'test://room', socket: net.socket, now: clock, ...(host ? { hostKey: 'HOST' } : {}), ...(key ? { key } : {}) })
  s.connect()
  return s
}

/** Each session's fingerprint of the game as tick `t` was about to run. */
const printsAt = (sessions: RoomSession[], t: number) => sessions.map((s) => {
  const snap = s.timeline!.snapshotAt(t)
  return snap ? worldFingerprint(snap) : null
})

beforeEach(() => {
  now = 1_000_000
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('a Hackable room (docs/qa/hackable-rooms M1)', () => {
  it('the room only takes projects it can read', () => {
    const text = designText(createStarterProject().design)
    expect(checkProject(text)).toEqual({ ok: true, kit: 'platformer' })
    expect(checkProject(designText(createRaceStarterProject().design), 'platformer')).toEqual({ ok: false, reason: 'invalid' })
    expect(checkProject('{"design":{}}').ok).toBe(false)
    expect(checkProject('x'.repeat(2_000_000))).toEqual({ ok: false, reason: 'too_big' })
  })

  it('two players see the same game: both Heroes, both sets of keys', async () => {
    const room = new HackableRoomCore('r1', designText(createStarterProject().design), { now: clock, hostKey: 'HOST' })
    const net = new Net(room, 50)
    const maya = join(net, 'Maya', true)
    await net.run(200, [maya])
    const sam = join(net, 'Sam')
    const all = [maya, sam]
    await net.run(500, all)
    expect(maya.view.players.map((p) => p.name)).toEqual(['Maya', 'Sam'])
    // The host hears who joined, and how to start everyone together (a race's late Car missed its "go").
    expect(maya.view.notice).toBe('Sam joined. Press Restart to start everyone together.')
    expect(sam.view.notice).toBeNull()

    maya.key('right arrow', true)
    sam.key('left arrow', true)
    await net.run(700, all)
    maya.key('space', true)
    await net.run(200, all)
    maya.key('space', false)
    sam.key('left arrow', false)
    await net.run(1500, all)

    // Both games have both Heroes, and they went opposite ways.
    for (const s of all) {
      const w = s.runtime!.world
      expect(playerHero(w, 1)).toBeDefined()
      expect(playerHero(w, 2)).toBeDefined()
    }
    const tick = Math.min(maya.timeline!.tick, sam.timeline!.tick) - 40
    const t = tick - (tick % 4)
    const [a, b] = printsAt(all, t)
    expect(a).not.toBeNull()
    expect(a).toBe(b)
    expect(sam.stats.rewinds + maya.stats.rewinds).toBeGreaterThan(0)
    // Fingerprints went to the room and agreed: nobody needed a fresh copy.
    expect(maya.stats.hashes).toBeGreaterThan(0)
    expect(room.stats.resyncs).toBe(0)
  })

  it('the host edits the project live, and Play again restarts everyone from it', async () => {
    const design = createStarterProject().design
    const room = new HackableRoomCore('r2', designText(design), { now: clock, hostKey: 'HOST' })
    const net = new Net(room, 40)
    const maya = join(net, 'Maya', true)
    const sam = join(net, 'Sam')
    const all = [maya, sam]
    await net.run(600, all)

    // Sam is not the host: his edits are refused.
    expect(sam.sendProject(designText(design), true)).toBe(false)

    // A copy through the save format (structuredClone in the test DOM makes masks from another realm).
    const edited = designOfText(designText(design))
    edited.name = 'Edited level'
    const coin = edited.bricks.find((b) => b.id === 'brick_coin')!
    coin.name = 'Big Coin'
    expect(maya.sendProject(designText(edited), false)).toBe(true)
    await net.run(400, all)
    for (const s of all) {
      expect(s.runtime!.world.bricks.brick_coin.name).toBe('Big Coin')
      expect(s.runtime!.world.design?.name).toBe('Edited level')
    }
    expect(room.project).toContain('Big Coin')

    const before = sam.runtime
    expect(maya.restart()).toBe(true)
    await net.run(400, all)
    expect(sam.runtime).not.toBe(before)
    for (const s of all) {
      expect(s.runtime!.world.players?.map((p) => p.num)).toEqual([1, 2])
      expect(playerHero(s.runtime!.world, 2)).toBeDefined()
    }
    const tick = Math.min(maya.timeline!.tick, sam.timeline!.tick) - 40
    const t = tick - (tick % 4)
    const [a, b] = printsAt(all, t)
    expect(a).toBe(b)
  })

  it('a player joining late starts from the provider’s keyframe and plays the same game', async () => {
    const room = new HackableRoomCore('r3', designText(createStarterProject().design), { now: clock, hostKey: 'HOST' })
    const net = new Net(room, 30)
    const maya = join(net, 'Maya', true)
    await net.run(300, [maya])
    maya.key('right arrow', true)
    // Past a keyframe: KEYFRAME_EVERY ticks, plus the time for it to settle.
    await net.run((KEYFRAME_EVERY + 60) * TICK_MS, [maya])
    expect(maya.stats.keyframes).toBeGreaterThan(0)
    expect(room.stats.keyframes).toBeGreaterThan(0)

    const lee = join(net, 'Lee')
    const all = [maya, lee]
    await net.run(1500, all)
    maya.key('right arrow', false)
    lee.key('space', true)
    await net.run(1200, all)

    const tick = Math.min(maya.timeline!.tick, lee.timeline!.tick) - 40
    const t = tick - (tick % 4)
    const [a, b] = printsAt(all, t)
    expect(a).not.toBeNull()
    expect(a).toBe(b)
    expect(playerHero(lee.runtime!.world, 2)).toBeDefined()
    expect(room.stats.resyncs).toBe(0)
  })

  it('a game out of step gets a fresh copy from the room and agrees again', async () => {
    const room = new HackableRoomCore('r4', designText(createStarterProject().design), { now: clock, hostKey: 'HOST' })
    const net = new Net(room, 30)
    const maya = join(net, 'Maya', true)
    const sam = join(net, 'Sam')
    const all = [maya, sam]
    await net.run(800, all)
    // Something nudges Sam's game (a bug, a cosmic ray): the next fingerprint disagrees.
    const hero = playerHero(sam.runtime!.world, 2)!
    hero.x += 7
    await net.run((HASH_EVERY * 3) * TICK_MS, all)
    expect(room.stats.resyncs).toBeGreaterThan(0)
    expect(sam.stats.resyncs).toBeGreaterThan(0)
    await net.run((HASH_EVERY * 2) * TICK_MS, all)
    const tick = Math.min(maya.timeline!.tick, sam.timeline!.tick) - 40
    const t = tick - (tick % 4)
    const [a, b] = printsAt(all, t)
    expect(a).toBe(b)
  })

  it('a player leaving takes their Hero with them, for everyone, once they are not back in time', async () => {
    const room = new HackableRoomCore('r5', designText(createRaceStarterProject().design), { now: clock, hostKey: 'HOST' })
    const net = new Net(room, 30)
    const maya = join(net, 'Maya', true)
    const sam = join(net, 'Sam')
    await net.run(600, [maya, sam])
    expect(playerHero(maya.runtime!.world, 2)).toBeDefined()
    sam.close()
    await net.run(600, [maya])
    // Sam may only have dropped: his Car waits, and the host sees he is away.
    expect(playerHero(maya.runtime!.world, 2)).toBeDefined()
    expect(maya.view.players.map((p) => [p.name, !!p.away])).toEqual([['Maya', false], ['Sam', true]])
    await net.run(RECONNECT_GRACE_MS, [maya], 16)
    expect(playerHero(maya.runtime!.world, 2)).toBeUndefined()
    expect(maya.view.players.map((p) => p.name)).toEqual(['Maya'])
  })

  it('a player who drops and comes back in time keeps their Hero where it was, the same in every game', async () => {
    const room = new HackableRoomCore('r7', designText(createStarterProject().design), { now: clock, hostKey: 'HOST' })
    const net = new Net(room, 40)
    const maya = join(net, 'Maya', true)
    let sam = join(net, 'Sam', false, 'sams-browser')
    await net.run(600, [maya, sam])
    sam.key('right arrow', true)
    await net.run(800, [maya, sam])
    sam.close()
    await net.run(600, [maya])
    // The room let go of Sam's key: his Hero stopped where it was.
    const stopped = playerHero(maya.runtime!.world, 2)!.x
    await net.run(1000, [maya])
    expect(playerHero(maya.runtime!.world, 2)!.x).toBe(stopped)
    expect(maya.view.players.find((p) => p.num === 2)?.away).toBe(true)

    maya.clearNotice()
    // Back (a reload, the same browser): the same player number, so the same Hero, still there.
    sam = join(net, 'Sam', false, 'sams-browser')
    const all = [maya, sam]
    await net.run(800, all)
    expect(sam.view.me).toBe(2)
    expect(maya.view.players.map((p) => [p.num, !!p.away])).toEqual([[1, false], [2, false]])
    expect(maya.view.notice ?? '').not.toMatch(/joined/)
    for (const s of all) {
      expect(s.runtime!.world.players?.map((p) => p.num)).toEqual([1, 2])
      expect(playerHero(s.runtime!.world, 2)!.x).toBe(stopped)
    }
    sam.key('left arrow', true)
    await net.run(1000, all)
    sam.key('left arrow', false)
    await net.run(1500, all)
    expect(playerHero(sam.runtime!.world, 2)!.x).toBeLessThan(stopped)
    const tick = Math.min(maya.timeline!.tick, sam.timeline!.tick) - 40
    const t = tick - (tick % 4)
    const [a, b] = printsAt(all, t)
    expect(a).not.toBeNull()
    expect(a).toBe(b)
    // The grace time passing changes nothing for someone who came back.
    await net.run(RECONNECT_GRACE_MS, all, 16)
    expect(playerHero(maya.runtime!.world, 2)).toBeDefined()
    expect(room.stats.resyncs).toBe(0)
  })

  it('the host can remove a player who dropped, and close the room to newcomers', () => {
    const room = new HackableRoomCore('r8', designText(createStarterProject().design), { now: clock, hostKey: 'HOST' })
    const inbox = (sent: ServerMsg[]): RoomSocket => ({ send: (d) => sent.push(JSON.parse(d) as ServerMsg), close: () => {} })
    const hostSent: ServerMsg[] = []
    const host = inbox(hostSent)
    room.connect(host)
    room.message(host, JSON.stringify({ type: 'hello', v: 1, name: 'Maya', key: 'm', host: 'HOST' }))
    const sam = inbox([])
    room.connect(sam)
    room.message(sam, JSON.stringify({ type: 'hello', v: 1, name: 'Sam', key: 's' }))
    room.disconnect(sam)
    expect(room.players().map((p) => [p.name, !!p.away])).toEqual([['Maya', false], ['Sam', true]])
    room.message(host, JSON.stringify({ type: 'kick', num: 2 }))
    expect(room.players().map((p) => p.name)).toEqual(['Maya'])
    const leaves = hostSent.filter((m) => m.type === 'ev' && m.e.ev.t === 'leave')
    expect(leaves).toHaveLength(1)
    // Removed: Sam can't come back.
    const again: ServerMsg[] = []
    const back = inbox(again)
    room.connect(back)
    room.message(back, JSON.stringify({ type: 'hello', v: 1, name: 'Sam', key: 's' }))
    expect(again[0]).toMatchObject({ type: 'error', code: 'kicked' })
    // Closed: a newcomer is turned away, but the host's Restart still works.
    room.message(host, JSON.stringify({ type: 'settings', closed: true }))
    expect(room.info().closed).toBe(true)
    const late: ServerMsg[] = []
    const lee = inbox(late)
    room.connect(lee)
    room.message(lee, JSON.stringify({ type: 'hello', v: 1, name: 'Lee', key: 'l' }))
    expect(late[0]).toMatchObject({ type: 'error', code: 'closed' })
    room.message(host, JSON.stringify({ type: 'unban' }))
    expect(hostSent.filter((m) => m.type === 'settings').at(-1)).toMatchObject({ banned: 0, settings: { closed: true } })
  })

  it('refuses events the room does not order, and edits from someone who is not the host', () => {
    const room = new HackableRoomCore('r6', designText(createStarterProject().design), { now: clock })
    const sent: ServerMsg[] = []
    const sock: RoomSocket = { send: (d) => sent.push(JSON.parse(d) as ServerMsg), close: () => {} }
    room.connect(sock)
    room.message(sock, JSON.stringify({ type: 'hello', v: 1, name: 'Kid', key: 'k1' }))
    room.message(sock, JSON.stringify({ type: 'ev', cid: 'a', tick: 5, ev: { t: 'join', num: 9, name: 'x' } }))
    room.message(sock, JSON.stringify({ type: 'ev', cid: 'b', tick: 5, ev: { t: 'key', key: 'F1', down: true } }))
    room.message(sock, JSON.stringify({ type: 'ev', cid: 'c', tick: 5, ev: { t: 'restart' } }))
    const rejects = sent.filter((m) => m.type === 'reject').map((m) => (m as { cid: string; reason: string }))
    expect(rejects).toEqual([{ type: 'reject', cid: 'a', reason: 'invalid' }, { type: 'reject', cid: 'b', reason: 'invalid' }, { type: 'reject', cid: 'c', reason: 'host_only' }])
  })
})
