/**
 * One Hackable room's server logic (docs/qa/hackable-rooms M1), free of any hosting details so it can be tested
 * directly. The Worker's HackableRoom Durable Object feeds it sockets and messages and keeps `project` while the room
 * lives. The twin of the classic rooms' RoomCore (packages/platformer-core/src/net/roomCore.ts), without poses.
 *
 * The room never runs kids' code. It keeps the clock and the order: players' keys, joins and leaves (which the room
 * makes itself, so everyone's Hero appears and goes at the same tick), and the host's edits to the project, which it
 * checks like any save before passing them on. One player's game (the provider) sends a keyframe every so often for
 * people joining late; every game sends a fingerprint every HASH_EVERY ticks, and anyone who disagrees with the
 * provider's gets a fresh copy.
 */
import { parse } from '../core/save'
import { TICK_MS, designKit, type KitId } from '../core/contracts'
import {
  DEFAULT_SETTINGS,
  HACKABLE_PROTOCOL,
  HASH_EVERY,
  MAX_EARLY,
  MAX_LATE,
  MAX_MESSAGE_BYTES,
  MAX_PLAYERS,
  MAX_PROJECT_BYTES,
  RECONNECT_GRACE_MS,
  ROOM_LEAD,
  cleanName,
  isPlayerEv,
  type Base,
  type ClientMsg,
  type PlayerInfo,
  type RejectReason,
  type RoomEv,
  type RoomInfo,
  type RoomSettings,
  type ServerMsg,
  type StampedEvent,
} from './protocol'

export interface RoomSocket {
  send(data: string): void
  close(code?: number, reason?: string): void
}

/** Who a connection is, as the host (not the browser) established it. */
export interface TrustedIdentity {
  /** Stable identity for bans and reconnects: the account id in class rooms, the browser key in guest rooms. */
  key?: string
  host: boolean
  /** Shown to everyone; replaces whatever name the browser sends. */
  name?: string
  /** Keep this player number if it is free (a room waking up after hibernating). */
  num?: number
}

interface Client {
  num: number
  name: string
  key: string
  host: boolean
  joinedAt: number
  hello: boolean
  trusted?: TrustedIdentity
  windowStart: number
  events: number
  lastSync: number
  /** Keys this player holds down in the game, so the room can let them go if the player drops. */
  held: Set<string>
}

/** A player whose connection dropped: their Hero stays (standing still) until `until`, in case they come back. */
interface Away {
  num: number
  name: string
  key: string
  host: boolean
  until: number
}

export interface RoomMeta {
  settings: RoomSettings
  /** Identities the host removed; they cannot come back. */
  banned: string[]
}

export interface RoomCoreOptions {
  now?: () => number
  /** Guest rooms in-process (tests): whoever says hello with this key hosts. */
  hostKey?: string | null
  meta?: Partial<RoomMeta>
  classroom?: boolean
  title?: string
}

/** A project the room accepts: it reads like any save, and it is the room's game. */
export type ProjectCheck = { ok: true; kit: KitId } | { ok: false; reason: 'invalid' | 'too_big' }

export function checkProject(text: unknown, kit?: KitId): ProjectCheck {
  if (typeof text !== 'string') return { ok: false, reason: 'invalid' }
  if (text.length > MAX_PROJECT_BYTES) return { ok: false, reason: 'too_big' }
  const result = parse(text)
  if (!result.ok) return { ok: false, reason: 'invalid' }
  const projectKit = designKit(result.save.design)
  if (kit && projectKit !== kit) return { ok: false, reason: 'invalid' }
  return { ok: true, kit: projectKit }
}

/** Keys, and the host's edits, per player per second. */
const EVENTS_PER_SECOND = 60
/** The host's project edits: at most one this often. */
const PROJECT_EVERY_MS = 500

export class HackableRoomCore {
  /** The project as it is now (designText): what a new session starts from, and what the room keeps. */
  project: string
  readonly kit: KitId
  readonly classroom: boolean
  title: string
  /** Settings or the removed-player list changed since they were last saved. */
  metaDirty = false
  /** The project changed since it was last saved. */
  projectDirty = false
  private readonly now: () => number
  private readonly hostKey: string | null
  private settings: RoomSettings
  private banned: Set<string>
  private admitted = new Set<string>()
  private clients = new Map<RoomSocket, Client>()
  /** Players who dropped, by player number, keeping their slot and their Hero for RECONNECT_GRACE_MS. */
  private away = new Map<number, Away>()
  private epoch = 0
  private base: Base | null = null
  private events: StampedEvent[] = []
  private seq = 0
  /** The tick of the latest project event; they never go back before it, so their order is the order they arrived. */
  private projectTick = 0
  private lastProjectAt = -Infinity
  private hashes = new Map<number, Map<number, number>>()
  private joinCounter = 0
  stats = { events: 0, rejected: 0, resyncs: 0, keyframes: 0, badKeyframes: 0 }

