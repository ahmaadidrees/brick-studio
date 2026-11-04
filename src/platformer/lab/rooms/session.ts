/**
 * Playing in a Hackable room (docs/qa/hackable-rooms M1): the room connection, the timeline and the game, together.
 *
 * The game runs on the room's clock: each frame it plays up to the room's tick now. Our own keys go into our game at
 * once and to the room; everyone else's arrive a few ticks late and the timeline goes back for them. Every HASH_EVERY
 * ticks, once nothing can still change that tick, the game sends the room its fingerprint; the provider also sends a
 * keyframe every KEYFRAME_EVERY ticks for people joining. A game the room finds out of step is replaced by a fresh copy.
 */
import type { Runtime } from '../core'
import type { BroadcastListener } from '../core/runtime'
import { worldFingerprint, worldToJson } from '../core/snapshot'
import { applyRoomEvent, gameFromBase } from './game'
import { HackableRoomLink, type LinkOptions, type LinkStatus } from './link'
import { HASH_EVERY, KEYFRAME_EVERY, MAX_LATE, type Base, type PlayerEv, type PlayerInfo, type RoomEv, type RoomSettings, type StampedEvent } from './protocol'
import { HackableTimeline, type EventRecord } from './timeline'

/** Runtime methods that change the game: in a room only the room's events may, so the screen's calls do nothing. */
const LOCAL_ONLY = new Set<PropertyKey>(['step', 'stop', 'stopAll', 'greenFlag', 'clickTarget', 'restoreWorld', 'startHats', 'startStack', 'broadcast', 'addClone', 'removeClone', 'stopTarget', 'evalExpr', 'random'])
/** While the game is not on screen, it still keeps up with the room (fingerprints, keyframes, events) this often. */
const BACKGROUND_FRAME_MS = 100

/** A tick is settled (no event can still land on it) this long after it ran. */
const SETTLED = MAX_LATE + 5
/** At most this many ticks per frame; a game further behind catches up over a few frames. */
const MAX_TICKS_PER_FRAME = 300

export interface RoomView {
  status: LinkStatus
  /** Why we are offline, in words for the player. */
  detail?: string
  title: string
  me: number
  host: boolean
  players: PlayerInfo[]
  settings: RoomSettings
  /** How many players the host removed (they can't come back until the host lets them). */
  banned: number
  classroom: boolean
  /** Something to tell everyone (the room's notices, a refused edit). */
  notice: string | null
  /** The game started again from scratch (a join, a resync or Play again): the screen resets what it remembers. */
  generation: number
}

export interface RoomSessionOptions extends LinkOptions {
  name: string
}

export class RoomSession {
  readonly link: HackableRoomLink
  timeline: HackableTimeline<RoomEv> | null = null
  view: RoomView
  stats = { resyncs: 0, rewinds: 0, hashes: 0, keyframes: 0 }
  private listeners = new Set<() => void>()
  private runtimeListeners = new Set<() => void>()
  private shownRuntime: Runtime | null = null
  private ticker: ReturnType<typeof setInterval> | undefined
  private nextCid = 0
  private hashedTo = -1
  private keyframedTo = -1
  /** Keys this screen holds down, so a held key is sent once. */
  private readonly heldKeys = new Set<string>()
  /** Screens hearing the game's broadcasts: they keep hearing them when the game is rebuilt. */
  private readonly heard = new Set<BroadcastListener>()
  /** When the play we joined started (a fresh game's first tick), if we know it. */
  private startedAt: number | null = null

  constructor(opts: RoomSessionOptions) {
    this.view = { status: 'connecting', title: '', me: 0, host: false, players: [], settings: { closed: false }, banned: 0, classroom: false, notice: null, generation: 0 }
    this.link = new HackableRoomLink(opts.name, {
      welcome: (w) => {
        // The room let go of our keys when we dropped; the next press goes out again.
        if (w.reconnect) this.heldKeys.clear()
        this.set({ title: w.title, me: w.you, host: w.host, players: w.players, settings: w.settings, classroom: w.classroom })
        this.start(w.base, w.events)
      },
      resync: (base, events) => {
        this.stats.resyncs++
        this.start(base, events)
      },
      event: (e, mine) => this.event(e, mine),
      reject: (cid, reason) => {
        this.timeline?.reject(cid)
        if (reason === 'too_big') this.set({ notice: 'This project is too big to share live yet. Try smaller costumes.' })
        else if (reason === 'busy') this.set({ notice: 'Changes are going out a little slower. The newest one will follow.' })
      },
      players: (players) => this.set({ players, host: players.find((p) => p.num === this.view.me)?.host ?? this.view.host }),
      settings: (settings, banned) => this.set({ settings, banned }),
      notice: (message) => this.set({ notice: message }),
      status: (status, detail) => this.set({ status, detail }),
    }, opts)
  }

