/**
 * A block this version does not have never silently does nothing: compiling says so, on that block, in plain words.
 * What it compiles to is unchanged (it still does nothing at runtime), so a project that held one plays as before.
 */
import { describe, expect, it } from 'vitest'
import { compileWorkspace, UNKNOWN_BLOCK_MESSAGE, type WorkspaceBlockJson } from './compile'

const flag = (...body: WorkspaceBlockJson[]): WorkspaceBlockJson => {
  const chain = body.reduceRight<WorkspaceBlockJson | undefined>((next, b) => ({ ...b, ...(next ? { next: { block: next } } : {}) }), undefined)
  return { type: 'event_whenflagclicked', id: 'hat', ...(chain ? { next: { block: chain } } : {}) }
}
const compileTop = (...blocks: WorkspaceBlockJson[]) => compileWorkspace({ blocks: { languageVersion: 0, blocks } })

describe('unknown blocks', () => {
  it('a stack block this version does not have gets a diagnostic on that block', () => {
    const { program, diagnostics } = compileTop(flag({ type: 'motion_movesteps', id: 'ok' }, { type: 'hack_teleport', id: 'bad' }))
    expect(diagnostics).toEqual([{ message: UNKNOWN_BLOCK_MESSAGE, severity: 'warning', code: 'block.unknown', blockId: 'bad' }])
    expect(UNKNOWN_BLOCK_MESSAGE).toBe('This block isn’t part of Brickgineers, so it can’t run.')
    // Compiled as before: it is still in the program, and the runtime has nothing to run for it.
    expect(program.scripts[0].body.map((s) => s.opcode)).toEqual(['motion_movesteps', 'hack_teleport'])
  })

  it('an unknown reporter, shadow, or block inside a C-block or a My Block is caught too', () => {
    const { diagnostics } = compileTop(
      flag({
        type: 'control_if',
        id: 'if',
        inputs: {
          CONDITION: { block: { type: 'logic_compare', id: 'cmp' } },
          SUBSTACK: { block: { type: 'motion_movesteps', id: 'mv', inputs: { STEPS: { shadow: { type: 'mystery_number', id: 'sh' } } } } },
        },
      }),
      { type: 'procedures_definition', id: 'def', extraState: { proccode: 'zap', argumentNames: [] }, next: { block: { type: 'controls_repeat_ext', id: 'rep' } } },
    )
    expect(diagnostics.map((d) => d.blockId).sort()).toEqual(['cmp', 'rep', 'sh'])
    expect(diagnostics.every((d) => d.message === UNKNOWN_BLOCK_MESSAGE)).toBe(true)
  })

  it('an unknown block on its own says it cannot run (not just that it is not connected)', () => {
    const { diagnostics } = compileTop({ type: 'hack_teleport', id: 'alone' }, { type: 'motion_movesteps', id: 'loose' })
    expect(diagnostics).toEqual([
      { message: UNKNOWN_BLOCK_MESSAGE, severity: 'warning', code: 'block.unknown', blockId: 'alone' },
      expect.objectContaining({ code: 'block.disconnected', blockId: 'loose' }),
    ])
  })

  it('known blocks, literals and My Block inputs give no diagnostic', () => {
    const { diagnostics } = compileTop(
      flag(
        { type: 'motion_movesteps', id: 'a', inputs: { STEPS: { shadow: { type: 'math_number', fields: { NUM: 3 } } } } },
        { type: 'looks_say', id: 'b', inputs: { MESSAGE: { shadow: { type: 'text', fields: { TEXT: 'hi' } } } } },
        { type: 'procedures_call', id: 'c', extraState: { proccode: 'jump %s', argumentNames: ['n'] }, inputs: { n: { block: { type: 'argument_reporter_string_number', fields: { VALUE: 'n' } } } } },
      ),
    )
    expect(diagnostics).toEqual([])
  })

  it('a removed block keeps its own message', () => {
    const { diagnostics } = compileTop(flag({ type: 'control_if', id: 'if', inputs: { CONDITION: { block: { type: 'platformer_touchingtile', id: 'old' } } } }))
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({ code: 'block.unknown', blockId: 'old' })
    expect(diagnostics[0].message).toMatch(/touching tile/)
  })

  it('a turned-off script is skipped, unknown blocks and all', () => {
    expect(compileTop({ ...flag({ type: 'hack_teleport', id: 'bad' }), enabled: false }).diagnostics).toEqual([])
  })
})
