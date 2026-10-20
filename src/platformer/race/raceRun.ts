import { CAR_RADIUS, createCar, gridSpots, kickBoost, solidUnder, spinOut, stepCar, trackTileAt, type Car, type CarEvent, type CarFeel, type CarInput } from '@brick-studio/platformer-core/engine/car'
import type { WorldEvent } from '@brick-studio/platformer-core/engine/events'
import { RT } from '@brick-studio/platformer-core/engine/raceTiles'
import {
  BOX_BACK_TICKS, COIN_BACK_TICKS, COIN_TOP_K, HIT_GRACE_TICKS, MAX_COINS, SHIELD_BUMP, SHIELD_TICKS, SPIN_COIN_LOSS, SPLASH_COIN_LOSS,
  hazardAt, rollItem, throwEvent, type RaceItem,
} from '@brick-studio/platformer-core/engine/raceItems'
import type { World } from '@brick-studio/platformer-core/engine/world'
import { DEFAULT_RACE } from '@brick-studio/platformer-core/engine/kits'
import { computeLoop, createLapState, raceProgress, trackLaps, type LapState, type RaceLoop } from '@brick-studio/platformer-core/engine/laps'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { raceAutopilot } from '@brick-studio/platformer-core/engine/raceAutopilot'
import type { InputFrame } from '../input/input'

/*
 * One race on this machine: your car and some computer racers, the countdown, laps, standings and results. It knows
 * nothing about the screen; the game session steps it and the renderer draws what it reports. Rooms add other people's
 * cars from their poses. Items: ? blocks and coins are this game's own; balls, sparks, oil slicks and Walkers are in
 * the shared world, reached through the link (raceItems.ts).
 */

/** The shared world, for items and Walkers: what is in it, and sending events to it as this game's player. */
export interface RaceLink {
  world(): World
  emit(ev: WorldEvent): void
  /** This game's player number (who threw what). */
  num: number
}

/** Sounds a step asks for (your car only). */
export type RaceSound = 'coin' | 'item' | 'powerup' | 'hurt' | 'throw'

/** Another player's car near yours, from their pose: a shield on it spins you if you touch. */
export interface OtherCar {
  x: number
  y: number
  shield: boolean
  air: boolean
}

export const COUNTDOWN_TICKS = 180
const GO_SHOW_TICKS = 40
const RESULTS_DELAY = 70

export type SteerMode = 'turn' | 'point'
export type CameraMode = 'map' | 'turn'

export interface Racer {
  name: string
  color: string
  you: boolean
  /** Computer racers drive a little slower than top speed. */
  topK: number
  car: Car
  lap: LapState
  item: RaceItem | null
  /** Computer racers: when they will use the item they hold (0 = not decided yet). */
  itemAt: number
  coins: number
  /** Frames of shield left. */
  shield: number
  /** Can't be hit again before this tick. */
  graceUntil: number
}

export interface RaceStanding {
  name: string
  color: string
  you: boolean
  lap: number
  done: boolean
  /** Race time in ticks for finishers. */
  time: number
}

export type LoopProblem = 'no-finish' | 'no-loop' | 'finish-gap'

/** Someone else in the room, as their poses report them. */
export interface RemoteRacer {
  name: string
  color: string
  /** Laps done, distance round the lap, hidden gates passed this lap. */
  lap: number
  d: number
  gates: number
  /** Race time in ticks once finished, else -1. */
  finish: number
}

export interface RaceHud {
  /** Practice: driving before anyone has started a race (rooms). */
  phase: 'practice' | 'countdown' | 'racing' | 'results'
  /** Start lights lit: 1..3 red, 4 green, 0 off. */
  lights: number
  laps: number
  lap: number
  /** Ticks since the start (frozen once you finish). */
  time: number
  bestLap: number
  place: number
  racers: number
  youDone: boolean
  standings: RaceStanding[]
  /** Why laps don't count on this track, if they don't. */
  loopProblem: LoopProblem | null
  /** Whether ? blocks hand out items on this track; the item you hold; your coins. */
  itemsOn: boolean
  item: RaceItem | null
  coins: number
}

