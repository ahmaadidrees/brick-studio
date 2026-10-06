/**
 * Code Lab core: the shared contract for the new block runtime (docs/CODE-LAB-BRICK-MODEL.md).
 *
 * Every lane builds against these types. Change them only through the integrator, never inside a lane.
 * Behavior references (F01, H01, C01, M05 ...) are fixtures in research/code-lab/01-scratch-runtime-semantics.md.
 * Clean room: read Scratch's source to understand behavior, never copy its code.
 *
 * Coordinates: y points up, 1 step = 1 art pixel, (0, 0) is the bottom-left corner of the level (provisional).
 * Direction: 90 = right, 0 = up, 180 = down, -90 = left, kept in (-180, 180].
 */

/** A runtime value. Scratch keeps raw types, so "10" and 10 are different until a block casts them. */
export type Value = number | string | boolean

// ---------------------------------------------------------------- timing

/** Script ticks per second (decision 3; Scratch's configured rate, F01). */
export const TICKS_PER_SECOND = 30
export const TICK_MS = 1000 / TICKS_PER_SECOND
/** Operations one tick may spend across all threads (decision 4: replaces Scratch's 75%-of-tick wall clock). */
export const DEFAULT_TICK_OP_BUDGET = 20_000
/** Operations a warp (run without screen refresh) thread may spend before it is forced to yield (replaces Scratch's 500 ms). */
export const WARP_OP_LIMIT = 200_000
/** Runtime-created clones across the whole world, not per brick (C-fixtures; INDEX fact 5). Painted copies do not count. */
export const CLONE_LIMIT = 300

// ---------------------------------------------------------------- program IR

/** Field values: dropdown choices and ids. For variables/lists the field holds the variable id. */
export type Fields = Record<string, string>
export type Inputs = Record<string, Expr>

export type Expr =
  | { kind: 'lit'; value: Value }
  /** A reporter or boolean block, e.g. operator_add with inputs NUM1, NUM2. */
  | { kind: 'block'; opcode: string; inputs: Inputs; fields: Fields; id?: string }
  /** A custom-block parameter (argument_reporter_string_number / argument_reporter_boolean). */
  | { kind: 'param'; name: string; boolean?: boolean }

/** A stack block. C-blocks keep their stacks in `branches` (SUBSTACK = branches[0], SUBSTACK2 = branches[1]). */
export interface Stmt {
  opcode: string
  inputs: Inputs
  fields: Fields
  branches?: Stmt[][]
  /** procedures_call only. Inputs are keyed by argument name. */
  call?: { proccode: string }
  /** Editor block id, for glow and errors. */
  id?: string
}

/** Opcodes that start scripts. Platformer hats join this list in step 3. */
export type HatOpcode =
  | 'event_whenflagclicked'
  | 'event_whenkeypressed' // fields.KEY_OPTION
  | 'event_whenthisspriteclicked'
  | 'event_whenstageclicked'
  | 'event_whenbroadcastreceived' // fields.BROADCAST_OPTION (message name)
  | 'event_whenbackdropswitchesto' // fields.BACKDROP
  | 'event_whengreaterthan' // fields.WHENGREATERTHANMENU ('TIMER' | 'LOUDNESS'), inputs.VALUE
  | 'control_start_as_clone'
  /** Platformer extension (step 3): fields.SIDE ('_any_' | 'top' | 'bottom' | 'left' | 'right'), fields.BRICK ('_any_' | '_edge_' | brick name). */
  | 'platformer_whenbump'

export interface Script {
  id: string
  hat: { opcode: HatOpcode; fields: Fields; inputs: Inputs }
  body: Stmt[]
}

export interface Procedure {
  /** e.g. "jump %s times %b" */
  proccode: string
  argumentNames: string[]
  /** "run without screen refresh" */
  warp: boolean
  body: Stmt[]
}

export interface VariableDecl {
  id: string
  name: string
  value: Value
  /** Local variables only: shown as a knob on each painted copy (per-copy starting value). */
  showInBuild?: boolean
}

export interface ListDecl {
  id: string
  name: string
  value: Value[]
}

export interface BrickProgram {
  scripts: Script[]
  procedures: Procedure[]
  /** Declared on this brick: local to each copy/clone. On the stage brick: world (global) variables. */
  variables: VariableDecl[]
  lists: ListDecl[]
}

// ---------------------------------------------------------------- assets and bricks

/** Opaque-pixel occupancy, row-major from the top-left, one byte per pixel (0 or 1). */
export interface CostumeMask {
  width: number
  height: number
  data: Uint8Array
}

