/**
 * The 3D blocks in the editor (Hackable 3D D1): their definitions match the runtime (kit3d/blocks3d.ts), the speed and
 * bump menus gain z, front and back in a 3D project only, and the Platformer blocks are drawn in the 3D colour there.
 */
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { afterEach, describe, expect, it } from 'vitest'
import { kit3dPrimitives } from '../../kit3d/blocks3d'
import { compileWorkspace } from './compile'
import { defaultEditorContext, setEditorContext, type EditorContext } from './context'
import { CATEGORY_COLORS, createBlockDefinitions, registerEditorBlocks } from './definitions'

const KIT3D_TYPES = ['kit3d_gotoxyz', 'kit3d_changez', 'kit3d_setz', 'kit3d_zposition', 'kit3d_launchlanders', 'kit3d_gohome']
const STUDS = 'Studs are brick widths: a 2 × 4 brick is 2 studs by 4 studs.'
const ctx3d: EditorContext = { ...defaultEditorContext, kit: '3d', getBricks: () => ['Hero'] }

const defOf = (type: string, ctx?: EditorContext) => createBlockDefinitions(ctx).find((d) => d.type === type)!
const argNames = (type: string) => ((defOf(type).args0 as Array<{ name: string }> | undefined) ?? []).map((a) => a.name)
const options = (type: string, name: string, ctx?: EditorContext) => {
  const arg = (defOf(type, ctx).args0 as Array<{ name: string; options: unknown }>).find((a) => a.name === name)!
  return (typeof arg.options === 'function' ? (arg.options as () => string[][])() : arg.options) as string[][]
}

let restore = () => {}
afterEach(() => {
  restore()
  restore = () => {}
  registerEditorBlocks(defaultEditorContext)
})

describe('3D block definitions', () => {
  it('match the runtime: the same opcodes and input names', () => {
    for (const type of KIT3D_TYPES) expect(kit3dPrimitives[type], type).toBeTypeOf('function')
    expect(argNames('kit3d_gotoxyz')).toEqual(['X', 'Y', 'Z'])
    expect(argNames('kit3d_changez')).toEqual(['DZ'])
    expect(argNames('kit3d_setz')).toEqual(['Z'])
    expect(argNames('kit3d_zposition')).toEqual([])
    expect(argNames('kit3d_launchlanders')).toEqual(['SPEED'])
    expect(argNames('kit3d_gohome')).toEqual([])
    expect(defOf('kit3d_zposition').output).toBe('Number')
  })

  it('read as the mock says, and every distance block explains studs', () => {
    expect(defOf('kit3d_gotoxyz').message0).toBe('go to x: %1 y: %2 z: %3')
    expect(defOf('kit3d_changez').message0).toBe('change z by %1')
    expect(defOf('kit3d_setz').message0).toBe('set z to %1')
    expect(defOf('kit3d_zposition').message0).toBe('z position')
    expect(defOf('kit3d_launchlanders').message0).toBe('launch who landed on me up at %1')
    expect(defOf('kit3d_gohome').message0).toBe('go back to where I started')
    for (const type of KIT3D_TYPES.filter((t) => t !== 'kit3d_gohome')) expect(String(defOf(type).tooltip), type).toContain(STUDS)
    expect(String(defOf('kit3d_gotoxyz').tooltip)).toContain('The middle of the build plate is 0, 0, 0.')
  })
})