  constructor(
    readonly roomId: string,
    project: string,
    opts: RoomCoreOptions = {},
  ) {
    const check = checkProject(project)
    if (!check.ok) throw new Error('That project could not be read.')
    this.project = project
    this.kit = check.kit
    this.now = opts.now ?? (() => Date.now())
    this.hostKey = opts.hostKey ?? null
    this.classroom = opts.classroom ?? false
    this.title = opts.title ?? ''
    this.settings = { ...DEFAULT_SETTINGS, ...opts.meta?.settings }
    this.banned = new Set(opts.meta?.banned ?? [])
  }

  meta(): RoomMeta {
    return { settings: { ...this.settings }, banned: [...this.banned] }
  }

  info(): RoomInfo {
    const players = this.slotCount
    return { roomId: this.roomId, title: this.title, kit: this.kit, players, full: players >= MAX_PLAYERS, closed: this.settings.closed }
  }

  /** Players connected now. */
  get playerCount(): number {
    let n = 0
    for (const c of this.clients.values()) if (c.hello) n++
    return n
  }

  /** Players with a Hero in the game: connected, or dropped and maybe coming back. */
  private get slotCount(): number {
    return this.playerCount + this.away.size
  }

  /** Whether anyone is playing now (a live session with a clock and an event log). */
  get live(): boolean {
    return this.base !== null
  }

  serverTick(): number {
    return Math.floor((this.now() - this.epoch) / TICK_MS)
  }

  connect(sock: RoomSocket, trusted?: TrustedIdentity) {
    this.sweep()
    this.clients.set(sock, { num: 0, name: '', key: '', host: false, joinedAt: 0, hello: false, trusted, windowStart: this.now(), events: 0, lastSync: -Infinity, held: new Set() })
  }

  /**
   * A connection closed. A player who simply dropped keeps their slot and their Hero for RECONNECT_GRACE_MS: their
   * keys come up at once (so the Hero stands still), and their Hero goes only if they are not back in time. `gone`
   * (removed, refused) takes the Hero at once.
   */
  disconnect(sock: RoomSocket, gone = false) {
    const c = this.clients.get(sock)
    this.clients.delete(sock)
    if (!c?.hello) return
    if (this.playerCount === 0) {
      // Nobody left: the next person to arrive starts a fresh game from the project.
      this.base = null
      this.events = []
      this.hashes.clear()
      this.away.clear()
      return
    }
    for (const key of c.held) this.roomEvent({ t: 'key', key, down: false }, c.num)
    if (!gone && c.key) {
      this.away.set(c.num, { num: c.num, name: c.name, key: c.key, host: c.host, until: this.now() + RECONNECT_GRACE_MS })
    } else {
      this.roomEvent({ t: 'leave', num: c.num })
    }
    this.broadcast({ type: 'players', players: this.players() })
  }

  /** Dropped players who did not come back in time leave now. The host calls this whenever the room hears anything. */
  sweep() {
    const now = this.now()
    let changed = false
    for (const a of [...this.away.values()]) {
      if (a.until > now) continue
      this.away.delete(a.num)
      this.roomEvent({ t: 'leave', num: a.num })
      changed = true
    }
    if (changed) this.broadcast({ type: 'players', players: this.players() })
  }

