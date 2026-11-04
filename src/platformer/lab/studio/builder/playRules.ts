/**
 * What the builder needs to know to talk to a kid during Play. None of this is an engine rule: the Goal and the Hero
 * are ordinary bricks that broadcast these messages (starter.ts "check for the Hero", hero/heroBrick.ts "hero hurt"),
 * and the builder only listens (Runtime.onBroadcast). A test keeps the words below in step with those bricks.
 */
import type { BrickDef, LevelDesign, Value } from '../../core/contracts'
import type { Runtime } from '../../core/runtime'
import { powerKeysOf } from '../powers/powers'

/** The Goal says this when the Hero reaches it. */
export const COURSE_CLEAR = 'course clear'
/** Anything that hurts the Hero (spikes, lava, a Walker) says this; the Hero goes back to the start. */
export const HERO_HURT = 'hero hurt'
/**
 * What the Hero says when it really gets hurt (since parity bucket A: not while it blinks, safe, and also in a pit).
 * A Hero that never says it (one a kid changed before) is heard by HERO_HURT instead.
 */
export const HERO_OUCH = 'ouch'

/** Does any brick in the level say "ouch"? Then the Play screen listens for that instead of "hero hurt". */
export function saysOuch(design: LevelDesign): boolean {
  return design.bricks.some((b) => JSON.stringify(b.program).includes(`"${HERO_OUCH}"`))
}
/** The Stage's score variable (a Coin says "coin collected", the Stage adds one). */
export const COINS_VARIABLE = 'coins'

/** The keys the Hero reads (hero/heroBrick.ts "read keys"), the classic Platformer's: shown after the ← → keys. */
export const PLAY_CONTROLS_HINT = 'or A D move · Space, X or K jumps (hold to go higher) · hold Z, J or Shift to run'

/** Keys the Hero already has (the touch buttons press these): a power reading one needs no button or hint of its own. */
export const HERO_KEYS: ReadonlySet<string> = new Set(['left arrow', 'right arrow', 'up arrow', 'down arrow', 'a', 'd', 'space', 'x', 'k', 'z', 'j', 'shift', 'any'])

/** A key a snapped power reads beyond the Hero's own, and the power's name (Dash reads c). */
export interface PowerKey {
  key: string
  power: string
}

/**
 * Keys that switched-on powers on placed bricks (or the Stage) read, one entry per key, in brick order. Works on a
 * design's bricks or a running world's (both are BrickDefs with their compiled programs).
 */
export function powerKeysIn(bricks: readonly BrickDef[], placed: ReadonlySet<string>): PowerKey[] {
  const out: PowerKey[] = []
  for (const brick of bricks) {
    if (!placed.has(brick.id)) continue
    for (const snap of brick.powers ?? []) {
      for (const key of powerKeysOf(brick, snap)) {
        if (!HERO_KEYS.has(key) && !out.some((k) => k.key === key)) out.push({ key, power: snap.name })
      }
    }
  }
  return out
}

export function powerKeys(design: LevelDesign): PowerKey[] {
  return powerKeysIn([design.stage, ...design.bricks], new Set([design.stage.id, ...design.copies.map((c) => c.brickId)]))
}

/** "z" → "Z", "enter" → "Enter". */
export function keyLabel(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)
}

/** Added to the controls hint: " · Z for Dash". */
export function powerKeysHint(keys: readonly PowerKey[]): string {
  return keys.map((k) => ` · ${keyLabel(k.key)} for ${k.power}`).join('')
}

const isNamed = (name: string, wanted: string) => name.trim().toLowerCase() === wanted

/** Does the level have a copy of the brick called `name` (the Hero, the Goal)? */
export function hasCopyOf(design: LevelDesign, name: string): boolean {
  const canonicalId = `brick_${name.toLowerCase()}`
  const ids = new Set(design.bricks.filter((b) => b.id === canonicalId || b.remixOf === canonicalId || isNamed(b.name, name.toLowerCase())).map((b) => b.id))
  return design.copies.some((c) => ids.has(c.brickId))
}

export interface PlayCheck {
  hero: boolean
  goal: boolean
}

export function checkLevelForPlay(design: LevelDesign): PlayCheck {
  return { hero: hasCopyOf(design, 'Hero'), goal: hasCopyOf(design, 'Goal') }
}

/** The kind line shown when Play cannot start. */
export const NO_HERO_MESSAGE = 'Place your Hero first. Pick the Hero in the Bricks drawer, then click the level.'
/** Added to the controls hint when there is nothing to reach. */
export const NO_GOAL_NOTE = 'There is no Goal yet, so there is nowhere to finish. Place a Goal to win!'

/**
 * The Stage's variable called "coins", read live from the running game, or null if the level has none (then no counter
 * is shown). Looks the variable up by its name, so it works for any project.
 */
/** Ticks a second: the runtime's fixed step. */
export const TICKS_PER_SECOND = 30

/** A play time like the classic game's timer: minutes, then seconds to a tenth ("0:07.3"). */
export function formatPlayTime(ticks: number): string {
  const s = Math.max(0, ticks) / TICKS_PER_SECOND
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

/**
 * Best clear times, per level, for as long as the page is open (like the classic game's best time on a kid's own
 * level). A level is known by its painted cells and placed copies, so changing the level starts a new best.
 */
const bestTimes = new Map<string, number>()
const levelKey = (design: LevelDesign): string => JSON.stringify([design.id, design.tiles?.data ?? null, design.copies.map((c) => [c.brickId, c.x, c.y])])

/** The best time for this level so far (ticks), or null. */
export function bestTime(design: LevelDesign): number | null {
  return bestTimes.get(levelKey(design)) ?? null
}

/** Record a clear; true when it beats an earlier best (the first clear is not a "new best": there was none). */
export function recordClear(design: LevelDesign, ticks: number): boolean {
  const key = levelKey(design)
  const old = bestTimes.get(key)
  if (old === undefined || ticks < old) bestTimes.set(key, ticks)
  return old !== undefined && ticks < old
}

export function readCoins(runtime: Runtime, design: LevelDesign): number | null {
  const decl = design.stage.program.variables.find((v) => isNamed(v.name, COINS_VARIABLE))
  if (!decl) return null
  const value: Value | undefined = runtime.world.stage.variables[decl.id]
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}
