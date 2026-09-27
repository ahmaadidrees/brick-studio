import {
  COSTUMES,
  LAB_COLORS,
  LAB_SOUNDS,
  MEMORY_ICONS,
  MEMORY_NAMES,
  PHRASES,
  PHRASE_TEXT,
  type Costume,
  type LabColor,
  type LabSound,
} from './types'

/**
 * The code lab's blocks, as JSON definitions in the shape `Blockly.defineBlocksWithJsonArray` accepts. No Blockly
 * import: the compiler, the built-in bricks and the tests load this in plain Node.
 *
 * Every word a block can put in the game is a dropdown choice. Two dropdowns change with the level (which bricks
 * exist): `make a …` and the touch targets. Their definitions carry a placeholder and a `dynamic` marker; the code
 * panel registers `createBlockDefinitions(provider)`, which swaps them for option functions (see ui/blocklySetup.ts).
 *
 * The primitives, by category:
 *   Events   when I appear · when key pressed · when I touch … · when I get stomped · when I land · when I get hurt · every N seconds
 *   Motion   run and jump with the keys · set / change speed · launch at an angle · stop · turn around · face · move to
 *   Make     make a thing at a spot · remove · hurt
 *   Body     gravity, bounce, friction · solid / platform / not solid
 *   Ride     let … ride me · drop my rider · someone is riding me? · I am riding something?
 *   Look     costume · color · size · say · show a memory above me · play sound
 *   Sensing  key held? · on the ground? · is there … ahead? · touching …? · my speed · seconds since I appeared · distance to
 *   Memory   set / change / read my (or the player's) memory
 *   Control, Logic, Math: wait, wait until, repeat, forever, if, stop; compare, and/or, not; numbers, + − × ÷, random
 */

export type LabCategory = 'events' | 'motion' | 'make' | 'body' | 'ride' | 'look' | 'sensing' | 'memory' | 'control' | 'logic' | 'math'

export const CATEGORY_ORDER: readonly LabCategory[] = ['events', 'motion', 'make', 'body', 'ride', 'look', 'sensing', 'memory', 'control', 'logic', 'math']

export const CATEGORY_COLOURS: Readonly<Record<LabCategory, string>> = Object.freeze({
  events: '#E0A030',
  motion: '#3565BF',
  make: '#FF8B3D',
  body: '#12A4B8',
  ride: '#8A5CF6',
  look: '#F17861',
  sensing: '#5888DA',
  memory: '#E36A9A',
  control: '#E0A030',
  logic: '#3FA36B',
  math: '#2FA3A0',
})

export const CATEGORY_NAMES: Readonly<Record<LabCategory, string>> = Object.freeze({
  events: 'Events',
  motion: 'Motion',
  make: 'Make',
  body: 'Body',
  ride: 'Ride',
  look: 'Look',
  sensing: 'Sensing',
  memory: 'Memory',
  control: 'Control',
  logic: 'Logic',
  math: 'Math',
})

/** `[label, value]` exactly as Blockly's `FieldDropdown` expects. */
export type Option = [label: string, value: string]

/** The two dropdowns whose choices come from the level. */
export type DynamicMenu = 'brick' | 'target'
export type OptionsProvider = (menu: DynamicMenu, current: string | null) => Option[]

