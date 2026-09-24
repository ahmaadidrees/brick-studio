import { describe, it, expect } from 'vitest'
import { TICK_MS } from '../engine/constants'
import { editDesign } from '../engine/designEdit'
import type { WorldEvent } from '../engine/events'
import { cloneLevel, createBlankLevel, levelFromJson, levelToJson } from '../engine/level'
import { advanceWorld, createWorld, deserializeWorld, hashWorld, serializeWorld } from '../engine/world'
import { demoLevel } from '../levels/demo'
import { MAX_EARLY, MAX_LATE, MAX_PLAYERS, PROTOCOL, cleanName, type ServerMsg } from './protocol'
import { RoomCore, type RoomMeta, type RoomSocket } from './roomCore'
import { Timeline } from './timeline'

class FakeSocket implements RoomSocket {
  inbox: ServerMsg[] = []
  closed = false
  send(data: string) {
    this.inbox.push(JSON.parse(data))
  }
  close() {
    this.closed = true
  }
  last<T extends ServerMsg['type']>(type: T): Extract<ServerMsg, { type: T }> | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) if (this.inbox[i].type === type) return this.inbox[i] as Extract<ServerMsg, { type: T }>
    return undefined
  }
}

const HOST_KEY = 'host-secret'

function room(meta?: Partial<RoomMeta>) {
  let now = 1_000_000
  const core = new RoomCore('abcdefghij', demoLevel(), { now: () => now, hostKey: HOST_KEY, meta })
  let keys = 0
  const join = (name: string, opts: { key?: string; host?: boolean } = {}) => {
    const s = new FakeSocket()
    core.connect(s)
    const hello: Record<string, unknown> = { type: 'hello', v: PROTOCOL, name, key: opts.key ?? `key${++keys}` }
    if (opts.host) hello.host = HOST_KEY
    core.message(s, JSON.stringify(hello))
    return s
  }
  const leave = (s: FakeSocket) => core.disconnect(s)
  return { core, join, leave, advance: (ms: number) => (now += ms), send: (s: FakeSocket, m: unknown) => core.message(s, JSON.stringify(m)) }
}

