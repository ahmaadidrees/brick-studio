import { TICK_MS } from '@brick-studio/platformer-core/engine/constants'
import type { WorldJson } from '@brick-studio/platformer-core/engine/world'
import {
  PROTOCOL,
  type Base,
  type ClientMsg,
  type PlayerInfo,
  type Pose,
  type RoomSettings,
  type ServerMsg,
  type StampedEvent,
} from '@brick-studio/platformer-core/net/protocol'
import type { EventRecord } from '@brick-studio/platformer-core/net/timeline'
import type { Link } from '../game/session'

export type LinkStatus = 'connecting' | 'online' | 'reconnecting' | 'offline'

export interface Welcome {
  you: number
  host: boolean
  base: Base
  events: StampedEvent[]
  players: PlayerInfo[]
  settings: RoomSettings
  /** Whether this player may build at all (class rooms: false for look-only classmates). */
  canBuild: boolean
  /** A class level's room: it saves to the account by itself. */
  classroom: boolean
  /** True when this is a reconnect after a dropped connection, not the first join. */
  reconnect: boolean
}

export interface RoomHandlers {
  welcome(w: Welcome): void
  resync(base: Base, events: StampedEvent[]): void
  event(e: StampedEvent, mine: boolean): void
  reject(cid: string, reason: string): void
  pose(from: number, p: Pose): void
  players(list: PlayerInfo[]): void
  settings(s: RoomSettings, banned: number): void
  saved(): void
  notice(message: string): void
  bonk(from: number): void
  status(s: LinkStatus, detail?: string): void
}

export interface RoomLinkOptions {
  /** Where to connect: an address, or a function that fetches a fresh one (class rooms need a new ticket each time). */
  url: string | (() => Promise<string>)
  /** Identifies this browser to guest rooms (so it can reconnect to a closed room). */
  key?: string
}