export const KEY_OPTIONS: readonly Option[] = [
  ['space', 'space'],
  ['← left arrow', 'left'],
  ['→ right arrow', 'right'],
  ['↑ up arrow', 'up'],
  ['↓ down arrow', 'down'],
  ['Z', 'z'],
  ['X', 'x'],
]
/** Possessive: "set my speed …", "set its speed …". */
export const WHOSE_OPTIONS: readonly Option[] = [
  ['my', 'me'],
  ['its', 'it'],
  ['their', 'them'],
  ["the player's", 'player'],
  ["my rider's", 'rider'],
]
/** Objective: "launch it", "hurt them". */
export const WHOM_OPTIONS: readonly Option[] = [
  ['me', 'me'],
  ['it', 'it'],
  ['them', 'them'],
  ['the player', 'player'],
  ['my rider', 'rider'],
]
export const RIDER_OPTIONS: readonly Option[] = [
  ['them', 'them'],
  ['the player', 'player'],
  ['it', 'it'],
]
export const OTHER_OPTIONS: readonly Option[] = [
  ['the player', 'player'],
  ['it', 'it'],
  ['them', 'them'],
  ['my rider', 'rider'],
]
export const DIR_OPTIONS: readonly Option[] = [
  ['forward', 'forward'],
  ['backward', 'backward'],
  ['up', 'up'],
  ['down', 'down'],
  ['right', 'right'],
  ['left', 'left'],
]
export const PLACE_OPTIONS: readonly Option[] = [
  ['my hand', 'hand'],
  ['my feet', 'feet'],
  ['above me', 'above'],
  ['where I am', 'here'],
  ['the start', 'start'],
]
export const SIDE_OPTIONS: readonly Option[] = [
  ['anywhere', 'any'],
  ['on my top', 'top'],
  ['on my bottom', 'bottom'],
  ['on my side', 'side'],
]
export const FACE_OPTIONS: readonly Option[] = [
  ['right', 'right'],
  ['left', 'left'],
  ['the player', 'player'],
]
export const PROBE_WHAT_OPTIONS: readonly Option[] = [
  ['ground', 'ground'],
  ['a wall', 'wall'],
  ['spikes', 'spikes'],
  ['lava', 'lava'],
  ['a thing', 'thing'],
  ['the player', 'player'],
]
export const PROBE_WHERE_OPTIONS: readonly Option[] = [
  ['ahead', 'ahead'],
  ['ahead and down', 'aheadDown'],
  ['below me', 'below'],
  ['above me', 'above'],
  ['behind me', 'behind'],
]
export const BODY_OPTIONS: readonly Option[] = [
  ['gravity', 'gravity'],
  ['bounce', 'bounce'],
  ['friction', 'friction'],
]
export const SOLID_OPTIONS: readonly Option[] = [
  ['solid', 'solid'],
  ['a platform', 'platform'],
  ['not solid', 'none'],
]
export const HERO_STAT_OPTIONS: readonly Option[] = [
  ['jump power', 'jump'],
  ['run speed', 'speed'],
]
export const SCOPE_OPTIONS: readonly Option[] = [
  ['my', 'my'],
  ["the player's", 'player'],
]
export const MEMORY_OPTIONS: readonly Option[] = MEMORY_NAMES.map((name) => [`${MEMORY_ICONS[name]} ${name}`, name] as Option)

export const COSTUME_LABELS: Readonly<Record<Costume, string>> = {
  hero: 'builder',
  walker: 'Walker',
  walkerFlat: 'squashed Walker',
  spiky: 'Spiky',
  flyer: 'Flyer',
  spring: 'spring',
  springDown: 'squished spring',
  qblock: '? block',
  usedBlock: 'empty block',
  platform: 'platform',
  coin: 'coin',
  goal: 'goal flag',
  ball: 'ball',
  car: 'car',
  rocket: 'rocket',
  rocketFire: 'rocket (flame on)',
  crate: 'crate',
  star: 'star',
}
export const COSTUME_OPTIONS: readonly Option[] = COSTUMES.filter((c) => c !== 'hero').map((c) => [COSTUME_LABELS[c], c] as Option)

export const COLOR_LABELS: Readonly<Record<LabColor, string>> = {
  none: 'its own colors',
  red: '🔴 red',
  orange: '🟠 orange',
  yellow: '🟡 yellow',
  green: '🟢 green',
  blue: '🔵 blue',
  purple: '🟣 purple',
  pink: '🩷 pink',
  white: '⚪ white',
  black: '⚫ black',
}
export const COLOR_OPTIONS: readonly Option[] = LAB_COLORS.map((c) => [COLOR_LABELS[c], c] as Option)