describe('RoomCore', () => {
  it('welcomes players with numbers, a base and the roster', () => {
    const r = room()
    const a = r.join('Ada')
    const b = r.join('Bo')
    expect(a.last('welcome')?.you).toBe(1)
    expect(b.last('welcome')?.you).toBe(2)
    expect(a.last('players')?.players.map((p) => p.name)).toEqual(['Ada', 'Bo'])
    expect(a.last('players')?.players.find((p) => p.num === 1)?.provider).toBe(true)
  })

  it('orders events and clamps their ticks into the allowed window', () => {
    const r = room()
    const a = r.join('A')
    const b = r.join('B')
    r.advance(100 * TICK_MS)
    const st = r.core.serverTick()
    r.send(a, { type: 'ev', cid: 'a:1', tick: st - 500, ev: { t: 'coin', x: 22, y: 12 } })
    r.send(b, { type: 'ev', cid: 'b:1', tick: st + 500, ev: { t: 'bump', x: 5, y: 5, big: 1, dir: 1 } })
    const e1 = b.inbox.filter((m) => m.type === 'ev')[0] as Extract<ServerMsg, { type: 'ev' }>
    const e2 = a.inbox.filter((m) => m.type === 'ev')[1] as Extract<ServerMsg, { type: 'ev' }>
    expect(e1.e.tick).toBe(st - MAX_LATE)
    expect(e2.e.tick).toBe(st + MAX_EARLY)
    expect(e2.e.seq).toBe(e1.e.seq + 1)
  })

  it('rejects malformed events and keeps the design in step with edits', () => {
    const r = room()
    const a = r.join('A')
    r.send(a, { type: 'ev', cid: 'a:1', tick: 5, ev: { t: 'bump', x: 9999, y: 1, big: 1, dir: 1 } })
    expect(a.last('reject')?.cid).toBe('a:1')
    r.send(a, { type: 'ev', cid: 'a:2', tick: 5, ev: { t: 'edit', ops: [{ o: 'tile', x: 1, y: 1, t: 3, c: 0 }] } })
    expect(r.core.design.tiles[1 * r.core.design.width + 1]).toBe(3)
    expect(r.core.dirty).toBe(true)
  })

  it(`holds ${MAX_PLAYERS} players and turns away the next`, () => {
    const r = room()
    const all = Array.from({ length: MAX_PLAYERS }, (_, i) => r.join(`P${i}`))
    expect(all.map((s) => s.last('welcome')?.you)).toEqual(Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1))
    const late = r.join('Late')
    expect(late.last('error')?.code).toBe('full')
    expect(late.closed).toBe(true)
  })

  it('sends everyone’s poses together when flushed', () => {
    const r = room()
    const a = r.join('A')
    const b = r.join('B')
    const pose = (x: number) => ({ m: 0, x, y: 50, f: 1, a: 'stand', s: 0, v: 1, q: 0, t: 1 })
    r.send(a, { type: 'pose', p: pose(10) })
    r.send(b, { type: 'pose', p: pose(20) })
    expect(a.last('poses')).toBeUndefined()
    r.core.flushPoses()
    expect(a.last('poses')?.list).toEqual([
      [1, pose(10)],
      [2, pose(20)],
    ])
    const count = a.inbox.length
    r.core.flushPoses()
    expect(a.inbox.length).toBe(count)
  })

  it('relays allowlisted character IDs, accepts legacy poses, and drops invalid identities and extra fields', () => {
    const r = room()
    const a = r.join('A')
    const b = r.join('B')
    const worldHash = hashWorld(createWorld(r.core.design))
    const base = { m: 0, x: 10, y: 50, f: 1, a: 'stand', s: 0, v: 1, q: 0, t: 1 }
    r.send(a, { type: 'pose', p: { ...base, ch: 'brick-fox', af: 42, assetUrl: 'https://untrusted.invalid/skin.png' } })
    r.send(b, { type: 'pose', p: base })
    r.core.flushPoses()
    expect(a.last('poses')?.list).toEqual([
      [1, { ...base, ch: 'brick-fox', af: 42 }],
      [2, base],
    ])

    r.send(a, { type: 'pose', p: { ...base, t: 2, ch: 'https://untrusted.invalid/skin.png' } })
    r.send(a, { type: 'pose', p: { ...base, t: 2, af: 256 } })
    r.core.flushPoses(true)
    expect(a.last('poses')?.list).toEqual([
      [1, { ...base, ch: 'brick-fox', af: 42 }],
      [2, base],
    ])
    expect(hashWorld(createWorld(r.core.design))).toBe(worldHash)
  })

  it('knows the host only by the host key', () => {
    const r = room()
    const kid = r.join('Kid')
    const teacher = r.join('Teacher', { host: true })
    expect(kid.last('welcome')?.host).toBe(false)
    expect(teacher.last('welcome')?.host).toBe(true)
    expect(teacher.last('welcome')?.players.find((p) => p.num === 2)?.host).toBe(true)
    // Settings from anyone else are ignored.
    r.send(kid, { type: 'settings', buildLocked: true })
    expect(kid.last('settings')).toBeUndefined()
    r.send(teacher, { type: 'settings', buildLocked: true })
    expect(kid.last('settings')?.settings.buildLocked).toBe(true)
    expect(r.core.metaDirty).toBe(true)
  })

  it('turns away edits when building is locked, except from the host', () => {
    const r = room()
    const kid = r.join('Kid')
    const teacher = r.join('Teacher', { host: true })
    r.send(teacher, { type: 'settings', buildLocked: true })
    r.send(kid, { type: 'ev', cid: 'k:1', tick: 5, ev: { t: 'edit', ops: [{ o: 'tile', x: 1, y: 1, t: 3, c: 0 }] } })
    expect(kid.last('reject')).toEqual({ type: 'reject', cid: 'k:1', reason: 'locked' })
    r.send(teacher, { type: 'ev', cid: 't:1', tick: 5, ev: { t: 'edit', ops: [{ o: 'tile', x: 2, y: 1, t: 3, c: 0 }] } })
    expect(kid.last('ev')?.e.cid).toBe('t:1')
    // Playing still works for everyone.
    r.send(kid, { type: 'ev', cid: 'k:2', tick: 5, ev: { t: 'coin', x: 22, y: 12 } })
    expect(kid.last('ev')?.e.cid).toBe('k:2')
  })

  it('lets only the host reset the world', () => {
    const r = room()
    const kid = r.join('Kid')
    const teacher = r.join('Teacher', { host: true })
    r.send(kid, { type: 'ev', cid: 'k:1', tick: 5, ev: { t: 'reset' } })
    expect(kid.last('reject')?.reason).toBe('host_only')
    r.send(teacher, { type: 'ev', cid: 't:1', tick: 5, ev: { t: 'reset' } })
    expect(kid.last('ev')?.e.ev.t).toBe('reset')
  })

  it('closes to newcomers but lets people back in after a dropped connection', () => {
    const r = room()
    const teacher = r.join('Teacher', { host: true })
    const kid = r.join('Kid', { key: 'kid-key' })
    r.send(teacher, { type: 'settings', closed: true })
    const stranger = r.join('Stranger')
    expect(stranger.last('error')?.code).toBe('closed')
    r.leave(kid)
    const back = r.join('Kid', { key: 'kid-key' })
    expect(back.last('welcome')).toBeDefined()
    // The host always gets in.
    r.leave(teacher)
    expect(r.join('Teacher', { host: true, key: 'other' }).last('welcome')?.host).toBe(true)
  })

  it('removes a player for good until the host lets them back', () => {
    const r = room()
    const teacher = r.join('Teacher', { host: true })
    const kid = r.join('Kid', { key: 'kid-key' })
    const num = kid.last('welcome')!.you
    r.send(teacher, { type: 'kick', num })
    expect(kid.last('error')?.code).toBe('kicked')
    expect(kid.closed).toBe(true)
    expect(teacher.last('players')?.players.map((p) => p.name)).toEqual(['Teacher'])
    expect(teacher.last('settings')?.banned).toBe(1)
    expect(r.join('Kid', { key: 'kid-key' }).last('error')?.code).toBe('kicked')
    // Nobody can remove the host, and only the host can remove anyone.
    const other = r.join('Other')
    r.send(other, { type: 'kick', num: 1 })
    expect(teacher.closed).toBe(false)
    r.send(teacher, { type: 'unban' })
    expect(r.join('Kid', { key: 'kid-key' }).last('welcome')).toBeDefined()
    expect(r.core.meta().banned).toEqual([])
  })

  it('saves the level and restores it for everyone', () => {
    const r = room()
    const teacher = r.join('Teacher', { host: true })
    const kid = r.join('Kid')
    const edit = (x: number) => ({ t: 'edit', ops: [{ o: 'tile', x, y: 1, t: 3, c: 0 }] })
    r.send(kid, { type: 'ev', cid: 'k:1', tick: 5, ev: edit(1) })
    r.send(teacher, { type: 'save' })
    expect(teacher.last('saved')).toBeDefined()
    expect(kid.last('saved')).toBeUndefined()
    r.send(kid, { type: 'ev', cid: 'k:2', tick: 6, ev: edit(2) })
    const w = r.core.design.width
    expect(r.core.design.tiles[w + 2]).toBe(3)
    r.advance(50 * TICK_MS)
    r.send(kid, { type: 'restore' })
    expect(kid.last('ev')?.e.cid).toBe('k:2')
    r.send(teacher, { type: 'restore' })
    const load = kid.last('ev')!.e
    expect(load.ev.t).toBe('load')
    expect(load.by).toBe(0)
    expect(load.tick).toBeGreaterThan(r.core.serverTick())
    expect(r.core.design.tiles[w + 1]).toBe(3)
    expect(r.core.design.tiles[w + 2]).toBe(0)
    // Applied in a world, the load gives the saved level back.
    const world = createWorld(demoLevel())
    advanceWorld(world, [{ ev: edit(1) as WorldEvent, by: 1 }])
    advanceWorld(world, [{ ev: edit(2) as WorldEvent, by: 1 }])
    advanceWorld(world, [{ ev: load.ev, by: 0 }])
    expect(levelToJson(world.design)).toEqual(levelToJson(r.core.design))
    // Players cannot send a load themselves.
    r.send(kid, { type: 'ev', cid: 'k:3', tick: 60, ev: load.ev })
    expect(kid.last('reject')?.cid).toBe('k:3')
  })

  it('keeps names friendly', () => {
    const r = room()
    const rude = r.join('xX_fuckface_Xx')
    expect(rude.last('welcome')?.players[0].name).toBe('Builder')
    r.send(rude, { type: 'name', name: 'Sky Ler' })
    expect(rude.last('players')?.players[0].name).toBe('Sky Ler')
    for (const ok of ['Skyler', 'Peacock', 'Grape', 'Nazir', 'Fukuda', 'Cassidy', 'Dickens']) expect(cleanName(ok)).toBe(ok)
    for (const bad of ['sh1t', 'b.i.t.c.h', 'Nazi', 'poop head', 'BUTT']) expect(cleanName(bad)).toBe('Builder')
  })

  it('resyncs a player whose world disagrees with the provider', () => {
    const r = room()
    const a = r.join('A')
    const b = r.join('B')
    r.advance(200 * TICK_MS)
    r.send(a, { type: 'hash', tick: 120, h: 111 })
    r.send(b, { type: 'hash', tick: 120, h: 222 })
    expect(b.last('resync')).toBeDefined()
    expect(a.last('resync')).toBeUndefined()
  })

  it('accepts keyframes only from the provider and only when complete', () => {
    const r = room()
    const a = r.join('A')
    const b = r.join('B')
    // An event lands at tick 295, before the keyframe's tick.
    r.advance(320 * TICK_MS)
    r.send(a, { type: 'ev', cid: 'a:1', tick: 295, ev: { t: 'bump', x: 5, y: 5, big: 1, dir: 1 } })
    r.advance(80 * TICK_MS)
    const w = createWorld(demoLevel())
    for (let i = 0; i < 300; i++) advanceWorld(w)
    const kf = serializeWorld(w)
    r.send(b, { type: 'keyframe', tick: 300, lastSeq: 1, world: kf })
    expect(r.core.stats.keyframes).toBe(0)
    // Not the provider above; here the provider has not seen event 1 yet.
    r.send(a, { type: 'keyframe', tick: 300, lastSeq: 0, world: kf })
    expect(r.core.stats.keyframes).toBe(0)
    r.send(a, { type: 'keyframe', tick: 300, lastSeq: 1, world: kf })
    expect(r.core.stats.keyframes).toBe(1)
    const c = r.join('C')
    const welcome = c.last('welcome')!
    expect(welcome.base.tick).toBe(300)
    expect('world' in welcome.base).toBe(true)
  })

  it('starts a fresh world once everyone has left', () => {
    const r = room()
    const a = r.join('A')
    r.advance(500 * TICK_MS)
    r.core.disconnect(a)
    r.advance(1000)
    const b = r.join('B')
    expect(b.last('welcome')?.base.tick).toBe(0)
    expect(b.last('welcome')?.events).toEqual([])
  })
})

