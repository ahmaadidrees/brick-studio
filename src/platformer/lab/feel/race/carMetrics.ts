/**
 * Car feel measurements (docs/qa/hackable-modes R1), the race kit's car (`engine/car.ts`, 60 frames a second) against
 * the Hackable Car in open blocks (studio/race/carBrick.ts, 30 ticks a second), on the same fields with the same inputs.
 *
 * Both engines produce a trajectory in the same units: milliseconds, steps (one old pixel), y up, Scratch directions.
 * Inputs are given per 60 Hz frame; the Hackable runner holds a key for a tick when it is down in either of its two
 * frames (feel/adapter.ts tickKeys does the same for the Hero).
 */
import { DEFAULT_CAR_FEEL, createCar, stepCar, type CarInput, type Track } from '@brick-studio/platformer-core/engine/car'
import { RT } from '@brick-studio/platformer-core/engine/raceTiles'
import { play } from '../../core/index'
import type { LevelDesign, Target } from '../../core/contracts'
import { TrackPainter, raceDesign, trackChar, type TrackBrickKey } from '../../studio/race/raceTrack'

export const FRAME_MS = 1000 / 60
export const TICK_MS = 1000 / 30
const TILE = 16

/** What a field cell is made of. Grass is the empty background. */
export type Ground = 'grass' | Exclude<TrackBrickKey, 'finish'>

/** A test field: `cols` x `rows` cells (row 0 at the bottom), what each cell is, and where the car starts. */
export interface Field {
  cols: number
  rows: number
  ground: (col: number, row: number) => Ground
  /** Start cell (the car's centre is the cell's centre) and direction. */
  start: { col: number; row: number; direction: number }
}

export interface FrameInput {
  steer: -1 | 0 | 1
  gas: boolean
  brake: boolean
}

export interface Sample {
  t: number
  x: number
  y: number
  /** Scratch direction the car points. */
  dir: number
}
export type Trajectory = Sample[]
export type Runner = (field: Field, frames: FrameInput[]) => Trajectory

// ----------------------------------------------------------------------------------------------- the race kit's car

const OLD_TILE: Record<Ground, number> = { grass: RT.GRASS, road: RT.ROAD, dirt: RT.DIRT, ice: RT.ICE, barrier: RT.BARRIER, boost: RT.BOOST_R }

/** The race kit's car on the same field. Its rows grow downwards, its angle is radians from +x, clockwise on screen. */
export const oldCarRunner: Runner = (field, frames) => {
  const { cols: w, rows: h } = field
  const tiles = new Uint8Array(w * h)
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) tiles[(h - 1 - r) * w + c] = OLD_TILE[field.ground(c, r)]
  const track: Track = { tiles, width: w, height: h }
  const H = h * TILE
  const car = createCar({ x: (field.start.col + 0.5) * TILE, y: H - (field.start.row + 0.5) * TILE, a: ((field.start.direction - 90) * Math.PI) / 180 })
  return frames.map((f, i): Sample => {
    const input: CarInput = { steer: f.steer, gas: f.gas, brake: f.brake }
    stepCar(car, input, track, DEFAULT_CAR_FEEL, i)
    return { t: (i + 1) * FRAME_MS, x: car.x, y: H - car.y, dir: (car.a * 180) / Math.PI + 90 }
  })
}

// ----------------------------------------------------------------------------------------------- the Hackable Car

const CHAR: Record<Ground, string> = {
  grass: '.',
  road: trackChar('road'),
  dirt: trackChar('dirt'),
  ice: trackChar('ice'),
  barrier: trackChar('barrier'),
  boost: trackChar('boost'),
}

export function fieldDesign(field: Field): LevelDesign {
  const p = new TrackPainter(field.cols, field.rows)
  for (let r = 0; r < field.rows; r++) for (let c = 0; c < field.cols; c++) p.set(c, r, CHAR[field.ground(c, r)])
  return raceDesign({ id: 'car_feel', name: 'Car feel', tiles: p.layer(), car: { col: field.start.col, row: field.start.row, direction: field.start.direction }, noCountdown: true })
}

/** Ticks with no keys before the inputs start, so the green flag and "go" have run. */
export const WARM_UP_TICKS = 3