  message(sock: RoomSocket, raw: string) {
    const c = this.clients.get(sock)
    if (!c) return
    this.sweep()
    if (raw.length > MAX_PROJECT_BYTES + 1024) return this.fail(sock, 'too_big', 'Message too large')
    let msg: ClientMsg
    try {
      msg = JSON.parse(raw) as ClientMsg
    } catch {
      return this.fail(sock, 'bad_json', 'Could not read message')
    }
    if (!msg || typeof msg !== 'object') return
    const big = msg.type === 'keyframe' || (msg.type === 'ev' && msg.ev?.t === 'project')
    if (!big && raw.length > MAX_MESSAGE_BYTES) return this.fail(sock, 'too_big', 'Message too large')
    if (msg.type === 'hello') return this.hello(sock, c, msg)
    if (!c.hello) return this.fail(sock, 'no_hello', 'Say hello first')
    const now = this.now()
    if (now - c.windowStart >= 1000) {
      c.windowStart = now
      c.events = 0
    }
    switch (msg.type) {
      case 'ev':
        if (++c.events > EVENTS_PER_SECOND) return
        return this.event(sock, c, msg)
      case 'ping':
        if (typeof msg.c === 'number') this.send(sock, { type: 'pong', c: msg.c, s: now })
        return
      case 'hash':
        return this.hash(c, msg.tick, msg.h)
      case 'keyframe':
        return this.keyframe(c, msg)
      case 'sync':
        if (now - c.lastSync < 2000) return
        c.lastSync = now
        return this.resync(c.num)
      case 'name':
        if (c.trusted?.name) return
        c.name = cleanName(msg.name)
        return this.broadcast({ type: 'players', players: this.players() })
      case 'settings':
        if (!c.host) return
        if (typeof msg.closed === 'boolean') this.settings.closed = msg.closed
        this.metaDirty = true
        return this.broadcastSettings()
      case 'kick':
        if (c.host) this.kick(msg.num)
        return
      case 'unban':
        if (!c.host) return
        this.banned.clear()
        this.metaDirty = true
        return this.broadcastSettings()
    }
  }

  /** A connected player, once they have said hello. */
  player(sock: RoomSocket): { num: number; key: string; name: string; host: boolean } | undefined {
    const c = this.clients.get(sock)
    return c?.hello ? { num: c.num, key: c.key, name: c.name, host: c.host } : undefined
  }

  /** What one connected player may do changed (their class access changed while they were here). */
  updatePlayer(sock: RoomSocket, patch: { host?: boolean }) {
    const c = this.clients.get(sock)
    if (!c) return
    if (c.trusted) c.trusted = { ...c.trusted, ...patch }
    if (!c.hello || patch.host === undefined || patch.host === c.host) return
    c.host = patch.host
    this.broadcast({ type: 'players', players: this.players() })
  }

  /** The host refused an event before the room saw it (a classroom access check could not run). */
  rejectEvent(sock: RoomSocket, cid: string, reason: RejectReason) {
    if (typeof cid === 'string' && cid.length <= 64) this.send(sock, { type: 'reject', cid, reason })
  }

  /** Tell everyone something. */
  notice(message: string) {
    this.broadcast({ type: 'notice', message })
  }

  /** Close one connection with a reason the player sees. */
  refuse(sock: RoomSocket, code: Extract<ServerMsg, { type: 'error' }>['code'], message: string) {
    this.fail(sock, code, message, true)
    this.disconnect(sock, true)
  }

  players(): PlayerInfo[] {
    const provider = this.provider()
    const here: PlayerInfo[] = [...this.clients.values()]
      .filter((c) => c.hello)
      .map((c) => ({ num: c.num, name: c.name, provider: c === provider, host: c.host }))
    const away: PlayerInfo[] = [...this.away.values()].map((a) => ({ num: a.num, name: a.name, provider: false, host: a.host, away: true }))
    return [...here, ...away].sort((a, b) => a.num - b.num)
  }

  // -------------------------------------------------------------------------------------------

  private hello(sock: RoomSocket, c: Client, msg: Extract<ClientMsg, { type: 'hello' }>) {
    if (c.hello) return
    if (msg.v !== HACKABLE_PROTOCOL) return this.fail(sock, 'version', 'The game was updated. Reload the page to join.', true)
    const t = c.trusted
    const key = t?.key ?? (typeof msg.key === 'string' ? msg.key.slice(0, 64) : '')
    const host = t ? t.host : !!this.hostKey && (msg as { host?: unknown }).host === this.hostKey
    if (!host && key && this.banned.has(key)) return this.fail(sock, 'kicked', 'The host removed you from this room.', true)
    if (!host && this.settings.closed && !this.admitted.has(key)) return this.fail(sock, 'closed', 'The host has closed this room to new players.', true)
    // Back within the grace time: the same player number, so the same Hero, where it was.
    const back = key ? [...this.away.values()].find((a) => a.key === key) : undefined
    if (back) this.away.delete(back.num)
    else if (this.slotCount >= MAX_PLAYERS) return this.fail(sock, 'full', `This room is full (${MAX_PLAYERS} players).`, true)
    const used = new Set<number>(this.away.keys())
    for (const o of this.clients.values()) if (o.hello) used.add(o.num)
    let num = back ? back.num : t?.num && t.num > 0 && t.num <= MAX_PLAYERS && !used.has(t.num) ? t.num : 1
    while (!back && used.has(num)) num++
    c.num = num
    c.name = t?.name ? t.name.slice(0, 24) : cleanName(msg.name)
    c.key = key
    c.host = host
    c.hello = true
    c.joinedAt = ++this.joinCounter
    if (key) this.admitted.add(key)
    if (!this.base) {
      this.epoch = this.now()
      this.base = { tick: 0, project: this.project }
      this.events = []
      this.seq = 0
      this.projectTick = 0
      this.hashes.clear()
    }
    // Their Hero appears a moment from now, the same tick on every screen (a player coming back still has theirs).
    const join = back ? null : this.stamp({ t: 'join', num, name: c.name })
    this.send(sock, {
      type: 'welcome',
      you: num,
      host,
      roomId: this.roomId,
      title: this.title,
      epoch: this.epoch,
      now: this.now(),
      base: this.base,
      events: this.events,
      players: this.players(),
      settings: { ...this.settings },
      classroom: this.classroom,
    })
    if (join) this.broadcast({ type: 'ev', e: join }, sock)
    this.broadcast({ type: 'players', players: this.players() }, sock)
  }

