import { SUB, TICK_MS, TILE } from '@brick-studio/platformer-core/engine/constants'
import { MAX_EDIT_OPS, type EditOp, type WorldEvent } from '@brick-studio/platformer-core/engine/events'
import { DEFAULT_FEEL, P_SEGMENTS, feelToSub, type Feel, type FeelSub } from '@brick-studio/platformer-core/engine/feel'
import { levelFromJson, type LevelDesign } from '@brick-studio/platformer-core/engine/level'
import {
  POWER,
  createPlayer,
  grantEffect,
  respawn,
  stepPlayer,
  type OtherBody,
  type Player,
  type PlayerContext,
  type PlayerSound,
} from '@brick-studio/platformer-core/engine/player'
import { createWorld, deserializeWorld, hashWorld, serializeWorld, type Effect } from '@brick-studio/platformer-core/engine/world'
import { Sound, type SoundName } from '../audio/sound'
import { Input, type InputFrame } from '../input/input'
import { Timeline, type EventRecord } from '@brick-studio/platformer-core/net/timeline'
import { DEFAULT_SETTINGS, HASH_EVERY, KEYFRAME_EVERY, type Base, type PlayerInfo, type Pose, type RoomSettings, type StampedEvent } from '@brick-studio/platformer-core/net/protocol'
import { RoomLink, type LinkStatus, type RoomLinkOptions, type Welcome } from '../net/roomLink'
import { Remotes } from '../net/remotes'
import { playerColor } from '../render/art/palette'
import type { PlayerPose } from '../render/art/characters'
import { Renderer, formatTime, type Hud, type Particle, type PlayerLook, type View } from '../render/renderer'
import { Camera } from './camera'
import { Editor } from '../editor/editor'
import { loadBest, saveBest } from './records'

export type Mode = 'play' | 'build'

/** The connection to whoever orders events: a room server, or nobody (solo). */
export interface Link {
  readonly num: number
  readonly clientId: string
  /** Estimated server tick at `now` (performance.now()), or null to run free. */
  serverTick(now: number): number | null
  sendEvent(rec: EventRecord): void
  close(): void
}

/** Solo play: every event is accepted immediately, in order. */
export class LocalLink implements Link {
  readonly num = 1
  readonly clientId = 'solo'
  private seq = 0
  constructor(private readonly confirm: (cid: string, tick: number, seq: number) => void) {}
  serverTick() {
    return null
  }
  sendEvent(rec: EventRecord) {
    this.confirm(rec.cid, rec.tick, ++this.seq)
  }
  close() {}
}

export interface SessionStats {
  resyncs: number
  fps: number
  simMs: number
  renderMs: number
  rollbacks: number
  entities: number
  tick: number
}

export interface RoomOptions {
  roomId: string
  /** Shown to others in guest rooms; class rooms use the account name. */
  name: string
  /** The room's address, or a function that fetches a fresh one (class rooms need a new ticket each time). */
  url: RoomLinkOptions['url']
  lag?: number
  /** This browser's identity for guest rooms. */
  key?: string
}

export interface SessionOptions {
  feel?: Feel
  room?: RoomOptions
  /** Where to keep this course's best time (solo only), or null for none. */
  recordKey?: string | null
}

const EFFECT_SOUNDS: Partial<Record<Effect['k'], SoundName>> = {
  coin: 'coin',
  bump: 'bump',
  break: 'break',
  stomp: 'stomp',
  kick: 'kick',
  kill: 'kill',
  item: 'item',
  throw: 'throw',
  burst: 'burst',
  thud: 'thud',
  bounce: 'bounce',
  poof: 'poof',
  reset: 'reset',
  propeller: 'kill',
}

const REJECT_MESSAGES: Record<string, string> = {
  locked: 'The host has locked building',
  read_only: 'You can play this level, but not change it',
  host_only: 'Only the host can reset the world',
}

/*
 * A game in progress: the shared world's timeline, your player, the camera, sound and input.
 * Solo games follow course rules (dying or restarting resets the level, like Mario; menus pause).
 * Rooms follow playground rules (the world is shared and never pauses or resets on its own).
 */
