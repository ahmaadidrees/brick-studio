import { CAR_RADIUS, DEFAULT_CAR_FEEL, createCar, gridSpots, solidUnder, stepCar, type Car, type CarEvent, type CarFeel, type CarInput } from '@brick-studio/platformer-core/engine/car'
import { TILE } from '@brick-studio/platformer-core/engine/constants'
import { computeLoop, createLapState, raceProgress, trackLaps, type LapState, type RaceLoop } from '@brick-studio/platformer-core/engine/laps'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { raceAutopilot } from '@brick-studio/platformer-core/engine/raceAutopilot'
import { RT, isRaceBoost } from '@brick-studio/platformer-core/engine/raceTiles'
import { DEFAULT_RACE } from '@brick-studio/platformer-core/engine/kits'
import { Input } from '../input/input'
import { drawNameTag, drawRaceCar, drawRaceTile } from './raceArt'

/*
 * A race on one machine: your car and some computer racers, a countdown, laps and results. Like the platformer's
 * player, each car is driven locally; rooms (milestone 3) will add other people's cars from their poses.
 */

export const TICK_MS = 1000 / 60
const COUNTDOWN_TICKS = 180
const GO_SHOW_TICKS = 40
const RESULTS_DELAY = 70
const BAKE = 3

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
  standings: RaceStanding[]
  /** Why laps don't count on this track, if they don't. */
  loopProblem: 'no-finish' | 'no-loop' | 'finish-gap' | null
}

const RIVALS = [
  { name: 'Maya', color: '#8f5bd6', topK: 0.93 },
  { name: 'Leo', color: '#2e9d57', topK: 0.88 },
  { name: 'Sam', color: '#f08a24', topK: 0.84 },
]

export interface RaceSessionOptions {
  rivals: number
  onHud: (hud: RaceHud) => void
}

export class RaceSession {
  readonly level: LevelDesign
  readonly loop: RaceLoop
  readonly input = new Input()
  feel: CarFeel = { ...DEFAULT_CAR_FEEL }
  steerMode: SteerMode = 'turn'
  cameraMode: CameraMode = 'map'
  racers: Racer[] = []
  tick = 0
  private startTick = 0
  private finishedAt = -1
  private skids: { x: number; y: number }[] = []
  private cam = { x: 0, y: 0, z: 1, rot: 0 }
  private baked: HTMLCanvasElement
  private boosts: [number, number][] = []
  private raf = 0
  private last = 0
  private acc = 0
  private cssW = 0
  private cssH = 0
  private dpr = 1
  private observer: ResizeObserver
  private events: CarEvent[] = []

  constructor(level: LevelDesign, private canvas: HTMLCanvasElement, private opts: RaceSessionOptions) {
    this.level = level
    this.loop = computeLoop(level)
    this.baked = document.createElement('canvas')
    this.bake()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.resize()
    this.restart()
  }

  get laps() {
    return this.level.race?.laps ?? DEFAULT_RACE.laps
  }