export const SOUND_LABELS: Readonly<Record<LabSound, string>> = {
  hop: 'hop',
  boing: 'boing',
  coin: 'coin',
  squish: 'squish',
  kick: 'kick',
  whoosh: 'whoosh',
  bounce: 'bounce',
  ouch: 'ouch',
  powerup: 'power up',
  bump: 'bump',
  poof: 'poof',
  tada: 'ta-da',
  crash: 'crash',
  thud: 'thud',
}
export const SOUND_OPTIONS: readonly Option[] = LAB_SOUNDS.map((s) => [SOUND_LABELS[s], s] as Option)
export const PHRASE_OPTIONS: readonly Option[] = PHRASES.map((p) => [PHRASE_TEXT[p], p] as Option)

export const COMPARE_OPTIONS: readonly Option[] = [
  ['<', 'LT'],
  ['≤', 'LTE'],
  ['=', 'EQ'],
  ['≠', 'NEQ'],
  ['≥', 'GTE'],
  ['>', 'GT'],
]
export const LOGIC_OPTIONS: readonly Option[] = [
  ['and', 'AND'],
  ['or', 'OR'],
]
export const ARITHMETIC_OPTIONS: readonly Option[] = [
  ['+', 'ADD'],
  ['−', 'MINUS'],
  ['×', 'MULTIPLY'],
  ['÷', 'DIVIDE'],
]

/** Fixed choices of the touch-target menu; the level's bricks follow as `a <name>`. */
export const TARGET_BASE_OPTIONS: readonly Option[] = [
  ['the player', 'player'],
  ['anything', 'any'],
  ['the ground or a wall', 'tile:solid'],
  ['spikes', 'tile:spikes'],
  ['lava', 'tile:lava'],
]

type FieldDropdownArg = { type: 'field_dropdown'; name: string; options: Option[]; dynamic?: DynamicMenu }
type FieldNumberArg = { type: 'field_number'; name: string; value: number; min?: number; max?: number; precision?: number }
type InputValueArg = { type: 'input_value'; name: string; check?: 'Number' | 'Boolean' }
type InputStatementArg = { type: 'input_statement'; name: string }
export type LabBlockArg = FieldDropdownArg | FieldNumberArg | InputValueArg | InputStatementArg

/** The subset of Blockly's JSON block definition the catalog uses. Plain data. */
export type LabBlockDefinition = {
  type: `lab_${string}`
  message0: string
  args0?: LabBlockArg[]
  message1?: string
  args1?: LabBlockArg[]
  message2?: string
  args2?: LabBlockArg[]
  message3?: string
  args3?: LabBlockArg[]
  colour: string
  tooltip: string
  inputsInline?: boolean
  previousStatement?: null
  nextStatement?: null
  output?: 'Number' | 'Boolean' | null
}

const dropdown = (name: string, options: readonly Option[]): FieldDropdownArg => ({ type: 'field_dropdown', name, options: options.map(([l, v]) => [l, v] as Option) })
const dynamic = (name: string, menu: DynamicMenu, placeholder: Option): FieldDropdownArg => ({ type: 'field_dropdown', name, options: [placeholder], dynamic: menu })
const number = (name: string): InputValueArg => ({ type: 'input_value', name, check: 'Number' })
const boolean = (name: string): InputValueArg => ({ type: 'input_value', name, check: 'Boolean' })
const anyValue = (name: string): InputValueArg => ({ type: 'input_value', name })
const statements = (name: string): InputStatementArg => ({ type: 'input_statement', name })
const stack = { previousStatement: null, nextStatement: null } as const
const C = CATEGORY_COLOURS

const brickMenu = () => dynamic('BRICK', 'brick', ['Ball', 'ball'])
const targetMenu = () => dynamic('TARGET', 'target', ['the player', 'player'])