export class GameSession {
  readonly renderer: Renderer
  readonly input = new Input()
  readonly sound = new Sound()
  readonly camera = new Camera()
  readonly editor: Editor
  timeline: Timeline
  player: Player
  feel: FeelSub
  mode: Mode = 'play'
  particles: Particle[] = []
  stats: SessionStats = { resyncs: 0, fps: 0, simMs: 0, renderMs: 0, rollbacks: 0, entities: 0, tick: 0 }
  link: Link
  /** Called about five times a second so the UI can refresh. */
  onStatus: (() => void) | null = null
  onMenu: (() => void) | null = null
  onModeChange: (() => void) | null = null
  /** Short messages for the player ("Level saved", "The host has locked building"). */
  onToast: ((msg: string) => void) | null = null
  /** Solo: the player reached the goal (time in ticks, best in ticks or -1). */
  onClear: ((time: number, best: number, newBest: boolean) => void) | null = null
  /** Bumped whenever this player sends an edit (for autosave). */
  editCount = 0
  /** Where "Play" resumes after building: the player's spot when they started building. */
  resume: { x: number; y: number } | null = null
  /** Solo: time stands still (menu open, tab hidden). */
  paused = false
  /** The last clear beat the stored best. */
  newBest = false

  /** Present when playing in a room. */
  readonly room: RoomLink | null = null
  readonly remotes = new Remotes()
  /** Solo sessions are always joined; rooms join when the server's welcome arrives. */
  joined = true
  roomStatus: LinkStatus = 'online'
  roomDetail = ''
  settings: RoomSettings = { ...DEFAULT_SETTINGS }
  bannedCount = 0
  /** Whether this player may build in the room at all (look-only classmates may not). */
  roomCanBuild = true
  /** A class level's room: saved to the account by the room itself. */
  classroomRoom = false
  onRoom: (() => void) | null = null

  /** Where best times go; dropped once the course is changed, since it is not the same course. */
  private recordKey: string | null
  private seen = new Map<string, number>()
  private eventCounter = 0
  private raf = 0
  private acc = 0.5
  private lastNow = -1
  private frameCount = 0
  private fpsFrames = 0
  private fpsSince = 0
  private lastStatus = 0
  private ctx: PlayerContext
  private others: OtherBody[] = []
  private cameraReady = false
  /** Sounds and particles are held back while fast-forwarding into a room's present. */
  private silent = false
  private joinTick = 0

  constructor(
    readonly canvas: HTMLCanvasElement,
    level: LevelDesign,
    opts: SessionOptions = {},
  ) {
    this.renderer = new Renderer(canvas)
    this.feel = feelToSub(opts.feel ?? DEFAULT_FEEL)
    this.recordKey = opts.room ? null : (opts.recordKey ?? null)
    this.timeline = new Timeline(createWorld(level), (fx, t) => this.onEffects(fx, t))
    if (opts.room) {
      this.joined = false
      this.roomStatus = 'connecting'
      this.room = new RoomLink(opts.room.roomId, opts.room.name, this.roomHandlers(), { url: opts.room.url, key: opts.room.key })
      this.room.lagMs = opts.room.lag ?? 0
      this.link = this.room
    } else this.link = new LocalLink((cid, tick, seq) => this.timeline.confirm(cid, tick, seq))
    this.player = createPlayer(Math.max(1, this.link.num))
    this.ctx = {
      world: this.timeline.world,
      feel: this.feel,
      tick: 0,
      emit: (ev) => this.emit(ev),
      sound: (s: PlayerSound) => this.sound.play(s),
      dust: (x, y) => this.addParticle('dust', 3, x, y - 3, 0, -0.2, 0, 18),
      others: this.others,
      bonk: (num) => this.room?.sendBonk(num),
    }
    respawn(this.player, this.ctx, true)
    if (!opts.room) this.player.invuln = 0
    if (this.recordKey) this.player.bestTime = loadBest(this.recordKey)
    this.editor = new Editor({ world: () => this.timeline.world, sound: (n) => this.sound.play(n) })
  }

  get solo(): boolean {
    return !this.room
  }

  get isHost(): boolean {
    return !!this.room?.host
  }

  /** Whether this player may change the level right now. */
  get canBuild(): boolean {
    return this.solo || (this.roomCanBuild && (!this.settings.buildLocked || this.isHost))
  }

  /** Why building is not possible right now, for the Build button's hint. */
  get buildBlockedReason(): string | null {
    if (this.canBuild) return null
    return this.roomCanBuild ? 'The host has locked building' : 'You can play this level, but not change it'
  }