  start() {
    this.input.attach(window)
    this.last = performance.now()
    const frame = (now: number) => {
      this.acc += Math.min(100, now - this.last)
      this.last = now
      while (this.acc >= TICK_MS) {
        this.step()
        this.acc -= TICK_MS
      }
      this.draw()
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.input.detach(window)
    this.observer.disconnect()
  }

  /** Back to the starting grid with the same racers. */
  restart(rivals = this.opts.rivals) {
    this.opts.rivals = rivals
    const field = [{ name: 'You', color: '#3e6fd8', topK: 1, you: true }, ...RIVALS.slice(0, rivals).map((r) => ({ ...r, you: false }))]
    const spots = gridSpots(this.level, field.length)
    this.racers = field.map((r, i) => ({ ...r, car: createCar(spots[i]), lap: createLapState(0) }))
    for (const r of this.racers) trackLaps(r.lap, this.loop, this.level, r.car.x, r.car.y, 0, this.laps)
    this.tick = 0
    this.finishedAt = -1
    this.skids = []
    const me = this.racers[0].car
    this.cam = { x: me.x, y: me.y, z: this.cam.z || 1, rot: this.cameraMode === 'turn' ? -Math.PI / 2 - me.a : 0 }
    this.zoomTarget(true)
    this.emitHud()
  }

  // ------------------------------------------------------------------------------------------- simulation

  private phase(): RaceHud['phase'] {
    if (this.tick < COUNTDOWN_TICKS) return 'countdown'
    if (this.finishedAt >= 0 && this.tick >= this.finishedAt + RESULTS_DELAY) return 'results'
    return 'racing'
  }

  private youInput(): CarInput {
    const f = this.input.frame()
    if (this.steerMode === 'point') {
      const sx = (f.right ? 1 : 0) - (f.left ? 1 : 0), sy = (f.down ? 1 : 0) - (f.up ? 1 : 0)
      if (!sx && !sy) return { steer: 0, gas: false, brake: false }
      const r = -this.cam.rot
      const wx = sx * Math.cos(r) - sy * Math.sin(r), wy = sx * Math.sin(r) + sy * Math.cos(r)
      const car = this.racers[0].car
      const diff = Math.atan2(Math.sin(Math.atan2(wy, wx) - car.a), Math.cos(Math.atan2(wy, wx) - car.a))
      return { steer: Math.max(-1, Math.min(1, diff * 4)), gas: Math.abs(diff) < 2.2, brake: Math.abs(diff) >= 2.2 }
    }
    return { steer: (f.right ? 1 : 0) - (f.left ? 1 : 0), gas: f.up, brake: f.down }
  }

  step() {
    this.tick++
    if (this.tick === COUNTDOWN_TICKS) {
      this.startTick = this.tick
      for (const r of this.racers) r.lap.lapStart = this.tick
    }
    const racing = this.tick > COUNTDOWN_TICKS
    const mine = this.youInput()
    if (racing) {
      for (const r of this.racers) {
        const finished = r.lap.done >= 0
        const input = r.you ? (finished ? { steer: 0, gas: false, brake: true } : mine) : raceAutopilot(r.car, this.loop, this.level, r.lap.d)
        this.events.length = 0
        stepCar(r.car, input, this.level, this.feel, this.tick, this.events, r.topK)
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
    this.followCamera()
    if (this.tick % 4 === 0 || this.tick === COUNTDOWN_TICKS + 1) this.emitHud()
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
    return order
      .map((r) => ({ name: r.name, color: r.color, you: r.you, lap: Math.min(r.lap.lap + 1, this.laps), done: r.lap.done >= 0, time: r.lap.done >= 0 ? r.lap.done - this.startTick : 0 }))
  }

  private emitHud() {
    const me = this.racers[0]
    const standings = this.standings()
    const phase = this.phase()
    const t = this.tick
    const lights = t < COUNTDOWN_TICKS ? Math.floor(t / 60) + 1 : t < COUNTDOWN_TICKS + GO_SHOW_TICKS ? 4 : 0
    this.opts.onHud({
      phase,
      lights,
      laps: this.laps,
      lap: Math.min(me.lap.lap + 1, this.laps),
      time: t < COUNTDOWN_TICKS ? 0 : (me.lap.done >= 0 ? me.lap.done : t) - this.startTick,
      bestLap: me.lap.lapTimes.length ? Math.min(...me.lap.lapTimes) : 0,
      place: standings.findIndex((s) => s.you) + 1,
      racers: this.racers.length,
      standings,
      loopProblem: this.loop.ok ? null : this.loop.reason,
    })
  }

  // ------------------------------------------------------------------------------------------- camera and drawing

  private resize() {
    const r = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.cssW = r.width
    this.cssH = r.height
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr))
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr))
  }

  /** About 29 tiles across on a laptop, 19 on a phone. */
  private zoomTarget(snap = false) {
    const z = this.cssW / (this.cssW < 640 ? 300 : 460)
    if (snap || !this.cam.z) this.cam.z = z
    return z
  }

  private followCamera() {
    const me = this.racers[0].car
    const z = this.zoomTarget()
    this.cam.z += (z - this.cam.z) * 0.08
    this.cam.x += (me.x + me.vx * 16 - this.cam.x) * 0.12
    this.cam.y += (me.y + me.vy * 16 - this.cam.y) * 0.12
    const want = this.cameraMode === 'turn' ? -Math.PI / 2 - me.a : 0
    this.cam.rot += Math.atan2(Math.sin(want - this.cam.rot), Math.cos(want - this.cam.rot)) * 0.1
  }

  private bake() {
    const { width: w, height: h, tiles } = this.level
    this.baked.width = w * TILE * BAKE
    this.baked.height = h * TILE * BAKE
    const c = this.baked.getContext('2d')!
    c.setTransform(BAKE, 0, 0, BAKE, 0, 0)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[y * w + x]
        drawRaceTile(c, x, y, t, (dx, dy) => {
          const nx = x + dx, ny = y + dy
          return nx < 0 || ny < 0 || nx >= w || ny >= h ? RT.BARRIER : tiles[ny * w + nx]
        })
        if (isRaceBoost(t)) this.boosts.push([x, y])
      }
    }
  }

  draw() {
    const c = this.canvas.getContext('2d')!
    const { cam } = this
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.fillStyle = '#4e9a37'
    c.fillRect(0, 0, this.cssW, this.cssH)
    c.translate(this.cssW / 2, this.cssH / 2)
    c.scale(cam.z, cam.z)
    c.rotate(cam.rot)
    c.translate(-cam.x, -cam.y)
    const W = this.level.width * TILE, H = this.level.height * TILE
    c.imageSmoothingEnabled = true
    c.drawImage(this.baked, 0, 0, W, H)
    const pulse = 0.2 + 0.2 * Math.sin(this.tick / 6)
    c.fillStyle = `rgba(255,236,140,${pulse})`
    for (const [x, y] of this.boosts) c.fillRect(x * TILE, y * TILE, TILE, TILE)
    c.fillStyle = 'rgba(25,28,36,.28)'
    for (const s of this.skids) c.fillRect(s.x - 0.9, s.y - 0.9, 1.8, 1.8)
    const order = [...this.racers].sort((a, b) => (a.car.air > 0 ? 1 : 0) - (b.car.air > 0 ? 1 : 0))
    for (const r of order) {
      const k = r.car
      if (k.splash > 0) continue
      const lift = k.air > 0 ? Math.sin(Math.PI * (1 - k.air / k.airMax)) : 0
      drawRaceCar(c, k, r.color, { lift, flame: k.boost > 0 ? 3 + (this.tick % 4) : 0 })
    }
    for (const r of this.racers) if (!r.you && r.car.splash === 0) drawNameTag(c, r.car.x, r.car.y - (r.car.air > 0 ? 6 : 0), r.name, r.color, cam.rot)
  }
}

export const formatRaceTime = (ticks: number) => `${(ticks / 60).toFixed(1)}s`