export interface Costume {
  name: string
  /** Art pixels. 1 art pixel = 1 step at size 100. */
  width: number
  height: number
  /** Rotation center in costume pixels from the top-left, y down (like image coordinates). */
  rotationCenterX: number
  rotationCenterY: number
  /** Optional opaque bounds in costume pixels, y down, right/bottom exclusive. Defaults to the full image. */
  opaque?: { left: number; top: number; right: number; bottom: number }
  /** Needed for pixel touching. Without it the costume's opaque rectangle counts as solid. */
  mask?: CostumeMask
  /** Editor/render reference (data URL or asset id). The core never reads it. */
  asset?: string
}

export interface Sound {
  name: string
  durationMs: number
  asset?: string
}

export interface BrickDef {
  /** Step 6b: how many copies a level may hold (1 for the Hero and the Goal). Missing means no limit. */
  limit?: number
  /** Step 7: a grid brick (Ground, ? block, Spikes...). Its copies are painted cells of LevelDesign.tiles. See GridSpec. */
  grid?: GridSpec
  id: string
  /** Kid-facing name; also what "create clone of" and sensing menus show. */
  name: string
  isStage?: boolean
  costumes: Costume[]
  sounds: Sound[]
  program: BrickProgram
}

// ---------------------------------------------------------------- level design (what Build saves)

export interface StageBounds {
  left: number
  right: number
  bottom: number
  top: number
}

/** A brick painted with the Build brush. Saved in the design; restored on every Play (decision 1). */
export interface CopyPlacement {
  id: string
  brickId: string
  x: number
  y: number
  direction?: number
  size?: number
  costume?: number
  visible?: boolean
  /** Starting values for the brick's showInBuild variables, keyed by variable id. */
  knobs?: Record<string, Value>
}

export interface LevelDesign {
  id: string
  name: string
  /** The level is the stage (decision 2): fencing, edge, random position. */
  bounds: StageBounds
  /** Holds global variables/lists, stage scripts and backdrops. */
  stage: BrickDef
  bricks: BrickDef[]
  /** Back-to-front draw order. */
  copies: CopyPlacement[]
  /** Seed for the world RNG, so a Play is replayable. */
  seed: number
  /**
   * The grid (step 7): cells painted with grid bricks. Each character names the brick whose `grid.char` it is; on
   * Play every filled cell becomes a painted-copy target of that brick (see GridSpec). Missing means no grid.
   */
  tiles?: TileLayer
}

// ---------------------------------------------------------------- grid bricks (step 7, docs/qa/code-lab-core/STEP7.md)

/**
 * A grid brick is an ordinary brick (costumes, sounds, real Scratch code) whose copies snap to TILE_SIZE cells and are
 * stored compactly as one character per cell in LevelDesign.tiles, so a level can hold thousands of them.
 *
 * On Play, instantiate turns every filled cell (col, row) into a normal painted-copy Target of that brick:
 * - x = left + col*TILE_SIZE + TILE_SIZE/2, y = bottom + row*TILE_SIZE + TILE_SIZE/2 (the cell centre);
 * - copyId = gridCopyId(col, row), i.e. `cell:<col>:<row>`;
 * - starting costume: costume 1, or with `autotile`, costume 2 when the cell directly above holds the same char;
 * - the brick's variable defaults (cells have no per-copy knobs).
 * After that the engine has NO rule for any particular brick: solidity, hurting, bouncing and ? blocks all come from
 * the brick's own scripts (Platformer blocks plus Scratch). The builder draws Build mode with the same costume rule.
 */
export interface GridSpec {
  /** One character, unique among the level's grid bricks, never '.'. */
  char: string
  /** Pick the starting costume from the cell above (costume 2 when covered by the same brick: grass top vs dirt). */
  autotile?: boolean
}

export const gridCopyId = (col: number, row: number): string => `cell:${col}:${row}`
export function parseGridCopyId(copyId: string): { col: number; row: number } | null {
  const m = /^cell:(\d+):(\d+)$/.exec(copyId)
  return m ? { col: Number(m[1]), row: Number(m[2]) } : null
}

// ---------------------------------------------------------------- tiles (step 6, docs/qa/code-lab-core/STEP6.md)

/**
 * LEGACY (step 6/6b saves only). Before step 7 these characters were engine tile kinds with built-in rules. Step 7
 * removes every such rule: old saves are converted by mapping each character to a standard grid brick
 * (studio/gridBricks.ts LEGACY_TILE_BRICKS). Nothing in core may give these kinds behavior any more.
 */
