import * as Blockly from 'blockly'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { compileWorkspace } from '../../core/editor/compile'
import { registerEditorBlocks } from '../../core/editor/definitions'
import { createContinuousToolbox } from '../../core/editor/toolbox'
import { fillEmptySlots, refillUnpluggedSlot, slotShadowFor, slotShadowsFromToolbox } from './slotShadows'

const shadows = slotShadowsFromToolbox(createContinuousToolbox())

describe('slotShadowFor', () => {
  it('uses the palette shadow for a known slot', () => {
    expect(slotShadowFor(shadows, 'data_setvariableto', 'VALUE', null)).toEqual({ type: 'math_number', fields: { NUM: 0 } })
    expect(slotShadowFor(shadows, 'looks_say', 'MESSAGE', null)?.type).toBe('text')
  })

  it("starts at the pulled-out variable's number", () => {
    expect(slotShadowFor(shadows, 'data_setvariableto', 'VALUE', null, 8.625)).toEqual({ type: 'math_number', fields: { NUM: 8.625 } })
  })

  it('leaves yes/no slots empty', () => {
    expect(slotShadowFor(shadows, 'control_if', 'CONDITION', ['Boolean'])).toBeNull()
  })

  it('gives unknown number slots a 0 and My Block inputs a text slot', () => {
    expect(slotShadowFor(shadows, 'platformer_unknown', 'SPEED', ['Number'])).toEqual({ type: 'math_number', fields: { NUM: 0 } })
    expect(slotShadowFor(shadows, 'procedures_call', 'speed', null, 2)).toEqual({ type: 'text', fields: { TEXT: '2' } })
  })
})

describe('slots keep a value to type into (headless Blockly)', () => {
  let ws: Blockly.Workspace
  beforeAll(() => registerEditorBlocks({ getVariables: () => [{ id: 'jump_stand', name: 'jump standing' }, { id: 'jump_now', name: 'jump now' }] }))
  afterEach(() => ws?.dispose())

  const load = (value: unknown) => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load({
      variables: [{ id: 'jump_stand', name: 'jump standing' }, { id: 'jump_now', name: 'jump now' }],
      blocks: { languageVersion: 0, blocks: [{
        type: 'event_whenflagclicked', id: 'hat', x: 0, y: 0,
        next: { block: { type: 'data_setvariableto', id: 'set', fields: { VARIABLE: 'jump_now' }, ...(value ? { inputs: { VALUE: value } } : {}) } },
      }] },
    }, ws)
  }

  it('fills an empty number slot on load without an undo step', () => {
    load(undefined)
    expect(fillEmptySlots(ws, shadows)).toBe(1)
    const slot = ws.getBlockById('set')!.getInputTargetBlock('VALUE')!
    expect(slot.isShadow()).toBe(true)
    expect(slot.getFieldValue('NUM')).toBe(0)
    expect(ws.getUndoStack().length).toBe(0)
  })

  it('a reporter pulled out leaves its number behind, and the script still reads it', async () => {
    load({ block: { type: 'data_variable', id: 'rep', fields: { VARIABLE: 'jump_stand' } } })
    const rep = ws.getBlockById('rep')!
    const events: Blockly.Events.Abstract[] = []
    ws.addChangeListener((e) => events.push(e))
    Blockly.Events.setGroup(true)
    rep.unplug()
    Blockly.Events.setGroup(false)
    await new Promise((r) => setTimeout(r, 20))
    const move = events.find((e) => e.type === Blockly.Events.BLOCK_MOVE)!
    expect(refillUnpluggedSlot(ws, move, shadows, (id) => (id === 'jump_stand' ? 8.625 : undefined))).toBe(true)
    const slot = ws.getBlockById('set')!.getInputTargetBlock('VALUE')!
    expect(slot.isShadow()).toBe(true)
    expect(slot.getFieldValue('NUM')).toBe(8.625)
    const set = compileWorkspace(Blockly.serialization.workspaces.save(ws)).program.scripts[0].body[0] as unknown as { inputs: Record<string, unknown> }
    expect(set.inputs.VALUE).toEqual({ kind: 'lit', value: 8.625 })
  })
})