  start() {
    this.room?.connect()
    this.input.attach(window)
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop)
      this.frame(now)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.input.detach(window)
    this.link.close()
    this.sound.setMusic(false)
  }

  private roomHandlers() {
    return {
      welcome: (w: Welcome) => {
        this.player.num = w.you
        this.settings = w.settings
        this.roomCanBuild = w.canBuild
        this.classroomRoom = w.classroom
        this.joinWorld(w.base, w.events)
        this.remotes.setPlayers(w.players, w.you)
        this.syncCtx()
        if (!w.reconnect) {
          respawn(this.player, this.ctx, true)
          // Someone arriving in a busy room gets a few seconds to look around first.
          this.player.invuln = 240
          this.camera.reset()
          this.cameraReady = false
        }
        if (this.mode === 'build' && !this.canBuild) this.setMode('play')
        this.joined = true
        this.onRoom?.()
      },
      resync: (base: Base, events: StampedEvent[]) => {
        this.stats.resyncs++
        this.joinWorld(base, events)
      },
      event: (e: StampedEvent, mine: boolean) => {
        const rec: EventRecord = { tick: e.tick, seq: e.seq, by: e.by, ev: e.ev, cid: e.cid }
        if (mine && this.timeline.isPending(e.cid)) this.timeline.confirm(e.cid, e.tick, e.seq)
        else this.timeline.addRemote(rec)
      },
      reject: (cid: string, reason: string) => {
        this.timeline.reject(cid)
        const msg = REJECT_MESSAGES[reason]
        if (msg) this.onToast?.(msg)
      },
      pose: (from: number, p: Pose) => this.remotes.addPose(from, p),
      players: (list: PlayerInfo[]) => {
        this.remotes.setPlayers(list, this.player.num)
        const me = list.find((p) => p.num === this.player.num)
        if (me && me.canBuild !== this.roomCanBuild) {
          this.roomCanBuild = me.canBuild
          if (!me.canBuild) {
            this.onToast?.('You can play this level, but not change it')
            if (this.mode === 'build') this.setMode('play')
          }
        }
        this.onRoom?.()
      },
      settings: (s: RoomSettings, banned: number) => {
        const lockedNow = s.buildLocked && !this.settings.buildLocked
        this.settings = s
        this.bannedCount = banned
        if (lockedNow && !this.isHost) {
          this.onToast?.('The host has locked building')
          if (this.mode === 'build') this.setMode('play')
        }
        this.onRoom?.()
      },
      saved: () => this.onToast?.('Level saved'),
      notice: (message: string) => this.onToast?.(message),
      bonk: () => {
        this.player.squash = 14
        this.sound.play('bonk')
      },
      status: (s: LinkStatus, detail?: string) => {
        this.roomStatus = s
        this.roomDetail = detail ?? ''
        this.onRoom?.()
      },
    }
  }

  /** Start from the room's snapshot and replay every event since, up to the server's present. */
  private joinWorld(base: Base, events: StampedEvent[]) {
    const world = 'world' in base ? deserializeWorld(base.world) : createWorld(levelFromJson(base.level), base.tick)
    this.silent = true
    this.timeline.reset(world)
    for (const e of events) this.timeline.addRemote({ tick: e.tick, seq: e.seq, by: e.by, ev: e.ev, cid: e.cid })
    const target = this.link.serverTick(performance.now())
    this.timeline.advanceTo(Math.max(world.tick, Math.floor(target ?? world.tick)))
    this.silent = false
    this.joinTick = this.timeline.tick
    this.acc = 0.5
    this.syncCtx()
  }

  setFeel(f: Feel) {
    this.feel = feelToSub(f)
    this.ctx.feel = this.feel
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.renderer.resize(cssW, cssH, dpr)
  }

  /** Solo only: stop or restart time. Rooms never pause. */
  setPaused(p: boolean) {
    if (!this.solo) return
    this.paused = p
    this.lastNow = -1
  }

  /** Start the current run over from the start flag (solo: with a fresh level). */
  restartRun() {
    this.syncCtx()
    if (this.mode !== 'play') {
      this.resume = null
      this.setMode('play')
    }
    respawn(this.player, this.ctx, true)
    this.newBest = false
    if (this.solo) {
      this.player.invuln = 0
      this.emit({ t: 'reset' })
    }
    this.camera.reset()
  }

  setMode(mode: Mode): boolean {
    if (mode === this.mode) return true
    if (mode === 'build' && !this.canBuild) {
      this.onToast?.(this.buildBlockedReason ?? 'Building is off')
      return false
    }
    const p = this.player
    this.syncCtx()
    if (mode === 'build') {
      this.resume = p.dead || p.celebrate ? null : { x: p.x, y: p.y }
      this.editor.cancelStroke()
    } else {
      this.editor.cancelStroke()
      this.editor.leave()
      if (this.resume && !p.dead) {
        p.x = this.resume.x
        p.y = this.resume.y
        p.vx = 0
        p.vy = 0
        p.riding = 0
        p.invuln = Math.max(p.invuln, 30)
      } else respawn(p, this.ctx, false)
      // Course rules: pressing Play starts the level fresh (enemies home, blocks and coins back).
      if (this.solo) this.emit({ t: 'reset' })
      this.camera.reset()
    }
    this.mode = mode
    this.sound.play('toggle')
    this.onModeChange?.()
    return true
  }

  toggleMode() {
    this.setMode(this.mode === 'play' ? 'build' : 'play')
  }

  /** In build mode: put the player (where Play resumes) on a tile. */
  placeResume(tx: number, ty: number) {
    const p = this.player
    this.resume = { x: tx * TILE * SUB + ((TILE * SUB - p.w) >> 1), y: (ty + 1) * TILE * SUB - p.h }
  }

  resetWorld() {
    this.emit({ t: 'reset' })
  }

  /** Design changes made outside the editor (title, theme). */
  applyEdit(ops: EditOp[]) {
    if (!this.canBuild) {
      this.onToast?.(this.buildBlockedReason ?? 'Building is off')
      return
    }
    this.emit({ t: 'edit', ops })
    this.edited()
  }

  private edited() {
    this.editCount++
    if (this.recordKey) {
      this.recordKey = null
      this.player.bestTime = -1
    }
  }

  panCamera(dx: number, dy: number) {
    const w = this.timeline.world
    this.camera.pan(dx, dy, this.renderer.width, this.renderer.height, w.width * TILE, w.height * TILE)
  }

  // -------------------------------------------------------------------------------------------

  private frame(now: number) {
    // The menu button works even while paused.
    if (this.input.consume('menu')) this.onMenu?.()
    if (this.lastNow < 0) {
      this.lastNow = now
      this.fpsSince = now
    }
    const dt = Math.min(250, now - this.lastNow)
    this.lastNow = now
    if (!this.paused) this.acc += dt / TICK_MS
    const target = this.link.serverTick(now)
    if (target !== null && this.joined) {
      const err = target - (this.timeline.tick + this.acc)
      if (err > 90) {
        // Far behind (a background tab, a stall): jump the world to the present.
        this.silent = true
        this.timeline.advanceTo(Math.floor(target))
        this.silent = false
        this.acc = 0.5
        this.syncCtx()
      } else if (Math.abs(err) > 30) this.acc += err
      else this.acc += Math.max(-0.1, Math.min(0.1, err * 0.02))
    }
    let n = Math.floor(this.acc)
    this.acc -= n
    if (n > 10) {
      // Run at most ten ticks a frame; the rest carries over.
      this.acc += n - 10
      n = 10
    }
    if (n < 0 || !this.joined || this.paused) n = 0
    const t0 = performance.now()
    for (let i = 0; i < n; i++) this.tick()
    const t1 = performance.now()
    this.frameCount++
    this.draw()
    const t2 = performance.now()
    // Stats
    this.stats.simMs = this.stats.simMs * 0.9 + (t1 - t0) * 0.1
    this.stats.renderMs = this.stats.renderMs * 0.9 + (t2 - t1) * 0.1
    this.fpsFrames++
    if (now - this.fpsSince >= 1000) {
      this.stats.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsSince))
      this.fpsFrames = 0
      this.fpsSince = now
    }
    this.stats.rollbacks = this.timeline.rollbacks
    this.stats.entities = this.timeline.world.entities.length
    this.stats.tick = this.timeline.tick
    if (now - this.lastStatus > 200) {
      this.lastStatus = now
      this.onStatus?.()
    }
  }

  private syncCtx() {
    this.ctx.world = this.timeline.world
    this.ctx.tick = this.timeline.tick
  }

  private tick() {
    this.timeline.advanceTo(this.timeline.tick + 1)
    this.syncCtx()
    const input = this.input.frame()
    if (input.togglePressed) this.toggleMode()
    if (this.room) this.remotes.bodies(this.timeline.tick, this.others)
    if (this.mode === 'build') this.stepBuild()
    else this.stepPlay(input)
    this.updateParticles()
    if (this.room) this.roomDuties()
  }

  private roomDuties() {
    const room = this.room!
    const t = this.timeline.tick
    if (t % 3 === 0) room.sendPose(this.pose())
    // Every second, report a fingerprint of the world from two seconds ago (settled by then).
    if (t % HASH_EVERY === 0) {
      const at = t - 2 * HASH_EVERY
      const snap = at > this.joinTick ? this.timeline.worldAt(at) : undefined
      if (snap) room.sendHash(at, hashWorld(snap))
    }
    // The longest-connected player sends snapshots so newcomers do not replay the whole session.
    if (room.isProvider && t % KEYFRAME_EVERY === 0) {
      const at = t - 90
      const snap = at > this.joinTick ? this.timeline.worldAt(at) : undefined
      if (snap) room.sendKeyframe(at, serializeWorld(snap))
    }
  }

  private pose(): Pose {
    const t = this.timeline.tick
    if (this.mode === 'build') {
      const h = this.editor.hover
      return { m: 1, x: h ? h[0] : -1, y: h ? h[1] : -1, f: 1, a: 'stand', s: 0, v: 1, q: 0, t, it: this.editor.erasing ? 'eraser' : this.editor.item.id }
    }
    const l = this.lookOf(this.player)
    return {
      m: 0,
      x: Math.round(l.x),
      y: Math.round(l.y),
      f: l.facing,
      a: l.pose,
      s: l.size === 'big' ? (l.spark ? 2 : 1) : 0,
      v: l.visible ? 1 : 0,
      q: this.player.squash,
      t,
    }
  }

  /** The bottom of the screen is covered by this many CSS pixels of buttons: keep the action above them. */
  setBottomInset(cssPx: number) {
    const r = this.renderer.canvas.getBoundingClientRect()
    const k = r.height > 0 ? this.renderer.height / r.height : 1
    this.camera.bottomPad = Math.max(0, Math.round(cssPx * k))
  }

  /** Centre the camera on the player (or where Play will resume). */
  focusPlayer() {
    const w = this.timeline.world
    const p = this.player
    const x = this.resume?.x ?? p.x
    const y = this.resume?.y ?? p.y
    const margin = this.mode === 'build' ? 4 * TILE : 0
    this.camera.jumpTo((x + p.w / 2) / SUB, (y + p.h) / SUB, this.renderer.width, this.renderer.height, w.width * TILE, w.height * TILE, margin)
    this.cameraReady = true
  }

  private stepBuild() {
    if (!this.cameraReady) this.focusPlayer()
    const speed = this.input.isHeld('run') ? 10 : 5
    const dx = (this.input.isHeld('right') ? 1 : 0) - (this.input.isHeld('left') ? 1 : 0)
    const dy = (this.input.isHeld('down') ? 1 : 0) - (this.input.isHeld('up') ? 1 : 0)
    if (dx || dy) this.panCamera(dx * speed, dy * speed)
    const ops = this.editor.flush()
    for (let i = 0; i < ops.length; i += MAX_EDIT_OPS) {
      this.emit({ t: 'edit', ops: ops.slice(i, i + MAX_EDIT_OPS) })
      this.edited()
    }
  }

  private stepPlay(input: InputFrame) {
    const p = this.player
    const bx = p.x
    const by = p.y
    const wasDown = p.dead > 0 || p.celebrate > 0
    const cleared = p.clearTime
    stepPlayer(p, input, this.ctx)
    // Course rules (solo): coming back from a fall or the goal brings the level back too.
    if (this.solo && wasDown && !p.dead && !p.celebrate) this.emit({ t: 'reset' })
    if (cleared < 0 && p.clearTime >= 0) {
      if (this.recordKey) this.newBest = saveBest(this.recordKey, p.clearTime)
      if (this.solo) this.onClear?.(p.clearTime, p.bestTime, this.newBest)
    }
    // Respawning (after a fall, the goal or a restart) cuts the camera instead of scrolling.
    if (Math.abs(p.x - bx) > 8 * TILE * SUB || Math.abs(p.y - by) > 8 * TILE * SUB) this.camera.reset()
    const w = this.timeline.world
    this.cameraReady = true
    if (!p.dead) {
      this.camera.follow(
        (p.x + p.w / 2) / SUB,
        (p.y + p.h) / SUB,
        p.vx / SUB,
        p.onGround,
        this.renderer.width,
        this.renderer.height,
        w.width * TILE,
        w.height * TILE,
      )
    }
  }

  emit(ev: WorldEvent) {
    const rec: EventRecord = { tick: this.timeline.tick + 1, seq: null, by: this.link.num, ev, cid: `${this.link.clientId}:${++this.eventCounter}` }
    this.timeline.addLocal(rec)
    this.link.sendEvent(rec)
  }

  private onEffects(effects: readonly Effect[], tick: number) {
    if (effects.length === 0) return
    const camCx = this.camera.x + this.renderer.width / 2
    const camCy = this.camera.y + this.renderer.height / 2
    for (const e of effects) {
      const key = `${tick}:${e.k}:${e.id}:${e.x}:${e.y}:${e.by}`
      if (this.seen.has(key)) continue
      this.seen.set(key, tick)
      if (this.silent) continue
      if (e.by === this.player.num) {
        this.syncCtx()
        grantEffect(this.player, e, this.ctx)
      }
      // A solo level reset after a fall is part of the rhythm; keep it quiet.
      if (e.k === 'reset' && this.solo) continue
      const d = Math.max(Math.abs(e.x + 8 - camCx) - this.renderer.width / 2, Math.abs(e.y + 8 - camCy) - this.renderer.height / 2)
      const vol = d <= 0 ? 1 : Math.max(0, 1 - d / 160)
      const s = EFFECT_SOUNDS[e.k]
      if (s && vol > 0) this.sound.play(s, vol)
      this.effectParticles(e)
    }
    if (tick % 60 === 0) for (const [k, t] of this.seen) if (t < tick - 400) this.seen.delete(k)
  }

  private effectParticles(e: Effect) {
    switch (e.k) {
      case 'break':
        for (const [dx, dy, vx, vy] of [
          [4, 4, -1.4, -4.5],
          [12, 4, 1.4, -4.5],
          [4, 12, -1.1, -3],
          [12, 12, 1.1, -3],
        ])
          this.addParticle('debris', 1, e.x + dx, e.y + dy, vx, vy, 0.3, 70, true)
        break
      case 'sparkle':
        this.addParticle('sparkle', 3, e.x + 8, e.y + 8, 0, 0, 0, 16)
        break
      case 'coin':
        if (e.id >= 0) this.addParticle('sparkle', 3, e.x + 8, e.y + 8, 0, -0.3, 0, 16)
        break
      case 'poof':
      case 'propeller':
        this.addParticle('poof', 3, e.x + 7, e.y + 7, 0, 0, 0, 18)
        break
      case 'stomp':
        this.addParticle('dust', 3, e.x + 7, e.y + 12, 0, -0.2, 0, 14)
        break
    }
  }

  addParticle(key: string, frames: number, x: number, y: number, vx: number, vy: number, g: number, life: number, spin = false) {
    if (this.particles.length > 300) return
    this.particles.push({ key, frames, x, y, vx, vy, g, age: 0, life, spin })
  }

  private updateParticles() {
    const list = this.particles
    let j = 0
    for (let i = 0; i < list.length; i++) {
      const q = list[i]
      q.x += q.vx
      q.vy += q.g
      q.y += q.vy
      q.age++
      if (q.age < q.life) list[j++] = q
    }
    list.length = j
  }

  // -------------------------------------------------------------------------------------------
  // Drawing

  protected lookOf(p: Player): PlayerLook {
    return playerLook(p, this.frameCount)
  }

  protected hud(): Hud | null {
    const p = this.player
    const t = this.timeline.tick
    const best = p.bestTime >= 0 ? `BEST ${formatTime(p.bestTime)}` : ''
    return {
      coins: p.coins,
      timeTicks: p.clearTime >= 0 ? p.clearTime : Math.max(0, t - p.runStart),
      pmeter: p.pmeter,
      pFull: p.pmeter >= P_SEGMENTS && (this.frameCount >> 2) % 2 === 0,
      message: p.celebrate ? (this.newBest ? 'NEW BEST!' : 'COURSE CLEAR!') : undefined,
      sub: p.celebrate ? `TIME ${formatTime(p.clearTime)}${best ? '   ' + best : ''}` : undefined,
    }
  }

  protected view(): View {
    const build = this.mode === 'build'
    const players: PlayerLook[] = []
    if (!build) players.push(this.lookOf(this.player))
    else if (this.resume) {
      const p = this.player
      players.push({ ...this.lookOf({ ...p, x: this.resume.x, y: this.resume.y, vx: 0, onGround: true, dead: 0, invuln: 0 }), alpha: 0.45 })
    }
    const w = this.timeline.world
    const tick = this.timeline.tick
    if (this.room) players.unshift(...this.remotes.looks(tick))
    const cursors = this.room ? this.remotes.cursors(tick) : []
    return {
      world: w,
      camX: this.camera.x,
      camY: this.camera.y,
      frame: this.frameCount,
      players,
      particles: this.particles,
      localNum: this.player.num,
      localCheckpoint: this.player.checkpoint,
      hud: build ? null : this.hud(),
      overlay: (ctx, atlas) => {
        if (build) this.editor.drawOverlay(ctx, atlas, w, this.camera.x, this.camera.y, this.renderer.width, this.renderer.height, this.frameCount)
        const cx = Math.round(this.camera.x)
        const cy = Math.round(this.camera.y)
        for (const c of cursors) {
          const color = playerColor(c.num)[0]
          const sx = Math.round(c.x * TILE) - cx
          const sy = Math.round(c.y * TILE) - cy
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2)
          if (c.item && c.item !== 'eraser') {
            ctx.globalAlpha = 0.7
            const icon = atlas.get(cursorIcon(c.item))
            ctx.drawImage(icon, sx + TILE - 4, sy + TILE - 4, 10, 10)
            ctx.globalAlpha = 1
          }
          atlas.text(ctx, c.name, sx, sy - 10, color)
        }
      },
    }
  }

  private draw() {
    this.renderer.draw(this.view())
  }
}

