import { TILE } from './constants'
import type { LevelDesign } from './level'
import { DIR4, RT, raceBoostDir, raceSolid, raceSurface, raceTrack, type Dir4 } from './raceTiles'

// =============================================================================================
// A race car. Like the platformer's player, each game drives its own car and tells the others where it is, so none
// of this is shared state: floats are fine. Units are pixels and pixels per frame at 60 frames a second; a tile is 16
// pixels. Angles are radians with 0 pointing right and rows growing downwards, so a positive turn is clockwise.
// =============================================================================================

/** How the car drives. Every number is a slider in the Feel panel. */
export interface CarFeel {
  /** Top speed on road, px/frame. */
  top: number
  accel: number
  brake: number
  /** Steering, degrees per frame at speed. */
  steer: number
  /** How much sideways slide is removed each frame: 1 is on rails, low values drift. */
  grip: number
  /** How much speed a barrier hands back. */
  bounce: number
  /** Grass and dirt cap the top speed to this share of it. */
  grass: number
  dirt: number
  /** Grip on ice. */
  ice: number
  /** A boost pad's speed as a share of top speed. */
  boostK: number
  /** Frames in the air off a jump ramp, at top speed. */
  jump: number
}

/** "Kart", the mock's default the owner tried first. */
export const DEFAULT_CAR_FEEL: CarFeel = { top: 3.2, accel: 0.07, brake: 0.16, steer: 3.4, grip: 0.22, bounce: 0.35, grass: 0.45, dirt: 0.75, ice: 0.04, boostK: 1.6, jump: 30 }

/** The Feel panel's sliders for a car, grouped like the platformer's FEEL_GROUPS. */
export interface CarFeelField {
  key: keyof CarFeel
  label: string
  min: number
  max: number
  step: number
  hint?: string
}
export const CAR_FEEL_GROUPS: { title: string; fields: CarFeelField[] }[] = [
  {
    title: 'Speed',
    fields: [
      { key: 'top', label: 'Top speed (px/frame)', min: 1.5, max: 6, step: 0.1, hint: 'On road. A brick is 16 px.' },
      { key: 'accel', label: 'Acceleration', min: 0.02, max: 0.25, step: 0.01 },
      { key: 'brake', label: 'Brakes', min: 0.04, max: 0.4, step: 0.01 },
    ],
  },
  {
    title: 'Handling',
    fields: [
      { key: 'steer', label: 'Steering (°/frame)', min: 1, max: 7, step: 0.1 },
      { key: 'grip', label: 'Grip', min: 0.03, max: 1, step: 0.01, hint: 'Low grip slides and drifts. 1 is on rails.' },
      { key: 'bounce', label: 'Barrier bounce', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    title: 'Track bricks',
    fields: [
      { key: 'grass', label: 'Grass slows to', min: 0.2, max: 1, step: 0.05 },
      { key: 'dirt', label: 'Dirt slows to', min: 0.4, max: 1, step: 0.05 },
      { key: 'ice', label: 'Ice grip', min: 0.01, max: 0.3, step: 0.01 },
      { key: 'boostK', label: 'Boost pad', min: 1, max: 2.5, step: 0.05 },
      { key: 'jump', label: 'Jump ramp hang time (frames)', min: 12, max: 60, step: 1 },
    ],
  },
]

/** The mock's other two presets, for comparing feels quickly. */
export const CAR_FEEL_PRESETS: Record<string, CarFeel> = {
  Kart: DEFAULT_CAR_FEEL,
  Drifty: { ...DEFAULT_CAR_FEEL, top: 3.6, accel: 0.06, brake: 0.12, steer: 3.8, grip: 0.06, bounce: 0.45, grass: 0.5, boostK: 1.7 },
  'On rails': { ...DEFAULT_CAR_FEEL, top: 2.8, accel: 0.1, brake: 0.2, steer: 3.0, grip: 0.9, bounce: 0.2, grass: 0.4, boostK: 1.5, ice: 0.12 },
}

export const CAR_RADIUS = 5.5
const BOOST_TICKS = 45
const SPLASH_TICKS = 50
const SPIN_TICKS = 54
const SAFE_EVERY = 6
const SAFE_HISTORY = 12
const RAMP_MEMORY = 240
const DEG = Math.PI / 180

export interface CarSpot {
  x: number
  y: number
  a: number
}

export interface Car extends CarSpot {
  vx: number
  vy: number
  /** Frames of boost left. */
  boost: number
  /** Frames left in the air (off a jump ramp), and how long the jump was. */
  air: number
  airMax: number
  /** Frames left spinning out; the driver has no control. */
  spin: number
  /** Frames left under water before coming back. */
  splash: number
  /** Sideways speed this frame, for skid marks. */
  slip: number
  /** Where to come back after falling in water: the last few safe spots, and the one before the last ramp. */
  safe: CarSpot
  safeHist: CarSpot[]
  preRamp: CarSpot | null
  rampAt: number
}

export interface CarInput {
  /** -1 full left .. 1 full right. */
  steer: number
  gas: boolean
  brake: boolean
}
export const NO_CAR_INPUT: CarInput = { steer: 0, gas: false, brake: false }

export type CarEvent = 'boost' | 'jump' | 'land' | 'splash' | 'respawn' | 'barrier' | 'bumper'

/** What a car drives on: a race level's tiles. Outside the level is a barrier. */
export interface Track {
  tiles: Uint8Array
  width: number
  height: number
}

export const trackTileAt = (t: Track, px: number, py: number): number => {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE)
  return tx < 0 || ty < 0 || tx >= t.width || ty >= t.height ? RT.BARRIER : t.tiles[ty * t.width + tx]
}

export function createCar(spot: CarSpot): Car {
  return { ...spot, vx: 0, vy: 0, boost: 0, air: 0, airMax: 1, spin: 0, splash: 0, slip: 0, safe: { ...spot }, safeHist: [], preRamp: null, rampAt: -1e9 }
}

/** The solid tile a circle at (x, y) overlaps, or -1. */
export function solidUnder(t: Track, x: number, y: number, r: number): number {
  for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) {
    for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
      const c = tx < 0 || ty < 0 || tx >= t.width || ty >= t.height ? RT.BARRIER : t.tiles[ty * t.width + tx]
      if (!raceSolid(c)) continue
      const nx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE)), ny = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE))
      if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return c
    }
  }
  return -1
}

