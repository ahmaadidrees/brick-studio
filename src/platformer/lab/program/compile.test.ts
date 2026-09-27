import { describe, expect, it } from 'vitest'
import { BUILTIN_BRICKS } from '../bricks/builtins'
import { block, program, remove, hurt, setSpeed, when, make, launch, forever, repeat, type WorkspaceJson } from '../bricks/dsl'
import { carProgram, ledgeWalkerProgram, rocketProgram } from '../bricks/recipes'
import { applyRecipe, starterDoc, brickDef, allBricks } from '../level/doc'
import { LAB_BLOCK_DEFINITIONS, labToolbox, createBlockDefinitions } from './catalog'
import { compileProgram, describeIR, listKey } from './compile'
import { programText } from './text'
import { LAB_LIMITS, type CompileContext } from './types'

const ctx = (): CompileContext => ({ bricks: allBricks(starterDoc()).map((b) => ({ id: b.id, name: b.name })).concat([{ id: 'car', name: 'Car' }, { id: 'rocket', name: 'Rocket' }]) })

describe('the block catalog', () => {
  it('defines every toolbox block, each with a lab_ type, a tooltip and a colour', () => {
    const types = new Set(LAB_BLOCK_DEFINITIONS.map((d) => d.type))
    for (const cat of labToolbox().contents) for (const b of cat.contents) expect(types.has(b.type as `lab_${string}`), b.type).toBe(true)
    for (const d of LAB_BLOCK_DEFINITIONS) {
      expect(d.type.startsWith('lab_')).toBe(true)
      expect(d.tooltip.length).toBeGreaterThan(5)
      expect(d.colour).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('only ever shows picked words: no free-text fields anywhere', () => {
    for (const d of LAB_BLOCK_DEFINITIONS) {
      for (const args of [d.args0, d.args1, d.args2, d.args3]) {
        for (const a of args ?? []) expect(['field_dropdown', 'field_number', 'input_value', 'input_statement']).toContain(a.type)
      }
    }
  })

  it('makes the level-dependent dropdowns ask a provider', () => {
    const asked: string[] = []
    const defs = createBlockDefinitions((menu) => {
      asked.push(menu)
      return menu === 'brick' ? [['Car', 'car']] : [['the player', 'player']]
    })
    const makeDef = defs.find((d) => d.type === 'lab_make')!
    const brickField = (makeDef.args0 as { name: string; options: unknown }[]).find((a) => a.name === 'BRICK')!
    expect(typeof brickField.options).toBe('function')
    expect((brickField.options as () => unknown)()).toEqual([['Car', 'car']])
    expect(asked).toEqual(['brick'])
  })
})

describe('compiling', () => {
  it('compiles every built-in brick and recipe with no problems', () => {
    const doc = starterDoc()
    const programs: [string, unknown][] = BUILTIN_BRICKS.map((b) => [b.id, b.program])
    programs.push(['car', carProgram()], ['rocket', rocketProgram()], ['ledge', ledgeWalkerProgram()])
    for (const r of ['double-jump', 'throw'] as const) programs.push([r, brickDef(applyRecipe(doc, r).doc, 'you')!.program])
    for (const [id, p] of programs) {
      const c = compileProgram(p, ctx())
      expect(c.diagnostics, id).toEqual([])
      expect(c.ok).toBe(true)
      expect(c.ir.scripts.length, id).toBeGreaterThan(0)
    }
  })

  it('turns the Walker into readable IR, one statement per block', () => {
    const walker = BUILTIN_BRICKS.find((b) => b.id === 'walker')!
    const c = compileProgram(walker.program, ctx())
    expect(describeIR(c.ir)).toBe(
      [
        'when appear',
        '  forever',
        '    setSpeed who=me dir=forward value=0.5',
        '    if probe(wall, ahead)',
        '      turnAround',
        'when touch brick:walker side',
        '  turnAround',
        'when touch player side',
        '  hurt who=them',
        'when stomped',
        '  setSpeed who=them dir=up value=4',
        '  sound sound=squish',
        '  remove who=me',
        'when hurt',
        '  sound sound=kick',
        '  remove who=me',
      ].join('\n'),
    )
    // Statement lists are indexed by owner and arm, for the runtime and for live edits.
    const forever = c.ir.scripts[0].body[0]
    expect(c.lists.get(listKey(c.ir.scripts[0].id, 'body'))).toBe(c.ir.scripts[0].body)
    expect(c.lists.get(listKey(forever.blockId, 'do'))?.length).toBe(2)
    expect(new Set(c.stmts.keys()).size).toBe(c.stmts.size)
  })

  it('tells, not blames: “them” outside a touch script, “it” with nothing made, loose blocks, a missing brick', () => {
    const p = program('t', when.appear(hurt('them'), setSpeed('it', 'up', 3)), when.key('z', make('nope', 'hand')))
    p.blocks.blocks.push({ type: 'lab_turn_around', id: 'loose', x: 400, y: 0 })
    const c = compileProgram(p, ctx())
    const codes = c.diagnostics.map((d) => d.code)
    expect(codes).toContain('program.them-outside-touch')
    expect(codes).toContain('program.loose-blocks')
    expect(codes).toContain('program.brick-missing')
    // "it" has a make in this program, so no warning about it.
    expect(codes).not.toContain('program.it-without-make')
    expect(c.ok).toBe(true)
    const noMake = compileProgram(program('u', when.appear(launch('it', 45, 5))), ctx())
    expect(noMake.diagnostics.map((d) => d.code)).toEqual(['program.it-without-make'])
    expect(noMake.diagnostics[0].message).toMatch(/^“it” is the thing I made last/)
  })

  it('refuses unknown blocks and bad dropdown values as errors, never throwing', () => {
    const bad: WorkspaceJson = program('b', when.appear(block('js_eval', { CODE: 'alert(1)' }), block('lab_set_speed', { WHO: 'everyone', DIR: 'up' }, { VALUE: 1 })))
    const c = compileProgram(bad, ctx())
    expect(c.ok).toBe(false)
    expect(c.diagnostics.filter((d) => d.code === 'program.unknown-block')).toHaveLength(2)
    expect(compileProgram('{not json', ctx()).ok).toBe(false)
    expect(compileProgram(null, ctx()).diagnostics[0].code).toBe('program.no-scripts')
    expect(compileProgram({ blocks: { blocks: [42, 'x', null] } }, ctx()).ok).toBe(true)
  })

  it('bounds size and nesting before walking anything', () => {
    let deep = forever()
    for (let i = 0; i < LAB_LIMITS.maxDepth + 2; i++) deep = repeat(2, deep)
    const tooDeep = compileProgram(program('d', when.appear(deep)), ctx())
    expect(tooDeep.ok).toBe(false)
    expect(tooDeep.diagnostics[0].code).toBe('program.too-big')
    const many = program('m', when.appear(...Array.from({ length: LAB_LIMITS.maxBlocks }, () => remove('me'))))
    expect(compileProgram(many, ctx()).diagnostics[0].code).toBe('program.too-big')
  })
})

describe('the text views', () => {
  it('print the Walker as JavaScript and as Python, from the same IR the runtime runs', () => {
    const walker = BUILTIN_BRICKS.find((b) => b.id === 'walker')!
    const ir = compileProgram(walker.program, ctx()).ir
    const js = programText(ir, 'js', ctx().bricks)
    const py = programText(ir, 'py', ctx().bricks)
    expect(js).toContain('when("appear", async () => {')
    expect(js).toContain('me.setSpeed("forward", 0.5)')
    expect(js).toContain('if (isThere("wall", "ahead")) {')
    expect(js).toContain('when("touch", "Walker", "on my side", async (them) => {')
    expect(py).toContain('@when_appear()')
    expect(py).toContain('while True:')
    expect(py).toContain('me.set_speed("forward", 0.5)')
    expect(py).toContain('def script_3(them):')
  })

  it('print every built-in and recipe without trouble', () => {
    const doc = starterDoc()
    const programs: unknown[] = [...BUILTIN_BRICKS.map((b) => b.program), carProgram(), rocketProgram(), ledgeWalkerProgram(), brickDef(applyRecipe(doc, 'throw').doc, 'you')!.program]
    for (const p of programs) {
      const ir = compileProgram(p, ctx()).ir
      for (const lang of ['js', 'py'] as const) expect(programText(ir, lang, ctx().bricks).length).toBeGreaterThan(20)
    }
  })
})