const EVENTS: LabBlockDefinition[] = [
  { type: 'lab_when_appear', message0: 'when I appear', nextStatement: null, colour: C.events, tooltip: 'Starts when the level starts, or when something makes me.' },
  { type: 'lab_when_key', message0: 'when %1 key pressed', args0: [dropdown('KEY', KEY_OPTIONS)], nextStatement: null, colour: C.events, tooltip: 'Starts each time you press this key.' },
  { type: 'lab_when_touch', message0: 'when I touch %1 %2', args0: [targetMenu(), dropdown('SIDE', SIDE_OPTIONS)], nextStatement: null, colour: C.events, tooltip: 'Starts when I start touching it. In this script, "them" is what I touched.' },
  { type: 'lab_when_stomped', message0: 'when I get stomped', nextStatement: null, colour: C.events, tooltip: 'Starts when something falls on my top. "them" is who stomped me.' },
  { type: 'lab_when_land', message0: 'when I land', nextStatement: null, colour: C.events, tooltip: 'Starts when I come down on something after being in the air.' },
  { type: 'lab_when_hurt', message0: 'when I get hurt', nextStatement: null, colour: C.events, tooltip: 'Starts when something hurts me. "them" is who hurt me.' },
  { type: 'lab_every', message0: 'every %1 seconds', args0: [{ type: 'field_number', name: 'SECONDS', value: 1, min: 0.1, max: 60, precision: 0.1 }], nextStatement: null, colour: C.events, tooltip: 'Starts again and again, this many seconds apart.' },
]

const MOTION: LabBlockDefinition[] = [
  { type: 'lab_hero_on', message0: 'run and jump with the keys', ...stack, colour: C.motion, tooltip: '← and → run (hold X to go faster), space jumps. Hold space to jump higher.' },
  { type: 'lab_hero_off', message0: 'stop running with the keys', ...stack, colour: C.motion, tooltip: 'The keys stop moving me. My other scripts can still read them.' },
  { type: 'lab_set_speed', message0: 'set %1 speed %2 to %3', args0: [dropdown('WHO', WHOSE_OPTIONS), dropdown('DIR', DIR_OPTIONS), number('VALUE')], inputsInline: true, ...stack, colour: C.motion, tooltip: 'Speed in pixels a frame. A brick is 16 wide. Forward is the way I face.' },
  { type: 'lab_change_speed', message0: 'change %1 speed %2 by %3', args0: [dropdown('WHO', WHOSE_OPTIONS), dropdown('DIR', DIR_OPTIONS), number('BY')], inputsInline: true, ...stack, colour: C.motion, tooltip: 'A push: adds to the speed in that direction.' },
  { type: 'lab_launch', message0: 'launch %1 at %2 ° power %3', args0: [dropdown('WHO', WHOM_OPTIONS), number('ANGLE'), number('POWER')], inputsInline: true, ...stack, colour: C.motion, tooltip: '0° is straight ahead, the way I face. 90° is straight up.' },
  { type: 'lab_stop_moving', message0: 'stop %1 moving', args0: [dropdown('WHO', WHOM_OPTIONS)], ...stack, colour: C.motion, tooltip: 'Speed to zero, sideways and up.' },
  { type: 'lab_turn_around', message0: 'turn around', ...stack, colour: C.motion, tooltip: 'Face the other way.' },
  { type: 'lab_face', message0: 'face %1', args0: [dropdown('TOWARD', FACE_OPTIONS)], ...stack, colour: C.motion, tooltip: 'Turn to face this way.' },
  { type: 'lab_move_to', message0: 'move %1 to %2', args0: [dropdown('WHO', WHOM_OPTIONS), dropdown('PLACE', PLACE_OPTIONS)], ...stack, colour: C.motion, tooltip: 'Jump straight there and stop.' },
  { type: 'lab_hero_stat', message0: 'set my %1 to %2 %%', args0: [dropdown('STAT', HERO_STAT_OPTIONS), number('PERCENT')], inputsInline: true, ...stack, colour: C.motion, tooltip: 'For running and jumping with the keys. 100% is normal.' },
]

