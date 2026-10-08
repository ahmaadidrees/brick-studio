/**
 * What the builder needs to know to talk to a kid during Play. None of this is an engine rule: the Goal and the Hero
 * are ordinary bricks that broadcast these messages (starter.ts "check for the Hero", hero/heroBrick.ts "hero hurt"),
 * and the builder only listens (Runtime.onBroadcast). A test keeps the words below in step with those bricks.
 */
import type { LevelDesign, Value } from '../../core/contracts'
import type { Runtime } from '../../core/runtime'

/** The Goal says this when the Hero reaches it. */
export const COURSE_CLEAR = 'course clear'
/** Anything that hurts the Hero (spikes, lava, a Walker) says this; the Hero goes back to the start. */
export const HERO_HURT = 'hero hurt'
/** The Stage's score variable (a Coin says "coin collected", the Stage adds one). */
export const COINS_VARIABLE = 'coins'

/** The keys the Hero reads (hero/heroBrick.ts "read keys"). */
export const PLAY_CONTROLS_HINT = 'move · Space jumps (hold to go higher) · hold X to run'

const isNamed = (name: string, wanted: string) => name.trim().toLowerCase() === wanted

/** Does the level have a copy of the brick called `name` (the Hero, the Goal)? */
export function hasCopyOf(design: LevelDesign, name: string): boolean {
  const ids = new Set(design.bricks.filter((b) => isNamed(b.name, name.toLowerCase())).map((b) => b.id))
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
export function readCoins(runtime: Runtime, design: LevelDesign): number | null {
  const decl = design.stage.program.variables.find((v) => isNamed(v.name, COINS_VARIABLE))
  if (!decl) return null
  const value: Value | undefined = runtime.world.stage.variables[decl.id]
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}