describe('RoomCore with identities from the host', () => {
  function classRoom() {
    let now = 2_000_000
    const core = new RoomCore('abcdefabcdefabcdefabcdefabcdefab', demoLevel(), { now: () => now, classroom: true })
    const join = (identity: { key: string; host: boolean; name?: string; canBuild?: boolean; num?: number }, sentName = 'Whatever') => {
      const s = new FakeSocket()
      core.connect(s, identity)
      core.message(s, JSON.stringify({ type: 'hello', v: PROTOCOL, name: sentName, key: 'ignored-browser-key' }))
      return s
    }
    return { core, join, advance: (ms: number) => (now += ms), send: (s: FakeSocket, m: unknown) => core.message(s, JSON.stringify(m)) }
  }

  it('uses the account name and host flag, not what the browser sends', () => {
    const r = classRoom()
    const teacher = r.join({ key: 'teacher-id', host: true, name: 'Teacher' }, 'Hacker')
    const kid = r.join({ key: 'kid-id', host: false, name: 'ava_builds' }, 'Teacher')
    expect(teacher.last('welcome')).toMatchObject({ host: true, canBuild: true, classroom: true })
    expect(kid.last('welcome')?.host).toBe(false)
    expect(kid.last('welcome')?.players.map((p) => p.name)).toEqual(['Teacher', 'ava_builds'])
    // Renaming does nothing for account names.
    r.send(kid, { type: 'name', name: 'Teacher' })
    expect(r.core.players().map((p) => p.name)).toEqual(['Teacher', 'ava_builds'])
    expect(r.core.player(kid)).toMatchObject({ key: 'kid-id', host: false })
  })

  it('lets look-only players play but not build', () => {
    const r = classRoom()
    r.join({ key: 'owner', host: true })
    const viewer = r.join({ key: 'viewer', host: false, canBuild: false })
    expect(viewer.last('welcome')?.canBuild).toBe(false)
    r.send(viewer, { type: 'ev', cid: 'v:1', tick: 5, ev: { t: 'edit', ops: [{ o: 'tile', x: 1, y: 1, t: 3, c: 0 }] } })
    expect(viewer.last('reject')).toEqual({ type: 'reject', cid: 'v:1', reason: 'read_only' })
    r.send(viewer, { type: 'ev', cid: 'v:2', tick: 5, ev: { t: 'coin', x: 22, y: 12 } })
    expect(viewer.last('ev')?.e.cid).toBe('v:2')
    // Access can change while they are here.
    r.core.updatePlayer(viewer, { canBuild: true })
    expect(viewer.last('players')?.players.find((p) => p.num === 2)?.canBuild).toBe(true)
    r.send(viewer, { type: 'ev', cid: 'v:3', tick: 6, ev: { t: 'edit', ops: [{ o: 'tile', x: 1, y: 1, t: 3, c: 0 }] } })
    expect(viewer.last('ev')?.e.cid).toBe('v:3')
  })

  it('keeps player numbers when a room rebuilds itself', () => {
    const r = classRoom()
    const a = r.join({ key: 'a', host: false, num: 5 })
    const b = r.join({ key: 'b', host: false, num: 5 })
    expect(a.last('welcome')?.you).toBe(5)
    expect(b.last('welcome')?.you).toBe(1)
  })

  it('turns off the room save and restore in class rooms', () => {
    const r = classRoom()
    const teacher = r.join({ key: 'teacher-id', host: true })
    r.send(teacher, { type: 'save' })
    expect(teacher.last('saved')).toBeUndefined()
    r.send(teacher, { type: 'restore' })
    expect(teacher.last('ev')).toBeUndefined()
  })

  it('replaces the level for everyone, or just adopts it when nobody is here', () => {
    const r = classRoom()
    const blank = levelToJson(createWorld(demoLevel()).design)
    expect(r.core.replaceLevel({ ...blank, title: 'From the database' }, false)).toBe(true)
    expect(r.core.design.title).toBe('From the database')
    expect(r.core.dirty).toBe(false)
    const a = r.join({ key: 'a', host: false })
    r.advance(40 * TICK_MS)
    r.core.replaceLevel({ ...blank, title: 'Newer' }, false)
    const load = a.last('ev')!.e
    expect(load.ev.t).toBe('load')
    expect(load.by).toBe(0)
    expect(load.tick).toBeGreaterThan(r.core.serverTick())
    expect(r.core.replaceLevel({ nonsense: true } as never, false)).toBe(false)
  })

  it('sends poses at most every 50 ms unless asked to', () => {
    const r = classRoom()
    const a = r.join({ key: 'a', host: false })
    const pose = { m: 0, x: 1, y: 2, f: 1, a: 'stand', s: 0, v: 1, q: 0, t: 1 }
    r.send(a, { type: 'pose', p: pose })
    expect(r.core.flushPoses()).toBe(true)
    r.send(a, { type: 'pose', p: pose })
    expect(r.core.flushPoses()).toBe(false)
    r.advance(50)
    expect(r.core.flushPoses()).toBe(true)
    r.send(a, { type: 'pose', p: pose })
    expect(r.core.flushPoses(true)).toBe(true)
  })

  it('refuses a connection with a reason', () => {
    const r = classRoom()
    const a = r.join({ key: 'a', host: false })
    r.core.refuse(a, 'access', 'Your teacher closed collaboration.')
    expect(a.last('error')).toEqual({ type: 'error', code: 'access', message: 'Your teacher closed collaboration.' })
    expect(a.closed).toBe(true)
    expect(r.core.playerCount).toBe(0)
  })
})