/** A Hackable Car on the level `designFor` builds for each field, driven with the arrow keys: right and left steer, up is gas, down is brake. */
export const carRunner = (designFor: (field: Field) => LevelDesign): Runner => (field, frames) => {
  const runtime = play(designFor(field))
  const car = (): Target => runtime.world.targets.find((t) => t.copyId === 'copy_car')!
  for (let i = 0; i < WARM_UP_TICKS; i++) runtime.step()
  const held = new Set<string>()
  const out: Trajectory = []
  for (let i = 0; i < frames.length; i += 2) {
    const want = new Set<string>()
    for (const f of [frames[i], frames[i + 1]]) {
      if (!f) continue
      if (f.steer > 0) want.add('right arrow')
      if (f.steer < 0) want.add('left arrow')
      if (f.gas) want.add('up arrow')
      if (f.brake) want.add('down arrow')
    }
    for (const k of want) if (!held.has(k)) (held.add(k), runtime.pressKey(k))
    for (const k of [...held]) if (!want.has(k)) (held.delete(k), runtime.releaseKey(k))
    runtime.step()
    const t = car()
    out.push({ t: (i + 2) * FRAME_MS, x: t.x, y: t.y, dir: t.direction })
  }
  return out
}

/** The standard Hackable Car. */
export const hackableCarRunner: Runner = carRunner(fieldDesign)

// ----------------------------------------------------------------------------------------------- fields and inputs

const W = 100, H = 60
/** An open field of one ground, the car in the middle of the left side heading right. */
export const openField = (ground: Ground, start = { col: 6, row: 30, direction: 90 }): Field => ({ cols: W, rows: H, ground: () => ground, start })
/** Road with a one-cell boost pad column at BOOST_COL. */
export const BOOST_COL = 25
export const boostField: Field = { cols: W, rows: H, ground: (c) => (c === BOOST_COL ? 'boost' : 'road'), start: { col: 6, row: 30, direction: 90 } }

export const hold = (seconds: number, input: Partial<FrameInput>): FrameInput[] =>
  Array.from({ length: Math.round(seconds * 60) }, () => ({ steer: 0, gas: false, brake: false, ...input }))

// ----------------------------------------------------------------------------------------------- measuring

/** Speed (steps per second) at each sample, from the move since the one before. */
export function speeds(tr: Trajectory, x0: number, y0: number): number[] {
  return tr.map((s, i) => {
    const p = i === 0 ? { x: x0, y: y0, t: 0 } : tr[i - 1]
    return Math.hypot(s.x - p.x, s.y - p.y) / ((s.t - p.t) / 1000)
  })
}

/** Which way the car is moving at each sample, as a Scratch direction (NaN when it isn't). */
export function headings(tr: Trajectory): number[] {
  return tr.map((s, i) => {
    if (i === 0) return NaN
    const dx = s.x - tr[i - 1].x, dy = s.y - tr[i - 1].y
    return dx === 0 && dy === 0 ? NaN : (Math.atan2(dx, dy) * 180) / Math.PI
  })
}

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

export interface CarMetrics {
  /** Road top speed, steps/s. */
  topSpeed: number
  /** Time from standing to 99% of top speed, ms. */
  timeToTop: number
  /** From top speed, brakes held: how far the car goes before it stops, steps. */
  stopDistance: number
  /** Full steering at top speed with gas: the diameter of the circle it drives, steps. */
  turnCircle: number
  /** Top speed on grass and on dirt, steps/s. */
  grassTop: number
  dirtTop: number
  /** Over a boost pad at top speed: the fastest it goes, steps/s, and how long it stays above 1.1 x top speed, ms. */
  boostPeak: number
  boostTime: number
  /** On ice at its top speed, full steering with gas: the angle between where it points and where it goes, after 0.5 s and 1 s, degrees. */
  iceDrift05: number
  iceDrift10: number
  /** The same on road after 0.5 s: how much the road car slides, degrees. */
  roadDrift05: number
}

const startXY = (f: Field) => ({ x: (f.start.col + 0.5) * TILE, y: (f.start.row + 0.5) * TILE })

/** Index of the first sample at or after `ms`. */
const at = (tr: Trajectory, ms: number) => tr.findIndex((s) => s.t >= ms - 1e-9)

