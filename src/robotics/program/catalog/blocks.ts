import { LIGHT_COLORS } from '../types'

/**
 * The Robot Workshop block vocabulary (docs/robotics/CP2-PLAN.md §5, contract §6) as
 * JSON block definitions in exactly the shape `Blockly.defineBlocksWithJsonArray`
 * accepts. No Blockly import: the compiler, the starters and the tests load this in
 * plain Node.
 *
 * Device dropdowns (motor, sensor, light, button) are the only dynamic part: their
 * values are brick ids. `ROBO_BLOCK_DEFINITIONS` carries a placeholder option and a
 * `deviceMenu` marker on each; the Code view registers `createBlockDefinitions(provider)`,
 * which swaps those for live option functions.
 *
 * Hats have no previous connection; the Code view's theme (`startHats`) draws the cap.
 */

export type RoboCategory = 'events' | 'motion' | 'sensing' | 'input' | 'light' | 'control' | 'logic' | 'math' | 'variables'

export const CATEGORY_COLOURS: Readonly<Record<RoboCategory, string>> = Object.freeze({
  events: '#E0A030',
  motion: '#3565BF',
  sensing: '#5888DA',
  input: '#8A5CF6',
  light: '#F17861',
  control: '#E0A030',
  logic: '#3FA36B',
  math: '#2FA3A0',
  variables: '#E36A9A',
})

export const CATEGORY_NAMES: Readonly<Record<RoboCategory, string>> = Object.freeze({
  events: 'Events',
  motion: 'Motion',
  sensing: 'Sensing',
  input: 'Input',
  light: 'Light',
  control: 'Control',
  logic: 'Logic',
  math: 'Math',
  variables: 'Variables',
})

/** Which devices a dropdown lists. `motor` lists motors and hinge motors. */
export type DeviceMenuKind = 'motor' | 'sensor' | 'light' | 'button'
export const DEVICE_MENU_KINDS: readonly DeviceMenuKind[] = ['motor', 'sensor', 'light', 'button']

/** `[label, value]` exactly as Blockly's `FieldDropdown` expects. */
export type DeviceMenuOption = [label: string, value: string]

/**
 * Called by Blockly every time a device dropdown is built or opened, so it must be cheap.
 * `current` is the field's value when Blockly has one (null while a block is being built).
 */
export type DeviceOptionsProvider = (kind: DeviceMenuKind, current: string | null) => DeviceMenuOption[]

/** Field names that hold a device id, by the kind of device they list. */
export const DEVICE_FIELD_KINDS: Readonly<Record<string, DeviceMenuKind>> = Object.freeze({ MOTOR: 'motor', SENSOR: 'sensor', LIGHT: 'light', BUTTON: 'button' })

/** The value a device dropdown holds when the creation has no device of that kind. */
export const NO_DEVICE = ''
export const noDeviceOption = (kind: DeviceMenuKind): DeviceMenuOption => [`no ${kind} yet`, NO_DEVICE]

export const DIRECTION_OPTIONS: readonly DeviceMenuOption[] = Object.freeze([['forward', 'forward'], ['backward', 'backward']])
export const TURN_OPTIONS: readonly DeviceMenuOption[] = Object.freeze([['left', 'left'], ['right', 'right']])
export const KEY_OPTIONS: readonly DeviceMenuOption[] = Object.freeze([['up arrow', 'up'], ['down arrow', 'down'], ['left arrow', 'left'], ['right arrow', 'right'], ['space', 'space']])
export const AXIS_OPTIONS: readonly DeviceMenuOption[] = Object.freeze([['up', 'up'], ['right', 'right']])
export const LIGHT_COLOR_OPTIONS: readonly DeviceMenuOption[] = Object.freeze(LIGHT_COLORS.map((color) => [color, color] as DeviceMenuOption))
export const COMPARE_OPTIONS: readonly DeviceMenuOption[] = Object.freeze([['<', 'LT'], ['≤', 'LTE'], ['=', 'EQ'], ['≠', 'NEQ'], ['≥', 'GTE'], ['>', 'GT']])
export const LOGIC_OPTIONS: readonly DeviceMenuOption[] = Object.freeze([['and', 'AND'], ['or', 'OR']])
export const ARITHMETIC_OPTIONS: readonly DeviceMenuOption[] = Object.freeze([['+', 'ADD'], ['−', 'MINUS'], ['×', 'MULTIPLY'], ['÷', 'DIVIDE']])
export const MIN_MAX_OPTIONS: readonly DeviceMenuOption[] = Object.freeze([['min', 'MIN'], ['max', 'MAX']])