describe('editDesign', () => {
  it('matches the world’s own edit handling', () => {
    const design = cloneLevel(demoLevel())
    const w = createWorld(demoLevel())
    let seed = 5
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(rnd() * w.width)
      const y = Math.floor(rnd() * w.height)
      const r = rnd()
      const id = 1 + Math.floor(rnd() * 60)
      const ev: WorldEvent =
        r < 0.6
          ? { t: 'edit', ops: [{ o: 'tile', x, y, t: Math.floor(rnd() * 14), c: Math.floor(rnd() * 4) }] }
          : r < 0.75
            ? { t: 'edit', ops: [{ o: 'add', obj: { id, kind: rnd() < 0.2 ? 'start' : 'walker', x, y, dir: 1, alt: 0 } }] }
            : r < 0.9
              ? { t: 'edit', ops: [{ o: 'del', id }] }
              : { t: 'edit', ops: [{ o: 'move', id, x, y }] }
      advanceWorld(w, [{ ev, by: 1 }])
      if (ev.t === 'edit') for (const op of ev.ops) editDesign(design, op)
    }
    expect(levelToJson(design)).toEqual(levelToJson(w.design))
  })
})

/**
 * The whole pipeline in one process: three players with their own timelines talk to a RoomCore
 * through a fake network with random delays; a fourth joins late from a keyframe. At the end,
 * everyone's world must be identical.
 */
