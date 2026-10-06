import * as Blockly from 'blockly'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { compileWorkspace } from '../../core/editor/compile'
import { registerEditorBlocks } from '../../core/editor/definitions'
import { attachAffordances, getLabel, isShownIn, listDefinitions, setLabel, setWorkspaceHandlers, takesLabel } from './affordances'
import { drillInto, TOP_VIEW } from './layers'

const WORKSPACE = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'event_whenflagclicked',
        id: 'flag',
        x: 20,
        y: 20,
        data: 'label:Walk back and forth',
        next: {
          block: {
            type: 'procedures_call',
            id: 'call',
            extraState: { proccode: 'walk at %s', argumentNames: ['speed'] },
            inputs: { speed: { shadow: { type: 'math_number', id: 'n', fields: { NUM: 2 } } } },
            next: { block: { type: 'platformer_setgravity', id: 'grav', fields: { GRAVITY: 'on' } } },
          },
        },
      },
      {
        type: 'platformer_whenbump',
        id: 'bump',
        x: 20,
        y: 200,
        fields: { SIDE: '_any_', BRICK: '_any_' },
        data: 'label:Turn around at a wall',
      },
      {
        type: 'procedures_definition',
        id: 'def',
        x: 20,
        y: 400,
        extraState: { proccode: 'walk at %s', argumentNames: ['speed'], warp: false },
        next: { block: { type: 'platformer_setspeed', id: 'sp', fields: { AXIS: 'x' }, inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 3 } } } } } },
      },
    ],
  },
}

describe('script labels and magnifiers (headless Blockly)', () => {
  let ws: Blockly.Workspace
  beforeAll(() => {
    registerEditorBlocks()
    attachAffordances()
  })
  afterEach(() => ws?.dispose())

  it('labels survive a Blockly save/load round trip, shaped as `data: "label:<text>"` on the hat', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    expect(getLabel(ws.getBlockById('flag')!)).toBe('Walk back and forth')
    expect(getLabel(ws.getBlockById('bump')!)).toBe('Turn around at a wall')

    const saved = Blockly.serialization.workspaces.save(ws) as { blocks: { blocks: Array<{ id: string; data?: string }> } }
    const byId = Object.fromEntries(saved.blocks.blocks.map((b) => [b.id, b.data]))
    expect(byId.flag).toBe('label:Walk back and forth')
    expect(byId.bump).toBe('label:Turn around at a wall')
    expect(byId.def).toBeUndefined()

    // Save, load into a fresh workspace, save again: identical.
    const again = new Blockly.Workspace()
    try {
      Blockly.serialization.workspaces.load(saved, again)
      expect(Blockly.serialization.workspaces.save(again)).toEqual(saved)
    } finally {
      again.dispose()
    }
  })

  it('editing a label saves the new text, and clearing it removes the key', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    const flag = ws.getBlockById('flag')!
    setLabel(flag, '  Start walking ')
    const withLabel = Blockly.serialization.workspaces.save(ws) as { blocks: { blocks: Array<{ id: string; data?: string }> } }
    expect(withLabel.blocks.blocks.find((b) => b.id === 'flag')!.data).toBe('label:Start walking')
    setLabel(flag, '')
    const without = Blockly.serialization.workspaces.save(ws) as { blocks: { blocks: Array<{ id: string; data?: string }> } }
    expect('data' in without.blocks.blocks.find((b) => b.id === 'flag')!).toBe(false)
  })

  it('the compiler ignores labels: same program with or without them', () => {
    const { data: _drop, ...bare } = WORKSPACE.blocks.blocks[0] as Record<string, unknown>
    void _drop
    const plain = { blocks: { languageVersion: 0, blocks: [bare, ...WORKSPACE.blocks.blocks.slice(1).map((b) => ({ ...b, data: undefined }))] } }
    const a = compileWorkspace(WORKSPACE)
    const b = compileWorkspace(plain)
    expect(a.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(a.program).toEqual(b.program)
  })

  it('only top-level hats take a label (not definitions or inner blocks)', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    expect(takesLabel(ws.getBlockById('flag')!)).toBe(true)
    expect(takesLabel(ws.getBlockById('bump')!)).toBe(true)
    expect(takesLabel(ws.getBlockById('def')!)).toBe(false)
    expect(takesLabel(ws.getBlockById('call')!)).toBe(false)
  })

  it('puts a magnifier on My Block calls and Platformer blocks, and never saves it', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    for (const id of ['call', 'grav', 'bump', 'sp']) expect(ws.getBlockById(id)!.getField('MAGNIFIER'), id).toBeTruthy()
    expect(ws.getBlockById('flag')!.getField('MAGNIFIER')).toBeNull()
    expect(ws.getBlockById('def')!.getField('MAGNIFIER')).toBeNull()
    expect(JSON.stringify(Blockly.serialization.workspaces.save(ws))).not.toContain('MAGNIFIER')
  })

  it('clicking a call\'s magnifier asks to drill into its definition; a Platformer one asks to explain', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    const drilled: string[] = []
    const explained: string[] = []
    setWorkspaceHandlers(ws, { drill: (c) => drilled.push(c), explain: (op) => explained.push(op) })
    ws.getBlockById('call')!.getField('MAGNIFIER')!.showEditor()
    ws.getBlockById('grav')!.getField('MAGNIFIER')!.showEditor()
    ws.getBlockById('bump')!.getField('MAGNIFIER')!.showEditor()
    expect(drilled).toEqual(['walk at %s'])
    expect(explained).toEqual(['platformer_setgravity', 'platformer_whenbump'])
  })

  it('the top view hides definitions; drilled in shows only that definition', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    expect(listDefinitions(ws).map((d) => d.proccode)).toEqual(['walk at %s'])
    const shown = (state: typeof TOP_VIEW) => ws.getTopBlocks(true).filter((b) => isShownIn(b, state)).map((b) => b.id)
    expect(shown(TOP_VIEW)).toEqual(['flag', 'bump'])
    expect(shown(drillInto(TOP_VIEW, 'walk at %s'))).toEqual(['def'])
    expect(shown(drillInto(TOP_VIEW, 'missing'))).toEqual([])
  })
})
