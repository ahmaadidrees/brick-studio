/**
 * The code layer's program contract (/2d/lab). Every brick in a lab level, and the player, is a Blockly program
 * compiled to this IR; the runtime interprets it with op budgets. Nothing is ever turned into JavaScript and nothing
 * is evaluated: the compiler reads workspace JSON, the runtime walks plain data.
 *
 * Units are the kid's: speeds in pixels per frame (a brick is 16 wide), angles in degrees, time in seconds, and
 * settings in percent of normal. Guided choices come from the lists below; variable, procedure, input and message
 * names are short validated identifiers typed by the student.
 */

/** Keys a program can read. The player's own "run and jump with the keys" uses left, right, space and X. */
export type LabKey = 'left' | 'right' | 'up' | 'down' | 'space' | 'z' | 'x'
export const LAB_KEYS: readonly LabKey[] = ['left', 'right', 'up', 'down', 'space', 'z', 'x']

/** Who a block acts on, seen from the thing running the script. */
export type Who = 'me' | 'it' | 'them' | 'player' | 'rider'
export const WHO: readonly Who[] = ['me', 'it', 'them', 'player', 'rider']

/** Speed directions, seen from the thing running the script: forward is the way it faces. */
export type SpeedDir = 'forward' | 'backward' | 'right' | 'left' | 'up' | 'down'
export const SPEED_DIRS: readonly SpeedDir[] = ['forward', 'backward', 'right', 'left', 'up', 'down']

/** Spots next to a thing, for making things and moving them. */
export type Place = 'hand' | 'feet' | 'above' | 'here' | 'start'
export const PLACES: readonly Place[] = ['hand', 'feet', 'above', 'here', 'start']

/** Which side of me a touch is on. */
export type TouchSide = 'any' | 'top' | 'bottom' | 'side'
export const TOUCH_SIDES: readonly TouchSide[] = ['any', 'top', 'bottom', 'side']

/** Tile kinds a touch can name. Spikes are also solid. */
export type TileKind = 'solid' | 'spikes' | 'lava'
export const TILE_KINDS: readonly TileKind[] = ['solid', 'spikes', 'lava']

/**
 * What a touch hat or a `touching?` block looks for: `player`, `any` (any thing, not tiles), `tile:<kind>`, or
 * `brick:<id>` (things of that brick, or of a brick made from it).
 */
export type TouchTarget = string

/** What a look-around block checks for, and where. "ground" and "a wall" both mean something solid. */
export type ProbeWhat = 'ground' | 'wall' | 'spikes' | 'lava' | 'thing' | 'player'
export const PROBE_WHATS: readonly ProbeWhat[] = ['ground', 'wall', 'spikes', 'lava', 'thing', 'player']
export type ProbeWhere = 'ahead' | 'aheadDown' | 'below' | 'above' | 'behind'
export const PROBE_WHERES: readonly ProbeWhere[] = ['ahead', 'aheadDown', 'below', 'above', 'behind']

/** Whose memory: mine, or the player's (shared by every brick, like a score). */
export type MemScope = 'my' | 'player'
export type VariableScope = MemScope | 'world'
/** Safe on ordinary JSON objects before and after a world is serialized. */
export const isSafeIdentifier = (name: string): boolean => /^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(name) && !['__proto__', 'prototype', 'constructor'].includes(name)
export const MEM_SCOPES: readonly MemScope[] = ['my', 'player']

/** Memory names are picked, never typed: they show in the game (live values, meters above things). */
export const MEMORY_NAMES = ['fuel', 'jumps', 'cooldown', 'coins', 'score', 'health', 'power', 'count', 'used', 'hits', 'laps', 'stars'] as const
export type MemoryName = (typeof MEMORY_NAMES)[number]
export const MEMORY_ICONS: Readonly<Record<MemoryName, string>> = {
  fuel: '⛽',
  jumps: '🦘',
  cooldown: '⏳',
  coins: '🪙',
  score: '⭐',
  health: '❤️',
  power: '⚡',
  count: '🔢',
  used: '✅',
  hits: '🎯',
  laps: '🏁',
  stars: '🌟',
}

export const COSTUMES = [
  'hero',
  'walker',
  'walkerFlat',
  'spiky',
  'flyer',
  'spring',
  'springDown',
  'qblock',
  'usedBlock',
  'platform',
  'coin',
  'goal',
  'ball',
  'car',
  'rocket',
  'rocketFire',
  'crate',
  'star',
] as const
export type Costume = (typeof COSTUMES)[number]

export const LAB_COLORS = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'white', 'black'] as const
export type LabColor = (typeof LAB_COLORS)[number]