const bounceOf = (c: number, feel: CarFeel): number => (c === RT.BARRIER ? feel.bounce : c === RT.TIRES ? 0.08 : c === RT.BUMPER ? 1 : 0.25)

/** Knock the car into a spin (an item or a critter hit it). Ignored while already spinning or under water. */
export function spinOut(car: Car): boolean {
  if (car.spin > 0 || car.splash > 0) return false
  car.spin = SPIN_TICKS
  return true
}

/** A boost that does not need a pad (the Turbo item). */
export function kickBoost(car: Car, feel: CarFeel) {
  const fx = Math.cos(car.a), fy = Math.sin(car.a)
  const sf = Math.max(car.vx * fx + car.vy * fy, feel.top * feel.boostK)
  const sl = -car.vx * fy + car.vy * fx
  car.vx = fx * sf - fy * sl
  car.vy = fy * sf + fx * sl
  car.boost = BOOST_TICKS + 35
}

/**
 * One frame of driving. `topK` scales the top speed (coins, a slower computer driver). Events go to `out` for sounds
 * and effects.
 */
export function stepCar(car: Car, input: CarInput, track: Track, feel: CarFeel, tick: number, out?: CarEvent[], topK = 1): void {
  if (car.splash > 0) {
    if (--car.splash === 0) {
      const s = (tick - car.rampAt < RAMP_MEMORY && car.preRamp) || car.safeHist[0] || car.safe
      Object.assign(car, { x: s.x, y: s.y, a: s.a, vx: 0, vy: 0, safeHist: [{ ...s }] })
      out?.push('respawn')
    }
    return
  }
  if (car.spin > 0) {
    car.spin--
    car.a += 0.3
    input = NO_CAR_INPUT
  }
  const top = feel.top * topK
  const under = car.air > 0 ? -1 : trackTileAt(track, car.x, car.y)
  const surface = under < 0 ? 'air' : raceSurface(under)
  let grip = feel.grip, accel = feel.accel, capK = 1
  if (surface === 'grass') capK = feel.grass
  else if (surface === 'dirt') capK = feel.dirt
  else if (surface === 'ice') {
    grip = feel.ice
    accel *= 0.6
  }

  // Steering only bites when the car is rolling, flips in reverse and is weak in the air.
  const fwd0 = car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a)
  car.a += input.steer * feel.steer * DEG * (car.air > 0 ? 0.3 : 1) * Math.min(1, Math.abs(fwd0) / (top * 0.35)) * (fwd0 < -0.05 ? -1 : 1)
  const fx = Math.cos(car.a), fy = Math.sin(car.a)
  let sf = car.vx * fx + car.vy * fy
  let sl = -car.vx * fy + car.vy * fx

  const bd = under < 0 ? -1 : raceBoostDir(under)
  if (bd >= 0) {
    const [bx, by] = DIR4[bd]
    if (fx * bx + fy * by > 0.3) {
      if (car.boost < BOOST_TICKS - 1) out?.push('boost')
      car.boost = Math.max(car.boost, BOOST_TICKS)
      sf = Math.max(sf, top * feel.boostK)
    }
  }
  // Ramps launch the car at least at top speed, so a ramp always clears the gap it was built for.
  if (under === RT.RAMP && sf > 0.3) {
    sf = Math.max(sf, top)
    car.air = Math.round(feel.jump * Math.min(1.3, sf / top))
    car.airMax = car.air
    car.preRamp = { ...car.safe }
    car.rampAt = tick
    out?.push('jump')
  }
  let cap = top * capK
  if (car.boost > 0) {
    car.boost--
    const k = Math.min(1, car.boost / BOOST_TICKS)
    cap = Math.max(cap, top * feel.boostK * k + cap * (1 - k))
  }
  // No gas or brakes in the air. On the ground gas never pushes past the cap; above it (after a boost, or onto
  // grass) the car eases back down.
  if (car.air > 0) cap = Math.max(cap, sf)
  else if (input.gas) {
    if (sf < cap) sf = Math.min(cap, sf + accel * (sf < 0 ? 2 : 1))
  } else if (input.brake) sf -= sf > 0.05 ? feel.brake : accel * 0.6
  else sf *= 0.985
  if (car.spin > 0) sf *= 0.95
  if (sf > cap) sf = Math.max(cap, sf - (surface === 'grass' ? 0.14 : 0.05))
  sf = Math.max(sf, -top * 0.4)
  if (car.air <= 0) sl *= 1 - grip
  car.slip = Math.abs(sl)
  car.vx = fx * sf - fy * sl
  car.vy = fy * sf + fx * sl

  // Move one axis at a time in small steps, so a fast car cannot tunnel through a barrier.
  const steps = Math.ceil(Math.hypot(car.vx, car.vy) / 3) || 1
  for (const axis of [0, 1]) {
    for (let i = 0; i < steps; i++) {
      const d = (axis === 0 ? car.vx : car.vy) / steps
      if (axis === 0) car.x += d
      else car.y += d
      const hit = solidUnder(track, car.x, car.y, CAR_RADIUS)
      if (hit < 0) continue
      if (axis === 0) car.x -= d
      else car.y -= d
      let v = -(axis === 0 ? car.vx : car.vy) * bounceOf(hit, feel)
      if (hit === RT.BUMPER) {
        v += Math.sign(v || 1) * 2.4
        out?.push('bumper')
      } else out?.push('barrier')
      const across = hit === RT.TIRES ? 0.6 : hit === RT.BUMPER ? 1 : 0.85
      if (axis === 0) {
        car.vx = v
        car.vy *= across
      } else {
        car.vy = v
        car.vx *= across
      }
      break
    }
  }

  const here = trackTileAt(track, car.x, car.y)
  if (car.air > 0) {
    if (--car.air === 0) {
      if (here === RT.WATER) splash(car, out)
      else out?.push('land')
    }
  } else if (here === RT.WATER) splash(car, out)
  else if (raceTrack(here) && tick % SAFE_EVERY === 0 && car.spin === 0 && sf > 0.5) {
    car.safe = { x: car.x, y: car.y, a: car.a }
    car.safeHist.push(car.safe)
    if (car.safeHist.length > SAFE_HISTORY) car.safeHist.shift()
  }
}

function splash(car: Car, out?: CarEvent[]) {
  car.splash = SPLASH_TICKS
  car.vx = car.vy = 0
  car.spin = 0
  car.air = 0
  out?.push('splash')
}

/** Where the starting grid's cars go: two by two behind the start, facing the grid's direction. */
export function gridSpots(design: LevelDesign, count: number): CarSpot[] {
  const start = design.objects.find((o) => o.kind === 'start')
  const dir: Dir4 = design.race?.startDir ?? 0
  const a = dir * 90 * DEG
  const fx = Math.cos(a), fy = Math.sin(a), rx = -fy, ry = fx
  const cx = ((start?.x ?? 2) + 0.5) * TILE, cy = ((start?.y ?? 2) + 0.5) * TILE
  return Array.from({ length: count }, (_, i) => {
    const back = Math.floor(i / 2) * 1.6 * TILE + (i % 2) * 0.6 * TILE
    const side = (i % 2 ? 0.7 : -0.7) * TILE
    return { x: cx - fx * back + rx * side, y: cy - fy * back + ry * side, a }
  })
}