describe('3D menus', () => {
  it('in a 2D project, the speed and bump menus are exactly as before', () => {
    for (const ctx of [undefined, defaultEditorContext, { ...defaultEditorContext, kit: 'platformer' as const }, { ...defaultEditorContext, kit: 'race' as const }]) {
      for (const type of ['platformer_setspeed', 'platformer_changespeed', 'platformer_speed', 'platformer_moveuntilhit']) {
        expect(options(type, 'AXIS', ctx), type).toEqual([['x', 'x'], ['y', 'y']])
      }
      expect(options('platformer_whenbump', 'SIDE', ctx)).toEqual([['any side', '_any_'], ['top', 'top'], ['bottom', 'bottom'], ['left', 'left'], ['right', 'right']])
    }
  })

  it('in a 3D project, speed offers x, y and z, and bump adds front and back', () => {
    for (const type of ['platformer_setspeed', 'platformer_changespeed', 'platformer_speed']) {
      expect(options(type, 'AXIS', ctx3d), type).toEqual([['x', 'x'], ['y', 'y'], ['z', 'z']])
    }
    // "move until I hit something" is a 2D block (hidden in 3D): it keeps x and y.
    expect(options('platformer_moveuntilhit', 'AXIS', ctx3d)).toEqual([['x', 'x'], ['y', 'y']])
    expect(options('platformer_whenbump', 'SIDE', ctx3d)).toEqual([
      ['any side', '_any_'], ['top', 'top'], ['bottom', 'bottom'], ['left', 'left'], ['right', 'right'], ['front', 'front'], ['back', 'back'],
    ])
  })

  it('read the active context when the blocks were made without one', () => {
    restore = setEditorContext(ctx3d)
    expect(options('platformer_speed', 'AXIS')).toEqual([['x', 'x'], ['y', 'y'], ['z', 'z']])
  })

  it('a 3D script with z and front loads, saves and compiles unchanged', () => {
    restore = setEditorContext(ctx3d)
    registerEditorBlocks(ctx3d)
    const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } })
    const json = {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'platformer_whenbump', id: 'hat', x: 0, y: 0, fields: { SIDE: 'front', BRICK: 'Hero' },
            next: { block: { type: 'platformer_setspeed', id: 's', fields: { AXIS: 'z' }, inputs: { SPEED: num(3) },
              next: { block: { type: 'kit3d_gotoxyz', id: 'g', inputs: { X: num(1), Y: num(2), Z: num(3) } } } } },
          },
        ],
      },
    }
    const ws = new Blockly.Workspace()
    try {
      Blockly.serialization.workspaces.load(JSON.parse(JSON.stringify(json)), ws)
      const saved = Blockly.serialization.workspaces.save(ws)
      const before = compileWorkspace(json)
      const after = compileWorkspace(saved)
      expect(after.diagnostics).toEqual([])
      expect(after.program).toEqual(before.program)
      const script = after.program.scripts[0]
      expect(script.hat.fields).toEqual({ SIDE: 'front', BRICK: 'Hero' })
      expect(script.body[0].fields).toEqual({ AXIS: 'z' })
      expect(script.body[1].opcode).toBe('kit3d_gotoxyz')
    } finally {
      ws.dispose()
    }
  })
})

describe('Platformer blocks in the 3D colour', () => {
  const colourOf = (type: string) => {
    const ws = new Blockly.Workspace()
    try {
      return ws.newBlock(type).getColour().toLowerCase()
    } finally {
      ws.dispose()
    }
  }

  it('are drawn in the 3D colour in a 3D project, with studs in the speed tips', () => {
    restore = setEditorContext(ctx3d)
    registerEditorBlocks(ctx3d)
    for (const type of ['platformer_everytick', 'platformer_whenbump', 'platformer_setgravity', 'platformer_setspeed', 'platformer_onground']) {
      expect(colourOf(type), type).toBe(CATEGORY_COLORS.threeD.toLowerCase())
    }
    expect(colourOf('kit3d_launchlanders')).toBe(CATEGORY_COLORS.threeD.toLowerCase())
    expect(colourOf('kit3d_gotoxyz')).toBe(CATEGORY_COLORS.motion.toLowerCase())
    const ws = new Blockly.Workspace()
    try {
      expect(String(ws.newBlock('platformer_setspeed').tooltip)).toContain('studs a second')
    } finally {
      ws.dispose()
    }
  })

  it('keep the Platformer colour and words in a 2D project', () => {
    restore = setEditorContext(defaultEditorContext)
    registerEditorBlocks(defaultEditorContext)
    expect(colourOf('platformer_setgravity')).toBe(CATEGORY_COLORS.platformer.toLowerCase())
    const ws = new Blockly.Workspace()
    try {
      expect(String(ws.newBlock('platformer_setspeed').tooltip)).not.toContain('studs')
    } finally {
      ws.dispose()
    }
  })
})