const MAKE: LabBlockDefinition[] = [
  { type: 'lab_make', message0: 'make a %1 at %2', args0: [brickMenu(), dropdown('PLACE', PLACE_OPTIONS)], ...stack, colour: C.make, tooltip: 'A new thing appears. After this block, "it" is the new thing.' },
  { type: 'lab_remove', message0: 'remove %1', args0: [dropdown('WHO', WHOM_OPTIONS)], ...stack, colour: C.make, tooltip: 'Take it out of the level, with a poof.' },
  { type: 'lab_hurt', message0: 'hurt %1', args0: [dropdown('WHO', WHOM_OPTIONS)], ...stack, colour: C.make, tooltip: 'Starts their "when I get hurt" script.' },
]

const BODY: LabBlockDefinition[] = [
  { type: 'lab_body', message0: 'set my %1 to %2 %%', args0: [dropdown('SETTING', BODY_OPTIONS), number('PERCENT')], inputsInline: true, ...stack, colour: C.body, tooltip: 'Gravity 100% is normal, 0% floats. Bounce 0% stops dead. Friction 0% slides like ice.' },
  { type: 'lab_solid', message0: 'make me %1', args0: [dropdown('MODE', SOLID_OPTIONS)], ...stack, colour: C.body, tooltip: 'Solid things stop others. A platform holds up what lands on it. Not solid: walk right through.' },
]

const RIDE: LabBlockDefinition[] = [
  { type: 'lab_let_ride', message0: 'let %1 ride me', args0: [dropdown('WHO', RIDER_OPTIONS)], ...stack, colour: C.ride, tooltip: 'They get in. Their own keys stop moving them; my scripts read the keys now.' },
  { type: 'lab_drop_rider', message0: 'drop my rider', ...stack, colour: C.ride, tooltip: 'My rider hops off.' },
  { type: 'lab_has_rider', message0: 'someone is riding me?', output: 'Boolean', colour: C.ride, tooltip: 'True while someone rides me.' },
  { type: 'lab_is_riding', message0: 'I am riding something?', output: 'Boolean', colour: C.ride, tooltip: 'True while I ride something.' },
]

const LOOK: LabBlockDefinition[] = [
  { type: 'lab_costume', message0: 'switch costume to %1', args0: [dropdown('COSTUME', COSTUME_OPTIONS)], ...stack, colour: C.look, tooltip: 'Change how I look (and my size box).' },
  { type: 'lab_color', message0: 'set my color to %1', args0: [dropdown('COLOR', COLOR_OPTIONS)], ...stack, colour: C.look, tooltip: 'Paint me a color.' },
  { type: 'lab_size', message0: 'set my size to %1 %%', args0: [number('PERCENT')], inputsInline: true, ...stack, colour: C.look, tooltip: '100% is normal size.' },
  { type: 'lab_say', message0: 'say %1 for %2 seconds', args0: [dropdown('PHRASE', PHRASE_OPTIONS), number('SECONDS')], inputsInline: true, ...stack, colour: C.look, tooltip: 'A speech bubble over me.' },
  { type: 'lab_show', message0: 'show %1 %2 above me', args0: [dropdown('SCOPE', SCOPE_OPTIONS), dropdown('NAME', MEMORY_OPTIONS)], ...stack, colour: C.look, tooltip: 'Show this memory over my head while the level runs.' },
  { type: 'lab_sound', message0: 'play sound %1', args0: [dropdown('SOUND', SOUND_OPTIONS)], ...stack, colour: C.look, tooltip: 'Play a sound.' },
]

const SENSING: LabBlockDefinition[] = [
  { type: 'lab_key_held', message0: '%1 key held?', args0: [dropdown('KEY', KEY_OPTIONS)], output: 'Boolean', colour: C.sensing, tooltip: 'True while you hold this key.' },
  { type: 'lab_on_ground', message0: 'on the ground?', output: 'Boolean', colour: C.sensing, tooltip: 'True while I stand on something.' },
  { type: 'lab_probe', message0: 'is there %1 %2?', args0: [dropdown('WHAT', PROBE_WHAT_OPTIONS), dropdown('WHERE', PROBE_WHERE_OPTIONS)], output: 'Boolean', colour: C.sensing, tooltip: 'Look next to me. "Ground" and "a wall" both mean something solid.' },
  { type: 'lab_touching', message0: 'touching %1?', args0: [targetMenu()], output: 'Boolean', colour: C.sensing, tooltip: 'True while I touch it.' },
  { type: 'lab_speed', message0: 'my speed %1', args0: [dropdown('DIR', DIR_OPTIONS)], output: 'Number', colour: C.sensing, tooltip: 'How fast I go that way, in pixels a frame.' },
  { type: 'lab_age', message0: 'seconds since I appeared', output: 'Number', colour: C.sensing, tooltip: 'A stopwatch that starts when I appear.' },
  { type: 'lab_distance', message0: 'distance to %1', args0: [dropdown('WHO', OTHER_OPTIONS)], output: 'Number', colour: C.sensing, tooltip: 'How many bricks away they are.' },
]