/** A car as the renderer needs it. */
export interface DrawnCar {
  x: number
  y: number
  a: number
  color: string
  name: string
  you: boolean
  lift: number
  flame: number
  shield?: boolean
}

const YOU = { name: 'You', color: '#3e6fd8', topK: 1 }
const RIVALS = [
  { name: 'Maya', color: '#8f5bd6', topK: 0.93 },
  { name: 'Leo', color: '#2e9d57', topK: 0.88 },
  { name: 'Sam', color: '#f08a24', topK: 0.84 },
]
export const MAX_RIVALS = RIVALS.length

/** Turn the keys into driving: left and right steer, or (pointing mode) the arrows say which way to go. */
export function carInputFrom(f: InputFrame, mode: SteerMode, car: Car, cameraRot = 0): CarInput {
  const keySteer = (f.right ? 1 : 0) - (f.left ? 1 : 0)
  if (mode === 'point') {
    // A tilted micro:bit points the way to go, unless arrows are held.
    const keyed = keySteer || f.up || f.down
    const sx = keyed || !f.stick ? keySteer : f.stick.x, sy = keyed || !f.stick ? (f.down ? 1 : 0) - (f.up ? 1 : 0) : -f.stick.y
    if (!sx && !sy) return { steer: 0, gas: false, brake: false }
    const r = -cameraRot
    const want = Math.atan2(sx * Math.sin(r) + sy * Math.cos(r), sx * Math.cos(r) - sy * Math.sin(r))
    const diff = Math.atan2(Math.sin(want - car.a), Math.cos(want - car.a))
    return { steer: Math.max(-1, Math.min(1, diff * 4)), gas: Math.abs(diff) < 2.2, brake: Math.abs(diff) >= 2.2 }
  }
  // Keys win; otherwise a tilted micro:bit steers smoothly.
  return { steer: keySteer || (f.stick?.x ?? 0), gas: f.up, brake: f.down }
}

export interface RestartOptions {
  /** Which place on the grid is yours (rooms give each player their own). */
  slot?: number
  /** Ticks since the race started, for joining a race already under way (rooms). */
  elapsed?: number
  /** Free driving until a race starts: no lights, no results. */
  practice?: boolean
  /** Your car's colour (rooms use each player's own colour). */
  color?: string
}

export class RaceRun {
  readonly loop: RaceLoop
  racers: Racer[] = []
  tick = 0
  practice = false
  skids: { x: number; y: number }[] = []
  private startTick = 0
  private finishedAt = -1
  private events: CarEvent[] = []
  /** This game's ? blocks and coins that have been taken: tile index to the tick they come back. */
  readonly boxes = new Map<number, number>()
  readonly coinsTaken = new Map<number, number>()
  /** Thrown things this game already reported hitting. */
  private reported = new Set<number>()
  /** What this step wants heard (your car). */
  readonly sounds: RaceSound[] = []
  /** Item rolls and computer racers' timing; tests replace it. */
  random: () => number = Math.random

  constructor(readonly level: LevelDesign, private rivals: number, private feel: () => CarFeel, private link?: RaceLink) {
    this.loop = computeLoop(level)
    this.restart(rivals)
  }

  get laps() {
    return this.level.race?.laps ?? DEFAULT_RACE.laps
  }

  get you(): Racer {
    return this.racers[0]
  }

  get racing() {
    return this.tick > COUNTDOWN_TICKS
  }

  get itemsOn() {
    return this.level.race?.items ?? DEFAULT_RACE.items
  }

