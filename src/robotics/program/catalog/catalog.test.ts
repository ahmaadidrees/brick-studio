import * as Blockly from 'blockly/core'
import * as En from 'blockly/msg/en'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileContextFor, compileProgram } from '../compile'
import { deviceOptions } from '../devices'
import { startersFor } from '../starters'
import { wiredGate, wiredRover, wiredSignalPost } from '../testFixtures'
import { BLOCK_CATEGORY, CATEGORY_COLOURS, DEVICE_FIELD_KINDS, HAT_BLOCK_TYPES, ROBO_BLOCK_DEFINITIONS, createBlockDefinitions, type DeviceMenuKind, type DeviceMenuOption } from './blocks'
import { ROBO_TOOLBOX, roboToolbox } from './toolbox'

/**
 * The catalog is plain data, but it must be data Blockly accepts: these tests register it
 * with the real Blockly core and round-trip every starter through a headless workspace.
 */
type Provider = (kind: DeviceMenuKind, current: string | null) => DeviceMenuOption[]
let provider: Provider = () => []

beforeAll(() => {
  // The Code view sets the English message table the same way; variable fields need it.
  Blockly.setLocale(En as unknown as Record<string, string>)
  Blockly.defineBlocksWithJsonArray(createBlockDefinitions((kind, current) => provider(kind, current)))
})

const PLAN_VOCABULARY = [
  'robo_when_run', 'robo_when_sensor_sees', 'robo_when_button_pressed', 'robo_when_key_pressed',
  'robo_drive', 'robo_turn', 'robo_drive_joystick', 'robo_stop_motors', 'robo_run_motor', 'robo_turn_motor_to', 'robo_stop_motor',
  'robo_sensor_distance', 'robo_sensor_sees', 'robo_motor_position', 'robo_motor_speed', 'robo_button_pressed', 'robo_timer',
  'robo_when_joystick_moves', 'robo_when_controls_update', 'robo_joystick', 'robo_key_held',
  'robo_set_light', 'robo_light_off',
  'robo_wait', 'robo_wait_until', 'robo_repeat', 'robo_forever', 'robo_if', 'robo_if_else', 'robo_stop_script',
  'robo_compare', 'robo_and_or', 'robo_not',
  'robo_number', 'robo_arithmetic', 'robo_min_max',
  'robo_set_variable', 'robo_change_variable', 'robo_variable',
]

describe('block catalog', () => {
  it('defines exactly the plan §5 vocabulary, robo_-prefixed, each in its category colour', () => {
    expect(ROBO_BLOCK_DEFINITIONS.map((definition) => definition.type)).toEqual(PLAN_VOCABULARY)
    expect(CATEGORY_COLOURS).toEqual({ events: '#E0A030', motion: '#3565BF', sensing: '#5888DA', input: '#8A5CF6', light: '#F17861', control: '#E0A030', logic: '#3FA36B', math: '#2FA3A0', variables: '#E36A9A' })
    for (const definition of ROBO_BLOCK_DEFINITIONS) expect(definition.colour).toBe(CATEGORY_COLOURS[BLOCK_CATEGORY[definition.type]])
    expect(BLOCK_CATEGORY.robo_when_joystick_moves).toBe('input')
    expect(BLOCK_CATEGORY.robo_wait).toBe('control')
    // Hats start scripts: nothing snaps above them.
    for (const type of HAT_BLOCK_TYPES) expect(ROBO_BLOCK_DEFINITIONS.find((definition) => definition.type === type)).not.toHaveProperty('previousStatement')
  })

  it('is plain JSON: the static definitions survive a JSON round trip', () => {
    expect(JSON.parse(JSON.stringify(ROBO_BLOCK_DEFINITIONS))).toEqual(ROBO_BLOCK_DEFINITIONS)
  })

  it('live definitions ask the provider for device menus, with the field value, and never return an empty menu', () => {
    const calls: [DeviceMenuKind, string | null][] = []
    const definitions = createBlockDefinitions((kind, current) => { calls.push([kind, current]); return kind === 'sensor' ? [['Front sensor · C', 's1']] : [] })
    const sees = definitions.find((definition) => definition.type === 'robo_sensor_sees')!
    const menu = (sees.args0 as { name: string; options: unknown }[]).find((arg) => arg.name === 'SENSOR')!.options as (this: unknown) => DeviceMenuOption[]
    expect(menu.call({ getValue: () => 's1' })).toEqual([['Front sensor · C', 's1']])
    expect(calls).toEqual([['sensor', 's1']])
    const light = definitions.find((definition) => definition.type === 'robo_set_light')!
    const lightMenu = (light.args0 as { name: string; options: unknown }[]).find((arg) => arg.name === 'LIGHT')!.options as () => DeviceMenuOption[]
    expect(lightMenu()).toEqual([['no light yet', '']])
    // No marker leaks into what Blockly sees.
    expect(JSON.stringify(definitions)).not.toContain('deviceMenu')
    expect(Object.keys(DEVICE_FIELD_KINDS)).toEqual(['MOTOR', 'SENSOR', 'LIGHT', 'BUTTON'])
  })

  it('registers with Blockly: every block type can be built in a headless workspace', () => {
    const workspace = new Blockly.Workspace()
    for (const { type } of ROBO_BLOCK_DEFINITIONS) expect(() => workspace.newBlock(type)).not.toThrow()
    expect(workspace.getAllBlocks(false)).toHaveLength(PLAN_VOCABULARY.length)
    workspace.dispose()
  })
})

