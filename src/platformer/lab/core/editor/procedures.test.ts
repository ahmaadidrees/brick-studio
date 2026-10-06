import * as Blockly from 'blockly'
import { describe, expect, it } from 'vitest'
import { compileWorkspace } from './compile'
import { registerEditorBlocks } from './definitions'

describe('My Blocks survive a Blockly round trip', () => {
  it('keeps proccode, argument names, warp, and call arguments', () => {
    registerEditorBlocks()
    const json = {
      blocks: {
        blocks: [
          {
            type: 'procedures_definition',
            id: 'def',
            extraState: { proccode: 'jump %s times %b', argumentNames: ['height', 'fast?'], warp: true },
            next: { block: { type: 'motion_changeyby', id: 'cy', inputs: { DY: { shadow: { type: 'math_number', fields: { NUM: 1 } }, block: { type: 'argument_reporter_string_number', id: 'arg', fields: { VALUE: 'height' } } } } } },
          },
          {
            type: 'event_whenflagclicked',
            id: 'flag',
            next: {
              block: {
                type: 'procedures_call',
                id: 'call',
                extraState: { proccode: 'jump %s times %b', argumentNames: ['height', 'fast?'] },
                inputs: { height: { shadow: { type: 'math_number', fields: { NUM: 12 } } } },
              },
            },
          },
        ],
      },
    }
    const ws = new Blockly.Workspace()
    try {
      Blockly.serialization.workspaces.load(json, ws)
      expect(ws.getBlockById('def')!.getFieldValue('LABEL')).toBe('jump (height) times <fast?>')
      const saved = Blockly.serialization.workspaces.save(ws)
      const { program, diagnostics } = compileWorkspace(saved)
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
      expect(program.procedures.map((p) => [p.proccode, p.argumentNames, p.warp])).toEqual([['jump %s times %b', ['height', 'fast?'], true]])
      const call = program.scripts[0].body[0]
      expect(call.call).toEqual({ proccode: 'jump %s times %b' })
      expect(call.inputs.height).toEqual({ kind: 'lit', value: 12 })
    } finally {
      ws.dispose()
    }
  })
})