const MEMORY: LabBlockDefinition[] = [
  { type: 'lab_set_memory', message0: 'set %1 %2 to %3', args0: [dropdown('SCOPE', SCOPE_OPTIONS), dropdown('NAME', MEMORY_OPTIONS), anyValue('VALUE')], inputsInline: true, ...stack, colour: C.memory, tooltip: 'Remember a number. "The player\'s" memory is shared by every brick.' },
  { type: 'lab_change_memory', message0: 'change %1 %2 by %3', args0: [dropdown('SCOPE', SCOPE_OPTIONS), dropdown('NAME', MEMORY_OPTIONS), number('BY')], inputsInline: true, ...stack, colour: C.memory, tooltip: 'Add to a remembered number.' },
  { type: 'lab_memory', message0: '%1 %2', args0: [dropdown('SCOPE', SCOPE_OPTIONS), dropdown('NAME', MEMORY_OPTIONS)], output: null, colour: C.memory, tooltip: 'A remembered number. 0 until something sets it.' },
]

const CONTROL: LabBlockDefinition[] = [
  { type: 'lab_wait', message0: 'wait %1 seconds', args0: [number('SECONDS')], inputsInline: true, ...stack, colour: C.control, tooltip: 'Pause this script. Everything else keeps going.' },
  { type: 'lab_wait_until', message0: 'wait until %1', args0: [boolean('CONDITION')], ...stack, colour: C.control, tooltip: 'Pause this script until this is true.' },
  { type: 'lab_repeat', message0: 'repeat %1 times', args0: [number('TIMES')], message1: '%1', args1: [statements('DO')], ...stack, colour: C.control, tooltip: 'Run the blocks inside this many times.' },
  { type: 'lab_forever', message0: 'forever', message1: '%1', args1: [statements('DO')], previousStatement: null, colour: C.control, tooltip: 'Run the blocks inside again and again, once every frame.' },
  { type: 'lab_if', message0: 'if %1 then', args0: [boolean('CONDITION')], message1: '%1', args1: [statements('DO')], ...stack, colour: C.control, tooltip: 'Run the blocks inside only when this is true.' },
  { type: 'lab_if_else', message0: 'if %1 then', args0: [boolean('CONDITION')], message1: '%1', args1: [statements('DO')], message2: 'else', message3: '%1', args3: [statements('ELSE')], ...stack, colour: C.control, tooltip: 'The first blocks when it is true, the second ones when it is not.' },
  { type: 'lab_stop_script', message0: 'stop this script', previousStatement: null, colour: C.control, tooltip: 'End this script here.' },
]

const LOGIC: LabBlockDefinition[] = [
  { type: 'lab_compare', message0: '%1 %2 %3', args0: [number('A'), dropdown('OP', COMPARE_OPTIONS), number('B')], inputsInline: true, output: 'Boolean', colour: C.logic, tooltip: 'Compare two numbers.' },
  { type: 'lab_and_or', message0: '%1 %2 %3', args0: [boolean('A'), dropdown('OP', LOGIC_OPTIONS), boolean('B')], inputsInline: true, output: 'Boolean', colour: C.logic, tooltip: '"and": both true. "or": at least one true.' },
  { type: 'lab_not', message0: 'not %1', args0: [boolean('VALUE')], output: 'Boolean', colour: C.logic, tooltip: 'True when it is false.' },
]