describe('toolbox', () => {
  const types = (toolbox: ReturnType<typeof roboToolbox>) => toolbox.contents.flatMap((category) => category.contents.map((item) => item.type))

  it('lists the nine categories in order with their colours, and only defined blocks', () => {
    expect(ROBO_TOOLBOX.contents.map((category) => category.name)).toEqual(['Events', 'Motion', 'Sensing', 'Input', 'Light', 'Control', 'Logic', 'Math', 'Variables'])
    expect(ROBO_TOOLBOX.contents.map((category) => category.colour)).toEqual(['#E0A030', '#3565BF', '#5888DA', '#8A5CF6', '#F17861', '#E0A030', '#3FA36B', '#2FA3A0', '#E36A9A'])
    expect(new Set(types(ROBO_TOOLBOX))).toEqual(new Set(PLAN_VOCABULARY))
  })

  it('first run: a subset, controller blocks out of sight unless the starter is a controller starter, advanced never', () => {
    const first = types(roboToolbox({ firstRun: true }))
    expect(first.length).toBeLessThan(PLAN_VOCABULARY.length)
    expect(first).toContain('robo_drive')
    expect(first).not.toContain('robo_when_joystick_moves')
    expect(first).not.toContain('robo_drive_joystick')
    expect(first).not.toContain('robo_when_controls_update')
    const controller = types(roboToolbox({ firstRun: true, controller: true }))
    expect(controller).toEqual(expect.arrayContaining(['robo_when_joystick_moves', 'robo_drive_joystick', 'robo_joystick', 'robo_key_held']))
    expect(controller).not.toContain('robo_when_controls_update')
    // The rail keeps its shape.
    expect(roboToolbox({ firstRun: true }).contents).toHaveLength(9)
  })

  it('parses as a Blockly toolbox, and every palette entry builds', () => {
    // A headless workspace cannot host a toolbox; parsing it is what Blockly does on inject.
    expect(Blockly.utils.toolbox.convertToolboxDefToJson(ROBO_TOOLBOX)).toBeTruthy()
    const workspace = new Blockly.Workspace()
    for (const category of ROBO_TOOLBOX.contents) {
      for (const item of category.contents) expect(() => Blockly.serialization.blocks.append({ ...item } as Blockly.serialization.blocks.State, workspace)).not.toThrow()
    }
    workspace.dispose()
  })
})

describe('starters through Blockly', () => {
  it.each([['rover', wiredRover], ['gate', wiredGate], ['signal post', wiredSignalPost]] as const)('%s: every starter loads, saves and compiles to the same program', (_name, fixture) => {
    const { creation } = fixture()
    for (const starter of startersFor(creation)) {
      const program = { workspace: starter.workspace, deviceNames: {} }
      provider = (kind, current) => deviceOptions(creation, program, kind, current)
      const workspace = new Blockly.Workspace()
      Blockly.serialization.workspaces.load(starter.workspace as object, workspace)
      const saved = Blockly.serialization.workspaces.save(workspace)
      workspace.dispose()
      const context = compileContextFor(creation, program)
      const direct = compileProgram(starter.workspace, context)
      const roundTripped = compileProgram(saved, context)
      expect(direct.ok, starter.id).toBe(true)
      expect(roundTripped.ir, starter.id).toEqual(direct.ir)
      expect(roundTripped.diagnostics).toEqual(direct.diagnostics)
    }
  })

  it('a block naming a deleted sensor keeps its id through Blockly, labelled missing, and the compiler says so', () => {
    const { creation } = wiredSignalPost()
    const workspace = { blocks: { languageVersion: 0, blocks: [{ type: 'robo_when_sensor_sees', id: 'hat', x: 0, y: 0, fields: { SENSOR: 'gone-sensor' } }] } }
    const program = { workspace, deviceNames: { 'gone-sensor': 'Porch sensor' } }
    provider = (kind, current) => deviceOptions(creation, program, kind, current)
    const blockly = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(workspace, blockly)
    const field = blockly.getBlockById('hat')!.getField('SENSOR') as Blockly.FieldDropdown
    expect(field.getValue()).toBe('gone-sensor')
    expect(field.getText()).toBe('Porch sensor (missing)')
    const saved = Blockly.serialization.workspaces.save(blockly)
    blockly.dispose()
    const result = compileProgram(saved, compileContextFor(creation, program))
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'device.missing', message: 'Porch sensor is missing', blockId: 'hat', severity: 'error' }))

    // Without the program's references the menu would silently re-point the block.
    provider = (kind) => deviceOptions(creation, null, kind)
    const bare = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(workspace, bare)
    expect(bare.getBlockById('hat')!.getFieldValue('SENSOR')).not.toBe('gone-sensor')
    bare.dispose()
  })
})