describe('room end to end', () => {
  it('keeps every player in the same world, including one who joins late', () => {
    let now = 5_000_000
    let seed = 99
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    const core = new RoomCore('roomroom01', demoLevel(), { now: () => now })
    type Client = { sock: FakeSocket; tl: Timeline | null; num: number; read: number; counter: number }
    const clients: Client[] = []
    const network: [number, () => void][] = []
    const deliver = (delayMs: number, fn: () => void) => network.push([now + delayMs, fn])
    const join = () => {
      const c: Client = { sock: new FakeSocket(), tl: null, num: 0, read: 0, counter: 0 }
      core.connect(c.sock)
      core.message(c.sock, JSON.stringify({ type: 'hello', v: PROTOCOL, name: 'x' }))
      clients.push(c)
      return c
    }
    const tickNow = () => Math.floor((now - epoch) / TICK_MS)
    const a = join()
    const epoch = now
    join()
    join()
    const TOTAL = 1500
    let late: Client | null = null
    for (let frame = 0; frame < TOTAL; frame++) {
      now += TICK_MS
      // Deliver network traffic whose time has come.
      for (let i = network.length - 1; i >= 0; i--) {
        if (network[i][0] <= now) {
          const [, fn] = network.splice(i, 1)[0]
          fn()
        }
      }
      if (frame === 700) late = join()
      for (const c of clients) {
        // Read server messages (with a random receive delay applied per message on send side).
        while (c.read < c.sock.inbox.length) {
          const msg = c.sock.inbox[c.read++]
          if (msg.type === 'welcome' || msg.type === 'resync') {
            if (msg.type === 'welcome') c.num = msg.you
            const base = msg.base
            const w = 'world' in base ? deserializeWorld(base.world) : createWorld(levelFromJson(base.level), base.tick)
            c.tl = new Timeline(w, () => {})
            for (const e of msg.events) c.tl.addRemote({ ...e })
          } else if (msg.type === 'ev' && c.tl) {
            const e = msg.e
            if (c.tl.isPending(e.cid)) c.tl.confirm(e.cid, e.tick, e.seq)
            else c.tl.addRemote({ ...e })
          }
        }
        if (!c.tl) continue
        c.tl.advanceTo(tickNow())
        // Sometimes act on the world, like a player would.
        if (frame < TOTAL - 120 && rnd() < 0.05) {
          const x = Math.floor(rnd() * 216)
          const y = Math.floor(rnd() * 22)
          const ev: WorldEvent = rnd() < 0.5 ? { t: 'bump', x, y, big: 1, dir: 1 } : { t: 'edit', ops: [{ o: 'tile', x, y, t: Math.floor(rnd() * 14), c: 0 }] }
          const rec = { tick: c.tl.tick + 1, seq: null, by: c.num, ev, cid: `${c.num}:${++c.counter}` }
          c.tl.addLocal(rec)
          const payload = JSON.stringify({ type: 'ev', cid: rec.cid, tick: rec.tick, ev })
          deliver(20 + rnd() * 120, () => core.message(c.sock, payload))
        }
        // The provider sends keyframes.
        if (c === a && c.tl.tick % 300 === 0) {
          const at = c.tl.tick - 90
          const snap = c.tl.worldAt(at)
          if (snap) {
            const payload = JSON.stringify({ type: 'keyframe', tick: at, lastSeq: Math.max(0, ...c.sock.inbox.filter((m) => m.type === 'ev').map((m) => (m as Extract<ServerMsg, { type: 'ev' }>).e.seq)), world: serializeWorld(snap) })
            deliver(30, () => core.message(c.sock, payload))
          }
        }
      }
    }
    // Let the network drain and everyone catch up.
    now += 2000
    for (const [, fn] of network.splice(0)) fn()
    for (const c of clients) {
      while (c.read < c.sock.inbox.length) {
        const msg = c.sock.inbox[c.read++]
        if (msg.type === 'ev' && c.tl) {
          if (c.tl.isPending(msg.e.cid)) c.tl.confirm(msg.e.cid, msg.e.tick, msg.e.seq)
          else c.tl.addRemote({ ...msg.e })
        }
      }
      c.tl!.advanceTo(tickNow())
    }
    expect(core.stats.keyframes).toBeGreaterThan(0)
    expect(late?.tl).toBeTruthy()
    const hashes = clients.map((c) => hashWorld(c.tl!.world))
    expect(new Set(hashes).size).toBe(1)
    expect(clients.every((c) => c.tl!.tick === clients[0].tl!.tick)).toBe(true)
  })
})

