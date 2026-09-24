import { TICK_MS } from '../engine/constants'
import { editDesign } from '../engine/designEdit'
import { isValidEvent } from '../engine/events'
import { levelFromJson, levelToJson, type LevelDesign, type LevelJson } from '../engine/level'
import {
  DEFAULT_SETTINGS,
  HASH_EVERY,
  MAX_EARLY,
  MAX_KEYFRAME_BYTES,
  MAX_LATE,
  MAX_MESSAGE_BYTES,
  MAX_PLAYERS,
  PROTOCOL,
  cleanName,
  isValidPose,
  type Base,
  type ClientMsg,
  type PlayerInfo,
  type Pose,
  type RoomSettings,
  type ServerMsg,
  type StampedEvent,
} from './protocol'

/**
 * One room's server logic, free of any hosting details so it can be tested directly. The Worker's
 * PlatformerRoom Durable Object feeds it sockets and messages, calls flushPoses() as poses arrive,
 * and saves `design` and `meta()` when they change.
 */

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
  /** False for players who may look and play but not build. Defaults to true. */
  canBuild?: boolean
  /** Keep this player number if it is free (a room rebuilding itself after a restart). */
  num?: number
}

interface Client {
  num: number
  name: string
  key: string
  host: boolean
  canBuild: boolean
  joinedAt: number
  hello: boolean
  trusted?: TrustedIdentity
  windowStart: number
  events: number
  poses: number
}

export interface RoomMeta {
  settings: RoomSettings
  /** The level as the host last saved it (or as the room was opened). */
  savedLevel: LevelJson | null
  /** Identities the host removed; they cannot come back. */
  banned: string[]
}

export interface RoomCoreOptions {
  now?: () => number
  /** Guest rooms run in-process (tests): whoever says hello with this key hosts. */
  hostKey?: string | null
  meta?: Partial<RoomMeta>
  /** Class rooms save to the account world by themselves, so the room's own save and restore are off. */
  classroom?: boolean
}

/** A connected player as the host sees it. */
export interface RoomPlayer {
  num: number
  key: string
  name: string
  host: boolean
  canBuild: boolean
}

const EVENTS_PER_SECOND = 90
const POSES_PER_SECOND = 45

export class RoomCore {
  design: LevelDesign
  /** The design changed since it was last saved. */
  dirty = false
  /** Settings, saved level or removed-player list changed since last saved. */
  metaDirty = false
  readonly classroom: boolean
  private readonly now: () => number
  private readonly hostKey: string | null
  private settings: RoomSettings
  private savedLevel: LevelJson | null
  private banned: Set<string>
  /** Identities that joined during this live session (they may reconnect to a closed room). */
  private admitted = new Set<string>()
  private clients = new Map<RoomSocket, Client>()
  private epoch = 0
  private base: Base | null = null
  private events: StampedEvent[] = []
  private seq = 0
  private hashes = new Map<number, Map<number, number>>()
  private poses = new Map<number, Pose>()
  private lastPoseFlush = 0
  private joinCounter = 0
  stats = { events: 0, rejected: 0, resyncs: 0, keyframes: 0, restores: 0 }

  constructor(
    readonly roomId: string,
    design: LevelDesign,
    opts: RoomCoreOptions = {},
  ) {
    this.design = design
    this.now = opts.now ?? (() => Date.now())
    this.hostKey = opts.hostKey ?? null
    this.classroom = opts.classroom ?? false
    this.settings = { ...DEFAULT_SETTINGS, ...opts.meta?.settings }
    this.savedLevel = opts.meta?.savedLevel ?? levelToJson(design)
    this.banned = new Set(opts.meta?.banned ?? [])
  }

  meta(): RoomMeta {
    return { settings: { ...this.settings }, savedLevel: this.savedLevel, banned: [...this.banned] }
  }

  get playerCount(): number {
    let n = 0
    for (const c of this.clients.values()) if (c.hello) n++
    return n
  }

  get isClosed(): boolean {
    return this.settings.closed
  }