/** Speech bubbles: picked phrases only. */
export const PHRASES = ['hi', 'wheee', 'vroom', 'ouch', 'yay', 'uhoh', 'nofuel', 'gotit', 'boing', 'madeit', 'hmm', 'bye'] as const
export type Phrase = (typeof PHRASES)[number]
export const PHRASE_TEXT: Readonly<Record<Phrase, string>> = {
  hi: 'Hi!',
  wheee: 'Wheee!',
  vroom: 'Vroom!',
  ouch: 'Ouch!',
  yay: 'Yay!',
  uhoh: 'Uh-oh!',
  nofuel: 'Out of fuel!',
  gotit: 'Got it!',
  boing: 'Boing!',
  madeit: 'You made it!',
  hmm: 'Hmm…',
  bye: 'Bye!',
}

/** Kid names for the game's sounds (the synth in src/platformer/audio). */
export const LAB_SOUNDS = ['hop', 'boing', 'coin', 'squish', 'kick', 'whoosh', 'bounce', 'ouch', 'powerup', 'bump', 'poof', 'tada', 'crash', 'thud'] as const
export type LabSound = (typeof LAB_SOUNDS)[number]

export type SolidMode = 'solid' | 'platform' | 'none'
export type HeroStat = 'jump' | 'speed'
export type BodySetting = 'gravity' | 'bounce' | 'friction'

export type BinaryOp = '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '>=' | '==' | '!=' | 'and' | 'or'

/** Every node carries the Blockly block id it came from, so the runtime can make it glow and point at it. */
export type Expr =
  | { kind: 'number'; value: number; blockId?: string }
  | { kind: 'boolean'; value: boolean; blockId?: string }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; blockId?: string }
  | { kind: 'not'; operand: Expr; blockId?: string }
  | { kind: 'random'; low: Expr; high: Expr; blockId?: string }
  | { kind: 'keyHeld'; key: LabKey; blockId?: string }
  | { kind: 'onGround'; blockId?: string }
  | { kind: 'touching'; target: TouchTarget; blockId?: string }
  | { kind: 'probe'; what: ProbeWhat; where: ProbeWhere; blockId?: string }
  /** My speed in a direction, pixels per frame. */
  | { kind: 'speed'; dir: SpeedDir; blockId?: string }
  | { kind: 'hasRider'; blockId?: string }
  | { kind: 'isRiding'; blockId?: string }
  /** Seconds since I appeared. */
  | { kind: 'age'; blockId?: string }
  /** Bricks (tiles) from my middle to theirs; 999 when they are nowhere. */
  | { kind: 'distance'; who: Who; blockId?: string }
  | { kind: 'memory'; scope: MemScope; name: MemoryName; blockId?: string }
  | { kind: 'variable'; scope: VariableScope; name: string; blockId?: string }
  | { kind: 'argument'; name: string; blockId?: string }
  | { kind: 'position'; who: Who; axis: 'x' | 'y'; blockId?: string }

/**
 * Statements. Each block compiles to exactly one statement with the block's id, so a running program can be
 * followed block by block, and a live edit can find where each script was.
 */