  /** Back to the starting grid. */
  restart(rivals = this.rivals, opts: RestartOptions = {}) {
    this.rivals = Math.max(0, Math.min(MAX_RIVALS, rivals))
    const field = [{ ...YOU, ...(opts.color ? { color: opts.color } : {}), you: true }, ...RIVALS.slice(0, this.rivals).map((r) => ({ ...r, you: false }))]
    const slot = Math.max(0, opts.slot ?? 0)
    const spots = gridSpots(this.level, slot + field.length)
    // You take your slot; computer racers fill the places behind it.
    this.racers = field.map((r, i) => ({ ...r, car: createCar(spots[slot + i]), lap: createLapState(0), item: null, itemAt: 0, coins: 0, shield: 0, graceUntil: 0 }))
    for (const r of this.racers) trackLaps(r.lap, this.loop, this.level, r.car.x, r.car.y, 0, this.laps)
    this.practice = !!opts.practice
    // Practice skips the lights; joining late lands mid-countdown or straight into the race.
    this.tick = this.practice ? COUNTDOWN_TICKS : Math.max(0, opts.elapsed ?? 0)
    this.startTick = Math.min(this.tick, COUNTDOWN_TICKS)
    for (const r of this.racers) r.lap.lapStart = this.startTick
    this.finishedAt = -1
    this.skids = []
    this.boxes.clear()
    this.coinsTaken.clear()
    this.reported.clear()
  }

  /** Your race time so far, or your finish time, in ticks; -1 before the start or while practising. */
  get yourTime(): number {
    if (this.practice || this.tick < COUNTDOWN_TICKS) return -1
    return (this.you.lap.done >= 0 ? this.you.lap.done : this.tick) - this.startTick
  }

  /** One frame. `input` is how you are driving, `use` whether you pressed the item button; `others` are room cars. */
  step(input: CarInput, use = false, others: readonly OtherCar[] = []) {
    this.tick++
    this.sounds.length = 0
    if (this.tick === COUNTDOWN_TICKS && !this.practice) {
      this.startTick = this.tick
      for (const r of this.racers) r.lap.lapStart = this.tick
    }
    if (!this.racing) return
    const feel = this.feel()
    const world = this.link?.world()
    this.racers.forEach((r, slot) => {
      const drive = r.you ? (r.lap.done >= 0 ? { steer: 0, gas: false, brake: true } : input) : raceAutopilot(r.car, this.loop, this.level, r.lap.d)
      // You use your item with the button; computer racers use theirs a moment after picking it up.
      if (r.item && r.car.splash === 0 && r.car.spin === 0 && (r.lap.done < 0 || !r.you)) {
        if (r.you) {
          if (use) this.useItem(r, slot, feel)
        } else if (!r.itemAt) r.itemAt = this.tick + 50 + Math.floor(this.random() * 150)
        else if (this.tick >= r.itemAt) {
          this.useItem(r, slot, feel)
          r.itemAt = 0
        }
      }
      if (r.shield > 0) r.shield--
      this.events.length = 0
      stepCar(r.car, drive, this.level, feel, this.tick, this.events, r.topK * (1 + COIN_TOP_K * r.coins))
      if (this.events.includes('splash')) r.coins = Math.max(0, r.coins - SPLASH_COIN_LOSS)
      this.pickUp(r)
      if (world) this.meetHazards(r, slot, world)
      const result = trackLaps(r.lap, this.loop, this.level, r.car.x, r.car.y, this.tick, this.laps)
      if (r.you && result === 'finish' && !this.practice) this.finishedAt = this.tick
      // Practice laps never end the session.
      if (this.practice && r.lap.done >= 0) r.lap.done = -1
      const c = r.car
      if (c.slip > 0.45 && c.air <= 0 && c.splash === 0 && Math.hypot(c.vx, c.vy) > 1) {
        const fx = Math.cos(c.a), fy = Math.sin(c.a)
        for (const s of [-3.6, 3.6]) this.skids.push({ x: c.x - fx * 5 - fy * s, y: c.y - fy * 5 + fx * s })
        if (this.skids.length > 1600) this.skids.splice(0, 200)
      }
    })
    this.bumpCars()
    // Someone else's shield spins you if you touch.
    const me = this.you
    for (const o of others) {
      if (!o.shield || me.shield > 0 || o.air !== me.car.air > 0) continue
      if (Math.hypot(o.x - me.car.x, o.y - me.car.y) < SHIELD_BUMP) this.hit(me)
    }
    if (this.reported.size > 256 && world) {
      const live = new Set(world.entities.map((e) => e.id))
      for (const id of this.reported) if (!live.has(id)) this.reported.delete(id)
    }
  }