type FieldDropdownArg = { type: 'field_dropdown'; name: string; options: DeviceMenuOption[]; deviceMenu?: DeviceMenuKind }
type FieldNumberArg = { type: 'field_number'; name: string; value: number }
type FieldVariableArg = { type: 'field_variable'; name: string; variable: string }
type InputValueArg = { type: 'input_value'; name: string; check?: 'Number' | 'Boolean' }
type InputStatementArg = { type: 'input_statement'; name: string }
export type RoboBlockArg = FieldDropdownArg | FieldNumberArg | FieldVariableArg | InputValueArg | InputStatementArg

/** The subset of Blockly's JSON block definition the catalog uses. Plain data. */
export type RoboBlockDefinition = {
  type: `robo_${string}`
  message0: string
  args0?: RoboBlockArg[]
  message1?: string
  args1?: RoboBlockArg[]
  message2?: string
  args2?: RoboBlockArg[]
  message3?: string
  args3?: RoboBlockArg[]
  colour: string
  tooltip: string
  inputsInline?: boolean
  previousStatement?: null
  nextStatement?: null
  output?: 'Number' | 'Boolean' | null
}

const deviceMenu = (kind: DeviceMenuKind): FieldDropdownArg => ({ type: 'field_dropdown', name: kind.toUpperCase(), options: [noDeviceOption(kind)], deviceMenu: kind })
const dropdown = (name: string, options: readonly DeviceMenuOption[]): FieldDropdownArg => ({ type: 'field_dropdown', name, options: options.map(([label, value]) => [label, value] as DeviceMenuOption) })
const number = (name: string): InputValueArg => ({ type: 'input_value', name, check: 'Number' })
const boolean = (name: string): InputValueArg => ({ type: 'input_value', name, check: 'Boolean' })
const anyValue = (name: string): InputValueArg => ({ type: 'input_value', name })
const statements = (name: string): InputStatementArg => ({ type: 'input_statement', name })
const variable = (): FieldVariableArg => ({ type: 'field_variable', name: 'VAR', variable: 'count' })
const stack = { previousStatement: null, nextStatement: null } as const
const C = CATEGORY_COLOURS

const EVENTS: RoboBlockDefinition[] = [
  { type: 'robo_when_run', message0: 'when run', nextStatement: null, colour: C.events, tooltip: 'Starts when you press Run. The blocks below run one after another.' },
  { type: 'robo_when_sensor_sees', message0: 'when %1 sees something', args0: [deviceMenu('sensor')], nextStatement: null, colour: C.events, tooltip: 'Starts each time the sensor begins to see something closer than 5 studs.' },
  { type: 'robo_when_button_pressed', message0: 'when %1 pressed', args0: [deviceMenu('button')], nextStatement: null, colour: C.events, tooltip: 'Starts each time the button is pressed.' },
  { type: 'robo_when_key_pressed', message0: 'when key %1 pressed', args0: [dropdown('KEY', KEY_OPTIONS)], nextStatement: null, colour: C.events, tooltip: 'Starts each time you press this key.' },
]