  /** Whether anyone is playing now (a live session with a clock and an event log). */
  get live(): boolean {
    return this.base !== null
  }

  serverTick(): number {
    return Math.floor((this.now() - this.epoch) / TICK_MS)
  }

  connect(sock: RoomSocket, trusted?: TrustedIdentity) {
    this.clients.set(sock, { num: 0, name: '', key: '', host: false, canBuild: true, joinedAt: 0, hello: false, trusted, windowStart: this.now(), events: 0, poses: 0 })
  }

  disconnect(sock: RoomSocket) {
    const c = this.clients.get(sock)
    this.clients.delete(sock)
    if (!c?.hello) return
    this.poses.delete(c.num)
    if (this.playerCount === 0) {
      // Nobody left: the next person to arrive starts a fresh world from the saved design.
      this.base = null
      this.events = []
      this.hashes.clear()
      this.poses.clear()
    } else this.broadcast({ type: 'players', players: this.players() })
  }

  /** A connected player, once they have said hello. */
  player(sock: RoomSocket): RoomPlayer | undefined {
    const c = this.clients.get(sock)
    return c?.hello ? { num: c.num, key: c.key, name: c.name, host: c.host, canBuild: c.canBuild } : undefined
  }

  message(sock: RoomSocket, raw: string) {
    const c = this.clients.get(sock)
    if (!c) return
    if (raw.length > MAX_KEYFRAME_BYTES) return this.fail(sock, 'too_big', 'Message too large')
    let msg: ClientMsg
    try {
      msg = JSON.parse(raw) as ClientMsg
    } catch {
      return this.fail(sock, 'bad_json', 'Could not read message')
    }
    if (!msg || typeof msg !== 'object') return
    if (msg.type !== 'keyframe' && raw.length > MAX_MESSAGE_BYTES) return this.fail(sock, 'too_big', 'Message too large')
    if (msg.type === 'hello') return this.hello(sock, c, msg)
    if (!c.hello) return this.fail(sock, 'no_hello', 'Say hello first')
    const now = this.now()
    if (now - c.windowStart >= 1000) {
      c.windowStart = now
      c.events = 0
      c.poses = 0
    }
    switch (msg.type) {
      case 'ev':
        if (++c.events > EVENTS_PER_SECOND) return
        return this.event(sock, c, msg)
      case 'pose':
        if (++c.poses > POSES_PER_SECOND || !isValidPose(msg.p)) return
        this.poses.set(c.num, msg.p)
        return
      case 'ping':
        if (typeof msg.c === 'number') this.send(sock, { type: 'pong', c: msg.c, s: now })
        return
      case 'hash':
        return this.hash(c, msg.tick, msg.h)
      case 'keyframe':
        return this.keyframe(c, msg)
      case 'bonk':
        for (const [s, o] of this.clients) if (o.hello && o.num === msg.target) this.send(s, { type: 'bonk', from: c.num })
        return
      case 'name':
        // Names from accounts stay as they are.
        if (c.trusted?.name) return
        c.name = cleanName(msg.name)
        return this.broadcast({ type: 'players', players: this.players() })
      case 'settings':
        if (!c.host) return
        if (typeof msg.buildLocked === 'boolean') this.settings.buildLocked = msg.buildLocked
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
      case 'save':
        if (!c.host || this.classroom) return
        this.savedLevel = levelToJson(this.design)
        this.metaDirty = true
        return this.send(sock, { type: 'saved' })
      case 'restore':
        if (c.host && !this.classroom && this.savedLevel) {
          this.replaceLevel(this.savedLevel, true)
          this.notice('The host put the level back to its last save.')
        }
        return
    }
  }

  /**
   * Poses go out together. Called as poses arrive: at most once every 50 ms, or at once with `force`.
   * Returns whether anything was sent.
   */
  flushPoses(force = false): boolean {
    if (!this.poses.size) return false
    const now = this.now()
    if (!force && now - this.lastPoseFlush < 50) return false
    this.lastPoseFlush = now
    const list: [number, Pose][] = [...this.poses]
    this.poses.clear()
    this.broadcast({ type: 'poses', list })
    return true
  }