export type TileKind = 'ground' | 'brick' | 'hard' | 'qblock' | 'spikes' | 'lava' | 'semi' | 'bounce' | 'used'
export const TILE_KINDS: readonly TileKind[] = ['ground', 'brick', 'hard', 'qblock', 'spikes', 'lava', 'semi', 'bounce', 'used']
/** Stop bodies from every side. `semi` (one-way platform) only stops a body falling onto its top: see STEP6B.md. */
export const SOLID_TILES: readonly TileKind[] = ['ground', 'brick', 'hard', 'qblock', 'bounce', 'used']
/** One character per tile in saved rows. `used` is what a ? block becomes after it is hit from below. */
export const TILE_CHAR: Record<TileKind, string> = { ground: 'G', brick: 'B', hard: 'H', qblock: 'Q', spikes: 'S', lava: 'L', semi: '-', bounce: 'O', used: 'U' }
/** Tiles are TILE_SIZE steps square. */
export const TILE_SIZE = 16

/**
 * A grid of tiles laid over the level. Cell (col, row) covers x in [col*16, col*16+16) and y in [row*16, row*16+16):
 * row 0 is the BOTTOM row (y up, like everything else in Code Lab). rows[r] is a string of `cols` characters
 * from TILE_CHAR, '.' for empty.
 */
export interface TileLayer {
  cols: number
  rows: number
  /** rows[0] is the bottom row. */
  data: string[]
}

// ---------------------------------------------------------------- live state

export type RotationStyle = 'all around' | 'left-right' | "don't rotate"
export type EffectName = 'color' | 'fisheye' | 'whirl' | 'pixelate' | 'mosaic' | 'brightness' | 'ghost'
export const EFFECT_NAMES: readonly EffectName[] = ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic', 'brightness', 'ghost']

export interface Bubble {
  kind: 'say' | 'think'
  text: string
}

/** One live sprite: a painted copy, a clone, or the stage. */
export interface Target {
  id: string
  brickId: string
  isStage: boolean
  /** False for runtime clones. */
  isClone: boolean
  /** The painted copy this target came from (clones inherit their source's copyId). */
  copyId?: string
  x: number
  y: number
  direction: number
  /** Percent, 100 = art size. */
  size: number
  visible: boolean
  draggable: boolean
  /** 0-based index into the brick's costumes. Blocks speak 1-based numbers (L01). */
  costumeIndex: number
  rotationStyle: RotationStyle
  effects: Record<EffectName, number>
  volume: number
  soundEffects: { pitch: number; pan: number }
  /** Local variable values by variable id. On the stage target these are the globals. */
  variables: Record<string, Value>
  lists: Record<string, Value[]>
  bubble: Bubble | null
  /** Edge-triggered hat memory (event_whengreaterthan), copied to clones (C01). */
  edgeHatState: Record<string, boolean>
  /** Held by the player's pointer: motion blocks leave it alone and sprite touching skips it (S02). */
  dragging?: boolean
  /** Platformer extension state (step 3). Absent until a Platformer block touches this target. Clones copy it. */
  body?: Body
}

// ---------------------------------------------------------------- Platformer extension (step 3)

/**
 * A target's platformer body. Only Platformer blocks read or write it; Scratch motion blocks never do (they teleport
 * and fence, M05). See docs/qa/code-lab-core/STEP3.md for the exact physics step.
 */
export interface Body {
  /** "turn gravity [on]": falls with world.physics.gravity every tick. */
  gravity: boolean
  /** "solid [on]": other moving bodies cannot pass through this target's box. */
  solid: boolean
  /** Step 7, "solid [only on top]": while solid, stops only a body falling onto its top (one-way platform). */
  oneWay?: boolean
  /** Steps per tick, y up. */
  vx: number
  vy: number
  /** True after a tick in which this body was stopped moving down by something solid (or the level floor). */
  onGround: boolean
}

export interface PhysicsSettings {
  /** Steps per tick², pulling down. */
  gravity: number
  /** Fastest fall, steps per tick. */
  maxFall: number
  /** Level edges that stop bodies (the top is always open). */
  walls: { left: boolean; right: boolean; bottom: boolean }
}

export const DEFAULT_PHYSICS: PhysicsSettings = { gravity: 1, maxFall: 16, walls: { left: true, right: true, bottom: true } }

export interface Mouse {
  x: number
  y: number
  down: boolean
}

export interface HostClock {
  year: number
  month: number
  date: number
  /** 1 = Sunday … 7 = Saturday. */
  dayOfWeek: number
  hour: number
  minute: number
  second: number
}

export interface AskPrompt {
  targetId: string
  question: string
  /** Visibility of the asker when the question was enqueued, not when it is shown. */
  visible: boolean
  isStage: boolean
}

export interface QueuedAsk extends AskPrompt {
  id: number
  state: 'waiting' | 'answered'
}

export type ThreadStatus = 'running' | 'yield' | 'yield_tick' | 'done'

export interface ExecutionFrame {
  statements: Stmt[]
  pc: number
  isProcedure?: boolean
  proccode?: string
  params?: Record<string, Value>
  warp?: boolean
  isLoop?: boolean
  loopType?: 'repeat' | 'forever' | 'repeat_until' | 'while'
  loopTimesRemaining?: number
  loopCondition?: Expr
  stmtMemory?: Record<string, unknown>
}

