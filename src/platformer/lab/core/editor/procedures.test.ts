import * as Blockly from 'blockly'
import { describe, expect, it } from 'vitest'
import { compileWorkspace } from './compile'
import { registerEditorBlocks } from './definitions'
import { myBlocksFlyout, registerToolboxPlugins } from './toolbox'

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

describe('My Block calls read like Scratch: inputs inline between the words', () => {
  const load = (state: Record<string, unknown>, inputs: Record<string, unknown> = {}) => {
    registerEditorBlocks()
    const ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(
      { blocks: { languageVersion: 0, blocks: [{ type: 'procedures_call', id: 'c', extraState: state, inputs }] } },
      ws,
    )
    return ws
  }
  /** The row as the kid reads it: words, and (name) / <name> where an input sits. */
  const row = (b: Blockly.Block) =>
    b.inputList
      .flatMap((i) => [
        ...i.fieldRow.map((f) => String(f.getValue()).trim()),
        ...(i.type === Blockly.inputs.inputTypes.VALUE ? [i.connection?.getCheck()?.includes('Boolean') ? `<${i.name}>` : `(${i.name})`] : []),
      ])
      .filter(Boolean)
      .join(' ')

  it('"walk at %s" is one inline row: walk, then the speed input', () => {
    const ws = load({ proccode: 'walk at %s', argumentNames: ['speed'] })
    try {
      const b = ws.getBlockById('c')!
      expect(b.getInputsInline()).toBe(true)
      expect(row(b)).toBe('walk at (speed)')
      // the input carries the words before it, so it sits right after them, not on its own row
      expect(b.getInput('speed')!.fieldRow.map((f) => f.getValue())).toEqual(['walk at'])
    } finally {
      ws.dispose()
    }
  })

  it('"jump %s times %b" puts the words between the inputs, and the boolean slot takes only booleans', () => {
    const ws = load({ proccode: 'jump %s times %b', argumentNames: ['height', 'fast?'] })
    try {
      const b = ws.getBlockById('c')!
      expect(row(b)).toBe('jump (height) times <fast?>')
      expect(b.getInput('fast?')!.connection!.getCheck()).toEqual(['Boolean'])
      expect(b.getInput('height')!.connection!.getCheck()).toBeNull()
    } finally {
      ws.dispose()
    }
  })

  it('words after the last input stay on the row ("%s steps forward")', () => {
    const ws = load({ proccode: 'go %s steps forward', argumentNames: ['n'] })
    try {
      expect(row(ws.getBlockById('c')!)).toBe('go (n) steps forward')
    } finally {
      ws.dispose()
    }
  })

  it('a call with no inputs is just its words', () => {
    const ws = load({ proccode: 'turn around', argumentNames: [] })
    try {
      expect(row(ws.getBlockById('c')!)).toBe('turn around')
    } finally {
      ws.dispose()
    }
  })

  it('still saves the same state and compiles the call arguments by name', () => {
    const ws = load(
      { proccode: 'jump %s times %b', argumentNames: ['height', 'fast?'] },
      { height: { shadow: { type: 'math_number', fields: { NUM: 7 } } } },
    )
    try {
      const saved = Blockly.serialization.workspaces.save(ws)
      const call = (saved as { blocks: { blocks: Array<{ extraState: unknown; inputs: Record<string, unknown> }> } }).blocks.blocks[0]
      expect(call.extraState).toEqual({ proccode: 'jump %s times %b', argumentNames: ['height', 'fast?'] })
      const { program } = compileWorkspace({ blocks: { blocks: [{ type: 'event_whenflagclicked', id: 'f', next: { block: (saved as any).blocks.blocks[0] } }] } } as never)
      expect(program.scripts[0].body[0].inputs.height).toEqual({ kind: 'lit', value: 7 })
    } finally {
      ws.dispose()
    }
  })

  it('the definition shows the argument names where the call has inputs', () => {
    registerEditorBlocks()
    const ws = new Blockly.Workspace()
    try {
      Blockly.serialization.workspaces.load(
        { blocks: { languageVersion: 0, blocks: [{ type: 'procedures_definition', id: 'd', extraState: { proccode: 'walk at %s', argumentNames: ['speed'] } }] } },
        ws,
      )
      expect(ws.getBlockById('d')!.getFieldValue('LABEL')).toBe('walk at (speed)')
    } finally {
      ws.dispose()
    }
  })
})

describe('My Blocks palette', () => {
  it('has Make a Block, then a call and its argument reporters per definition, and nothing from the shareable-procedures plugin', () => {
    registerEditorBlocks()
    registerToolboxPlugins()
    const ws = new Blockly.Workspace()
    try {
      Blockly.serialization.workspaces.load(
        {
          blocks: {
            languageVersion: 0,
            blocks: [
              { type: 'procedures_definition', id: 'd1', extraState: { proccode: 'walk at %s', argumentNames: ['speed'] } },
              { type: 'procedures_definition', id: 'd2', extraState: { proccode: 'check %b', argumentNames: ['safe?'] } },
            ],
          },
        },
        ws,
      )
      const items = myBlocksFlyout(ws)
      expect(items[0]).toEqual({ kind: 'button', text: 'Make a Block', callbackKey: 'MAKE_A_PROCEDURE' })
      const types = items.filter((i) => i.kind === 'block').map((i) => i.type)
      expect(types).toEqual(['procedures_call', 'argument_reporter_string_number', 'procedures_call', 'argument_reporter_boolean'])
      // number/text slots start with an empty text shadow; boolean slots start empty
      expect((items[1] as any).inputs).toEqual({ speed: { shadow: { type: 'text', fields: { TEXT: '' } } } })
      expect((items[3] as any).inputs).toEqual({})
      expect(JSON.stringify(items)).not.toMatch(/defnoreturn|defreturn|callnoreturn|callreturn|ifreturn/)
    } finally {
      ws.dispose()
    }
  })

  it('an empty workspace lists only Make a Block', () => {
    const ws = new Blockly.Workspace()
    try {
      expect(myBlocksFlyout(ws)).toEqual([{ kind: 'button', text: 'Make a Block', callbackKey: 'MAKE_A_PROCEDURE' }])
    } finally {
      ws.dispose()
    }
  })

  it('the plugin stays registered only so old saves that hold its blocks still load', () => {
    registerEditorBlocks()
    registerToolboxPlugins()
    const ws = new Blockly.Workspace()
    try {
      expect(() =>
        Blockly.serialization.workspaces.load(
          { blocks: { languageVersion: 0, blocks: [{ type: 'procedures_defnoreturn', id: 'old', extraState: { procedureId: 'p1' }, fields: { NAME: 'do something' } }] }, procedures: [{ id: 'p1', name: 'do something', returnTypes: null, parameters: [] }] },
          ws,
        ),
      ).not.toThrow()
      expect(ws.getBlockById('old')).toBeTruthy()
    } finally {
      ws.dispose()
    }
  })
})