/*
 * From the pre-ship review (findings 1 and 3): what the room saves is what everyone sees, and a snapshot can never
 * change what is built.
 */
describe('RoomCore: saved design and snapshots', () => {
  function classRoom() {
    let now = 100_000
    const original = createBlankLevel(40, 20)
    const core = new RoomCore('reviewreview', cloneLevel(original), { now: () => now, classroom: true })
    const join = (key: string, canBuild = true) => {
      const s = new FakeSocket()
      core.connect(s, { key, host: false, canBuild })
      core.message(s, JSON.stringify({ type: 'hello', v: PROTOCOL, name: key, key }))
      return s
    }
    const send = (s: FakeSocket, m: unknown) => core.message(s, JSON.stringify(m))
    return { core, original, join, send, advance: (ms: number) => (now += ms) }
  }
  const TILE = 5 * 40 + 5
  const edit = (cid: string, tick: number, t: number) => ({ type: 'ev', cid, tick, ev: { t: 'edit', ops: [{ o: 'tile', x: 5, y: 5, t, c: 0 }] } })
  /** The world as a player replaying the room's events sees it at `tick`. */
  const replay = (r: ReturnType<typeof classRoom>, inbox: ServerMsg[], tick: number) => {
    const timeline = new Timeline(createWorld(cloneLevel(r.original)), () => {})
    for (const m of inbox) if (m.type === 'ev') timeline.addRemote(m.e)
    timeline.advanceTo(tick)
    return timeline.world
  }

  it('saves the design players see when edits arrive out of tick order', () => {
    const r = classRoom()
    const a = r.join('a')
    const b = r.join('b')
    r.advance(1000)
    r.send(a, edit('a:1', 55, 3))
    r.send(b, edit('b:1', 50, 4))
    expect(r.core.design.tiles[TILE]).toBe(4)
    expect(replay(r, a.inbox, 70).design.tiles[TILE]).toBe(r.core.design.tiles[TILE])
  })

  it('keeps a level load and later edits in the order they reached the room', () => {
    const r = classRoom()
    const a = r.join('a')
    r.advance(1000)
    const newer = cloneLevel(r.original)
    newer.tiles[TILE] = 7
    r.core.replaceLevel(levelToJson(newer), false)
    r.send(a, edit('a:1', 40, 3))
    expect(r.core.design.tiles[TILE]).toBe(3)
    expect(replay(r, a.inbox, 120).design.tiles[TILE]).toBe(3)
  })

  it('never lets a player who cannot build provide snapshots', () => {
    const r = classRoom()
    const viewer = r.join('viewer', false)
    const builder = r.join('builder')
    expect(r.core.players().find((p) => p.provider)?.name).toBe('builder')
    r.advance(10_000)
    const w = createWorld(cloneLevel(r.original), 200)
    r.send(viewer, { type: 'keyframe', tick: 200, lastSeq: 0, world: serializeWorld(w) })
    expect(r.core.stats.keyframes).toBe(0)
  })

  it('refuses a snapshot that does not read as a world', () => {
    const r = classRoom()
    const builder = r.join('builder')
    r.advance(10_000)
    r.send(builder, { type: 'keyframe', tick: 200, lastSeq: 0, world: { tick: 200 } })
    expect(r.core.stats.keyframes).toBe(0)
    expect(r.core.stats.badKeyframes).toBe(1)
    const base = r.join('late').last('welcome')!.base
    expect(() => ('world' in base ? deserializeWorld(base.world) : levelFromJson(base.level))).not.toThrow()
  })

  it('refuses a snapshot whose design differs from what the room applied, and takes one that matches', () => {
    const r = classRoom()
    const builder = r.join('builder')
    r.advance(1000)
    r.send(builder, edit('b:1', 20, 3))
    r.advance(9000)
    const forged = cloneLevel(r.core.design)
    forged.tiles[TILE] = 4
    r.send(builder, { type: 'keyframe', tick: 200, lastSeq: 1, world: serializeWorld(createWorld(forged, 200)) })
    expect(r.core.stats.keyframes).toBe(0)
    expect(r.core.stats.badKeyframes).toBe(1)

    const honest = replay(r, builder.inbox, 200)
    r.send(builder, { type: 'keyframe', tick: 200, lastSeq: 1, world: serializeWorld(honest) })
    expect(r.core.stats.keyframes).toBe(1)
    const base = r.join('late').last('welcome')!.base
    expect('world' in base && deserializeWorld(base.world).design.tiles[TILE]).toBe(3)
  })
})

