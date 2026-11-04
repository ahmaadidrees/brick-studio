/**
 * Hackable 3D's bricks in the code editor (D1): every 3D Hero, code brick and Stage workspace opens in Blockly with the
 * 3D editor context and closes again compiling to exactly the program it had, with no warnings. Then every block the 3D
 * palette offers goes into a "when flag clicked" script, compiles, and runs in a 3D game for a second.
 *
 * Same load / save path as the code editor (CodeEditor.tsx) and workspaceRoundTrip.test.ts.
 */
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { beforeAll, describe, expect, it } from 'vitest'
import { ALL_PRIMITIVES, createRuntime } from '../core'
import { compileWorkspace, type WorkspaceJson } from '../core/editor/compile'
import { setEditorContext } from '../core/editor/context'
import { isHatOpcode, registerEditorBlocks } from '../core/editor/definitions'
import { createContinuousToolbox, registerToolboxPlugins, type ToolboxBlock } from '../core/editor/toolbox'
import { kit3dPrimitives } from '../kit3d/blocks3d'
import type { LevelDesign3 } from '../kit3d/contracts3d'
import { HERO3D } from '../kit3d/engine3d'
import { buildEditorContext } from './code/context'
import { screensFor } from './kitScreens'
import { STAGE_ID, StudioStore } from './store'
import {
  createBouncePad3d,
  createButton3d,
  createCoin3d,
  createDoor3d,
  createGoal3d,
  createHero3d,
  createMover3d,
  createSpinner3d,
  createStage3dWorkspace,
  STAGE_VARIABLES_3D,
  type Made3,
} from './three/bricks3d'
import { createStarter3dProject } from './three/project3d'

beforeAll(() => {
  registerToolboxPlugins()
})

/** The editor's own context for the open brick, its blocks registered with it, then load and save as the editor does. */
function throughBlockly(store: StudioStore, workspace: unknown): WorkspaceJson {
  const ctx = buildEditorContext(store)
  expect(ctx.kit).toBe('3d')
  setEditorContext(ctx)
  registerEditorBlocks(ctx)
  const ws = new Blockly.Workspace()
  try {
    Blockly.serialization.workspaces.load(JSON.parse(JSON.stringify(workspace)), ws)
    return Blockly.serialization.workspaces.save(ws) as WorkspaceJson
  } finally {
    ws.dispose()
  }
}

const BRICKS: Array<[string, (id: string) => Made3]> = [
  ['createHero3d', (id) => createHero3d(id)],
  ['createBouncePad3d', createBouncePad3d],
  ['createMover3d', createMover3d],
  ['createSpinner3d', createSpinner3d],
  ['createCoin3d', createCoin3d],
  ['createGoal3d', createGoal3d],
  ['createButton3d', createButton3d],
  ['createDoor3d', createDoor3d],
]

describe('Hackable 3D workspaces open and close in the editor unchanged', () => {
  for (const [name, make] of BRICKS) {
    it(`${name}: loads with the 3D context and compiles back to the same program, no diagnostics`, () => {
      const store = new StudioStore(createStarter3dProject())
      const made = make(name === 'createHero3d' ? 'brick_hero3d_copy' : 'brick3d_test')
      const id = store.addBrickFrom(made.brick, made.workspace) // selects the new brick
      const before = store.brick(id)!.program
      const workspace = store.getState().project.workspaces[id] as WorkspaceJson
      expect(compileWorkspace(workspace, { variables: before.variables }).diagnostics).toEqual([])
      const saved = throughBlockly(store, workspace)
      store.setWorkspace(id, saved)
      expect(store.getState().diagnostics[id] ?? []).toEqual([])
      expect(store.brick(id)!.program).toEqual(before)
    })
  }

  it('the starter\'s own bricks and its Stage do too', () => {
    const project = createStarter3dProject()
    for (const id of [...project.design.bricks.map((b) => b.id), STAGE_ID]) {
      const store = new StudioStore(createStarter3dProject())
      store.selectBrick(id)
      const before = store.brick(id)!.program
      const saved = throughBlockly(store, store.getState().project.workspaces[id])
      store.setWorkspace(id, saved)
      expect(store.getState().diagnostics[id] ?? [], id).toEqual([])
      expect(store.brick(id)!.program, id).toEqual(before)
    }
  })

  it('createStage3dWorkspace compiles back to the same program, no diagnostics', () => {
    const store = new StudioStore(createStarter3dProject())
    store.selectBrick(STAGE_ID)
    const workspace = createStage3dWorkspace()
    const before = compileWorkspace(workspace, { variables: STAGE_VARIABLES_3D })
    expect(before.diagnostics).toEqual([])
    const after = compileWorkspace(throughBlockly(store, workspace), { variables: STAGE_VARIABLES_3D })
    expect(after.diagnostics).toEqual([])
    expect(after.program).toEqual(before.program)
  })
})

