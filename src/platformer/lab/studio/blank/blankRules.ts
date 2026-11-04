/**
 * The words a Start from nothing game's jobs say to each other (studio/blank/jobs.ts) and Play listens for (BlankHud).
 * They are the Platformer's own messages, so a brick borrowed from the Platformer (a Coin, Spikes, the Goal) and a
 * brick with a job understand each other.
 */
import type { BrickDef, LevelDesign } from '../../core/contracts'
import type { Runtime } from '../../core/runtime'
import { COURSE_CLEAR, HERO_HURT } from '../builder/playRules'

/** The Goal job says it when the player touches it; Play shows "You win!". */
export const WIN_MESSAGE = COURSE_CLEAR
/** The Hurts job says it when the player touches it; the player's job sends it back to the start. */
export const HURT_MESSAGE = HERO_HURT

/** The six jobs a brick can have (owner decisions 2026-11-04). */
export const JOB_IDS = ['player', 'wall', 'collect', 'goal', 'hurts', 'falls'] as const
export type JobId = (typeof JOB_IDS)[number]
/** The Player job's three ways to move. */
export const PLAYER_WAYS = ['walk', 'jump', 'drive'] as const
export type PlayerWay = (typeof PLAYER_WAYS)[number]

/** A snapped job's id ('player:walk' is the Player job). */
export const jobIdOf = (job: string | undefined): JobId | undefined => {
  const id = job?.split(':')[0]
  return (JOB_IDS as readonly string[]).includes(id ?? '') ? (id as JobId) : undefined
}

/** The jobs on a brick, in the order they were given. */
export function jobsOf(brick: Pick<BrickDef, 'powers'>): JobId[] {
  return (brick.powers ?? []).map((p) => jobIdOf(p.job)).filter((j): j is JobId => !!j)
}

/** Has this brick got any code of its own or any job (so it is not waiting for one)? */
export function hasJobOrCode(brick: Pick<BrickDef, 'powers' | 'program'>): boolean {
  if (jobsOf(brick).length > 0) return true
  return brick.program.procedures.length > 0 || brick.program.scripts.some((s) => s.body.length > 0)
}

/** The one team score (v1): a Stage variable the Collect job adds to. */
export const SCORE_ID = 'score'
export const SCORE_NAME = 'Score'

/** Does this game keep a score (a Collect job made one, or the kid made a Stage variable called Score)? */
export function scoreVariableId(design: Pick<LevelDesign, 'stage'>): string | undefined {
  const vars = design.stage.program.variables
  return (vars.find((v) => v.id === SCORE_ID) ?? vars.find((v) => v.name.trim().toLowerCase() === SCORE_NAME.toLowerCase()))?.id
}

/** The score now, or null when the game keeps none. */
export function readScore(runtime: Runtime, design: Pick<LevelDesign, 'stage'>): number | null {
  const id = scoreVariableId(design)
  if (!id) return null
  const value = runtime.world.stage.variables[id]
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}
