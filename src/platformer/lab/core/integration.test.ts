/**
 * End to end across every lane: Blockly workspace JSON → compiler → level design → Play → ticks.
 */
import { describe, expect, it } from 'vitest'
import type { LevelDesign } from './contracts'
import { compileWorkspace } from './editor/compile'
import { play } from './index'
import { CURRENT_EDITOR_VERSION, CURRENT_ENGINE_SEMANTICS_VERSION, CURRENT_SCHEMA_VERSION, DEFAULT_PLUGIN_VERSIONS, parse, serialize } from './save'

const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } })

/** when ⚑ clicked: repeat 10 { change x by (speed) }, create clone of myself. when I start as a clone: change y by 30. */
const walkerWorkspace = {
  variables: [{ id: 'v_speed', name: 'speed' }],
  blocks: {
    blocks: [
      {
        type: 'event_whenflagclicked',
        id: 'flag',
        next: {
          block: {
            type: 'control_repeat',
            id: 'rep',
            inputs: {
              TIMES: num(10),
              SUBSTACK: {
                block: {
                  type: 'motion_changexby',
                  id: 'cx',
                  inputs: { DX: { shadow: { type: 'math_number', fields: { NUM: 0 } }, block: { type: 'data_variable', id: 'rv', fields: { VARIABLE: { id: 'v_speed' } } } } },
                },
              },
            },
            next: { block: { type: 'control_create_clone_of', id: 'mk', fields: { CLONE_OPTION: '_myself_' } } },
          },
        },
      },
      {
        type: 'control_start_as_clone',
        id: 'cloned',
        next: { block: { type: 'motion_changeyby', id: 'cy', inputs: { DY: num(30) } } },
      },
    ],
  },
}

function design(): LevelDesign {
  const { program, diagnostics } = compileWorkspace(walkerWorkspace, {
    variables: [{ id: 'v_speed', name: 'speed', value: 2, showInBuild: true }],
  })
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  return {
    id: 'lvl',
    name: 'Test level',
    seed: 7,
    bounds: { left: 0, right: 960, bottom: 0, top: 360 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks: [
      {
        id: 'walker',
        name: 'Walker',
        costumes: [{ name: 'idle', width: 16, height: 16, rotationCenterX: 8, rotationCenterY: 8 }],
        sounds: [],
        program,
      },
    ],
    copies: [
      { id: 'a', brickId: 'walker', x: 100, y: 100, knobs: { v_speed: 5 } },
      { id: 'b', brickId: 'walker', x: 200, y: 100 },
    ],
  }
}

describe('Code Lab core integration', () => {
  it('runs a compiled brick on painted copies with per-copy knobs, frame pacing and clones', () => {
    const d = design()
    const rt = play(d)
    const [a, b] = rt.world.targets

    rt.step()
    // A visible move requests a redraw, so each loop pass waits for the next tick (F03–F07).
    expect([a.x, b.x]).toEqual([105, 202])

    for (let i = 0; i < 12; i++) rt.step()
    expect([a.x, b.x]).toEqual([150, 220])

    const clones = rt.world.targets.filter((t) => t.isClone)
    expect(clones).toHaveLength(2)
    expect(clones.map((c) => [c.x, c.y]).sort()).toEqual([
      [150, 130],
      [220, 130],
    ])
    // Clones copy local variables (C01, C11).
    expect(clones.map((c) => c.variables.v_speed).sort()).toEqual([2, 5])
    // Play never mutates the design (decision 1).
    expect(d.copies[0].x).toBe(100)
  })

  it('Play restarts from the saved design; the green flag alone does not (H01)', () => {
    const d = design()
    const rt = play(d)
    for (let i = 0; i < 15; i++) rt.step()
    const a = rt.world.targets.find((t) => t.copyId === 'a')!
    expect(a.x).toBe(150)

    rt.greenFlag()
    expect(rt.world.targets.filter((t) => t.isClone)).toHaveLength(0)
    expect(a.x).toBe(150)

    const fresh = play(d)
    expect(fresh.world.targets.find((t) => t.copyId === 'a')!.x).toBe(100)
  })

  it('replays identically from the same design', () => {
    const run = () => {
      const rt = play(design())
      for (let i = 0; i < 20; i++) rt.step()
      return JSON.stringify(rt.world.targets.map((t) => [t.copyId, t.isClone, t.x, t.y]))
    }
    expect(run()).toBe(run())
  })

  it('saves and reloads code whose ids come from Blockly (punctuation in block and variable ids)', () => {
    const blocklyIds = JSON.parse(
      JSON.stringify(walkerWorkspace)
        .replaceAll('"flag"', '"]4inN;!9sbH@RLzk#o$P"')
        .replaceAll('"cx"', '"7jo)a4Y[;[T8^vYp+-=X"')
        .replaceAll('v_speed', 'q(4`Zr|k~H/2,a.Bm{x}'),
    )
    const { program } = compileWorkspace(blocklyIds, { variables: [{ id: 'q(4`Zr|k~H/2,a.Bm{x}', name: 'speed', value: 2, showInBuild: true }] })
    const d = design()
    d.bricks[0].program = program
    d.copies[0].knobs = { 'q(4`Zr|k~H/2,a.Bm{x}': 5 }
    const text = serialize({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      engineSemanticsVersion: CURRENT_ENGINE_SEMANTICS_VERSION,
      editorVersion: CURRENT_EDITOR_VERSION,
      pluginVersions: { ...DEFAULT_PLUGIN_VERSIONS },
      design: d,
      workspaces: { walker: blocklyIds },
    })
    const result = parse(text)
    expect(result.ok ? [] : result.problems).toEqual([])
  })
})
