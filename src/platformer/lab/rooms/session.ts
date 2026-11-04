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
import { workspacesIn, type EditOp } from './edits'
import { DEFAULT_SETTINGS, HASH_EVERY, KEYFRAME_EVERY, MAX_LATE, type Base, type HistoryItem, type PlayerEv, type PlayerInfo, type RoomEv, type RoomSettings, type StampedEvent } from './protocol'
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
  /** M2: the room's recent changes, newest last. */
  history: HistoryItem[]
  /** M2: what we may change (the host everything). */
  build: boolean
  code: boolean
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
  /** M2: bricks' blocks this screen has (from the room, or from edits), by brick id. */
  readonly workspaces = new Map<string, unknown>()
  /** M2: bricks the room has no blocks for. */
  readonly missingWorkspaces = new Set<string>()
  /** M2: told when someone's edit lands, an edit of ours is refused, or blocks arrive. */
  private readonly editListeners = new Set<() => void>()
  /** M2: edits of ours the room refused (tests and the dev check read it). */
  rejected = 0
  private readonly ownEdits = new Set<string>()

  constructor(opts: RoomSessionOptions) {
    this.view = { status: 'connecting', title: '', me: 0, host: false, players: [], settings: { ...DEFAULT_SETTINGS }, banned: 0, classroom: false, notice: null, generation: 0, history: [], build: false, code: false }
    this.link = new HackableRoomLink(opts.name, {
      welcome: (w) => {
        // The room let go of our keys when we dropped; the next press goes out again.
        if (w.reconnect) this.heldKeys.clear()
        this.set({ title: w.title, me: w.you, host: w.host, players: w.players, settings: { ...DEFAULT_SETTINGS, ...w.settings }, classroom: w.classroom, history: w.history, ...rightsOf(w.players, w.you, w.host) })
        this.start(w.base, w.events)
      },
      resync: (base, events) => {
        this.stats.resyncs++
        this.start(base, events)
      },
      event: (e, mine) => this.event(e, mine),
      reject: (cid, reason) => {
        this.timeline?.reject(cid)
        this.ownEdits.delete(cid)
        this.rejected++
        if (reason === 'too_big') this.set({ notice: 'This project is too big to share live yet. Try smaller costumes.' })
        else if (reason === 'busy') this.set({ notice: 'Changes are going out a little slower. Try that again in a moment.' })
        else if (reason === 'not_allowed') this.set({ notice: this.view.build ? 'Changing code is off for you. The host can turn it on.' : 'Building is off right now. The host can turn it on.' })
        else if (reason === 'invalid') this.set({ notice: 'That change could not be shared. Try it again.' })
        this.checkRuntime()
        for (const fn of this.editListeners) fn()
      },
      players: (players) => {
        const host = players.find((p) => p.num === this.view.me)?.host ?? this.view.host
        this.set({ players, host, ...rightsOf(players, this.view.me, host) })
      },
      settings: (settings, banned) => this.set({ settings: { ...DEFAULT_SETTINGS, ...settings }, banned }),
      notice: (message) => this.set({ notice: message }),
      history: (history) => {
        // Someone else changed code: say so once, since their brick's scripts started again.
        const seen = this.view.history.reduce((m, h) => Math.max(m, h.seq), 0)
        const news = history.filter((h) => h.seq > seen && h.by !== this.view.me && h.kind === 'code')
        const last = news.at(-1)
        this.set({ history, ...(last ? { notice: `${last.name} ${last.summary}.${/code/.test(last.summary) ? ' Its scripts started again.' : ''}` } : {}) })
      },
      workspace: (id, ws) => {
        if (ws === null || ws === undefined) this.missingWorkspaces.add(id)
        else this.workspaces.set(id, ws)
        for (const fn of this.editListeners) fn()
      },
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
    this.ownEdits.clear()
    this.startedAt = base.world ? this.playStart : base.tick
    this.timeline = new HackableTimeline<RoomEv>(runtime, applyRoomEvent, { history: 300, snapshotEvery: 4 })
    this.timeline.onBroadcast((message, from, about) => {
      for (const l of [...this.heard]) l(message, from, about)
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
    if (e.ev.t === 'edit') this.heardEdit(e, mine)
    if (mine && timeline.isPending(e.cid)) {
      timeline.confirm(e.cid, e.tick, e.seq)
      if (this.ownEdits.delete(e.cid)) for (const fn of this.editListeners) fn()
      return
    }
    if (!timeline.addRemote(record(e))) this.link.askSync()
    if (e.ev.t === 'edit') {
      this.frame()
      for (const fn of this.editListeners) fn()
    }
  }

  /** M2: blocks that came with an edit; a short notice when someone changed code (their brick restarted). */
  private heardEdit(e: StampedEvent, mine: boolean) {
    const ev = e.ev
    if (ev.t !== 'edit') return
    for (const [id, ws] of Object.entries(workspacesIn(ev.ops))) {
      this.workspaces.set(id, ws)
      this.missingWorkspaces.delete(id)
    }
    if (mine) return
    const who = this.view.players.find((p) => p.num === e.by)?.name ?? 'Someone'
    if (ev.undoOf !== undefined) {
      const item = this.view.history.find((h) => h.seq === ev.undoOf)
      this.set({ notice: item ? `${who} put back ${item.name === who ? 'their' : `${item.name}’s`} change: ${item.summary}.` : `${who} put back a change.` })
      return
    }
  }

  /** M2: hear edits landing (ours refused, someone else's arriving, blocks arriving). Returns the way to stop. */
  onEdits(fn: () => void): () => void {
    this.editListeners.add(fn)
    return () => this.editListeners.delete(fn)
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

  private send(ev: PlayerEv): string | null {
    const timeline = this.timeline
    if (!timeline || this.link.status !== 'online') return null
    // Stamp it with the room's tick now: a game that was not drawn for a while (a tab in the background) catches up first.
    this.frame()
    const cid = `${this.link.clientId}:${++this.nextCid}`
    const rec: EventRecord<RoomEv> = { tick: timeline.tick, seq: null, by: this.view.me, cid, ev }
    timeline.addLocal(rec)
    this.link.sendEvent(cid, rec.tick, ev)
    return cid
  }

  /** One of our keys went down or up: our Hero answers at once. */
  key(key: string, down: boolean) {
    this.send({ t: 'key', key, down })
  }

  /** The host's edited project (designText): the bricks change live, or with `restart` everyone plays again. */
  sendProject(text: string, restart: boolean): boolean {
    return this.view.host && !!this.send({ t: 'project', text, restart })
  }

  /** The host's Play again with the project as it is. */
  restart(): boolean {
    return this.view.host && !!this.send({ t: 'restart' })
  }

  /**
   * M2: our edit (rooms/edits.ts): it lands in our game at once and goes to the room, which may refuse it (then our
   * game goes back). False when we may not make it or are not connected.
   */
  sendEdit(ops: EditOp[]): boolean {
    if (!ops.length || (!this.view.build && !this.view.code)) return false
    for (const [id, ws] of Object.entries(workspacesIn(ops))) this.workspaces.set(id, ws)
    const cid = this.send({ t: 'edit', ops })
    if (cid) this.ownEdits.add(cid)
    return !!cid
  }

  /** M2: edits of ours the room has not answered yet. */
  get editsInFlight(): number {
    return this.ownEdits.size
  }

  /** M2: what we are editing now, for everyone's room bar ("Walker's code"), or null. */
  setEditing(what: string | null) {
    this.link.presence(what)
  }

  /** M2: ask the room for a brick's blocks (they arrive through onEdits). */
  askWorkspace(id: string) {
    if (!this.workspaces.has(id)) this.link.askWorkspace(id)
  }

  /** M2: put back a change (ours; the host anyone's). */
  undo(seq: number) {
    this.link.undo(seq)
  }

  /** M2 (host): everyone may build, or change code. */
  setRoles(roles: { build?: boolean; code?: boolean }) {
    if (this.view.host) this.link.setRoles(roles)
  }

  /** M2 (host): let one player change code, or not. */
  grantCode(num: number, code: boolean) {
    if (this.view.host && num !== this.view.me) this.link.grant(num, code)
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

/** What we may change, from the players list (the host everything). */
function rightsOf(players: PlayerInfo[], me: number, host: boolean): { build: boolean; code: boolean } {
  if (host) return { build: true, code: true }
  const p = players.find((x) => x.num === me)
  return { build: !!p?.build, code: !!p?.code }
}

function record(e: StampedEvent): EventRecord<RoomEv> {
  return { tick: e.tick, seq: e.seq, by: e.by, cid: e.cid, ev: e.ev }
}