  /**
   * Replace the whole level for everyone, a moment in the future so nobody has to rewind: a restored save, or a
   * newer copy of a class world from the database. With nobody here, the next session simply starts from it.
   */
  replaceLevel(level: LevelJson, markDirty: boolean): boolean {
    let design: LevelDesign
    try {
      design = levelFromJson(level)
    } catch {
      return false
    }
    this.design = design
    this.dirty = markDirty
    this.stats.restores++
    if (!this.base) return true
    const tick = Math.max(this.serverTick() + 3, this.base.tick + 1)
    const e: StampedEvent = { tick, seq: ++this.seq, by: 0, cid: `room:${this.seq}`, ev: { t: 'load', level: levelToJson(design) } }
    this.events.push(e)
    this.broadcast({ type: 'ev', e })
    return true
  }

  /** Change what one connected player may do (their class access changed while they were here). */
  updatePlayer(sock: RoomSocket, patch: { canBuild?: boolean; host?: boolean }) {
    const c = this.clients.get(sock)
    if (!c) return
    if (c.trusted) c.trusted = { ...c.trusted, ...patch }
    if (!c.hello) return
    let changed = false
    if (patch.canBuild !== undefined && patch.canBuild !== c.canBuild) {
      c.canBuild = patch.canBuild
      changed = true
    }
    if (patch.host !== undefined && patch.host !== c.host) {
      c.host = patch.host
      changed = true
    }
    if (changed) this.broadcast({ type: 'players', players: this.players() })
  }

  /** Tell everyone something (the level was reloaded, saving is delayed). */
  /** The host refused an event before the room saw it (a classroom access check could not run). */
  rejectEvent(sock: RoomSocket, cid: string, reason: Extract<ServerMsg, { type: 'reject' }>['reason']) {
    if (typeof cid === 'string' && cid.length <= 64) this.send(sock, { type: 'reject', cid, reason })
  }

  notice(message: string) {
    this.broadcast({ type: 'notice', message })
  }

  /** Close one connection with a reason the player sees. */
  refuse(sock: RoomSocket, code: Extract<ServerMsg, { type: 'error' }>['code'], message: string) {
    this.fail(sock, code, message, true)
    this.disconnect(sock)
  }

  // -------------------------------------------------------------------------------------------

  private hello(sock: RoomSocket, c: Client, msg: Extract<ClientMsg, { type: 'hello' }>) {
    if (c.hello) return
    if (msg.v !== PROTOCOL) return this.fail(sock, 'version', 'The game was updated. Reload the page to join.', true)
    const t = c.trusted
    const key = t?.key ?? (typeof msg.key === 'string' ? msg.key.slice(0, 64) : '')
    const host = t ? t.host : !!this.hostKey && msg.host === this.hostKey
    if (!host && key && this.banned.has(key)) return this.fail(sock, 'kicked', 'The host removed you from this room.', true)
    if (!host && this.settings.closed && !this.admitted.has(key)) return this.fail(sock, 'closed', 'The host has closed this room to new players.', true)
    if (this.playerCount >= MAX_PLAYERS) return this.fail(sock, 'full', `This room is full (${MAX_PLAYERS} players).`, true)
    const used = new Set<number>()
    for (const o of this.clients.values()) if (o.hello) used.add(o.num)
    let num = t?.num && t.num > 0 && t.num <= MAX_PLAYERS && !used.has(t.num) ? t.num : 1
    while (used.has(num)) num++
    c.num = num
    c.name = t?.name ? t.name.slice(0, 24) : cleanName(msg.name)
    c.key = key
    c.host = host
    c.canBuild = t?.canBuild ?? true
    c.hello = true
    c.joinedAt = ++this.joinCounter
    if (key) this.admitted.add(key)
    if (!this.base) {
      this.epoch = this.now()
      this.base = { tick: 0, level: levelToJson(this.design) }
      this.events = []
      this.seq = 0
      this.hashes.clear()
    }
    this.send(sock, {
      type: 'welcome',
      you: num,
      host,
      roomId: this.roomId,
      epoch: this.epoch,
      now: this.now(),
      base: this.base,
      events: this.events,
      players: this.players(),
      settings: { ...this.settings },
      canBuild: c.canBuild,
      classroom: this.classroom,
    })
    this.broadcast({ type: 'players', players: this.players() }, sock)
  }