/** Which sprite a player shows this frame. */
export function playerLook(p: Player, frame: number): PlayerLook {
  const big = p.power !== POWER.SMALL
  let pose: PlayerPose = 'stand'
  if (p.dead) pose = 'dead'
  else if (p.celebrate) pose = (frame >> 4) % 2 ? 'jump' : 'stand'
  else if (!p.onGround) pose = p.wallSide ? 'wall' : p.crouch ? 'crouch' : 'jump'
  else if (p.crouch) pose = 'crouch'
  else if (p.skid) pose = 'skid'
  else if (p.kick > 0) pose = 'kick'
  else if (p.throwAnim > 0) pose = 'throw'
  else if (p.vx !== 0) pose = (['walk1', 'walk2', 'walk3', 'walk2'] as const)[Math.floor(p.anim / (SUB * 5)) % 4]
  let size: 'small' | 'big' = big && !p.dead ? 'big' : 'small'
  let spark = p.power === POWER.SPARK
  if (p.transform > 0 && (p.transform >> 2) % 2 === 0) {
    size = p.transformFrom === POWER.SMALL ? 'small' : 'big'
    spark = p.transformFrom === POWER.SPARK
  }
  const blink = p.invuln > 0 && p.transform === 0 && !p.dead && (frame >> 1) % 2 === 0
  return {
    num: p.num,
    x: (p.x + p.w / 2) / SUB,
    y: (p.y + p.h) / SUB,
    facing: p.wallSide ? (p.wallSide as 1 | -1) : p.facing,
    size,
    pose,
    spark,
    visible: !blink,
    squash: p.squash,
  }
}

/** Small icon for a builder's cursor: the palette item they are holding. */
function cursorIcon(itemId: string): string {
  const icons: Record<string, string> = {
    ground: 'g:0:day',
    hard: 'hard',
    semi: 'semi:00',
    pipe: 'pipe:L:1',
    spikes: 'spikes',
    lava: 'lava:0:1',
    brick: 'brick',
    qblock: 'q:0',
    bounce: 'bounce',
    spring: 'spring:0',
    coin: 'coin:0',
    grow: 'grow',
    spark: 'sparkitem:1',
    walker: 'walker:1',
    shellbug: 'shellbug:1',
    spiky: 'spiky:1',
    flyer: 'flyer:1',
    lift: 'lift',
    liftv: 'lift',
    start: 'start',
    checkpoint: 'checkpoint:0',
    goal: 'goalicon',
  }
  return icons[itemId] ?? 'q:0'
}