  private useItem(r: Racer, slot: number, feel: CarFeel) {
    const it = r.item
    if (!it) return
    r.item = null
    if (it === 'turbo') kickBoost(r.car, feel)
    else if (it === 'shield') r.shield = SHIELD_TICKS
    else this.link?.emit(throwEvent(r.car, it, feel, slot))
    if (r.you) this.sounds.push(it === 'turbo' || it === 'shield' ? 'powerup' : 'throw')
  }

  /** ? blocks and coins under the car. */
  private pickUp(r: Racer) {
    const c = r.car
    if (c.air > 0 || c.splash > 0) return
    const tx = Math.floor(c.x / 16), ty = Math.floor(c.y / 16)
    const t = trackTileAt(this.level, c.x, c.y)
    const i = ty * this.level.width + tx
    if (t === RT.ITEM && this.itemsOn && (this.boxes.get(i) ?? 0) <= this.tick) {
      this.boxes.set(i, this.tick + BOX_BACK_TICKS)
      if (!r.item) {
        r.item = rollItem(this.random())
        if (r.you) this.sounds.push('item')
      }
    } else if (t === RT.COIN && (this.coinsTaken.get(i) ?? 0) <= this.tick) {
      this.coinsTaken.set(i, this.tick + COIN_BACK_TICKS)
      r.coins = Math.min(MAX_COINS, r.coins + 1)
      if (r.you) this.sounds.push('coin')
    }
  }

  /** Walkers and thrown items in the shared world. */
  private meetHazards(r: Racer, slot: number, w: World) {
    const c = r.car
    if (c.air > 0 || c.splash > 0 || this.tick < r.graceUntil || !this.link) return
    const h = hazardAt(w, c.x, c.y, this.link.num, slot, this.reported)
    if (!h) return
    if (h.kind === 'thrown') {
      // Whatever hit the car is used up, for everyone; a shield takes the hit.
      this.reported.add(h.id)
      this.link.emit({ t: 'hit', id: h.id })
    }
    if (r.shield <= 0) this.hit(r)
  }

  /** Spin out and drop some coins. */
  private hit(r: Racer) {
    if (r.shield > 0 || (r.you && r.lap.done >= 0) || !spinOut(r.car)) return
    r.coins = Math.max(0, r.coins - SPIN_COIN_LOSS)
    r.graceUntil = this.tick + HIT_GRACE_TICKS
    if (r.you) this.sounds.push('hurt')
  }

  /** Whether this game's ? block or coin at tile index `i` is showing. */
  showing(i: number): boolean {
    const t = this.level.tiles[i]
    return ((t === RT.ITEM ? this.boxes : this.coinsTaken).get(i) ?? 0) <= this.tick
  }