  /** An event the room makes itself, a moment ahead so nobody has to go back for it. */
  /** `by`: the player it is for (keys the room lets go of for a player who dropped); 0 for the room's own. */
  private roomEvent(ev: RoomEv, by = 0): StampedEvent {
    const e = this.stamp(ev, by)
    this.broadcast({ type: 'ev', e })
    return e
  }

  private stamp(ev: RoomEv, by = 0): StampedEvent {
    const tick = Math.max(this.serverTick() + ROOM_LEAD, (this.base?.tick ?? 0) + 1)
    const e: StampedEvent = { tick, seq: ++this.seq, by, cid: `room:${this.seq}`, ev }
    this.events.push(e)
    return e
  }

  private reject(sock: RoomSocket, cid: string, reason: RejectReason) {
    this.stats.rejected++
    this.send(sock, { type: 'reject', cid, reason })
  }

  private event(sock: RoomSocket, c: Client, msg: Extract<ClientMsg, { type: 'ev' }>) {
    if (typeof msg.cid !== 'string' || msg.cid.length > 48 || !Number.isInteger(msg.tick)) return
    if (!isPlayerEv(msg.ev)) return this.reject(sock, msg.cid, 'invalid')
    const ev = msg.ev
    const edit = ev.t === 'project' || ev.t === 'restart'
    if (edit && !c.host) return this.reject(sock, msg.cid, 'host_only')
    if (ev.t === 'project') {
      if (this.now() - this.lastProjectAt < PROJECT_EVERY_MS) return this.reject(sock, msg.cid, 'busy')
      const check = checkProject(ev.text, this.kit)
      if (!check.ok) return this.reject(sock, msg.cid, check.reason)
      this.lastProjectAt = this.now()
    }
    const st = this.serverTick()
    const lo = Math.max(st - MAX_LATE, (this.base?.tick ?? 0) + 1)
    let tick = Math.min(Math.max(msg.tick, lo), st + MAX_EARLY)
    if (edit) tick = this.projectTick = Math.max(tick, this.projectTick)
    // Only what the room checked goes on, never the message as sent.
    const clean: RoomEv = ev.t === 'key' ? { t: 'key', key: ev.key, down: ev.down } : ev.t === 'project' ? { t: 'project', text: ev.text, restart: ev.restart } : { t: 'restart' }
    const e: StampedEvent = { tick, seq: ++this.seq, by: c.num, cid: msg.cid, ev: clean }
    this.events.push(e)
    this.stats.events++
    if (clean.t === 'key') {
      if (clean.down) c.held.add(clean.key)
      else c.held.delete(clean.key)
    }
    if (clean.t === 'project') {
      this.project = clean.text
      this.projectDirty = true
    }
    this.broadcast({ type: 'ev', e })
  }

  private kick(num: number) {
    for (const [s, o] of [...this.clients]) {
      if (!o.hello || o.num !== num || o.host) continue
      if (o.key) {
        this.banned.add(o.key)
        this.admitted.delete(o.key)
      }
      this.metaDirty = true
      this.fail(s, 'kicked', 'The host removed you from this room.', true)
      this.disconnect(s, true)
    }
    // Someone who dropped can be removed too: they can't come back, and their Hero goes now.
    const gone = this.away.get(num)
    if (gone && !gone.host) {
      this.away.delete(num)
      this.banned.add(gone.key)
      this.admitted.delete(gone.key)
      this.metaDirty = true
      this.roomEvent({ t: 'leave', num })
    }
    this.broadcast({ type: 'players', players: this.players() })
    this.broadcastSettings()
  }