/** Errors from getting a class-room address that mean "you cannot come in", not "try again". */
function isRefusal(error: unknown): boolean {
  const status = (error as { status?: number })?.status ?? 0
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

/**
 * A live room connection. Keeps an estimate of the server's clock (so every game counts the same
 * ticks), sends our events and pose, and hands everything that arrives to the session.
 */
export class RoomLink implements Link {
  num = 0
  host = false
  readonly clientId = Math.random().toString(36).slice(2, 10)
  epoch = 0
  lastSeq = 0
  rtt = 0
  players: PlayerInfo[] = []
  status: LinkStatus = 'connecting'
  /** Simulated one-way network delay for testing (?lag=ms in the page URL), with some jitter. */
  lagMs = 0
  private ws: WebSocket | null = null
  private offset = 0
  private samples: { rtt: number; offset: number }[] = []
  private synced = false
  private joinedOnce = false
  private pingTimer: ReturnType<typeof setInterval> | undefined
  private retry = 0
  private closed = false
  private sendAt = 0
  private recvAt = 0
  private readonly url: RoomLinkOptions['url']
  private readonly key: string

  constructor(
    readonly roomId: string,
    private name: string,
    private readonly h: RoomHandlers,
    opts: RoomLinkOptions,
  ) {
    this.url = opts.url
    this.key = opts.key ?? Math.random().toString(36).slice(2, 14)
  }

  get isProvider(): boolean {
    return this.players.some((p) => p.num === this.num && p.provider)
  }

  connect() {
    this.closed = false
    this.setStatus(this.retry ? 'reconnecting' : 'connecting')
    const open = (url: string) => {
      if (this.closed) return
      const ws = new WebSocket(url)
      this.ws = ws
      ws.onopen = () => this.send({ type: 'hello', v: PROTOCOL, name: this.name, key: this.key })
      ws.onmessage = (e) => this.later('recv', () => this.receive(e.data as string))
      ws.onclose = () => {
        clearInterval(this.pingTimer)
        this.synced = false
        if (!this.closed) this.scheduleRetry()
      }
    }
    if (typeof this.url === 'string') return open(this.url)
    this.url().then(open, (error: unknown) => {
      if (this.closed) return
      if (isRefusal(error)) {
        this.closed = true
        this.setStatus('offline', error instanceof Error ? error.message : 'You cannot join this world right now.')
      } else this.scheduleRetry()
    })
  }

  private scheduleRetry() {
    this.setStatus('reconnecting')
    const wait = Math.min(8000, 800 * 2 ** this.retry++)
    setTimeout(() => !this.closed && this.connect(), wait)
  }

  /** Deliver in order, after the simulated delay (or at once when there is none). */
  private later(dir: 'send' | 'recv', fn: () => void) {
    if (!this.lagMs) return fn()
    const now = performance.now()
    const at = Math.max(dir === 'send' ? this.sendAt : this.recvAt, now + this.lagMs * (0.85 + Math.random() * 0.3))
    if (dir === 'send') this.sendAt = at
    else this.recvAt = at
    setTimeout(fn, at - now)
  }

  private setStatus(s: LinkStatus, detail?: string) {
    this.status = s
    this.h.status(s, detail)
  }

  private receive(data: string) {
    let msg: ServerMsg
    try {
      msg = JSON.parse(data) as ServerMsg
    } catch {
      return
    }
    switch (msg.type) {
      case 'welcome': {
        this.num = msg.you
        this.host = msg.host
        this.epoch = msg.epoch
        this.offset = msg.now - performance.now()
        this.samples = []
        this.synced = true
        this.retry = 0
        this.players = msg.players
        this.lastSeq = msg.events.reduce((m, e) => Math.max(m, e.seq), 0)
        this.setStatus('online')
        // A burst of pings to learn the clock quickly, then one every two seconds.
        let burst = 0
        this.ping()
        clearInterval(this.pingTimer)
        this.pingTimer = setInterval(() => {
          if (burst++ < 6 || burst % 20 === 0) this.ping()
        }, 100)
        const reconnect = this.joinedOnce
        this.joinedOnce = true
        this.h.welcome({
          you: msg.you,
          host: msg.host,
          base: msg.base,
          events: msg.events,
          players: msg.players,
          settings: msg.settings,
          canBuild: msg.canBuild,
          classroom: msg.classroom,
          reconnect,
        })
        return
      }
      case 'ev':
        this.lastSeq = Math.max(this.lastSeq, msg.e.seq)
        this.h.event(msg.e, msg.e.cid.startsWith(this.clientId + ':'))
        return
      case 'reject':
        this.h.reject(msg.cid, msg.reason)
        return
      case 'poses':
        for (const [from, p] of msg.list) if (from !== this.num) this.h.pose(from, p)
        return
      case 'pong': {
        const now = performance.now()
        const rtt = now - msg.c
        this.samples.push({ rtt, offset: msg.s + rtt / 2 - now })
        if (this.samples.length > 10) this.samples.shift()
        const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a))
        this.offset = best.offset
        this.rtt = Math.round(best.rtt)
        return
      }
      case 'players':
        this.players = msg.players
        this.host = msg.players.find((p) => p.num === this.num)?.host ?? this.host
        this.h.players(msg.players)
        return
      case 'settings':
        this.h.settings(msg.settings, msg.banned)
        return
      case 'saved':
        this.h.saved()
        return
      case 'notice':
        this.h.notice(msg.message)
        return
      case 'resync':
        this.lastSeq = msg.events.reduce((m, e) => Math.max(m, e.seq), this.lastSeq)
        this.h.resync(msg.base, msg.events)
        return
      case 'bonk':
        this.h.bonk(msg.from)
        return
      case 'error':
        if (msg.code === 'full' || msg.code === 'version' || msg.code === 'closed' || msg.code === 'kicked' || msg.code === 'access' || msg.code === 'rate') {
          this.closed = true
          this.setStatus('offline', msg.message)
        }
        return
    }
  }

  private ping() {
    this.send({ type: 'ping', c: performance.now() })
  }

  private send(msg: ClientMsg) {
    const data = JSON.stringify(msg)
    const ws = this.ws
    this.later('send', () => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(data)
    })
  }

  serverTick(now: number): number | null {
    if (!this.synced) return null
    return (now + this.offset - this.epoch) / TICK_MS
  }

  sendEvent(rec: EventRecord) {
    this.send({ type: 'ev', cid: rec.cid, tick: rec.tick, ev: rec.ev })
  }

  sendPose(p: Pose) {
    this.send({ type: 'pose', p })
  }

  sendHash(tick: number, h: number) {
    this.send({ type: 'hash', tick, h })
  }

  sendKeyframe(tick: number, world: WorldJson) {
    this.send({ type: 'keyframe', tick, lastSeq: this.lastSeq, world })
  }

  sendBonk(target: number) {
    this.send({ type: 'bonk', target })
  }

  setName(name: string) {
    this.name = name
    this.send({ type: 'name', name })
  }

  // Host controls (the server ignores them from anyone else).
  setSettings(s: Partial<RoomSettings>) {
    this.send({ type: 'settings', ...s })
  }

  kick(num: number) {
    this.send({ type: 'kick', num })
  }

  unban() {
    this.send({ type: 'unban' })
  }

  saveLevel() {
    this.send({ type: 'save' })
  }

  restoreLevel() {
    this.send({ type: 'restore' })
  }

  close() {
    this.closed = true
    clearInterval(this.pingTimer)
    this.ws?.close()
    this.setStatus('offline')
  }
}