const MOTION: RoboBlockDefinition[] = [
  { type: 'robo_drive', message0: 'drive %1 at %2 %%', args0: [dropdown('DIRECTION', DIRECTION_OPTIONS), number('POWER')], inputsInline: true, ...stack, colour: C.motion, tooltip: 'Both drive motors at the same speed. They keep going until you stop them.' },
  { type: 'robo_turn', message0: 'turn %1 at %2 %% for %3 s', args0: [dropdown('DIRECTION', TURN_OPTIONS), number('POWER'), number('SECONDS')], inputsInline: true, ...stack, colour: C.motion, tooltip: 'Spin in place: one drive motor forward, the other backward, then stop both.' },
  { type: 'robo_drive_joystick', message0: 'drive using joystick', ...stack, colour: C.motion, tooltip: 'Push the joystick (or the arrow keys) to drive. Up goes forward, right turns right.' },
  { type: 'robo_stop_motors', message0: 'stop motors', ...stack, colour: C.motion, tooltip: 'Stop every motor and hold it where it is.' },
  { type: 'robo_run_motor', message0: 'run %1 at %2 %%', args0: [deviceMenu('motor'), number('POWER')], inputsInline: true, ...stack, colour: C.motion, tooltip: 'One motor at a speed from -100 (backward) to 100 (forward). It keeps going until you stop it.' },
  { type: 'robo_turn_motor_to', message0: 'turn %1 to %2 °', args0: [deviceMenu('motor'), number('DEGREES')], inputsInline: true, ...stack, colour: C.motion, tooltip: 'Turn a motor to an angle. For a hinge motor, 0° is the arm as you built it.' },
  { type: 'robo_stop_motor', message0: 'stop %1', args0: [deviceMenu('motor')], ...stack, colour: C.motion, tooltip: 'Stop this motor and hold it where it is.' },
]

const SENSING: RoboBlockDefinition[] = [
  { type: 'robo_sensor_distance', message0: '%1 distance (studs)', args0: [deviceMenu('sensor')], output: 'Number', colour: C.sensing, tooltip: 'How far away the nearest thing in front of the sensor is, in studs. 40 when it sees nothing.' },
  { type: 'robo_sensor_sees', message0: '%1 sees something closer than %2 studs', args0: [deviceMenu('sensor'), number('STUDS')], inputsInline: true, output: 'Boolean', colour: C.sensing, tooltip: 'True when something is closer to the sensor than that many studs.' },
  { type: 'robo_motor_position', message0: '%1 position (°)', args0: [deviceMenu('motor')], output: 'Number', colour: C.sensing, tooltip: 'How far the motor has turned since Run, in degrees. A hinge motor counts from the arm as built.' },
  { type: 'robo_motor_speed', message0: '%1 speed (%%)', args0: [deviceMenu('motor')], output: 'Number', colour: C.sensing, tooltip: 'How fast the motor is really turning, from -100 to 100.' },
  { type: 'robo_button_pressed', message0: '%1 pressed?', args0: [deviceMenu('button')], output: 'Boolean', colour: C.sensing, tooltip: 'True while the button is held down.' },
  { type: 'robo_timer', message0: 'timer (s)', output: 'Number', colour: C.sensing, tooltip: 'Seconds since you pressed Run.' },
]

const INPUT: RoboBlockDefinition[] = [
  { type: 'robo_when_joystick_moves', message0: 'when joystick moves', nextStatement: null, colour: C.input, tooltip: 'Runs all at once, many times a second, while the joystick or the arrow keys are pushed, and once more when they let go. It cannot wait.' },
  { type: 'robo_when_controls_update', message0: 'when controls update', nextStatement: null, colour: C.input, tooltip: 'Runs all at once, many times a second, the whole time. It cannot wait.' },
  { type: 'robo_joystick', message0: 'joystick %1 amount', args0: [dropdown('AXIS', AXIS_OPTIONS)], output: 'Number', colour: C.input, tooltip: 'How far the joystick (or the arrow keys) is pushed, from -100 to 100.' },
  { type: 'robo_key_held', message0: 'key %1 held?', args0: [dropdown('KEY', KEY_OPTIONS)], output: 'Boolean', colour: C.input, tooltip: 'True while you hold this key down.' },
]

const LIGHT: RoboBlockDefinition[] = [
  { type: 'robo_set_light', message0: 'set %1 to %2', args0: [deviceMenu('light'), dropdown('COLOR', LIGHT_COLOR_OPTIONS)], inputsInline: true, ...stack, colour: C.light, tooltip: 'Turn the light on in this colour.' },
  { type: 'robo_light_off', message0: 'turn %1 off', args0: [deviceMenu('light')], ...stack, colour: C.light, tooltip: 'Turn the light off.' },
]