describe('every block the 3D palette offers compiles and runs in a 3D game', () => {
  const store = new StudioStore(createStarter3dProject())
  store.selectBrick(HERO3D)
  const palette = screensFor(store.getState().project.design).toolbox
  const toolbox = createContinuousToolbox(buildEditorContext(store), { palette })
  // Motion's z blocks and the whole 3D category: the blocks this kit adds or changes.
  const entries = toolbox.contents
    .filter((c) => c.name === 'Motion' || c.name === '3D')
    .flatMap((c) => (c.contents ?? []).filter((i): i is ToolboxBlock => i.kind === 'block'))
  const engine = { ...ALL_PRIMITIVES, ...kit3dPrimitives }

  it('covers the 3D category and the z blocks', () => {
    const types = entries.map((e) => e.type)
    for (const t of ['kit3d_gotoxyz', 'kit3d_changez', 'kit3d_setz', 'kit3d_zposition', 'kit3d_launchlanders', 'kit3d_gohome', 'platformer_whenbump']) expect(types).toContain(t)
  })

  for (const entry of entries) {
    it(entry.type, () => {
      const ctx = buildEditorContext(store)
      setEditorContext(ctx)
      registerEditorBlocks(ctx)
      const ws = new Blockly.Workspace()
      let saved: WorkspaceJson
      try {
        const flag = ws.newBlock('event_whenflagclicked')
        const { kind: _kind, ...state } = entry
        const block = Blockly.serialization.blocks.append(state as unknown as Blockly.serialization.blocks.State, ws) as Blockly.Block
        if (!isHatOpcode(entry.type)) {
          if (block.previousConnection) flag.nextConnection!.connect(block.previousConnection)
          else {
            const bool = block.outputConnection!.getCheck()?.includes('Boolean')
            const holder = ws.newBlock(bool ? 'control_if' : 'looks_say')
            holder.getInput(bool ? 'CONDITION' : 'MESSAGE')!.connection!.connect(block.outputConnection!)
            flag.nextConnection!.connect(holder.previousConnection!)
          }
        }
        // Pick the 3D-only menu choices where a block has them, so they are what runs.
        if (block.getField('AXIS')) block.setFieldValue('z', 'AXIS')
        if (block.getField('SIDE')) block.setFieldValue('front', 'SIDE')
        expect(block.getField('AXIS')?.getValue() ?? 'z').toBe('z')
        saved = Blockly.serialization.workspaces.save(ws) as WorkspaceJson
      } finally {
        ws.dispose()
      }
      const { program, diagnostics } = compileWorkspace(saved)
      expect(diagnostics).toEqual([])
      const opcodes = JSON.stringify(program).match(/"opcode":"[a-z0-9_]+"/g)!.map((m) => m.slice(10, -1))
      expect(opcodes).toContain(entry.type)
      for (const op of opcodes) if (!isHatOpcode(op) && !op.startsWith('control_') && !op.startsWith('procedures_')) expect(engine[op], op).toBeTypeOf('function')

      // A second of a 3D game with the Hero running it.
      const design = createStarter3dProject().design as LevelDesign3
      const hero = design.bricks.find((b) => b.id === HERO3D)!
      hero.program = { ...hero.program, scripts: [...hero.program.scripts, ...program.scripts] }
      const rt = createRuntime(design)
      rt.greenFlag()
      for (let i = 0; i < 30; i++) rt.step()
    })
  }
})
