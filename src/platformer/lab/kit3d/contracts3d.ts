/**
 * Hackable 3D (docs/qa/hackable-3d/SPIKE.md, D1.md): the shapes a 3D game adds to the Hackable core's contracts.
 *
 * Nothing here changes core/contracts.ts: a 3D target is an ordinary Target with a `z` and a `body3`, a 3D design is an
 * ordinary LevelDesign with `kit: '3d'` and a list of plain build bricks (`scenery3d`). Because the core's copy, JSON and
 * fingerprint walk every field of a target, the extra fields ride along in rewinds, keyframes and fingerprints with no
 * change to core/snapshot.ts. Keeping them as intersections here keeps the shared contracts file untouched while other
 * kits land in parallel.
 *
 * Units inside the engine: the classic 3D builder's world units (packages/brick-core/src/parts.ts): one stud = 0.62,
 * one plate = 0.18, y up, the build plate's top at y = 0 and its centre at x = z = 0. Speeds are units per second (the
 * classic character's numbers: walk 3.5, run 5.4, jump 5.25, gravity 16). Everything is + − × ÷ and sqrt, plus
 * core/detmath.ts.
 *
 * Units on blocks (owner decision 2026-11-04): STUDS. Every distance a kid types or reads ("go to x: y: z:", "change z
 * by", "set x speed to", "x position", "distance to") is in studs, 1 stud = 1 brick width, and speeds are studs per
 * second. blocks3d.ts converts at the block's edge, so the engine and the classic character keep their exact numbers.
 */
import type { CustomPartDefinition } from '../../../../packages/brick-core/src/types'
import type { BrickDef, CopyPlacement, LevelDesign, PlayerSlot, Target, World } from '../core/contracts'

export const STUD = 0.62
export const PLATE = 0.18
/** The build plate is GRID studs square (src/brick/parts.ts GRID_SIZE). */
export const GRID = 64
/** Physics runs at 60 Hz inside the core's 30 ticks/s, so the character integrates exactly like the classic one. */
export const SUBSTEPS = 2
export const SUB_DT = 1 / 60

/** A plain build brick, exactly as the classic builder saves it (packages/brick-core BrickInstance), minus colour. */
export interface SceneryBrick {
  partId: string
  /** Stud-grid corner, 0..GRID. */
  x: number
  z: number
  /** Plates above the build plate. */
  y: number
  rotation: 0 | 1 | 2 | 3
  color: string
}

/** The simple models a code brick can be drawn as (render3d.ts). */
export type Model3 = 'hero' | 'coin' | 'pad' | 'box' | 'flag' | 'button' | 'bar'
export const MODELS3: readonly Model3[] = ['hero', 'coin', 'pad', 'box', 'flag', 'button', 'bar']

/** A brick's 3D box: footprint and height in world units, centred on (x, z), standing on y. */
export interface Shape3 {
  w: number
  h: number
  d: number
  /** What the drawing uses: a classic part and colour, or a simple model. */
  look?: { partId?: string; color: string; model?: Model3 }
}

/** Studs to world units and back. Reporters round to a millionth so a kid reads 3, not 3.0000000000000004. */
export const studsToWorld = (studs: number): number => studs * STUD
export const worldToStuds = (units: number): number => Math.round((units / STUD) * 1e6) / 1e6

/** A coded brick's 3D brick definition: an ordinary BrickDef plus its box. */
export type BrickDef3 = BrickDef & { shape3d?: Shape3 }

/** The classic character's state, ported (src/brick/characterController.ts CharacterMotionState). Seconds, units/s, degrees. */
export interface Character3 {
  velocityX: number
  velocityZ: number
  /** Facing, degrees, 0 = towards −z. */
  facing: number
  grounded: boolean
  coyote: number
  jumpBuffer: number
  airJumps: number
  groundIgnore: number
  airborne: number
  /** Jump key held last substep (a jump is buffered on the key's down edge, as the classic keydown is). */
  jumpWasDown: boolean
}

export interface Body3 {
  w: number
  h: number
  d: number
  solid: boolean
  gravity: boolean
  /** Units per second. For a character, vy is its vertical velocity and vx/vz are ignored (its own velocity rules). */
  vx: number
  vy: number
  vz: number
  onGround: boolean
  /** Driven by the character controller from its player's keys and the Hero's sliders. */
  character?: Character3
  /**
   * Where the physics step last left this body (world units). A solid that scripts moved since ("change y by",
   * "go to") carries whoever was standing on it from here, just as a solid moved by its speed does.
   */
  last?: [number, number, number]
}

export type Target3 = Target & { z: number; body3?: Body3 }

export type Side3 = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'

/** A bump from the last physics step, kept in the world so a rewind or keyframe carries it. */
export interface Bump3 {
  moverId: string
  otherId: string
  /** The side of the other thing the mover hit (2D's convention: landing on something is `top`). */
  side: Side3
}

export type PlayerSlot3 = PlayerSlot & { /** Camera yaw this player looks along, whole degrees (their keys move relative to it). */ yaw?: number }

export type World3 = Omit<World, 'targets' | 'players'> & {
  targets: Target3[]
  players?: PlayerSlot3[]
  /** Bumps the last physics step found (read by "launch who landed on me"). */
  bumps3d?: Bump3[]
  /** Camera yaw of the one keyboard outside a room. */
  yaw3d?: number
}

export type CopyPlacement3 = CopyPlacement & { z: number }

export type LevelDesign3 = Omit<LevelDesign, 'kit' | 'copies' | 'bricks'> & {
  kit: '3d'
  copies: CopyPlacement3[]
  bricks: BrickDef3[]
  /** The build: plain bricks with no code. The project (shared, never copied); collision is indexed once per list. */
  scenery3d: SceneryBrick[]
  /**
   * The classic builder's custom parts this build uses (a copied classic build keeps its own). Every browser builds
   * the same boxes from the design itself, never from this browser's global part registry.
   */
  customParts3d?: CustomPartDefinition[]
  /**
   * The build plate's size in studs, as the classic builder's (64, 96 or 128; missing is 64). The middle of the plate
   * is always x = z = 0.
   */
  plate3d?: 64 | 96 | 128
  /** Look settings carried over from a classic build (drawing only; nothing in the game reads them). */
  look3d?: { environmentId?: string }
  /**
   * SPIKE: also make every scenery brick a solid target (the 2D way: every grid cell is a target), to measure what
   * that costs against the scenery index.
   */
  sceneryAsTargets?: boolean
}

export const PLATE_SIZES3D: readonly number[] = [64, 96, 128]
/** A design's plate size in studs. */
export const plateOf = (design: Pick<LevelDesign3, 'plate3d'> | undefined): number => (design?.plate3d && PLATE_SIZES3D.includes(design.plate3d) ? design.plate3d : GRID)

/** The most build bricks a 3D project holds: the classic builder's own limit (BRICK_STUDIO_MAX_BRICKS). */
export const MAX_SCENERY3D = 2_000

export const isTarget3 = (t: Target): t is Target3 => typeof (t as Target3).z === 'number'
