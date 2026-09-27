import type { FeelSub } from '@brick-studio/platformer-core/engine/feel'
import type { CompiledProgram } from '../program/compile'
import type { Costume, LabColor, LabDiagnostic, LabKey, LabSound, Phrase, TileKind } from '../program/types'

/*
 * The code lab's world. Everything here is plain data (numbers, strings, arrays, records and one Uint8Array of
 * tiles): no closures, no class instances, no references into the compiled programs. Running scripts are kept as
 * positions (which statement list, which index) so the world can be copied, saved, compared and, when a program is
 * edited while it runs, picked up by the new program where each script stands.
 *
 * Positions and speeds are whole sub-pixels like the engine's (256 to a pixel); the lab reuses the engine's tile
 * collision (collide.ts), tile flags (tiles.ts) and the player's feel numbers (feel.ts), and leaves the engine alone.
 */

export const SOLID_NONE = 0
export const SOLID_ALL = 1
export const SOLID_TOP = 2
export type SolidFlag = typeof SOLID_NONE | typeof SOLID_ALL | typeof SOLID_TOP

/** A running script, as data. */
export interface Frame {
  /** The hat (a script's body) or the C-block whose list this frame walks. */
  owner: string
  arm: 'body' | 'do' | 'else'
  /** The next statement to run. */
  index: number
  /** The block id at `index` when it was set ('' past the end): finds the spot again after an edit. */
  at: string
  /** 0 a plain list, 1 repeat, 2 forever. */
  loop: 0 | 1 | 2
  /** Repeat: passes left. */
  left: number
}

export const FIBER_READY = 0
export const FIBER_SLEEPING = 1
export const FIBER_WAITING = 2

export interface Fiber {
  /** The script's hat block id. */
  script: string
  frames: Frame[]
  state: typeof FIBER_READY | typeof FIBER_SLEEPING | typeof FIBER_WAITING
  /** Sleeping: the tick it wakes. */
  wake: number
  /** Waiting: the `wait until` block whose condition it re-checks. */
  until: string
  /** "them": who touched, stomped or hurt me (thing id, 0 = nobody). */
  them: number
  /** The block it stopped on (a wait), for the glow. */
  on: string
}

export type ContactSide = 'top' | 'bottom' | 'side'

export type LabEvent =
  | { kind: 'appear' }
  | { kind: 'touch'; other: number; tile: TileKind | null; side: ContactSide }
  | { kind: 'stomped'; other: number }
  | { kind: 'land' }
  | { kind: 'hurt'; other: number }

/** The player's own "run and jump with the keys" state (the engine player's, trimmed). */
export interface HeroState {
  coyote: number
  buffer: number
  jumping: boolean
  jumpHold: number
  skid: boolean
  /** Distance walked, for the walk cycle. */
  anim: number
}

export interface Thing {
  id: number
  /** Which brick it is: the program it runs. */
  brick: string
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  /** Position when this frame's movement began (touch sides, carried riders). */
  ox: number
  oy: number
  facing: 1 | -1
  /** Body settings, percent of normal. */
  gravity: number
  bounce: number
  friction: number
  solid: SolidFlag
  /** Runs and jumps with the keys. */
  hero: boolean
  jumpPct: number
  speedPct: number
  hs: HeroState
  onGround: boolean
  /** The thing it stands on (carried along), or 0. */
  ground: number
  /** Who rides me, and what I ride (0 = nobody, nothing). */
  rider: number
  riding: number
  costume: Costume
  color: LabColor
  size: number
  say: Phrase | null
  sayUntil: number
  /** Memories shown over my head: `my:fuel`, `player:coins`. */
  shown: string[]
  mem: Record<string, number | boolean>
  fibers: Fiber[]
  /** Events for my next turn. */
  events: LabEvent[]
  /** What I touched last frame, as keys (`n:<id>:<side>`, `t:<kind>:<side>`), for "just started touching". */
  contacts: string[]
  /** The thing I made last ("it"). */
  it: number
  born: number
  removed: boolean
  /** The level's placed thing it came from, or 0 when code made it. */
  spawn: number
  /** When I was last hurt (a moment of safety after). */
  hurtAt: number
  /** Makes this frame (limited). */
  made: number
}

export type LabEffect =
  | { kind: 'sound'; sound: LabSound; x: number; y: number }
  | { kind: 'poof'; x: number; y: number }

/** A problem a running script ran into, for the code panel. */
export interface LabNote {
  thing: number
  brick: string
  diagnostic: LabDiagnostic
}

export interface LabInput {
  held: Record<LabKey, boolean>
  pressed: LabKey[]
}

export const NO_KEYS: LabInput = { held: { left: false, right: false, up: false, down: false, space: false, z: false, x: false }, pressed: [] }

export interface LabWorld {
  tick: number
  width: number
  height: number
  /** Engine tile ids, row-major (the tiles the lab keeps: ground, blocks, one-way platforms, pipes, spikes, lava). */
  tiles: Uint8Array
  /** In id order. */
  things: Thing[]
  nextId: number
  playerId: number
  /** The start, in tiles (the cell the player stands in). */
  start: { x: number; y: number }
  /** For "pick random". */
  seed: number
  input: LabInput
  /** This frame's sounds and poofs. Not part of the state. */
  effects: LabEffect[]
  notes: LabNote[]
}

/** What a brick is, beyond its program. */
export interface BrickInfo {
  id: string
  costume: Costume
  /** This brick and the bricks it was made from, nearest first: "a Walker" matches a Smart Walker too. */
  lineage: readonly string[]
}

/** What the world needs from outside: programs, bricks and the feel of running and jumping. */
export interface LabHost {
  program(brick: string): CompiledProgram | null
  brick(brick: string): BrickInfo | null
  feel: FeelSub
}

/** Where the glow comes from: the blocks one thing ran this frame. */
export interface Trace {
  thing: number
  blocks: Set<string>
}
