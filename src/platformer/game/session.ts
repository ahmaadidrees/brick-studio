import { SUB, TICK_MS, TILE } from '@brick-studio/platformer-core/engine/constants'
import { MAX_EDIT_OPS, type EditOp, type WorldEvent } from '@brick-studio/platformer-core/engine/events'
import { DEFAULT_FEEL, P_SEGMENTS, feelToSub, type Feel, type FeelSub } from '@brick-studio/platformer-core/engine/feel'
import { cloneLevel, levelFromJson, type LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { kitOf } from '@brick-studio/platformer-core/engine/kits'
import { TILE as RACE_TILE } from '@brick-studio/platformer-core/engine/constants'
import { useMicrobit } from '../../microbit/store'
import type { GameEvent } from '../../microbit/assign'
import { RaceRun, carInputFrom, type RaceHud, type RaceSound, type RaceLink, type RemoteRacer, type RestartOptions } from '../race/raceRun'
import { loadRaceFeel, type RaceFeel } from '../race/raceFeel'
import { drawRaceBuildOverlay } from '../race/raceOverlay'
import {
  POWER,
  createPlayer,
  canEnterPipe as playerCanEnterPipe,
  beginPipeTravel,
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
import { DEFAULT_CHARACTER, DEFAULT_SETTINGS, HASH_EVERY, KEYFRAME_EVERY, isCharacterId, type Base, type CharacterId, type PlayerInfo, type Pose, type RoomSettings, type StampedEvent } from '@brick-studio/platformer-core/net/protocol'
import { RoomLink, type LinkStatus, type RoomLinkOptions, type Welcome } from '../net/roomLink'
import { Remotes } from '../net/remotes'
import { playerColor } from '../render/art/palette'
import type { PlayerPose } from '../render/art/characters'
import { Renderer, formatTime, type Hud, type Particle, type PlayerLook, type View } from '../render/renderer'
import { drawSprite } from '../render/skin'
import { Camera } from './camera'
import { Editor } from '../editor/editor'
import { loadBest, saveBest } from './records'
import { characterMotion } from '../characters/motion'

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
  character?: CharacterId
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

/** Your own sounds that the micro:bit also reacts to. */
const PLAYER_SOUND_EVENTS: Partial<Record<PlayerSound, GameEvent>> = {
  die: 'die', hurt: 'hurt', powerup: 'powerup', goal: 'goal', checkpoint: 'checkpoint',
}
/** Your own race sounds that the micro:bit also reacts to (throwing isn't one). */
const RACE_SOUND_EVENTS: Partial<Record<RaceSound, GameEvent>> = { coin: 'coin', item: 'item', powerup: 'powerup', hurt: 'hurt' }

/** Tell a connected micro:bit about something your player did (does nothing when none is connected). */
function reactMicrobit(event: GameEvent, n?: number) {
  useMicrobit.getState().react(event, n)
}

/** Race tracks: the farthest the build view zooms out. */
const MAX_RACE_ZOOM = 4

/** A room race that started longer ago than this is over; newcomers practise instead (10 minutes). */
const MAX_RACE_TICKS = 10 * 60 * 60

const REJECT_MESSAGES: Record<string, string> = {
  locked: 'The host has locked building',
  read_only: 'You can play this world, but not change it',
  host_only: 'Only the host can reset the world',
  race_busy: 'A race is on. The host can restart it; anyone can start a new one a little later.',
  unchecked: 'Could not check your class access, so that change was not made. Try again in a moment.',
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
  character: CharacterId = DEFAULT_CHARACTER
  particles: Particle[] = []
  stats: SessionStats = { resyncs: 0, fps: 0, simMs: 0, renderMs: 0, rollbacks: 0, entities: 0, tick: 0 }
  link: Link
  /** Called about five times a second so the UI can refresh. */
  onStatus: (() => void) | null = null
  onMenu: (() => void) | null = null
  onModeChange: (() => void) | null = null
  /** Short messages for the player ("World saved", "The host has locked building"). */
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
  /** Race tracks: how far out the build view was last zoomed, restored when building again. */
  private raceZoom = 1
  onZoom: ((z: number) => void) | null = null
  /** Race tracks: the race being driven while playing, how the car drives, and how many computer racers join a solo race. */
  raceRun: RaceRun | null = null
  raceFeel: RaceFeel = loadRaceFeel()
  rivals = 2
  onRaceHud: ((hud: RaceHud) => void) | null = null
  private raceRot = 0
  /** Rooms: the race (world start tick) this game last lined up for. */
  private seenRaceAt = -1
  private roomPlayers: PlayerInfo[] = []

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
  private reactRun: RaceRun | null = null
  private reactLap = 0
  private reactDone = false
  private joinTick = 0

  constructor(
    readonly canvas: HTMLCanvasElement,
    level: LevelDesign,
    opts: SessionOptions = {},
  ) {
    if (isCharacterId(opts.character)) this.character = opts.character
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
      sound: (s: PlayerSound) => {
        this.sound.play(s)
        const ev = PLAYER_SOUND_EVENTS[s]
        if (ev && !this.silent) reactMicrobit(ev)
      },
      dust: (x, y) => this.addParticle('dust', 3, x, y - 3, 0, -0.2, 0, 18),
      others: this.others,
      bonk: (num) => this.room?.sendBonk(num),
    }
    respawn(this.player, this.ctx, true)
    if (!opts.room) this.player.invuln = 0
    if (this.recordKey) this.player.bestTime = loadBest(this.recordKey)
    this.editor = new Editor({ world: () => this.timeline.world, sound: (n) => this.sound.play(n) })
    this.input.remoteMode = () => (this.isRace ? 'race' : 'platformer')
  }

  get solo(): boolean {
    return !this.room
  }

  /** Whether this level is a race track. */
  get isRace(): boolean {
    return kitOf(this.timeline.world.design) === 'race'
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
    return this.roomCanBuild ? 'The host has locked building' : 'You can play this world, but not change it'
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

  /** Change only the local appearance, and announce it to the room immediately. */
  setCharacter(id: CharacterId): void {
    if (!isCharacterId(id) || this.character === id) return
    this.character = id
    if (this.room && this.joined) this.room.sendPose(this.pose())
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
        this.roomPlayers = w.players
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
        this.roomPlayers = list
        const me = list.find((p) => p.num === this.player.num)
        if (me && me.canBuild !== this.roomCanBuild) {
          this.roomCanBuild = me.canBuild
          if (!me.canBuild) {
            this.onToast?.('You can play this world, but not change it')
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
      saved: () => this.onToast?.('World saved'),
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
    let world
    try {
      world = 'world' in base ? deserializeWorld(base.world) : createWorld(levelFromJson(base.level), base.tick)
    } catch {
      // A snapshot this game cannot read: keep the world as it is rather than stopping.
      this.onToast?.('Could not load the room’s world. Reload the page to rejoin.')
      return
    }
    this.silent = true
    this.remotes.resetPoseHistory()
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

  /** Race tracks: Build and Play. Play always starts a fresh race on the grid from the track as built. */
  private setRaceMode(mode: Mode): boolean {
    if (mode === 'build' && !this.canBuild) {
      this.onToast?.(this.buildBlockedReason ?? 'Building is off')
      return false
    }
    this.editor.cancelStroke()
    if (mode === 'build') this.raceRun = null
    else {
      this.editor.leave()
      this.startRace()
    }
    this.mode = mode
    // Driving is always close up; building comes back to where it was zoomed.
    this.applyZoom(mode === 'build' ? this.raceZoom : 1)
    this.cameraReady = false
    this.sound.play('toggle')
    this.onModeChange?.()
    return true
  }

  /**
   * Line up on the grid. Solo: a new race with computer racers. Rooms: the room's current race (joining it late if it
   * is under way), or practice until someone starts one; each player has their own place on the grid.
   */
  startRace(rivals = this.rivals) {
    this.rivals = rivals
    const w = this.timeline.world
    const run = new RaceRun(cloneLevel(w.design), this.solo ? rivals : 0, () => this.raceFeel.feel, this.raceLink)
    if (this.room) {
      const nums = [...new Set([...this.roomPlayers.map((p) => p.num), this.player.num])].sort((a, b) => a - b)
      const elapsed = w.tick - w.raceAt
      const opts: RestartOptions = { slot: Math.max(0, nums.indexOf(this.player.num)), color: playerColor(this.player.num)[0] }
      // A race that started long ago is over: practise until the next one.
      if (w.raceAt < 0 || elapsed > MAX_RACE_TICKS) opts.practice = true
      else opts.elapsed = elapsed
      run.restart(0, opts)
      this.seenRaceAt = w.raceAt
    }
    this.raceRun = run
    this.cameraReady = false
    this.onRaceHud?.(run.hud(this.remoteRacers()))
  }

  /** Items and Walkers live in the shared world; races reach it through this. */
  private readonly raceLink: RaceLink = {
    world: () => this.timeline.world,
    emit: (ev) => this.emit(ev),
    num: 0,
  }

  /** Start a race: solo, at once; in a room, for everyone (the host any time, others once the last race has run). */
  requestRace() {
    if (this.solo) return this.startRace()
    this.emit({ t: 'race' })
  }

  /** Other players in this room's current race. */
  private remoteRacers(): RemoteRacer[] {
    if (!this.room) return []
    const raceAt = this.timeline.world.raceAt
    if (raceAt < 0) return []
    return this.remotes.cars(this.timeline.tick).filter((c) => c.race === raceAt).map((c) => ({ name: c.name, color: playerColor(c.num)[0], lap: c.lap, d: c.d, gates: c.gates, finish: c.finish }))
  }

  /** Your lap going up, or you crossing the line, tells the micro:bit (once each). */
  private reactRaceProgress(run: RaceRun) {
    const lap = run.you.lap
    if (this.reactRun !== run) {
      this.reactRun = run
      this.reactLap = lap.lap
      this.reactDone = lap.done >= 0
      return
    }
    if (lap.done >= 0) {
      if (!this.reactDone) reactMicrobit('finish', run.hud(this.remoteRacers()).place)
    } else if (lap.lap > this.reactLap) reactMicrobit('lap', lap.lap + 1)
    this.reactLap = lap.lap
    this.reactDone = lap.done >= 0
  }

  private stepRace(input: InputFrame) {
    // Someone in the room started a race: everyone lines up for it.
    if (!this.raceRun || (this.room && this.timeline.world.raceAt !== this.seenRaceAt)) this.startRace()
    const run = this.raceRun!
    this.raceLink.num = this.link.num
    const others = this.room ? this.remotes.cars(this.timeline.tick).filter((c) => c.visible).map((c) => ({ x: c.x, y: c.y, shield: c.shield, air: c.lift > 0 })) : []
    // The jump button (Space) uses your item.
    run.step(carInputFrom(input, this.raceFeel.steer, run.you.car, this.raceRot), input.jumpPressed, others)
    if (!this.silent) {
      for (const s of run.sounds) {
        this.sound.play(s)
        const ev = RACE_SOUND_EVENTS[s]
        if (ev) reactMicrobit(ev)
      }
      this.reactRaceProgress(run)
    }
    // The camera keeps your car in the middle, looking a little ahead; with "map turns", your car points up.
    const c = run.you.car, W = this.renderer.width, H = this.renderer.height
    const tx = c.x + c.vx * 16 - W / 2, ty = c.y + c.vy * 16 - H / 2
    const want = this.raceFeel.camera === 'turn' && this.solo ? -Math.PI / 2 - c.a : 0
    if (!this.cameraReady) {
      this.camera.x = tx
      this.camera.y = ty
      this.raceRot = want
      this.cameraReady = true
    } else {
      this.camera.x += (tx - this.camera.x) * 0.12
      this.camera.y += (ty - this.camera.y) * 0.12
      this.raceRot += Math.atan2(Math.sin(want - this.raceRot), Math.cos(want - this.raceRot)) * 0.1
    }
    if (run.tick % 4 === 0 || run.tick === 181) this.onRaceHud?.(run.hud(this.remoteRacers()))
  }

  /** Start the current run over from the start flag (solo: with a fresh level). */
  restartRun() {
    if (this.isRace) {
      if (this.mode !== 'play') this.setMode('play')
      else if (this.solo || this.raceRun?.practice) this.startRace()
      else this.onToast?.('You’re in a race! Finish it, or ask the host to restart.')
      return
    }
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
    if (this.isRace) return this.setRaceMode(mode)
    if (this.player.pipe) {
      this.onToast?.('Finish travelling through the pipe, then switch modes.')
      return false
    }
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
      // Pressing Play alone starts the world fresh: enemies home, blocks and coins back, and the clock from zero.
      if (this.solo) {
        this.emit({ t: 'reset' })
        p.runStart = this.ctx.tick
        p.clearTime = -1
      }
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

  canEnterPipe(): boolean {
    if (this.mode !== 'play' || !this.joined || this.paused) return false
    this.syncCtx()
    return playerCanEnterPipe(this.player, this.ctx)
  }

  enterPipe(): void {
    if (!this.canEnterPipe()) return
    if (beginPipeTravel(this.player, this.ctx)) this.onStatus?.()
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
    // A paused solo game (a sheet is open) still shows the change right away: step the world one tick to apply it.
    if (this.solo && this.paused) {
      this.timeline.advanceTo(this.timeline.tick + 1)
      this.syncCtx()
    }
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
    this.camera.centerY = this.isRace
    this.camera.pan(dx, dy, this.renderer.width, this.renderer.height, w.width * TILE, w.height * TILE)
  }

  /** Race tracks while building: how far out the view is (1 = normal), and how far out shows the whole track. */
  get zoom(): number {
    return this.renderer.zoom
  }

  get maxZoom(): number {
    if (!this.isRace) return 1
    const w = this.timeline.world
    const [bw, bh] = this.renderer.baseView
    const z = this.renderer.zoom
    // The drawer and the strip cover part of the view; the track should fit in what is left, with a little room.
    const freeW = bw - this.camera.leftPad / z, freeH = bh - this.camera.bottomPad / z
    const fit = Math.max((w.width + 2) * TILE / Math.max(1, freeW), (w.height + 2) * TILE / Math.max(1, freeH))
    return Math.max(1, Math.min(MAX_RACE_ZOOM, fit))
  }

  /** Zoom a race track's build view, keeping the middle of the view where it is. */
  setZoom(z: number, about?: [number, number]) {
    const next = this.isRace && this.mode === 'build' ? Math.max(1, Math.min(this.maxZoom, z)) : 1
    this.applyZoom(next, about)
    if (this.isRace && this.mode === 'build') this.raceZoom = next
  }

  private applyZoom(z: number, about?: [number, number]) {
    const r = this.renderer
    const old = r.zoom
    if (Math.abs(z - old) < 1e-3) return
    // The point under `about` (world pixels; default the middle of the view) stays put.
    const [ax, ay] = about ?? [this.camera.x + r.width / 2, this.camera.y + r.height / 2]
    const fx = (ax - this.camera.x) / r.width, fy = (ay - this.camera.y) / r.height
    this.camera.leftPad *= z / old
    this.camera.bottomPad *= z / old
    r.setZoom(z)
    this.camera.x = ax - fx * r.width
    this.camera.y = ay - fy * r.height
    if (this.mode === 'build') this.panCamera(0, 0)
    this.onZoom?.(z)
  }

  // -------------------------------------------------------------------------------------------

  private frame(now: number) {
    // The menu button works even while paused.
    if (this.input.consume('menu')) this.onMenu?.()
    // Only a race track's build view zooms (a level loaded into a room can change kit under us).
    if (this.renderer.zoom !== 1 && !(this.isRace && this.mode === 'build')) this.applyZoom(1)
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
    const run = this.raceRun
    if (this.isRace && this.mode === 'play' && run) {
      const c = run.you.car, lap = run.you.lap
      const time = run.yourTime
      return {
        m: 0, x: Math.round(c.x), y: Math.round(c.y), f: 1, a: 'stand', s: 0, v: c.splash > 0 ? 0 : 1, q: 0, t,
        ch: this.character,
        hd: Math.round(((((c.a / (Math.PI * 2)) % 1) + 1) % 1) * 256) & 255,
        lf: c.air > 0 ? Math.round(Math.sin(Math.PI * (1 - c.air / c.airMax)) * 255) : 0,
        rl: Math.min(9, lap.lap),
        rp: Math.max(0, Math.min(65535, lap.d)),
        rg: lap.gates & 15,
        ra: run.practice ? -1 : this.seenRaceAt,
        ...(lap.done >= 0 && time >= 0 ? { rf: time } : {}),
        ...(run.you.shield > 0 ? { sh: 1 as const } : {}),
      }
    }
    if (this.mode === 'build') {
      const h = this.editor.hover
      return { m: 1, x: h ? h[0] : -1, y: h ? h[1] : -1, f: 1, a: 'stand', s: 0, v: 1, q: 0, t, it: this.editor.erasing ? 'eraser' : this.editor.item.id, ch: this.character, af: this.frameCount & 255 }
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
      ch: this.character,
      af: this.frameCount & 255,
      ...(l.gait === undefined ? {} : { ga: l.gait === 'run' ? 1 as const : 0 as const }),
      gp: Math.floor((l.gaitPhase ?? 0) * 256) & 255,
      gb: Math.round((l.gaitBlend ?? 0) * 255),
      gw: Math.round((l.gaitWeight ?? 0) * 255),
      lc: Math.round((l.landingCompression ?? 0) * 255),
      ...(this.player.pipe ? { pi: {
        x: this.player.pipe.mouthX,
        y: this.player.pipe.mouthY,
        phase: this.player.pipe.phase === 'enter' ? 0 as const : 1 as const,
        progress: Math.round(this.player.pipe.progress * 255),
      } } : {}),
    }
  }

  /** The bottom of the screen is covered by this many CSS pixels of buttons: keep the action above them. */
  setBottomInset(cssPx: number) {
    const r = this.renderer.canvas.getBoundingClientRect()
    const k = r.height > 0 ? this.renderer.height / r.height : 1
    this.camera.bottomPad = Math.max(0, Math.round(cssPx * k))
  }

  /** The docked Bricks drawer covers the left of the view while building. */
  setLeftInset(cssPx: number) {
    const r = this.renderer.canvas.getBoundingClientRect()
    const k = r.width > 0 ? this.renderer.width / r.width : 1
    this.camera.leftPad = Math.max(0, Math.round(cssPx * k))
  }

  /** Centre the camera on the player (or where Play will resume). */
  focusPlayer() {
    const w = this.timeline.world
    if (this.isRace) {
      const start = w.design.objects.find((o) => o.kind === 'start')
      const sx = ((start?.x ?? 0) + 0.5) * RACE_TILE, sy = ((start?.y ?? 0) + 0.5) * RACE_TILE
      this.camera.x = sx - this.renderer.width / 2
      this.camera.y = sy - this.renderer.height / 2
      this.cameraReady = true
      return
    }
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
    if (this.isRace) return this.stepRace(input)
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
        if (e.k === 'coin' && !this.isRace) reactMicrobit('coin')
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
    return playerLook(p, this.frameCount, this.character, this.feel.walkMax / SUB)
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
      message: p.celebrate ? (this.newBest ? 'NEW BEST!' : 'YOU MADE IT!') : undefined,
      sub: p.celebrate ? `TIME ${formatTime(p.clearTime)}${best ? '   ' + best : ''}` : undefined,
    }
  }

  protected view(): View {
    const build = this.mode === 'build'
    if (this.isRace) return this.raceView(build)
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
      overlay: (ctx, skin, cx, cy) => {
        if (build) this.editor.drawOverlay(ctx, skin, w, cx, cy, this.renderer.width, this.renderer.height, this.frameCount)
        for (const c of cursors) {
          const color = playerColor(c.num)[0]
          const sx = skin.snap(c.x * TILE) - cx
          const sy = skin.snap(c.y * TILE) - cy
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2)
          if (c.item && c.item !== 'eraser') {
            ctx.globalAlpha = 0.7
            drawSprite(ctx, skin.sprite(cursorIcon(c.item)), sx + TILE - 4, sy + TILE - 4, 10, 10)
            ctx.globalAlpha = 1
          }
          skin.label(ctx, c.name, sx + TILE / 2, sy + 1, color)
        }
      },
    }
  }

  private raceView(build: boolean): View {
    const w = this.timeline.world
    const tick = this.timeline.tick
    const cursors = this.room ? this.remotes.cursors(tick).map((c) => ({ x: c.x, y: c.y, name: c.name, color: playerColor(c.num)[0] })) : []
    const run = build ? null : this.raceRun
    // Other players' cars show while you build too, so you can watch them race.
    const others = this.room
      ? this.remotes.cars(tick).filter((c) => c.visible).map((c) => ({ x: c.x, y: c.y, a: c.a, color: playerColor(c.num)[0], name: c.name, you: false, lift: c.lift, flame: 0, shield: c.shield }))
      : []
    return {
      world: w,
      camX: this.camera.x,
      camY: this.camera.y,
      frame: this.frameCount,
      players: [],
      particles: [],
      localNum: this.player.num,
      localCheckpoint: 0,
      hud: null,
      race: {
        cars: [...others, ...(run ? run.cars() : [])],
        skids: run ? run.skids : [],
        tags: true,
        rot: build ? 0 : this.raceRot,
        // ? blocks and coins you took are gone for you for a while; while building, all show.
        showing: run ? (i) => run.showing(i) : undefined,
        overlay: build ? (ctx) => drawRaceBuildOverlay(ctx, this.editor, w, this.frameCount, cursors) : undefined,
      },
    }
  }

  private draw() {
    this.renderer.draw(this.view())
  }
}

/** Which sprite a player shows this frame. */
export function playerLook(p: Player, frame: number, character: CharacterId = DEFAULT_CHARACTER, walkMax = DEFAULT_FEEL.walkMax): PlayerLook {
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
  const motion = characterMotion(p, frame, character, walkMax, pose)
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
    character,
    animationFrame: frame & 255,
    ...motion,
    ...(p.pipe ? { pipe: { x: p.pipe.mouthX, y: p.pipe.mouthY, phase: p.pipe.phase } } : {}),
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