  /** Cars push each other apart and trade a little speed; never into a barrier. */
  private bumpCars() {
    const rs = this.racers
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i].car, b = rs[j].car
        if (a.splash || b.splash || (a.air > 0) !== (b.air > 0)) continue
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy)
        if (d <= 0 || d >= CAR_RADIUS * 2) continue
        if (rs[i].shield > 0) this.hit(rs[j])
        if (rs[j].shield > 0) this.hit(rs[i])
        const nx = dx / d, ny = dy / d, push = (CAR_RADIUS * 2 - d) / 2
        if (solidUnder(this.level, a.x - nx * push, a.y - ny * push, CAR_RADIUS) < 0) { a.x -= nx * push; a.y -= ny * push }
        if (solidUnder(this.level, b.x + nx * push, b.y + ny * push, CAR_RADIUS) < 0) { b.x += nx * push; b.y += ny * push }
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
        if (rel < 0) {
          a.vx += nx * rel * 0.6; a.vy += ny * rel * 0.6
          b.vx -= nx * rel * 0.6; b.vy -= ny * rel * 0.6
        }
      }
    }
  }

  /** Everyone in the race, best first: your car, computer racers and (rooms) other people. */
  standings(remotes: RemoteRacer[] = []): RaceStanding[] {
    const L = this.loop.ok ? this.loop.length : 1
    const progressOf = (lap: number, d: number, gates: number, finish: number) =>
      finish >= 0 ? 1e9 - finish : lap * L + (!(gates & 2) && d > L / 2 ? d - L : d)
    const rows = [
      ...this.racers.map((r) => ({
        name: r.name, color: r.color, you: r.you,
        lap: Math.min(r.lap.lap + 1, this.laps), done: r.lap.done >= 0, time: r.lap.done >= 0 ? r.lap.done - this.startTick : 0,
        p: r.lap.done >= 0 ? 1e9 - (r.lap.done - this.startTick) : raceProgress(r.lap, this.loop),
      })),
      ...remotes.map((r) => ({
        name: r.name, color: r.color, you: false,
        lap: Math.min(r.lap + 1, this.laps), done: r.finish >= 0, time: Math.max(0, r.finish), p: progressOf(r.lap, r.d, r.gates, r.finish),
      })),
    ]
    // On the grid, before the start, the order is the grid's.
    if (this.tick >= COUNTDOWN_TICKS) rows.sort((a, b) => b.p - a.p)
    return rows.map(({ p: _p, ...row }) => row)
  }

  hud(remotes: RemoteRacer[] = []): RaceHud {
    const me = this.you
    const standings = this.standings(remotes)
    const t = this.tick
    return {
      phase: this.practice ? 'practice' : t < COUNTDOWN_TICKS ? 'countdown' : this.finishedAt >= 0 && t >= this.finishedAt + RESULTS_DELAY ? 'results' : 'racing',
      lights: this.practice ? 0 : t < COUNTDOWN_TICKS ? Math.floor(t / 60) + 1 : t < COUNTDOWN_TICKS + GO_SHOW_TICKS ? 4 : 0,
      laps: this.laps,
      lap: Math.min(me.lap.lap + 1, this.laps),
      time: Math.max(0, this.yourTime),
      bestLap: me.lap.lapTimes.length ? Math.min(...me.lap.lapTimes) : 0,
      place: standings.findIndex((s) => s.you) + 1,
      racers: standings.length,
      youDone: me.lap.done >= 0,
      standings,
      loopProblem: this.loop.ok ? null : this.loop.reason,
      itemsOn: this.itemsOn,
      item: me.item,
      coins: me.coins,
    }
  }

  cars(): DrawnCar[] {
    const out: DrawnCar[] = []
    // Cars in the air are drawn over the ones on the ground.
    for (const r of [...this.racers].sort((a, b) => (a.car.air > 0 ? 1 : 0) - (b.car.air > 0 ? 1 : 0))) {
      const k = r.car
      if (k.splash > 0) continue
      out.push({ x: k.x, y: k.y, a: k.a, color: r.color, name: r.name, you: r.you, lift: k.air > 0 ? Math.sin(Math.PI * (1 - k.air / k.airMax)) : 0, flame: k.boost > 0 ? 3 + (this.tick % 4) : 0, shield: r.shield > 0 })
    }
    return out
  }
}

export const formatRaceTime = (ticks: number) => `${(ticks / 60).toFixed(1)}s`