export type Stmt =
  | { op: 'setSpeed'; who: Who; dir: SpeedDir; value: Expr; blockId: string }
  | { op: 'changeSpeed'; who: Who; dir: SpeedDir; by: Expr; blockId: string }
  /** 0° is straight ahead (the way I face), 90° straight up. */
  | { op: 'launch'; who: Who; angle: Expr; power: Expr; blockId: string }
  | { op: 'stopMoving'; who: Who; blockId: string }
  | { op: 'turnAround'; blockId: string }
  | { op: 'face'; toward: 'left' | 'right' | 'player'; blockId: string }
  | { op: 'moveTo'; who: Who; place: Place; blockId: string }
  | { op: 'hero'; on: boolean; blockId: string }
  | { op: 'heroStat'; stat: HeroStat; percent: Expr; blockId: string }
  | { op: 'make'; brick: string; place: Place; blockId: string }
  | { op: 'remove'; who: Who; blockId: string }
  | { op: 'hurt'; who: Who; blockId: string }
  | { op: 'body'; setting: BodySetting; percent: Expr; blockId: string }
  | { op: 'solid'; mode: SolidMode; blockId: string }
  | { op: 'letRide'; who: Who; blockId: string }
  | { op: 'dropRider'; blockId: string }
  | { op: 'costume'; costume: Costume; blockId: string }
  | { op: 'color'; color: LabColor; blockId: string }
  | { op: 'size'; percent: Expr; blockId: string }
  | { op: 'say'; phrase: Phrase; seconds: Expr; blockId: string }
  | { op: 'show'; scope: MemScope; name: MemoryName; blockId: string }
  | { op: 'sound'; sound: LabSound; blockId: string }
  | { op: 'setMemory'; scope: MemScope; name: MemoryName; value: Expr; blockId: string }
  | { op: 'changeMemory'; scope: MemScope; name: MemoryName; by: Expr; blockId: string }
  | { op: 'wait'; seconds: Expr; blockId: string }
  | { op: 'waitUntil'; condition: Expr; blockId: string }
  | { op: 'repeat'; count: Expr; body: Stmt[]; blockId: string }
  | { op: 'forever'; body: Stmt[]; blockId: string }
  | { op: 'if'; condition: Expr; then: Stmt[]; else?: Stmt[]; blockId: string }
  | { op: 'stopScript'; blockId: string }
  | { op: 'setVariable'; scope: VariableScope; name: string; value: Expr; blockId: string }
  | { op: 'changeVariable'; scope: VariableScope; name: string; by: Expr; blockId: string }
  | { op: 'call'; name: string; args: Expr[]; blockId: string }
  | { op: 'broadcast'; message: string; blockId: string }
  | { op: 'moveXY'; who: Who; x: Expr; y: Expr; blockId: string }
  | { op: 'makeXY'; brick: string; x: Expr; y: Expr; blockId: string }
  | { op: 'setControls'; who: Who; enabled: boolean; blockId: string }
  | { op: 'setPhysics'; who: Who; enabled: boolean; blockId: string }
  | { op: 'setVisible'; who: Who; visible: boolean; blockId: string }
  | { op: 'frame'; frame: Expr; blockId: string }
  | { op: 'nextFrame'; blockId: string }
  | { op: 'playFrames'; fps: Expr; blockId: string }
  | { op: 'stopFrames'; blockId: string }
  | { op: 'sayText'; text: string; seconds: Expr; blockId: string }

/** What starts a script. Event hats start their script unless it is still running from the last time. */
export type Trigger =
  | { kind: 'appear' }
  | { kind: 'key'; key: LabKey }
  | { kind: 'touch'; target: TouchTarget; side: TouchSide }
  | { kind: 'stomped' }
  | { kind: 'land' }
  | { kind: 'hurt' }
  | { kind: 'every'; seconds: number }
  | { kind: 'message'; message: string }
  | { kind: 'clicked' }

export type Script = { id: string; trigger: Trigger; body: Stmt[]; hatBlockId: string }

export type Procedure = { name: string; params: string[]; body: Stmt[]; blockId: string }
export type ProgramIR = { irVersion: 1; scripts: Script[]; procedures?: Procedure[] }

export const LAB_LIMITS = Object.freeze({
  /** Blocks in one program. */
  maxBlocks: 600,
  /** Nesting depth of blocks inside blocks. */
  maxDepth: 24,
  maxScripts: 24,
  maxProcedures: 24,
  maxNamedVariables: 64,
  maxCallDepth: 16,
  maxMessagesPerTick: 32,
  maxVariableValue: 1_000_000,
  maxWorkspaceBytes: 150_000,
  maxRepeatCount: 10_000,
  /** Ops one thing may spend in one frame, shared by its running scripts. */
  opsPerThing: 1_500,
  /** Ops the whole level may spend in one frame; things past it wait for the next frame. */
  opsPerTick: 40_000,
  /** Things alive at once in a level. */
  maxThings: 300,
  /** Things one thing may make in one frame. */
  makesPerThingPerTick: 6,
  /** Fastest speed, pixels per frame. */
  maxSpeed: 12,
})

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export type DiagnosticCode =
  | 'program.loose-blocks'
  | 'program.no-scripts'
  | 'program.too-big'
  | 'program.unknown-block'
  | 'program.empty-slot'
  | 'program.them-outside-touch'
  | 'program.it-without-make'
  | 'program.brick-missing'
  | 'program.bad-name'
  | 'program.unknown-procedure'
  | 'program.bad-argument'
  | 'program.too-many-variables'
  | 'runtime.budget'
  | 'runtime.non-finite'
  | 'runtime.too-many-things'
  | 'runtime.nobody'
  | 'runtime.cannot-remove-player'
  | 'runtime.level-busy'
  | 'runtime.call-depth'
  | 'runtime.message-limit'
  | 'runtime.variable-limit'

export type LabDiagnostic = {
  code: DiagnosticCode
  severity: DiagnosticSeverity
  /** Plain words for a kid: tell, don't blame. */
  message: string
  blockId: string | null
  scriptId?: string
}

/** A brick the compiler can name: the id blocks store and the kid's name for it. */
export type BrickRef = { id: string; name: string }

export type CompileContext = {
  /** Every brick a program may make or look for (built-in, the level's own, the kid's). */
  bricks: readonly BrickRef[]
}
