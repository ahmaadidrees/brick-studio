/**
 * A Hackable room connection (docs/qa/hackable-rooms M1): the classic rooms' RoomLink (src/platformer/net/roomLink.ts)
 * for the Hackable protocol. It keeps an estimate of the room's clock, so every game counts the same ticks; sends our
 * events, fingerprints and keyframes; and reconnects by itself, fetching a fresh address each time when it needs one
 * (class rooms need a new ticket for every connection).
 *
 * The classic link stays as it is: the two protocols differ in their events, their joining copy and in poses, and the
 * classic rooms are live in classes.
 */
import { TICK_MS } from '../core/contracts'
import {
  HACKABLE_PROTOCOL,
  type Base,
  type ClientMsg,
  type HistoryItem,
  type PlayerEv,
  type PlayerInfo,
  type RoomSettings,
  type ServerMsg,
  type StampedEvent,
} from './protocol'

export type LinkStatus = 'connecting' | 'online' | 'reconnecting' | 'offline'

export interface Welcome {
  you: number
  host: boolean
  title: string
  base: Base
  events: StampedEvent[]
  players: PlayerInfo[]
  settings: RoomSettings
  classroom: boolean
  /** A reconnect after a dropped connection, not the first join. */
  reconnect: boolean
  /** M2: the room's recent changes. */
  history: HistoryItem[]
}

export interface LinkHandlers {
  welcome(w: Welcome): void
  resync(base: Base, events: StampedEvent[]): void
  event(e: StampedEvent, mine: boolean): void
  reject(cid: string, reason: string): void
  players(list: PlayerInfo[]): void
  settings(s: RoomSettings, banned: number): void
  notice(message: string): void
  status(s: LinkStatus, detail?: string): void
  /** M2: the room's recent changes changed. */
  history?(items: HistoryItem[]): void
  /** M2: a brick's blocks, as asked for. */
  workspace?(id: string, ws: unknown): void
}

/** The socket a link opens; tests pass an in-process one. */
export interface LinkSocket {
  readonly readyState: number
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((e: { data: unknown }) => void) | null
  onclose: (() => void) | null
}

export interface LinkOptions {
  /** Where to connect: an address, or a function that fetches a fresh one. */
  url: string | (() => Promise<string>)
  /** Identifies this browser (so it can reconnect to a closed room). */
  key?: string
  /** Test rooms only: the host key the in-process room was made with. */
  hostKey?: string
  /** Defaults to the browser's WebSocket. */
  socket?: (url: string) => LinkSocket
  /** Defaults to performance.now. */
  now?: () => number
}

const OPEN = 1
const CONNECTING = 0

/** What a kid sees when the room is full (the server holds the cap). */
export const ROOM_FULL_MESSAGE = 'This room is full. Try again when someone leaves.'

