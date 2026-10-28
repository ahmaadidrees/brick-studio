import * as Blockly from 'blockly/core'
import { describe, expect, it } from 'vitest'
import { compileWorkspace, type WorkspaceBlockJson } from './compile'
import { createBlockDefinitions, registerEditorBlocks, HAT_OPCODES, CATEGORY_COLORS } from './definitions'
import { createContinuousToolbox } from './toolbox'

const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } })
const ws = (...blocks: WorkspaceBlockJson[]) => ({ blocks: { languageVersion: 0, blocks } })

const PLATFORMER_TEXT: Record<string, string> = {
  platformer_setgravity: 'turn gravity %1',
  platformer_setsolid: 'solid %1',
  platformer_setspeed: 'set %1 speed to %2',
  platformer_changespeed: 'change %1 speed by %2',
  platformer_speed: '%1 speed',
  platformer_onground: 'on ground?',
  platformer_whenbump: 'when I bump %1 of %2',
}

describe('Platformer blocks: wording', () => {
  const defs = createBlockDefinitions()
  const platformerDefs = defs.filter((d) => (d.type as string).startsWith('platformer_'))

  it('has exactly the seven Platformer blocks, worded as the STEP3 table (and no touching tile: step 7 removed it)', () => {
    expect(platformerDefs.map((d) => d.type).sort()).toEqual(Object.keys(PLATFORMER_TEXT).sort())
    for (const d of platformerDefs) {
      expect(d.message0).toBe(PLATFORMER_TEXT[d.type as string])
      expect(d.colour).toBe(CATEGORY_COLORS.platformer)
    }
  })

  it('no Platformer block text equals any Scratch block text', () => {
    const scratch = new Set(
      defs.filter((d) => !(d.type as string).startsWith('platformer_')).map((d) => d.message0 as string),
    )
    for (const d of platformerDefs) expect(scratch.has(d.message0 as string)).toBe(false)
  })

  it('the Platformer color is not shared with a Scratch category', () => {
    const others = Object.entries(CATEGORY_COLORS).filter(([k]) => k !== 'platformer').map(([, v]) => v)
    expect(others).not.toContain(CATEGORY_COLORS.platformer)
  })

  it('registers in Blockly with a bump hat and kinds as the table says', () => {
    registerEditorBlocks()
    for (const t of Object.keys(PLATFORMER_TEXT)) expect(Blockly.Blocks[t]).toBeDefined()
    expect(HAT_OPCODES).toContain('platformer_whenbump')
    const byType = Object.fromEntries(platformerDefs.map((d) => [d.type as string, d]))
    expect(byType.platformer_speed.output).toBe('Number')
    expect(byType.platformer_onground.output).toBe('Boolean')
    expect(byType.platformer_whenbump.hat).toBe('cap')
    expect(byType.platformer_setgravity.previousStatement).toBeNull()
  })
})

describe('Platformer blocks: menus', () => {
  const dropdownOptions = (type: string, name: string, ctx?: Parameters<typeof createBlockDefinitions>[0]) => {
    const def = createBlockDefinitions(ctx).find((d) => d.type === type)!
    const arg = (def.args0 as Array<{ name: string; options: unknown }>).find((a) => a.name === name)!
    const o = arg.options
    return (typeof o === 'function' ? (o as () => string[][])() : o) as string[][]
  }

  it('solid menu: on, off, only on top (step 7: one-way platform)', () => {
    expect(dropdownOptions('platformer_setsolid', 'SOLID')).toEqual([
      ['on', 'on'],
      ['off', 'off'],
      ['only on top', 'top'],
    ])
  })

  it('SIDE menu: any side, top, bottom, left, right', () => {
    expect(dropdownOptions('platformer_whenbump', 'SIDE')).toEqual([
      ['any side', '_any_'],
      ['top', 'top'],
      ['bottom', 'bottom'],
      ['left', 'left'],
      ['right', 'right'],
    ])
  })

  it('BRICK menu: anything, edge, then every brick name from the context (no tile entries since step 7)', () => {
    const opts = dropdownOptions('platformer_whenbump', 'BRICK', { getBricks: () => ['Ground', 'Coin'] })
    expect(opts).toEqual([
      ['anything', '_any_'],
      ['edge', '_edge_'],
      ['Ground', 'Ground'],
      ['Coin', 'Coin'],
    ])
  })
})

