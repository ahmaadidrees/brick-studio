import { CATEGORY_COLOURS, CATEGORY_NAMES, type RoboCategory } from './blocks'

/**
 * Category toolbox in Blockly's JSON shape (`{ kind: 'categoryToolbox' }`), ready for
 * `Blockly.inject(div, { toolbox })` or `workspace.updateToolbox(toolbox)`. Number slots
 * carry `robo_number` shadows with the plan's defaults (§5) so a block is runnable as
 * dragged. Device dropdowns take their first option (the provider's order). Plain data.
 *
 * Contract §6: on a program's first run the palette shows a small subset and the
 * controller blocks stay out of sight unless the starter is a controller starter.
 */
type ShadowInput = { shadow: { type: string; fields: Record<string, unknown> } }
export type ToolboxBlock = { kind: 'block'; type: string; fields?: Record<string, unknown>; inputs?: Record<string, ShadowInput> }
export type ToolboxCategory = { kind: 'category'; name: string; colour: string; toolboxitemid: RoboCategory; contents: ToolboxBlock[] }
export type RoboToolbox = { kind: 'categoryToolbox'; contents: ToolboxCategory[] }

const num = (value: number): ShadowInput => ({ shadow: { type: 'robo_number', fields: { NUM: value } } })
const block = (type: string, inputs?: Record<string, ShadowInput>, fields?: Record<string, unknown>): ToolboxBlock => ({ kind: 'block', type, ...(fields ? { fields } : {}), ...(inputs ? { inputs } : {}) })
const category = (key: RoboCategory, contents: ToolboxBlock[]): ToolboxCategory => ({ kind: 'category', name: CATEGORY_NAMES[key], colour: CATEGORY_COLOURS[key], toolboxitemid: key, contents })

/** Every palette block, by category, with its defaults. */
const PALETTE: Readonly<Record<RoboCategory, ToolboxBlock[]>> = {
  events: [block('robo_when_run'), block('robo_when_sensor_sees'), block('robo_when_button_pressed'), block('robo_when_key_pressed')],
  motion: [
    block('robo_drive', { POWER: num(40) }),
    block('robo_turn', { POWER: num(40), SECONDS: num(1) }),
    block('robo_drive_joystick'),
    block('robo_stop_motors'),
    block('robo_run_motor', { POWER: num(50) }),
    block('robo_turn_motor_to', { DEGREES: num(90) }),
    block('robo_stop_motor'),
  ],
  sensing: [
    block('robo_sensor_distance'),
    block('robo_sensor_sees', { STUDS: num(3) }),
    block('robo_motor_position'),
    block('robo_motor_speed'),
    block('robo_button_pressed'),
    block('robo_timer'),
  ],
  input: [block('robo_when_joystick_moves'), block('robo_joystick'), block('robo_key_held'), block('robo_when_controls_update')],
  light: [block('robo_set_light'), block('robo_light_off')],
  control: [
    block('robo_wait', { SECONDS: num(1) }),
    block('robo_wait_until'),
    block('robo_repeat', { TIMES: num(10) }),
    block('robo_forever'),
    block('robo_if'),
    block('robo_if_else'),
    block('robo_stop_script'),
  ],
  logic: [block('robo_compare', { A: num(0), B: num(0) }, { OP: 'LT' }), block('robo_and_or'), block('robo_not')],
  math: [block('robo_number', undefined, { NUM: 0 }), block('robo_arithmetic', { A: num(1), B: num(1) }), block('robo_min_max', { A: num(0), B: num(0) })],
  variables: [block('robo_set_variable', { VALUE: num(0) }), block('robo_change_variable', { BY: num(1) }), block('robo_variable')],
}

/** The first-run subset: the blocks a starter's goal line asks for, no advanced or controller blocks. */
const FIRST_RUN: Readonly<Record<RoboCategory, readonly string[]>> = {
  events: ['robo_when_run', 'robo_when_sensor_sees', 'robo_when_button_pressed'],
  motion: ['robo_drive', 'robo_turn', 'robo_stop_motors', 'robo_run_motor', 'robo_turn_motor_to', 'robo_stop_motor'],
  sensing: ['robo_sensor_distance', 'robo_sensor_sees', 'robo_motor_position'],
  input: [],
  light: ['robo_set_light', 'robo_light_off'],
  control: ['robo_wait', 'robo_wait_until', 'robo_repeat', 'robo_forever', 'robo_if'],
  logic: ['robo_compare'],
  math: ['robo_number', 'robo_arithmetic'],
  variables: [],
}

/** Controller blocks a controller starter (joystick drive) shows from the first run. */
const CONTROLLER_FIRST_RUN: readonly string[] = ['robo_when_joystick_moves', 'robo_joystick', 'robo_key_held', 'robo_drive_joystick']
/** Off the first-run palette whatever the starter (contract §6: advanced). */
const ADVANCED: readonly string[] = ['robo_when_controls_update']

const ORDER: readonly RoboCategory[] = ['events', 'motion', 'sensing', 'input', 'light', 'control', 'logic', 'math', 'variables']

export type ToolboxOptions = {
  /** The program's first run: a small palette. */
  firstRun?: boolean
  /** The program began as a controller starter, so its controller blocks are in sight. */
  controller?: boolean
}

/**
 * The toolbox for a program. The full toolbox lists every category (the rail stays
 * visible); the first-run toolbox keeps every category too but trims each to the subset,
 * so the rail never changes shape. Fresh objects each call.
 */
export function roboToolbox(options: ToolboxOptions = {}): RoboToolbox {
  const keep = (key: RoboCategory, item: ToolboxBlock) => {
    if (!options.firstRun) return true
    if (ADVANCED.includes(item.type)) return false
    if (options.controller && CONTROLLER_FIRST_RUN.includes(item.type)) return true
    return FIRST_RUN[key].includes(item.type)
  }
  return {
    kind: 'categoryToolbox',
    contents: ORDER.map((key) => category(key, PALETTE[key].filter((item) => keep(key, item)).map((item) => JSON.parse(JSON.stringify(item)) as ToolboxBlock))),
  }
}

/** The full toolbox. */
export const ROBO_TOOLBOX: RoboToolbox = roboToolbox()