function isRefusal(error: unknown): boolean {
  const status = (error as { status?: number })?.status ?? 0
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

export class HackableRoomLink {
  num = 0
  host = false
  readonly clientId = Math.random().toString(36).slice(2, 10)
  epoch = 0
  lastSeq = 0
  rtt = 0
  players: PlayerInfo[] = []
  status: LinkStatus = 'connecting'
  /** Why the room turned this player away (`full`, `closed`, `kicked`…), until the next try. */
  refusal: string | null = null
  private ws: LinkSocket | null = null
  private offset = 0
  private samples: { rtt: number; offset: number }[] = []
  private synced = false
  private joinedOnce = false
  private pingTimer: ReturnType<typeof setInterval> | undefined
  private retry = 0
  private closed = false
  private generation = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private watchdog: ReturnType<typeof setTimeout> | undefined
  private readonly key: string
  private readonly openSocket: (url: string) => LinkSocket
  private readonly clock: () => number

  constructor(
    private name: string,
    private readonly h: LinkHandlers,
    private readonly opts: LinkOptions,
  ) {
    this.key = opts.key ?? Math.random().toString(36).slice(2, 14)
    this.openSocket = opts.socket ?? ((url) => new WebSocket(url) as unknown as LinkSocket)
    this.clock = opts.now ?? (() => performance.now())
  }

  get isProvider(): boolean {
    return this.players.some((p) => p.num === this.num && p.provider)
  }

  connect() {
    if (this.ws && (this.ws.readyState === CONNECTING || this.ws.readyState === OPEN)) return
    this.closed = false
    this.refusal = null
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    clearTimeout(this.watchdog)
    this.watchdog = undefined
    const generation = ++this.generation
    this.setStatus(this.retry ? 'reconnecting' : 'connecting')
    const open = (url: string) => {
      if (this.closed || generation !== this.generation) return
      const ws = this.openSocket(url)
      this.ws = ws
      const armWatchdog = () => {
        clearTimeout(this.watchdog)
        this.watchdog = setTimeout(() => {
          if (generation === this.generation && this.ws === ws && !this.closed) this.failAttempt(ws, generation)
        }, 10_000)
      }
      armWatchdog()
      ws.onopen = () => {
        if (generation !== this.generation || this.ws !== ws || this.closed) return
        armWatchdog()
        this.send({ type: 'hello', v: HACKABLE_PROTOCOL, name: this.name, key: this.key, ...(this.opts.hostKey ? { host: this.opts.hostKey } : {}) })
      }
      ws.onmessage = (e) => {
        if (generation === this.generation && this.ws === ws && !this.closed) {
          armWatchdog()
          this.receive(e.data as string)
        }
      }
      ws.onclose = () => {
        if (generation !== this.generation || this.ws !== ws) return
        this.ws = null
        ++this.generation
        clearTimeout(this.watchdog)
        this.watchdog = undefined
        clearInterval(this.pingTimer)
        this.synced = false
        if (!this.closed) this.scheduleRetry()
      }
    }
    const url = this.opts.url
    if (typeof url === 'string') return open(url)
    this.watchdog = setTimeout(() => {
      if (generation === this.generation && !this.closed) {
        ++this.generation
        this.scheduleRetry()
      }
    }, 10_000)
    url().then((address) => {
      if (generation !== this.generation || this.closed) return
      clearTimeout(this.watchdog)
      this.watchdog = undefined
      open(address)
    }, (error: unknown) => {
      if (generation !== this.generation || this.closed) return
      clearTimeout(this.watchdog)
      this.watchdog = undefined
      if (isRefusal(error)) this.stop('access', error instanceof Error && error.message ? error.message : 'You can’t open this room right now.')
      else {
        ++this.generation
        this.scheduleRetry()
      }
    })
  }

  private failAttempt(ws: LinkSocket, generation: number) {
    if (generation !== this.generation || this.ws !== ws) return
    clearTimeout(this.watchdog)
    clearInterval(this.pingTimer)
    this.synced = false
    this.ws = null
    ++this.generation
    try { ws.close() } catch { /* already closed */ }
    if (!this.closed) this.scheduleRetry()
  }

  private scheduleRetry() {
    if (this.closed || this.retryTimer) return
    this.setStatus('reconnecting')
    const wait = Math.min(8000, 800 * 2 ** this.retry++)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      if (!this.closed) this.connect()
    }, wait)
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
        this.offset = msg.now - this.clock()
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
        this.h.welcome({ you: msg.you, host: msg.host, title: msg.title, base: msg.base, events: msg.events, players: msg.players, settings: msg.settings, classroom: msg.classroom, reconnect, history: msg.history ?? [] })
        return
      }
      case 'ev':
        this.lastSeq = Math.max(this.lastSeq, msg.e.seq)
        this.h.event(msg.e, msg.e.cid.startsWith(this.clientId + ':'))
        return
      case 'reject':
        this.h.reject(msg.cid, msg.reason)
        return
      case 'pong': {
        const now = this.clock()
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
      case 'notice':
        this.h.notice(msg.message)
        return
      case 'history':
        this.h.history?.(msg.history)
        return
      case 'workspace':
        this.h.workspace?.(msg.id, msg.ws)
        return
      case 'resync':
        this.lastSeq = msg.events.reduce((m, e) => Math.max(m, e.seq), this.lastSeq)
        this.h.resync(msg.base, msg.events)
        return
      case 'error':
        if (msg.code === 'rate') {
          if (this.ws) this.failAttempt(this.ws, this.generation)
        } else if (msg.code === 'full') {
          this.stop('full', ROOM_FULL_MESSAGE)
        } else if (msg.code === 'access' || msg.code === 'version' || msg.code === 'closed' || msg.code === 'kicked') {
          this.stop(msg.code, msg.message)
        }
        return
    }
  }

  private ping() {
    this.send({ type: 'ping', c: this.clock() })
  }

  private send(msg: ClientMsg) {
    const ws = this.ws
    if (ws?.readyState === OPEN) ws.send(JSON.stringify(msg))
  }

  /** The room's tick now, with a fraction; null until the room has said welcome. */
  serverTick(now = this.clock()): number | null {
    if (!this.synced) return null
    return (now + this.offset - this.epoch) / TICK_MS
  }

  sendEvent(cid: string, tick: number, ev: PlayerEv) {
    this.send({ type: 'ev', cid, tick, ev })
  }

  sendHash(tick: number, h: number) {
    this.send({ type: 'hash', tick, h })
  }

  sendKeyframe(tick: number, world: string) {
    this.send({ type: 'keyframe', tick, lastSeq: this.lastSeq, world })
  }

  /** Our game can't catch up by itself: ask for a fresh copy. */
  askSync() {
    this.send({ type: 'sync' })
  }

  setName(name: string) {
    this.name = name
    this.send({ type: 'name', name })
  }

  // Host controls (the room ignores them from anyone else).
  setClosed(closed: boolean) {
    this.send({ type: 'settings', closed })
  }

  /** M2 (host): everyone may build, or change code. */
  setRoles(roles: { build?: boolean; code?: boolean }) {
    this.send({ type: 'settings', ...roles })
  }

  /** M2 (host): let one player change code, or not. */
  grant(num: number, code: boolean) {
    this.send({ type: 'grant', num, code })
  }

  /** M2: what we are editing now. */
  presence(what: string | null) {
    this.send({ type: 'presence', what })
  }

  /** M2: ask for a brick's blocks. */
  askWorkspace(id: string) {
    this.send({ type: 'workspace', id })
  }

  /** M2: put back a change. */
  undo(seq: number) {
    this.send({ type: 'undo', seq })
  }

  kick(num: number) {
    this.send({ type: 'kick', num })
  }

  unban() {
    this.send({ type: 'unban' })
  }

  /** The room said no: no more tries until the player asks (connect() again). */
  private stop(reason: string, message: string) {
    this.closed = true
    this.refusal = reason
    clearTimeout(this.watchdog)
    this.watchdog = undefined
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    clearInterval(this.pingTimer)
    this.synced = false
    this.ws?.close()
    this.setStatus('offline', message)
  }

  close() {
    this.closed = true
    ++this.generation
    clearTimeout(this.retryTimer)
    clearTimeout(this.watchdog)
    this.retryTimer = undefined
    this.watchdog = undefined
    clearInterval(this.pingTimer)
    this.ws?.close()
    this.setStatus('offline')
  }
}