describe('Platformer blocks: workspace JSON compiles to IR', () => {
  const compileStack = (...blocks: WorkspaceBlockJson[]) => {
    const hat: WorkspaceBlockJson = { type: 'event_whenflagclicked', id: 'h' }
    let tail = hat
    for (const b of blocks) {
      tail.next = { block: b }
      tail = b
    }
    const r = compileWorkspace(ws(hat))
    expect(r.diagnostics).toEqual([])
    return r.program.scripts[0].body
  }

  it('turn gravity [on] and solid [off] keep their fields', () => {
    const body = compileStack(
      { type: 'platformer_setgravity', fields: { GRAVITY: 'on' } },
      { type: 'platformer_setsolid', fields: { SOLID: 'off' } },
    )
    expect(body.map((s) => [s.opcode, s.fields])).toEqual([
      ['platformer_setgravity', { GRAVITY: 'on' }],
      ['platformer_setsolid', { SOLID: 'off' }],
    ])
  })

  it('set / change speed carry AXIS and a SPEED input', () => {
    const body = compileStack(
      { type: 'platformer_setspeed', fields: { AXIS: 'x' }, inputs: { SPEED: num(5) } },
      { type: 'platformer_changespeed', fields: { AXIS: 'y' }, inputs: { SPEED: num(-1) } },
    )
    expect(body[0]).toMatchObject({
      opcode: 'platformer_setspeed',
      fields: { AXIS: 'x' },
      inputs: { SPEED: { kind: 'lit', value: 5 } },
    })
    expect(body[1]).toMatchObject({
      opcode: 'platformer_changespeed',
      fields: { AXIS: 'y' },
      inputs: { SPEED: { kind: 'lit', value: -1 } },
    })
  })

  it('[x] speed and on ground? compile as reporter and boolean inside an if', () => {
    const body = compileStack({
      type: 'control_if',
      inputs: {
        CONDITION: { block: { type: 'platformer_onground' } },
        SUBSTACK: {
          block: {
            type: 'data_setvariableto',
            fields: { VARIABLE: 'v' },
            inputs: { VALUE: { block: { type: 'platformer_speed', fields: { AXIS: 'y' } } } },
          },
        },
      },
    })
    expect(body[0].inputs.CONDITION).toMatchObject({ kind: 'block', opcode: 'platformer_onground', fields: {} })
    expect(body[0].branches![0][0].inputs.VALUE).toMatchObject({
      kind: 'block',
      opcode: 'platformer_speed',
      fields: { AXIS: 'y' },
    })
  })

  it('when I bump [top] of [Spikes] is a script hat with SIDE and BRICK', () => {
    const r = compileWorkspace(
      ws({
        type: 'platformer_whenbump',
        id: 'b1',
        fields: { SIDE: 'top', BRICK: 'Spikes' },
        next: { block: { type: 'looks_hide' } },
      }),
    )
    expect(r.diagnostics).toEqual([])
    expect(r.program.scripts).toHaveLength(1)
    expect(r.program.scripts[0].hat).toEqual({
      opcode: 'platformer_whenbump',
      fields: { SIDE: 'top', BRICK: 'Spikes' },
      inputs: {},
    })
    expect(r.program.scripts[0].body.map((s) => s.opcode)).toEqual(['looks_hide'])
  })

  it('bump hat defaults round-trip (_any_ / _edge_)', () => {
    const r = compileWorkspace(
      ws({ type: 'platformer_whenbump', fields: { SIDE: '_any_', BRICK: '_edge_' } }),
    )
    expect(r.program.scripts[0].hat.fields).toEqual({ SIDE: '_any_', BRICK: '_edge_' })
  })
})

describe('Platformer toolbox category', () => {
  it('is the last category (My Blocks is first), with an extension header and all eight blocks', () => {
    const t = createContinuousToolbox()
    const names = t.contents.map((c) => c.name)
    expect(names[0]).toBe('My Blocks')
    expect(names[names.length - 1]).toBe('Platformer')
    const cat = t.contents.find((c) => c.name === 'Platformer')!
    expect(cat.colour).toBe(CATEGORY_COLORS.platformer)
    expect(cat.cssConfig?.container).toBe('code-extension-category')
    expect(cat.contents![0]).toEqual({ kind: 'label', text: 'Platformer extension' })
    const types = cat.contents!.flatMap((i) => (i.kind === 'block' ? [i.type] : []))
    expect(types.sort()).toEqual(Object.keys(PLATFORMER_TEXT).sort())
  })

  it('the Stage toolbox has no Platformer category', () => {
    expect(createContinuousToolbox(undefined, { isStage: true }).contents.map((c) => c.name)).not.toContain(
      'Platformer',
    )
  })
})

describe('Platformer blocks: removed touching tile', () => {
  it('is not in the toolbox or the block definitions', () => {
    expect(createBlockDefinitions().some((d) => d.type === 'platformer_touchingtile')).toBe(false)
    expect(JSON.stringify(createContinuousToolbox())).not.toContain('platformer_touchingtile')
  })

  it('an old workspace that still holds it compiles, with a clear unknown-block warning and no crash', () => {
    const hat: WorkspaceBlockJson = { type: 'event_whenflagclicked', id: 'h' }
    hat.next = {
      block: {
        type: 'control_if',
        id: 'if1',
        inputs: { CONDITION: { block: { type: 'platformer_touchingtile', id: 'tt', fields: { TILE: 'spikes' } } } },
      },
    }
    const r = compileWorkspace(ws(hat))
    expect(r.program.scripts).toHaveLength(1)
    expect(r.diagnostics).toHaveLength(1)
    expect(r.diagnostics[0]).toMatchObject({ code: 'block.unknown', severity: 'warning', blockId: 'tt' })
    expect(r.diagnostics[0].message).toContain('touching tile')
    // As a statement-position block too.
    const r2 = compileWorkspace(ws({ ...hat, next: { block: { type: 'platformer_touchingtile', id: 'tt2' } } }))
    expect(r2.diagnostics.map((d) => d.code)).toEqual(['block.unknown'])
  })
})