export interface SerializedThread {
  id: number
  targetId: string
  scriptId?: string
  done: boolean
  status: ThreadStatus
  stack: ExecutionFrame[]
  warpOpCount: number
  isStackClick: boolean
}

export interface World {
  /** Ticks since Play. */
  tick: number
  /** Tick at which the timer was last reset. timer seconds = (tick - timerStartTick) * TICK_MS / 1000. */
  timerStartTick: number
  bounds: StageBounds
  stage: Target
  /** Sprites back-to-front (draw order). The stage is not in this list. */
  targets: Target[]
  bricks: Record<string, BrickDef>
  /** Scratch key names: 'space', 'left arrow', 'right arrow', 'up arrow', 'down arrow', 'a'..'z', '0'..'9'. */
  keysDown: Set<string>
  mouse: Mouse
  answer: string
  /** RNG state (see rng.ts). */
  rngState: number
  /** Runtime clones currently alive. */
  cloneCount: number
  /** Platformer extension settings (step 3). Missing means DEFAULT_PHYSICS. */
  physics?: PhysicsSettings
  /** The level's grid (step 7: for reference only, cells are already targets). Missing means no grid. */
  tiles?: TileLayer
  nextTargetId: number
  /** Ask prompt queue for sensing primitives. */
  askQueue: QueuedAsk[]
  /** Next integer id for queued questions. */
  nextAskId: number
  /** Deterministic injected host clock, or null. */
  hostClock: HostClock | null
  /** Serialized interpreter threads (optional snapshot representation). */
  threads?: SerializedThread[]
}

// ---------------------------------------------------------------- runtime surface for primitives

export interface ThreadHandle {
  readonly id: number
  readonly target: Target
  readonly done: boolean
}

/** Things the host shows or plays. The core never touches audio or the DOM. */
export type RuntimeNote =
  | { kind: 'sound'; targetId: string; sound: string; volume: number; pitch: number; pan: number }
  | { kind: 'stopSounds'; targetId?: string }
  | { kind: 'ask'; targetId: string; question: string }
  | { kind: 'backdrop'; name: string }

export interface RuntimeApi {
  readonly world: World
  /** Deterministic time: world.tick * TICK_MS. */
  nowMs(): number
  /** A visible change happened: in non-warp threads the scheduler stops re-sweeping this tick (F03–F07). */
  requestRedraw(): void
  /** Seeded uniform float in [0, 1). */
  random(): number
  /** Start every matching hat. Restart/ignore rules for already-running scripts follow H02–H06. */
  startHats(opcode: HatOpcode, opts?: { fields?: Fields; target?: Target }): ThreadHandle[]
  /** Starts event_whenbroadcastreceived scripts for `message` (case-insensitive match, like Scratch). */
  broadcast(message: string): ThreadHandle[]
  stopAll(): void
  /** Stop a target's threads, optionally keeping one (stop "other scripts in sprite"). */
  stopTarget(target: Target, except?: ThreadHandle): void
  /** Insert a new clone into draw order directly behind `source` and register it. Returns false at CLONE_LIMIT. */
  addClone(clone: Target, source: Target): boolean
  /** Remove a clone (stops its threads). Ignored for non-clones. */
  removeClone(target: Target): void
  /** The non-clone target a sprite menu names: the first painted copy of the brick named `name`, or undefined. */
  findOriginal(brickName: string): Target | undefined
  emit(note: RuntimeNote): void
}

/** Return this from a primitive to yield; the same block runs again when the thread next runs (Scratch util.yield). */
export const YIELD: unique symbol = Symbol('core.yield')
/** Return this to sleep until the next tick even if the scheduler would sweep again (F07, Scratch's yield-tick). */
export const YIELD_TICK: unique symbol = Symbol('core.yieldTick')
export type PrimitiveResult = Value | void | typeof YIELD | typeof YIELD_TICK

export interface PrimitiveCtx {
  readonly target: Target
  readonly runtime: RuntimeApi
  readonly thread: ThreadHandle
  /** Inputs, already evaluated (raw types preserved). Missing inputs read as ''. */
  arg(name: string): Value
  field(name: string): string
  /** Per-invocation memory that survives YIELD and is cleared when the block finishes (timers, glide start). */
  readonly frame: Record<string, unknown>
  /** Inside a "run without screen refresh" custom block. */
  readonly warp: boolean
}

export type Primitive = (ctx: PrimitiveCtx) => PrimitiveResult
export type PrimitiveTable = Record<string, Primitive>

/** Fresh graphic effects, all zero. */
export const zeroEffects = (): Record<EffectName, number> =>
  Object.fromEntries(EFFECT_NAMES.map((n) => [n, 0])) as Record<EffectName, number>