  /** The game to draw and to read. Changes when the game is rebuilt (a join, a resync, Play again). */
  get runtime(): Runtime | null {
    return this.timeline?.runtime ?? null
  }

  /**
   * The tick the play on screen started: a fresh game's first tick, or the tick the host's Play again rebuilt it at.
   * Null when we joined a game already going (from a keyframe) and have not seen it start again since. Every
   * player's game gives the same answer, so their screens' clocks agree.
   */
  get playStart(): number | null {
    return this.timeline?.rebuiltAt ?? this.startedAt
  }

  /** Hear the game's broadcasts (each once, as first played), whichever game is running now. Returns the way to stop. */
  onBroadcast(listener: BroadcastListener): () => void {
    this.heard.add(listener)
    return () => this.heard.delete(listener)
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private set(patch: Partial<RoomView>) {
    this.view = { ...this.view, ...patch }
    for (const fn of this.listeners) fn()
  }

  /** The game was rebuilt (a join, a resync, Play again): screens holding on to the old one take the new one. */
  onRuntime(fn: () => void): () => void {
    this.runtimeListeners.add(fn)
    return () => this.runtimeListeners.delete(fn)
  }

  private checkRuntime() {
    const runtime = this.runtime
    if (runtime === this.shownRuntime) return
    this.shownRuntime = runtime
    for (const fn of this.runtimeListeners) fn()
  }

  connect() {
    // Dev only: the two-browser check reads each tab's game (scripts/qa/hackable-rooms).
    if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __hackableRoom?: RoomSession }).__hackableRoom = this
    this.link.connect()
    clearInterval(this.ticker)
    this.ticker = setInterval(() => this.frame(), BACKGROUND_FRAME_MS)
  }

  close() {
    clearInterval(this.ticker)
    this.ticker = undefined
    this.link.close()
  }

  /**
   * The game as the studio's screens see it (the Stage, the HUD, touch controls): it reads the room's game, sends our
   * keys to the room, and ignores everything else that would change the game on this screen only (a click, the mouse,
   * stopping it), which would put this game out of step with everyone's. It is one object for the whole session, so
   * screens can keep it while the game underneath is rebuilt.
   */
  readonly facade: Runtime = this.makeFacade()

  private makeFacade(): Runtime {
    const down = this.heldKeys
    const mouse = { x: 0, y: 0, down: false }
    const worlds = new WeakMap<object, unknown>()
    return new Proxy({} as Runtime, {
      get: (_target, prop) => {
        if (prop === 'pressKey') return (key: string) => { if (!down.has(key)) { down.add(key); this.key(key, true) } }
        if (prop === 'releaseKey') return (key: string) => { if (down.delete(key)) this.key(key, false) }
        // Not bound to the game of the moment: a Play again or a resync builds a new one, and screens keep hearing.
        if (prop === 'onBroadcast') return (listener: BroadcastListener) => this.onBroadcast(listener)
        if (LOCAL_ONLY.has(prop)) return () => undefined
        const runtime = this.runtime
        if (!runtime) return undefined
        if (prop === 'world') {
          // The mouse is this screen's own (rooms have no shared mouse yet).
          const world = runtime.world
          let view = worlds.get(world)
          if (!view) worlds.set(world, (view = new Proxy(world, { get: (w, p) => (p === 'mouse' ? mouse : Reflect.get(w, p)), set: (w, p, v) => (p === 'mouse' ? true : Reflect.set(w, p, v)) })))
          return view
        }
        const value = Reflect.get(runtime, prop, runtime) as unknown
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(runtime) : value
      },
    })
  }

  clearNotice() {
    if (this.view.notice) this.set({ notice: null })
  }

  private start(base: Base, events: StampedEvent[]) {
    let runtime: Runtime
    try {
      runtime = gameFromBase(base)
    } catch {
      this.set({ notice: 'This room’s game could not be opened here.' })
      return
    }
    // A keyframe is the same play carried on (a resync, coming back), unless the events after it start it again.
    this.startedAt = base.world ? this.playStart : base.tick
    this.timeline = new HackableTimeline<RoomEv>(runtime, applyRoomEvent, { history: 300, snapshotEvery: 4 })
    this.timeline.onBroadcast((message, from) => {
      for (const l of [...this.heard]) l(message, from)
    })
    this.hashedTo = this.keyframedTo = Math.floor(base.tick / HASH_EVERY) * HASH_EVERY
    for (const e of events) this.timeline.addRemote(record(e))
    this.set({ generation: this.view.generation + 1 })
    this.checkRuntime()
  }

  private event(e: StampedEvent, mine: boolean) {
    const timeline = this.timeline
    if (!timeline) return
    // Someone joining a game already going missed its start (a race's "go"): the host can start everyone together.
    if (e.ev.t === 'join' && e.ev.num !== this.view.me && this.view.host) this.set({ notice: `${e.ev.name} joined. Press Restart to start everyone together.` })
    if (mine && timeline.isPending(e.cid)) return timeline.confirm(e.cid, e.tick, e.seq)
    if (!timeline.addRemote(record(e))) this.link.askSync()
  }

  /**
   * Play up to the room's tick now. Returns how many ticks ran (a rewind's replayed ticks not counted), so the screen
   * knows whether to blend between frames.
   */
  frame(now?: number): number {
    const timeline = this.timeline
    const room = this.link.serverTick(now)
    if (!timeline || room === null) return 0
    const from = timeline.tick
    const target = Math.min(Math.floor(room), from + MAX_TICKS_PER_FRAME)
    const rewinds = timeline.rewinds
    // Even with no new tick to play, a late event may have to be put in (a rewind).
    if (!timeline.advanceTo(Math.max(target, from))) this.link.askSync()
    this.stats.rewinds += timeline.rewinds - rewinds
    this.report()
    this.checkRuntime()
    // Sounds nobody drew (the game is off screen) are not kept forever.
    const notes = timeline.runtime.notes
    if (notes.length > 200) notes.splice(0, notes.length - 200)
    return timeline.tick - from
  }

  /** Fingerprints (everyone) and keyframes (the provider) for ticks nothing can change any more. */
  private report() {
    const timeline = this.timeline!
    const settled = timeline.tick - SETTLED
    for (let t = this.hashedTo + HASH_EVERY; t <= settled; t += HASH_EVERY) {
      this.hashedTo = t
      const snap = timeline.snapshotAt(t)
      if (!snap || timeline.pendingBefore(t)) continue
      this.link.sendHash(t, worldFingerprint(snap))
      this.stats.hashes++
    }
    if (!this.link.isProvider) return
    for (let t = this.keyframedTo + KEYFRAME_EVERY - (this.keyframedTo % KEYFRAME_EVERY); t <= settled; t += KEYFRAME_EVERY) {
      this.keyframedTo = t
      const snap = timeline.snapshotAt(t)
      if (!snap || timeline.pendingBefore(t)) continue
      this.link.sendKeyframe(t, worldToJson(snap))
      this.stats.keyframes++
    }
  }

  /** Dev checks: the fingerprint of the game as tick `t` was about to run, if a copy of it is still kept. */
  fingerprintAt(t: number): number | null {
    const snap = this.timeline?.snapshotAt(t)
    return snap ? worldFingerprint(snap) : null
  }

  private send(ev: PlayerEv) {
    const timeline = this.timeline
    if (!timeline || this.link.status !== 'online') return false
    // Stamp it with the room's tick now: a game that was not drawn for a while (a tab in the background) catches up first.
    this.frame()
    const cid = `${this.link.clientId}:${++this.nextCid}`
    const rec: EventRecord<RoomEv> = { tick: timeline.tick, seq: null, by: this.view.me, cid, ev }
    timeline.addLocal(rec)
    this.link.sendEvent(cid, rec.tick, ev)
    return true
  }

  /** One of our keys went down or up: our Hero answers at once. */
  key(key: string, down: boolean) {
    this.send({ t: 'key', key, down })
  }

  /** The host's edited project (designText): the bricks change live, or with `restart` everyone plays again. */
  sendProject(text: string, restart: boolean): boolean {
    return this.view.host && this.send({ t: 'project', text, restart })
  }

  /** The host's Play again with the project as it is. */
  restart(): boolean {
    return this.view.host && this.send({ t: 'restart' })
  }

  // Host controls: the room ignores them from anyone else.

  /** Take a player out of the room: their Hero goes, and they can't come back until the host lets them. */
  removePlayer(num: number) {
    if (this.view.host && num !== this.view.me) this.link.kick(num)
  }

  /** Let new players join, or not (people already admitted can always come back). */
  setClosed(closed: boolean) {
    if (this.view.host) this.link.setClosed(closed)
  }

  /** Everyone the host removed may come back. */
  letRemovedBack() {
    if (this.view.host) this.link.unban()
  }
}

function record(e: StampedEvent): EventRecord<RoomEv> {
  return { tick: e.tick, seq: e.seq, by: e.by, cid: e.cid, ev: e.ev }
}