export function measureCar(run: Runner): CarMetrics {
  // Top speed and time to top: gas from standing for 3 s.
  const road = openField('road')
  const { x: x0, y: y0 } = startXY(road)
  const accel = run(road, hold(3, { gas: true }))
  const v = speeds(accel, x0, y0)
  const topSpeed = v[v.length - 1]
  const timeToTop = accel[v.findIndex((s) => s >= topSpeed * 0.99)].t

  // Stopping: 2 s of gas, then brakes until it stops moving forward.
  const stop = run(road, [...hold(2, { gas: true }), ...hold(2, { brake: true })])
  const from = stop[at(stop, 2000) - 1].x
  const stopDistance = Math.max(...stop.slice(at(stop, 2000)).map((s) => s.x)) - from

  // Turning circle: up to speed, then 3 s of full right steering with gas; the circle's size from its last 2 s.
  const turn = run(road, [...hold(1.5, { gas: true }), ...hold(3, { gas: true, steer: 1 })])
  const lap = turn.slice(at(turn, 2500))
  const turnCircle = (Math.max(...lap.map((s) => s.x)) - Math.min(...lap.map((s) => s.x)) + Math.max(...lap.map((s) => s.y)) - Math.min(...lap.map((s) => s.y))) / 2

  const capOn = (ground: Ground) => {
    const f = openField(ground)
    const tr = run(f, hold(4, { gas: true }))
    const s = speeds(tr, startXY(f).x, startXY(f).y)
    return s[s.length - 1]
  }

  // Boost: at top speed over the boost pad.
  const boost = run(boostField, hold(4, { gas: true }))
  const bv = speeds(boost, x0, y0)
  const boostPeak = Math.max(...bv)
  const fast = bv.map((s) => s > topSpeed * 1.1)
  const first = fast.indexOf(true), last = fast.lastIndexOf(true)
  const boostTime = first < 0 ? 0 : boost[last].t - (first === 0 ? 0 : boost[first - 1].t)

  // Drift: get up to speed on the ground, then steer hard right with gas.
  const drift = (ground: Ground, upTo: number) => {
    const f = openField(ground)
    const tr = run(f, [...hold(upTo, { gas: true }), ...hold(1.2, { gas: true, steer: 1 })])
    const hd = headings(tr)
    const angle = (ms: number) => Math.abs(wrap180(tr[at(tr, upTo * 1000 + ms)].dir - hd[at(tr, upTo * 1000 + ms)]))
    return [angle(500), angle(1000)]
  }
  const [iceDrift05, iceDrift10] = drift('ice', 2.5)
  const [roadDrift05] = drift('road', 1.5)

  return { topSpeed, timeToTop, stopDistance, turnCircle, grassTop: capOn('grass'), dirtTop: capOn('dirt'), boostPeak, boostTime, iceDrift05, iceDrift10, roadDrift05 }
}

export interface CarMetricDef {
  id: keyof CarMetrics
  label: string
  unit: 'steps/s' | 'ms' | 'steps' | '°'
  tolerance: { kind: 'rel'; frac: number } | { kind: 'abs'; amount: number }
}

/** The Hero's tolerances (feel/metrics.ts): speeds 3%, times one tick, short distances 2 steps, longer ones 4. Drift 3°. */
const T3 = { kind: 'rel', frac: 0.03 } as const
const TICK = { kind: 'abs', amount: TICK_MS + 1e-6 } as const
const px = (n: number) => ({ kind: 'abs', amount: n }) as const
export const CAR_METRICS: readonly CarMetricDef[] = [
  { id: 'topSpeed', label: 'Top speed on road', unit: 'steps/s', tolerance: T3 },
  { id: 'timeToTop', label: 'Time to top speed', unit: 'ms', tolerance: TICK },
  { id: 'stopDistance', label: 'Stopping distance from top speed', unit: 'steps', tolerance: px(2) },
  { id: 'turnCircle', label: 'Turning circle at top speed', unit: 'steps', tolerance: px(4) },
  { id: 'grassTop', label: 'Top speed on grass', unit: 'steps/s', tolerance: T3 },
  { id: 'dirtTop', label: 'Top speed on dirt', unit: 'steps/s', tolerance: T3 },
  { id: 'boostPeak', label: 'Boost pad: fastest', unit: 'steps/s', tolerance: T3 },
  { id: 'boostTime', label: 'Boost pad: time above 1.1 x top speed', unit: 'ms', tolerance: TICK },
  { id: 'iceDrift05', label: 'Drift on ice after 0.5 s of full steering', unit: '°', tolerance: px(3) },
  { id: 'iceDrift10', label: 'Drift on ice after 1 s of full steering', unit: '°', tolerance: px(3) },
  { id: 'roadDrift05', label: 'Slide on road after 0.5 s of full steering', unit: '°', tolerance: px(3) },
]

export const withinTolerance = (def: CarMetricDef, old: number, now: number): boolean =>
  Math.abs(now - old) <= (def.tolerance.kind === 'rel' ? Math.abs(old) * def.tolerance.frac : def.tolerance.amount)