const MATH: LabBlockDefinition[] = [
  { type: 'lab_number', message0: '%1', args0: [{ type: 'field_number', name: 'NUM', value: 0 }], output: 'Number', colour: C.math, tooltip: 'A number.' },
  { type: 'lab_arithmetic', message0: '%1 %2 %3', args0: [number('A'), dropdown('OP', ARITHMETIC_OPTIONS), number('B')], inputsInline: true, output: 'Number', colour: C.math, tooltip: 'Add, take away, times or share. Dividing by zero gives 0.' },
  { type: 'lab_random', message0: 'pick random %1 to %2', args0: [number('LOW'), number('HIGH')], inputsInline: true, output: 'Number', colour: C.math, tooltip: 'A whole number from the first to the second.' },
]

const BY_CATEGORY: readonly [LabCategory, LabBlockDefinition[]][] = [
  ['events', EVENTS],
  ['motion', MOTION],
  ['make', MAKE],
  ['body', BODY],
  ['ride', RIDE],
  ['look', LOOK],
  ['sensing', SENSING],
  ['memory', MEMORY],
  ['control', CONTROL],
  ['logic', LOGIC],
  ['math', MATH],
]

export const LAB_BLOCK_DEFINITIONS: readonly LabBlockDefinition[] = Object.freeze(BY_CATEGORY.flatMap(([, list]) => list))
export type LabBlockType = LabBlockDefinition['type']
export const BLOCK_CATEGORY: Readonly<Record<string, LabCategory>> = Object.freeze(
  Object.fromEntries(BY_CATEGORY.flatMap(([category, list]) => list.map((d) => [d.type, category]))),
)
export const HAT_TYPES: readonly LabBlockType[] = ['lab_when_appear', 'lab_when_key', 'lab_when_touch', 'lab_when_stomped', 'lab_when_land', 'lab_when_hurt', 'lab_every']
/** Hats whose scripts have someone to call "them". */
export const THEM_HATS: readonly LabBlockType[] = ['lab_when_touch', 'lab_when_stomped', 'lab_when_hurt']

const LAB_TYPES = new Set<string>(LAB_BLOCK_DEFINITIONS.map((d) => d.type))
export const isLabBlockType = (type: string): type is LabBlockType => LAB_TYPES.has(type)

/**
 * Live definitions for `Blockly.defineBlocksWithJsonArray`: the two level-dependent dropdowns become option functions
 * that ask `provider` each time Blockly builds or opens them. Fresh copies; every other field is the same plain data.
 */
