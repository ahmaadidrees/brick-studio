import { CAR_RADIUS, createCar, gridSpots, solidUnder, stepCar, type Car, type CarEvent, type CarFeel, type CarInput } from '@brick-studio/platformer-core/engine/car'
import { DEFAULT_RACE } from '@brick-studio/platformer-core/engine/kits'
import { computeLoop, createLapState, raceProgress, trackLaps, type LapState, type RaceLoop } from '@brick-studio/platformer-core/engine/laps'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { raceAutopilot } from '@brick-studio/platformer-core/engine/raceAutopilot'
import type { InputFrame } from '../input/input'

/*
 * One race on this machine: your car and some computer racers, the countdown, laps, standings and results. It knows
 * nothing about the screen; the game session steps it and the renderer draws what it reports. Rooms (milestone 3) add
 * other people's cars from their poses.
 */

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

export interface RaceHud {
  phase: 'countdown' | 'racing' | 'results'
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
  if (mode === 'point') {
    const sx = (f.right ? 1 : 0) - (f.left ? 1 : 0), sy = (f.down ? 1 : 0) - (f.up ? 1 : 0)
    if (!sx && !sy) return { steer: 0, gas: false, brake: false }
    const r = -cameraRot
    const want = Math.atan2(sx * Math.sin(r) + sy * Math.cos(r), sx * Math.cos(r) - sy * Math.sin(r))
    const diff = Math.atan2(Math.sin(want - car.a), Math.cos(want - car.a))
    return { steer: Math.max(-1, Math.min(1, diff * 4)), gas: Math.abs(diff) < 2.2, brake: Math.abs(diff) >= 2.2 }
  }
  return { steer: (f.right ? 1 : 0) - (f.left ? 1 : 0), gas: f.up, brake: f.down }
}

export class RaceRun {
  readonly loop: RaceLoop
  racers: Racer[] = []
  tick = 0
  skids: { x: number; y: number }[] = []
  private startTick = 0
  private finishedAt = -1
  private events: CarEvent[] = []

  constructor(readonly level: LevelDesign, private rivals: number, private feel: () => CarFeel) {
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

  /** Back to the starting grid. */
  restart(rivals = this.rivals) {
    this.rivals = Math.max(0, Math.min(MAX_RIVALS, rivals))
    const field = [{ ...YOU, you: true }, ...RIVALS.slice(0, this.rivals).map((r) => ({ ...r, you: false }))]
    const spots = gridSpots(this.level, field.length)
    this.racers = field.map((r, i) => ({ ...r, car: createCar(spots[i]), lap: createLapState(0) }))
    for (const r of this.racers) trackLaps(r.lap, this.loop, this.level, r.car.x, r.car.y, 0, this.laps)
    this.tick = 0
    this.finishedAt = -1
    this.skids = []
  }

  /** One frame. `input` is how you are driving. */
  step(input: CarInput) {
    this.tick++
    if (this.tick === COUNTDOWN_TICKS) {
      this.startTick = this.tick
      for (const r of this.racers) r.lap.lapStart = this.tick
    }
    if (!this.racing) return
    const feel = this.feel()
    for (const r of this.racers) {
      const drive = r.you ? (r.lap.done >= 0 ? { steer: 0, gas: false, brake: true } : input) : raceAutopilot(r.car, this.loop, this.level, r.lap.d)
      this.events.length = 0
      stepCar(r.car, drive, this.level, feel, this.tick, this.events, r.topK)
      const result = trackLaps(r.lap, this.loop, this.level, r.car.x, r.car.y, this.tick, this.laps)
      if (r.you && result === 'finish') this.finishedAt = this.tick
      const c = r.car
      if (c.slip > 0.45 && c.air <= 0 && c.splash === 0 && Math.hypot(c.vx, c.vy) > 1) {
        const fx = Math.cos(c.a), fy = Math.sin(c.a)
        for (const s of [-3.6, 3.6]) this.skids.push({ x: c.x - fx * 5 - fy * s, y: c.y - fy * 5 + fx * s })
        if (this.skids.length > 1600) this.skids.splice(0, 200)
      }
    }
    this.bumpCars()
  }

  /** Cars push each other apart and trade a little speed; never into a barrier. */
  private bumpCars() {
    const cars = this.racers.map((r) => r.car)
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j]
        if (a.splash || b.splash || (a.air > 0) !== (b.air > 0)) continue
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy)
        if (d <= 0 || d >= CAR_RADIUS * 2) continue
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

  standings(): RaceStanding[] {
    // On the grid, before the start, the order is the grid's.
    const order = this.tick < COUNTDOWN_TICKS ? [...this.racers] : [...this.racers].sort((a, b) => raceProgress(b.lap, this.loop) - raceProgress(a.lap, this.loop))
    return order.map((r) => ({ name: r.name, color: r.color, you: r.you, lap: Math.min(r.lap.lap + 1, this.laps), done: r.lap.done >= 0, time: r.lap.done >= 0 ? r.lap.done - this.startTick : 0 }))
  }

  hud(): RaceHud {
    const me = this.you
    const standings = this.standings()
    const t = this.tick
    return {
      phase: t < COUNTDOWN_TICKS ? 'countdown' : this.finishedAt >= 0 && t >= this.finishedAt + RESULTS_DELAY ? 'results' : 'racing',
      lights: t < COUNTDOWN_TICKS ? Math.floor(t / 60) + 1 : t < COUNTDOWN_TICKS + GO_SHOW_TICKS ? 4 : 0,
      laps: this.laps,
      lap: Math.min(me.lap.lap + 1, this.laps),
      time: t < COUNTDOWN_TICKS ? 0 : (me.lap.done >= 0 ? me.lap.done : t) - this.startTick,
      bestLap: me.lap.lapTimes.length ? Math.min(...me.lap.lapTimes) : 0,
      place: standings.findIndex((s) => s.you) + 1,
      racers: this.racers.length,
      youDone: me.lap.done >= 0,
      standings,
      loopProblem: this.loop.ok ? null : this.loop.reason,
    }
  }

  cars(): DrawnCar[] {
    const out: DrawnCar[] = []
    // Cars in the air are drawn over the ones on the ground.
    for (const r of [...this.racers].sort((a, b) => (a.car.air > 0 ? 1 : 0) - (b.car.air > 0 ? 1 : 0))) {
      const k = r.car
      if (k.splash > 0) continue
      out.push({ x: k.x, y: k.y, a: k.a, color: r.color, name: r.name, you: r.you, lift: k.air > 0 ? Math.sin(Math.PI * (1 - k.air / k.airMax)) : 0, flame: k.boost > 0 ? 3 + (this.tick % 4) : 0 })
    }
    return out
  }
}

export const formatRaceTime = (ticks: number) => `${(ticks / 60).toFixed(1)}s`
