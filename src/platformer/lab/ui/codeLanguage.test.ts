import * as Blockly from 'blockly/core'
import { describe, expect, it } from 'vitest'
import { CATEGORY_ORDER, LAB_BLOCK_DEFINITIONS, createBlockDefinitions, labToolbox } from '../program/catalog'
import { readBlockDeclarations, readVariableDeclarations, withVariableDeclarations } from './authoring'

describe('Code Lab free-form block palette', () => {
  it('makes the new language available from visible categories', () => {
    const palette = labToolbox()
    const category = (name: string) => palette.contents.find((c) => c.toolboxitemid === name)
    const types = (name: string) => category(name)?.contents.filter((item) => item.kind === 'block').map((item) => item.type)
    expect(CATEGORY_ORDER).toEqual(['motion', 'look', 'sound', 'events', 'control', 'sensing', 'operators', 'variables', 'myBlocks', 'brickgineers'])
    expect(category('variables')?.contents[0]).toMatchObject({ kind: 'button', text: 'Make a Variable' })
    expect(category('myBlocks')?.contents[0]).toMatchObject({ kind: 'button', text: 'Make a Block' })
    expect(types('events')).toContain('lab_when_clicked')
    expect(types('motion')).toContain('lab_set_controls')
    expect(types('brickgineers')).toContain('lab_set_physics')
    expect(types('brickgineers')).toContain('lab_make_xy')
    expect(category('brickgineers')?.contents.filter((item) => item.kind === 'label').map((item) => item.text)).toEqual(['Physics', 'Building', 'Interactions'])
    expect(types('look')).toContain('lab_say_text')
    expect(types('look')).toContain('lab_hide_thing')
    expect(types('sound')).toEqual(['lab_sound'])
    expect(labToolbox([{ name: 'score', scope: 'world' }], [{ name: 'boost', args: ['power'] }]).contents.find((c) => c.toolboxitemid === 'variables')?.contents.filter((item) => item.kind === 'block').map((item) => item.fields)).toEqual([
      { SCOPE: 'world', NAME: 'score' },
      { SCOPE: 'world', NAME: 'score' },
      { SCOPE: 'world', NAME: 'score' },
    ])
  })

  it('round trips named variables, broadcasts, and a custom definition through Blockly JSON', () => {
    Blockly.defineBlocksWithJsonArray(createBlockDefinitions(() => [['Ball', 'ball']], () => [['score', 'score']]) as Parameters<typeof Blockly.defineBlocksWithJsonArray>[0])
    const ws = new Blockly.Workspace()
    try {
      const definitions = new Set(LAB_BLOCK_DEFINITIONS.map((b) => b.type))
      for (const type of ['lab_define', 'lab_call', 'lab_argument', 'lab_set_variable', 'lab_variable', 'lab_when_message', 'lab_broadcast', 'lab_move_xy', 'lab_make_xy', 'lab_position']) {
        expect(definitions.has(type as `lab_${string}`)).toBe(true)
      }
      const define = ws.newBlock('lab_define')
      define.setFieldValue('boost', 'NAME')
      define.setFieldValue('power', 'ARG1')
      const call = ws.newBlock('lab_call')
      call.setFieldValue('boost', 'NAME')
      const set = ws.newBlock('lab_set_variable')
      set.setFieldValue('world', 'SCOPE')
      set.setFieldValue('score', 'NAME')
      const received = ws.newBlock('lab_when_message')
      received.setFieldValue('startRace', 'MESSAGE')
      const json = Blockly.serialization.workspaces.save(ws)
      const saved = withVariableDeclarations(json, [{ name: 'score', scope: 'world' }])
      expect(readVariableDeclarations(saved)).toEqual([{ name: 'score', scope: 'world' }])
      expect(readBlockDeclarations(saved)).toEqual([{ name: 'boost', args: ['power'] }])
      const restored = new Blockly.Workspace()
      try {
        Blockly.serialization.workspaces.load(json, restored)
        expect(restored.getAllBlocks(false).find((b) => b.type === 'lab_define')?.getFieldValue('ARG1')).toBe('power')
        expect(restored.getAllBlocks(false).find((b) => b.type === 'lab_call')?.getFieldValue('NAME')).toBe('boost')
        expect(restored.getAllBlocks(false).find((b) => b.type === 'lab_set_variable')?.getFieldValue('NAME')).toBe('score')
        expect(restored.getAllBlocks(false).find((b) => b.type === 'lab_when_message')?.getFieldValue('MESSAGE')).toBe('startRace')
      } finally {
        restored.dispose()
      }
    } finally {
      ws.dispose()
    }
  })
})