  /** The provider's fingerprint is the reference; anyone who disagrees gets a fresh copy. */
  private hash(c: Client, tick: number, h: number) {
    if (!Number.isInteger(tick) || !Number.isInteger(h) || tick % HASH_EVERY !== 0) return
    const st = this.serverTick()
    if (tick > st || tick < st - 600) return
    let m = this.hashes.get(tick)
    if (!m) {
      m = new Map()
      this.hashes.set(tick, m)
    }
    m.set(c.num, h)
    const provider = this.provider()
    if (provider) {
      const ref = m.get(provider.num)
      if (ref !== undefined) {
        for (const [num, v] of m) {
          if (v === ref || num === provider.num) continue
          m.delete(num)
          this.resync(num)
        }
      }
    }
    for (const t of this.hashes.keys()) if (t < st - 900) this.hashes.delete(t)
  }

  /**
   * A keyframe from the provider becomes the new base for joiners and resyncs. The room does not run the game, so it
   * only checks that the keyframe is plausible: on the tick it claims, after every event up to it, and small enough.
   * Its project is always the room's own (the project as of that tick), never anything the keyframe carries.
   */
  private keyframe(c: Client, msg: Extract<ClientMsg, { type: 'keyframe' }>) {
    const provider = this.provider()
    if (!provider || provider.num !== c.num || !this.base) return
    const st = this.serverTick()
    if (!Number.isInteger(msg.tick) || msg.tick <= this.base.tick || msg.tick > st - MAX_LATE - 1) return
    if (typeof msg.world !== 'string' || msg.world.length > MAX_PROJECT_BYTES || !Number.isInteger(msg.lastSeq)) return
    // The keyframe is the game as its tick is about to run, so it must come after every event before that tick.
    if (this.events.some((e) => e.seq > msg.lastSeq && e.tick < msg.tick)) return
    try {
      const world = JSON.parse(msg.world) as { tick?: unknown; targets?: unknown; bricks?: unknown }
      if (!world || typeof world !== 'object' || world.tick !== msg.tick || !Array.isArray(world.targets) || world.bricks !== undefined) throw new Error('shape')
    } catch {
      this.stats.badKeyframes++
      return
    }
    this.base = { tick: msg.tick, project: this.projectAt(msg.tick), world: msg.world }
    this.events = this.events.filter((e) => e.tick >= msg.tick)
    this.stats.keyframes++
  }

  /** The project as `tick` is about to run: the base's, or the latest project event before it. */
  private projectAt(tick: number): string {
    let project = this.base!.project
    let at = -1
    for (const e of this.events) {
      if (e.ev.t === 'project' && e.tick < tick && e.tick >= at) {
        project = e.ev.text
        at = e.tick
      }
    }
    return project
  }

  private resync(num: number) {
    if (!this.base) return
    for (const [s, o] of this.clients) {
      if (o.hello && o.num === num) {
        this.stats.resyncs++
        this.send(s, { type: 'resync', base: this.base, events: this.events })
      }
    }
  }

  /** Who sends keyframes: the longest-connected player. */
  private provider(): Client | undefined {
    let best: Client | undefined
    for (const c of this.clients.values()) if (c.hello && (!best || c.joinedAt < best.joinedAt)) best = c
    return best
  }

  private broadcastSettings() {
    this.broadcast({ type: 'settings', settings: { ...this.settings }, banned: this.banned.size })
  }

  private send(sock: RoomSocket, msg: ServerMsg) {
    try {
      sock.send(JSON.stringify(msg))
    } catch {
      // The socket is closing; its close handler will clean up.
    }
  }

  private broadcast(msg: ServerMsg, except?: RoomSocket) {
    const data = JSON.stringify(msg)
    for (const [s, c] of this.clients) {
      if (s === except || !c.hello) continue
      try {
        s.send(data)
      } catch {
        // ignore; closed sockets are removed by their close handler
      }
    }
  }

  private fail(sock: RoomSocket, code: Extract<ServerMsg, { type: 'error' }>['code'], message: string, close = false) {
    this.send(sock, { type: 'error', code, message })
    if (close) {
      try {
        sock.close(4000, code)
      } catch {
        // already closed
      }
    }
  }
}