const CONTROL: RoboBlockDefinition[] = [
  { type: 'robo_wait', message0: 'wait %1 s', args0: [number('SECONDS')], inputsInline: true, ...stack, colour: C.control, tooltip: 'Pause this script. Motors keep doing what they were told.' },
  { type: 'robo_wait_until', message0: 'wait until %1', args0: [boolean('CONDITION')], ...stack, colour: C.control, tooltip: 'Pause this script until the condition is true. Motors keep doing what they were told.' },
  { type: 'robo_repeat', message0: 'repeat %1', args0: [number('TIMES')], message1: '%1', args1: [statements('DO')], ...stack, colour: C.control, tooltip: 'Run the blocks inside this many times.' },
  { type: 'robo_forever', message0: 'forever', message1: '%1', args1: [statements('DO')], previousStatement: null, colour: C.control, tooltip: 'Run the blocks inside again and again until Stop. Each time round takes at least one instant.' },
  { type: 'robo_if', message0: 'if %1 then', args0: [boolean('CONDITION')], message1: '%1', args1: [statements('DO')], ...stack, colour: C.control, tooltip: 'Run the blocks inside only when the condition is true.' },
  { type: 'robo_if_else', message0: 'if %1 then', args0: [boolean('CONDITION')], message1: '%1', args1: [statements('DO')], message2: 'else', message3: '%1', args3: [statements('ELSE')], ...stack, colour: C.control, tooltip: 'Run the first blocks when the condition is true, the second ones when it is not.' },
  { type: 'robo_stop_script', message0: 'stop this script', previousStatement: null, colour: C.control, tooltip: 'End this script. Its motors keep their last command.' },
]

const LOGIC: RoboBlockDefinition[] = [
  { type: 'robo_compare', message0: '%1 %2 %3', args0: [number('A'), dropdown('OP', COMPARE_OPTIONS), number('B')], inputsInline: true, output: 'Boolean', colour: C.logic, tooltip: 'Compare two numbers.' },
  { type: 'robo_and_or', message0: '%1 %2 %3', args0: [boolean('A'), dropdown('OP', LOGIC_OPTIONS), boolean('B')], inputsInline: true, output: 'Boolean', colour: C.logic, tooltip: '"and": both must be true. "or": at least one must be true.' },
  { type: 'robo_not', message0: 'not %1', args0: [boolean('VALUE')], output: 'Boolean', colour: C.logic, tooltip: 'True when the condition is false.' },
]

const MATH: RoboBlockDefinition[] = [
  { type: 'robo_number', message0: '%1', args0: [{ type: 'field_number', name: 'NUM', value: 0 }], output: 'Number', colour: C.math, tooltip: 'A number.' },
  { type: 'robo_arithmetic', message0: '%1 %2 %3', args0: [number('A'), dropdown('OP', ARITHMETIC_OPTIONS), number('B')], inputsInline: true, output: 'Number', colour: C.math, tooltip: 'Add, subtract, multiply or divide. Dividing by zero gives 0.' },
  { type: 'robo_min_max', message0: '%1 of %2 and %3', args0: [dropdown('OP', MIN_MAX_OPTIONS), number('A'), number('B')], inputsInline: true, output: 'Number', colour: C.math, tooltip: 'The smaller (min) or the larger (max) of two numbers.' },
]

const VARIABLES: RoboBlockDefinition[] = [
  { type: 'robo_set_variable', message0: 'set %1 to %2', args0: [variable(), anyValue('VALUE')], inputsInline: true, ...stack, colour: C.variables, tooltip: 'Remember a number (or true/false) under this name.' },
  { type: 'robo_change_variable', message0: 'change %1 by %2', args0: [variable(), number('BY')], inputsInline: true, ...stack, colour: C.variables, tooltip: 'Add to the number remembered under this name.' },
  { type: 'robo_variable', message0: '%1', args0: [variable()], output: null, colour: C.variables, tooltip: 'The value remembered under this name. 0 until you set it.' },
]

