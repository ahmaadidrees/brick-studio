import { SUB } from './constants'
import type { Car, CarFeel } from './car'
import { MAX_THROW_SPEED, RACE_THROWN, type WorldEvent } from './events'
import { EK, ES, RACE_THROWN_LIFE, isRaceThrown, type World } from './world'

// =============================================================================================
// Race items, coins and Walkers as each game's own car meets them. ? blocks and coins are per player: driving through
// one takes it for you, and it comes back for you a few seconds later. Turbo and Shield act on your own car. Balls,
// sparks and oil slicks go into the shared world with an 'item' event, so everyone sees the same ones; the car that
// runs into one says so with a 'hit' event. Walkers live in the world too; touching one spins you out.
// =============================================================================================

export type RaceItem = 'turbo' | 'oil' | 'ball' | 'spark' | 'shield'

export const RACE_ITEMS: Record<RaceItem, { name: string; hint: string; weight: number }> = {
  turbo: { name: 'Turbo', hint: 'A burst of speed', weight: 30 },
  oil: { name: 'Oil slick', hint: 'Drops behind you; whoever drives over it spins', weight: 24 },
  ball: { name: 'Bouncy ball', hint: 'Fires ahead and bounces off walls', weight: 20 },
  spark: { name: 'Spark', hint: 'Fires straight ahead, fast; bursts on a wall', weight: 14 },
  shield: { name: 'Shield', hint: 'Six seconds safe from items and Walkers; bump others to spin them', weight: 12 },
}
const ITEM_ORDER = Object.keys(RACE_ITEMS) as RaceItem[]
const ITEM_TOTAL = ITEM_ORDER.reduce((s, k) => s + RACE_ITEMS[k].weight, 0)

/** A random item, given a number in [0, 1). */
export function rollItem(r: number): RaceItem {
  let left = r * ITEM_TOTAL
  for (const k of ITEM_ORDER) if ((left -= RACE_ITEMS[k].weight) < 0) return k
  return 'turbo'
}

/** A ? block you drove through comes back (for you) after this many ticks; a coin after this many. */
export const BOX_BACK_TICKS = 180
export const COIN_BACK_TICKS = 360
/** Each coin adds a little top speed, up to this many. */
export const MAX_COINS = 10
export const COIN_TOP_K = 0.012
/** Coins dropped when you spin out, and when you fall in water. */
export const SPIN_COIN_LOSS = 3
export const SPLASH_COIN_LOSS = 2
export const SHIELD_TICKS = 360
/** After a hit, a car can't be hit again for this long (it would still be touching the Walker). */
export const HIT_GRACE_TICKS = 90
/** A car can't run into its own ball or spark this soon after throwing it, or its own oil slick. */
const OWN_GRACE = { ball: 40, spark: 40, oil: 90 }
const WALKER_HIT = 10
const SHOT_HIT = 8
const SLICK_HIT = 7
/** Two cars this close touch (one with a shield spins the other). */
export const SHIELD_BUMP = 11

/** The 'item' event that throws a ball or spark ahead of the car, or drops oil behind it. `slot` is which car. */
export function throwEvent(car: Car, item: 'ball' | 'spark' | 'oil', feel: CarFeel, slot: number): WorldEvent {
  const fx = Math.cos(car.a), fy = Math.sin(car.a)
  if (item === 'oil') return { t: 'item', k: RACE_THROWN.OIL, x: Math.round(car.x - fx * 13), y: Math.round(car.y - fy * 13), vx: 0, vy: 0, o: slot }
  const sp = feel.top * (item === 'spark' ? 2.4 : 1.9)
  const v = (n: number) => Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, Math.round(n * SUB)))
  return { t: 'item', k: item === 'spark' ? RACE_THROWN.SPARK : RACE_THROWN.BALL, x: Math.round(car.x + fx * 10), y: Math.round(car.y + fy * 10), vx: v(fx * sp), vy: v(fy * sp), o: slot }
}

/** Something in the world that just ran into a car. */
export type RaceHazard = { kind: 'walker'; id: number } | { kind: 'thrown'; id: number }

/**
 * What in the world touches a car at (x, y): a Walker, or a thrown item (not one this car threw a moment ago, nor one
 * it already reported). `by` is this game's player number and `slot` which of its cars this is.
 */
export function hazardAt(w: World, x: number, y: number, by: number, slot: number, reported: ReadonlySet<number>): RaceHazard | null {
  const px = x * SUB, py = y * SUB
  for (const e of w.entities) {
    if (e.rm) continue
    const dx = e.x + e.w / 2 - px, dy = e.y + e.h / 2 - py
    const d2 = (dx * dx + dy * dy) / (SUB * SUB)
    if (e.kind === EK.WALKER) {
      if (e.state === ES.ACTIVE && d2 < WALKER_HIT * WALKER_HIT) return { kind: 'walker', id: e.id }
      continue
    }
    if (!isRaceThrown(e) || reported.has(e.id)) continue
    const what = e.kind === EK.RACE_SLICK ? 'oil' : e.kind === EK.RACE_SPARK ? 'spark' : 'ball'
    if (e.owner === by && e.a === slot && e.timer < OWN_GRACE[what]) continue
    const r = what === 'oil' ? SLICK_HIT : SHOT_HIT
    if (d2 < r * r) return { kind: 'thrown', id: e.id }
  }
  return null
}

/** A thrown thing as the renderer draws it, in pixels. */
export interface DrawnThrown {
  kind: 'ball' | 'spark' | 'oil'
  x: number
  y: number
  /** 0..1 of its life left (slicks fade out at the end). */
  left: number
}

export function thrownToDraw(w: World): DrawnThrown[] {
  const out: DrawnThrown[] = []
  for (const e of w.entities) {
    if (e.rm || !isRaceThrown(e)) continue
    const i = e.kind === EK.RACE_SLICK ? 2 : e.kind === EK.RACE_SPARK ? 1 : 0
    out.push({ kind: (['ball', 'spark', 'oil'] as const)[i], x: (e.x + e.w / 2) / SUB, y: (e.y + e.h / 2) / SUB, left: 1 - e.timer / RACE_THROWN_LIFE[i] })
  }
  return out
}

/** A Walker as the renderer draws it: where it is, which way it faces (0 right, 1 down, 2 left, 3 up), knocked flat. */
export interface DrawnWalker {
  x: number
  y: number
  dir: 0 | 1 | 2 | 3
  flat: boolean
}

export function walkersToDraw(w: World): DrawnWalker[] {
  const out: DrawnWalker[] = []
  for (const e of w.entities) {
    if (e.rm || e.kind !== EK.WALKER) continue
    out.push({ x: (e.x + e.w / 2) / SUB, y: (e.y + e.h / 2) / SUB, dir: (e.c ? (e.dir > 0 ? 1 : 3) : e.dir > 0 ? 0 : 2), flat: e.state === ES.SQUASHED })
  }
  return out
}