describe('RoomCore: snapshot limits', () => {
  function builderRoom() {
    let now = 100_000
    const level = createBlankLevel(40, 20)
    const core = new RoomCore('limitslimits', cloneLevel(level), { now: () => now })
    const s = new FakeSocket()
    core.connect(s, { key: 'builder', canBuild: true, host: false })
    core.message(s, JSON.stringify({ type: 'hello', v: PROTOCOL, key: 'builder', name: 'Builder' }))
    now += 10_000
    const send = (world: unknown) => core.message(s, JSON.stringify({ type: 'keyframe', tick: 200, lastSeq: 0, world }))
    return { core, level, send }
  }
  const walker = (patch: Partial<Record<number, number>> = {}) => {
    const row = [1, 1, 4000, 4000, 256, 256, 0, 0, 4000, 4000, 1, 0, 0, 0, 0, 0, 0, 0, 0]
    for (const [i, v] of Object.entries(patch)) row[Number(i)] = v as number
    return row
  }

  it('takes a snapshot whose every field is within the limits, and keeps its own copy', () => {
    const r = builderRoom()
    const world = serializeWorld(createWorld(r.level, 200))
    world.entities = [walker()]
    world.nextId = 2
    r.send(world)
    expect(r.core.stats.keyframes).toBe(1)
  })

  const unsafe: [string, (w: ReturnType<typeof serializeWorld>) => void][] = [
    ['a huge height far above the level', (w) => (w.entities = [walker({ 3: -1e100, 5: 1e100, 9: -1e100 })])],
    ['a position far outside the level', (w) => (w.entities = [walker({ 2: 1e9 })])],
    ['a fractional coordinate', (w) => (w.entities = [walker({ 2: 4000.5 })])],
    ['a speed beyond any in play', (w) => (w.entities = [walker({ 6: 1e7 })])],
    ['an unknown kind', (w) => (w.entities = [walker({ 1: 99 })])],
    ['a short entity row', (w) => (w.entities = [walker().slice(0, 10)])],
    ['a repeated id', (w) => (w.entities = [walker(), walker()])],
    ['an id at or past nextId', (w) => { w.entities = [walker({ 0: 5 })]; w.nextId = 5 }],
    ['a bump off the level', (w) => (w.bumps = [[400, 2, 3]])],
    ['too many entities', (w) => (w.entities = Array.from({ length: 5000 }, (_, i) => walker({ 0: i + 1 })))],
  ]
  for (const [what, spoil] of unsafe) {
    it(`refuses a snapshot with ${what}`, () => {
      const r = builderRoom()
      const world = serializeWorld(createWorld(r.level, 200))
      world.nextId = 10_000
      spoil(world)
      r.send(world)
      expect(r.core.stats.keyframes).toBe(0)
      expect(r.core.stats.badKeyframes).toBe(1)
    })
  }
})