  private event(sock: RoomSocket, c: Client, msg: Extract<ClientMsg, { type: 'ev' }>) {
    if (typeof msg.cid !== 'string' || msg.cid.length > 48 || !Number.isInteger(msg.tick)) return
    if (!isValidEvent(msg.ev, this.design.width, this.design.height)) {
      this.stats.rejected++
      return this.send(sock, { type: 'reject', cid: msg.cid, reason: 'invalid' })
    }
    if (msg.ev.t === 'edit' && !c.canBuild) {
      this.stats.rejected++
      return this.send(sock, { type: 'reject', cid: msg.cid, reason: 'read_only' })
    }
    if (msg.ev.t === 'edit' && this.settings.buildLocked && !c.host) {
      this.stats.rejected++
      return this.send(sock, { type: 'reject', cid: msg.cid, reason: 'locked' })
    }
    if (msg.ev.t === 'reset' && !c.host) {
      this.stats.rejected++
      return this.send(sock, { type: 'reject', cid: msg.cid, reason: 'host_only' })
    }
    const st = this.serverTick()
    const lo = Math.max(st - MAX_LATE, (this.base?.tick ?? 0) + 1)
    const tick = Math.min(Math.max(msg.tick, lo), st + MAX_EARLY)
    const e: StampedEvent = { tick, seq: ++this.seq, by: c.num, cid: msg.cid, ev: msg.ev }
    this.events.push(e)
    this.stats.events++
    if (msg.ev.t === 'edit') {
      for (const op of msg.ev.ops) if (editDesign(this.design, op)) this.dirty = true
    }
    this.broadcast({ type: 'ev', e })
  }

  private kick(num: number) {
    for (const [s, o] of this.clients) {
      if (!o.hello || o.num !== num || o.host) continue
      if (o.key) {
        this.banned.add(o.key)
        this.admitted.delete(o.key)
      }
      this.metaDirty = true
      this.fail(s, 'kicked', 'The host removed you from this room.', true)
      this.clients.delete(s)
      this.poses.delete(num)
    }
    this.broadcast({ type: 'players', players: this.players() })
    this.broadcastSettings()
  }

  /** The provider's hash is the reference; anyone who disagrees gets a fresh copy. */
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

  private keyframe(c: Client, msg: Extract<ClientMsg, { type: 'keyframe' }>) {
    const provider = this.provider()
    if (!provider || provider.num !== c.num || !this.base) return
    const st = this.serverTick()
    if (!Number.isInteger(msg.tick) || msg.tick <= this.base.tick || msg.tick > st - MAX_LATE - 1) return
    if (!msg.world || typeof msg.world !== 'object' || msg.world.tick !== msg.tick) return
    // The snapshot must include every event up to its tick.
    if (this.events.some((e) => e.seq > msg.lastSeq && e.tick <= msg.tick)) return
    this.base = { tick: msg.tick, world: msg.world }
    this.events = this.events.filter((e) => e.tick > msg.tick)
    this.stats.keyframes++
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

  private provider(): Client | undefined {
    let best: Client | undefined
    for (const c of this.clients.values()) if (c.hello && (!best || c.joinedAt < best.joinedAt)) best = c
    return best
  }

  players(): PlayerInfo[] {
    const provider = this.provider()
    return [...this.clients.values()]
      .filter((c) => c.hello)
      .sort((a, b) => a.num - b.num)
      .map((c) => ({ num: c.num, name: c.name, provider: c === provider, host: c.host, canBuild: c.canBuild }))
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