export function createBlockDefinitions(provider: OptionsProvider): Array<Record<string, unknown>> {
  const menu = (kind: DynamicMenu, placeholder: Option) =>
    function labMenuOptions(this: unknown): Option[] {
      let current: string | null = null
      const field = this as { getValue?: () => unknown } | undefined
      if (field && typeof field.getValue === 'function') {
        const value = field.getValue()
        if (typeof value === 'string') current = value
      }
      const options = provider(kind, current)
      return options.length > 0 ? options.map(([l, v]) => [l, v] as Option) : [placeholder]
    }
  const live = (args?: LabBlockArg[]) =>
    args?.map((arg) => {
      if (arg.type === 'field_dropdown' && arg.dynamic) {
        const { dynamic: kind, options, ...rest } = arg
        return { ...rest, options: menu(kind, options[0]) }
      }
      if (arg.type === 'field_dropdown') return { ...arg, options: arg.options.map(([l, v]) => [l, v]) }
      return { ...arg }
    })
  return LAB_BLOCK_DEFINITIONS.map((definition) => {
    const out: Record<string, unknown> = { ...definition }
    for (const key of ['args0', 'args1', 'args2', 'args3'] as const) if (definition[key]) out[key] = live(definition[key])
    return out
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Toolbox

type ShadowInput = { shadow: { type: string; fields: Record<string, unknown> } }
export type ToolboxBlock = { kind: 'block'; type: string; fields?: Record<string, unknown>; inputs?: Record<string, ShadowInput> }
export type ToolboxCategory = { kind: 'category'; name: string; colour: string; toolboxitemid: LabCategory; contents: ToolboxBlock[] }
export type LabToolbox = { kind: 'categoryToolbox'; contents: ToolboxCategory[] }

const num = (value: number): ShadowInput => ({ shadow: { type: 'lab_number', fields: { NUM: value } } })
const block = (type: string, inputs?: Record<string, ShadowInput>, fields?: Record<string, unknown>): ToolboxBlock => ({
  kind: 'block',
  type,
  ...(fields ? { fields } : {}),
  ...(inputs ? { inputs } : {}),
})

const PALETTE: Readonly<Record<LabCategory, ToolboxBlock[]>> = {
  events: [
    block('lab_when_appear'),
    block('lab_when_key'),
    block('lab_when_touch'),
    block('lab_when_stomped'),
    block('lab_when_land'),
    block('lab_when_hurt'),
    block('lab_every'),
  ],
  motion: [
    block('lab_hero_on'),
    block('lab_set_speed', { VALUE: num(2) }),
    block('lab_change_speed', { BY: num(1) }),
    block('lab_launch', { ANGLE: num(45), POWER: num(5) }),
    block('lab_stop_moving'),
    block('lab_turn_around'),
    block('lab_face'),
    block('lab_move_to', undefined, { PLACE: 'start' }),
    block('lab_hero_stat', { PERCENT: num(150) }),
    block('lab_hero_off'),
  ],
  make: [block('lab_make', undefined, { PLACE: 'hand' }), block('lab_remove'), block('lab_hurt', undefined, { WHO: 'them' })],
  body: [
    block('lab_body', { PERCENT: num(100) }, { SETTING: 'gravity' }),
    block('lab_body', { PERCENT: num(80) }, { SETTING: 'bounce' }),
    block('lab_body', { PERCENT: num(10) }, { SETTING: 'friction' }),
    block('lab_solid'),
  ],
  ride: [block('lab_let_ride'), block('lab_drop_rider'), block('lab_has_rider'), block('lab_is_riding')],
  look: [
    block('lab_costume'),
    block('lab_color', undefined, { COLOR: 'red' }),
    block('lab_size', { PERCENT: num(150) }),
    block('lab_say', { SECONDS: num(2) }),
    block('lab_show', undefined, { SCOPE: 'my', NAME: 'fuel' }),
    block('lab_sound'),
  ],
  sensing: [
    block('lab_key_held'),
    block('lab_on_ground'),
    block('lab_probe', undefined, { WHAT: 'ground', WHERE: 'aheadDown' }),
    block('lab_touching'),
    block('lab_speed'),
    block('lab_age'),
    block('lab_distance'),
  ],
  memory: [
    block('lab_set_memory', { VALUE: num(0) }),
    block('lab_change_memory', { BY: num(1) }),
    block('lab_memory'),
  ],
  control: [
    block('lab_wait', { SECONDS: num(1) }),
    block('lab_wait_until'),
    block('lab_repeat', { TIMES: num(10) }),
    block('lab_forever'),
    block('lab_if'),
    block('lab_if_else'),
    block('lab_stop_script'),
  ],
  logic: [block('lab_compare', { A: num(0), B: num(0) }, { OP: 'GT' }), block('lab_and_or'), block('lab_not')],
  math: [block('lab_number', undefined, { NUM: 0 }), block('lab_arithmetic', { A: num(1), B: num(1) }), block('lab_random', { LOW: num(1), HIGH: num(10) })],
}

/** The toolbox, category by category, with each block's defaults. Fresh objects each call. */
export function labToolbox(): LabToolbox {
  return {
    kind: 'categoryToolbox',
    contents: CATEGORY_ORDER.map((key) => ({
      kind: 'category',
      name: CATEGORY_NAMES[key],
      colour: CATEGORY_COLOURS[key],
      toolboxitemid: key,
      contents: PALETTE[key].map((item) => JSON.parse(JSON.stringify(item)) as ToolboxBlock),
    })),
  }
}
