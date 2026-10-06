import { describe, expect, it } from 'vitest'
import { TILE_KINDS } from './contracts'
import { compileWorkspace } from './editor/compile'
import { CATEGORY_COLORS } from './editor/definitions'
import { TILE_BLOCK_DEFINITIONS, TILE_BRICK_OPTION, TILE_KIND_OPTIONS, TILE_TOOLBOX_ENTRY } from './editor/tileBlocks'

describe('tile block definition (for the integrator to wire in)', () => {
  const def = TILE_BLOCK_DEFINITIONS[0]

  it('is a Platformer boolean worded "touching tile [kind]?" with a TILE dropdown of every tile kind', () => {
    expect(def.type).toBe('platformer_touchingtile')
    expect(def.message0).toBe('touching tile %1?')
    expect(def.output).toBe('Boolean')
    expect(def.colour).toBe(CATEGORY_COLORS.platformer)
    expect(def.args0[0].name).toBe('TILE')
    expect(TILE_KIND_OPTIONS.map(([, v]) => v)).toEqual([...TILE_KINDS])
  })

  it('has a toolbox entry defaulting to spikes, and the "a tile" bump menu option', () => {
    expect(TILE_TOOLBOX_ENTRY).toEqual({ kind: 'block', type: 'platformer_touchingtile', fields: { TILE: 'spikes' } })
    expect(TILE_BRICK_OPTION).toEqual(['a tile', '_tiles_'])
  })

  it('a workspace using it compiles to the expected IR with zero errors', () => {
    const workspace = {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'event_whenflagclicked',
            id: 'h',
            next: {
              block: {
                type: 'control_if',
                id: 'i',
                inputs: { CONDITION: { block: { type: 'platformer_touchingtile', id: 't', fields: { TILE: 'lava' } } } },
              },
            },
          },
        ],
      },
    }
    const result = compileWorkspace(workspace)
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    const cond = result.program.scripts[0].body[0].inputs.CONDITION
    expect(cond).toMatchObject({ kind: 'block', opcode: 'platformer_touchingtile', fields: { TILE: 'lava' } })
  })
})