const BY_CATEGORY: readonly [RoboCategory, RoboBlockDefinition[]][] = [
  ['events', EVENTS], ['motion', MOTION], ['sensing', SENSING], ['input', INPUT], ['light', LIGHT],
  ['control', CONTROL], ['logic', LOGIC], ['math', MATH], ['variables', VARIABLES],
]

/** Static definitions, grouped by category in toolbox order. See `createBlockDefinitions` for the live version. */
export const ROBO_BLOCK_DEFINITIONS: readonly RoboBlockDefinition[] = Object.freeze(BY_CATEGORY.flatMap(([, definitions]) => definitions))

export type RoboBlockType = RoboBlockDefinition['type']

/** Which category each block belongs to (toolbox grouping). */
export const BLOCK_CATEGORY: Readonly<Record<string, RoboCategory>> = Object.freeze(Object.fromEntries(BY_CATEGORY.flatMap(([category, definitions]) => definitions.map((definition) => [definition.type, category]))))

/** Hats: the block types that start a script. */
export const HAT_BLOCK_TYPES: readonly RoboBlockType[] = Object.freeze(['robo_when_run', 'robo_when_sensor_sees', 'robo_when_button_pressed', 'robo_when_key_pressed', 'robo_when_joystick_moves', 'robo_when_controls_update'])
/** Hats whose script runs all at once every tick, after the others (contract §8). */
export const CONTROLLER_HAT_TYPES: readonly RoboBlockType[] = Object.freeze(['robo_when_joystick_moves', 'robo_when_controls_update'])

/**
 * Built-in Blockly blocks the compiler also accepts, so the Code view may use Blockly's
 * own number shadow or its dynamic Variables category (`custom: 'VARIABLE'`) if it
 * prefers. They compile exactly like `robo_number`, `robo_variable`, `robo_set_variable`
 * and `robo_change_variable`.
 */
export const BUILTIN_ALIASES: Readonly<Record<string, RoboBlockType>> = Object.freeze({
  math_number: 'robo_number',
  variables_get: 'robo_variable',
  variables_set: 'robo_set_variable',
  math_change: 'robo_change_variable',
})

const ROBO_TYPES = new Set<string>(ROBO_BLOCK_DEFINITIONS.map((definition) => definition.type))
export const isRoboBlockType = (type: string): type is RoboBlockType => ROBO_TYPES.has(type)

/**
 * Live definitions for `Blockly.defineBlocksWithJsonArray`. Device dropdowns become
 * option functions that ask `provider` each time Blockly builds or opens them (an empty
 * answer becomes the single "no … yet" option, since Blockly refuses an empty menu);
 * every other field is the same plain data as `ROBO_BLOCK_DEFINITIONS`. Fresh copies.
 */
export function createBlockDefinitions(provider: DeviceOptionsProvider): Array<Record<string, unknown>> {
  const menu = (kind: DeviceMenuKind) => function deviceMenuOptions(this: unknown): DeviceMenuOption[] {
    let current: string | null = null
    const field = this as { getValue?: () => unknown } | undefined
    if (field && typeof field.getValue === 'function') {
      const value = field.getValue()
      if (typeof value === 'string') current = value
    }
    const options = provider(kind, current)
    return options.length > 0 ? options.map(([label, value]) => [label, value] as DeviceMenuOption) : [noDeviceOption(kind)]
  }
  const liveArgs = (args?: RoboBlockArg[]) => args?.map((arg) => {
    if (arg.type === 'field_dropdown' && arg.deviceMenu) {
      const { deviceMenu: kind, options: _placeholder, ...rest } = arg
      return { ...rest, options: menu(kind) }
    }
    if (arg.type === 'field_dropdown') return { ...arg, options: arg.options.map(([label, value]) => [label, value]) }
    return { ...arg }
  })
  return ROBO_BLOCK_DEFINITIONS.map((definition) => {
    const out: Record<string, unknown> = { ...definition }
    for (const key of ['args0', 'args1', 'args2', 'args3'] as const) if (definition[key]) out[key] = liveArgs(definition[key])
    return out
  })
}
