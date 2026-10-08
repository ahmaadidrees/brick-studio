/**
 * Regression: opening a brick in the workshop and pressing Done must never damage the save.
 *
 * The Walker's "walk at (speed)" definition holds a parameter reporter. Blockly never serialises a plain label field, so
 * the reporter came back from every save with no name, the compiled program held an empty-named parameter, and
 * `validateDesign` rejected the whole project ("unsafe-name"). On reload the kid silently got the starter back.
 *
 * This runs every brick of the starter and every New-brick template through the same Blockly load / save path the code
 * editor uses, then through store.setWorkspace, serialize and parse.
 */
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { beforeAll, describe, expect, it } from 'vitest'
import { setEditorContext } from '../core/editor/context'
import { registerEditorBlocks } from '../core/editor/definitions'
import { registerToolboxPlugins } from '../core/editor/toolbox'
import { parse } from '../core/save'
import { validateDesign } from '../core/project'
import { buildEditorContext } from './code/context'
import { exportProjectJson } from './persist/projectIo'
import { createStarterProject } from './starter'
import { BRICK_TEMPLATES } from './templates'
import { STAGE_ID, StudioStore } from './store'

beforeAll(() => {
  registerToolboxPlugins()
})

/** The editor's own load, then its own save (CodeEditor.tsx: workspaces.load into the workspace, workspaces.save on change). */
function throughBlockly(store: StudioStore, workspace: unknown): unknown {
  const ctx = buildEditorContext(store)
  setEditorContext(ctx)
  registerEditorBlocks(ctx)
  const ws = new Blockly.Workspace()
  try {
    Blockly.serialization.workspaces.load(JSON.parse(JSON.stringify(workspace)), ws)
    return Blockly.serialization.workspaces.save(ws)
  } finally {
    ws.dispose()
  }
}

function expectSaveSurvives(store: StudioStore) {
  const project = store.getState().project
  expect(validateDesign(project.design)).toEqual([])
  const text = exportProjectJson(project)
  const parsed = parse(text)
  expect(parsed.ok, parsed.ok ? '' : JSON.stringify(parsed.problems)).toBe(true)
}

describe('Blockly round trip keeps every brick saveable', () => {
  const starter = createStarterProject()
  const ids = [...starter.design.bricks.map((b) => b.id), STAGE_ID]

  for (const id of ids) {
    it(`starter: ${id} opened and closed keeps the project valid and the program unchanged`, () => {
      const store = new StudioStore(createStarterProject())
      store.selectBrick(id) // the editor's dropdowns (variables) are built for the open brick
      const before = store.brick(id)!.program
      const saved = throughBlockly(store, store.getState().project.workspaces[id])
      store.setWorkspace(id, saved)
      expect(store.getState().diagnostics[id] ?? []).toEqual([])
      expectSaveSurvives(store)
      expect(store.brick(id)!.program).toEqual(before)
    })
  }

  for (const template of BRICK_TEMPLATES) {
    it(`template: ${template.id} opened and closed keeps the project valid and the program unchanged`, () => {
      const store = new StudioStore(createStarterProject())
      const made = template.make('brick_new', 'Fresh')
      const id = store.addBrickFrom(made.brick, made.workspace) // selects the new brick
      const before = store.brick(id)!.program
      const saved = throughBlockly(store, store.getState().project.workspaces[id])
      store.setWorkspace(id, saved)
      expect(store.getState().diagnostics[id] ?? []).toEqual([])
      expectSaveSurvives(store)
      expect(store.brick(id)!.program).toEqual(before)
    })
  }

  it('a parameter reporter keeps its name through a save (the Walker bug)', () => {
    const store = new StudioStore(createStarterProject())
    store.selectBrick('brick_walker')
    const saved = JSON.stringify(throughBlockly(store, store.getState().project.workspaces['brick_walker']))
    expect(saved).toContain('"type":"argument_reporter_string_number"')
    expect(saved).toMatch(/"argument_reporter_string_number"[^}]*"fields":\{"VALUE":"speed"\}/)
  })

  it('a workspace saved with the old bug (nameless parameter) is caught by the compiler instead of corrupting the project', () => {
    const store = new StudioStore(createStarterProject())
    const broken = JSON.parse(JSON.stringify(store.getState().project.workspaces['brick_walker']))
    const strip = (o: unknown): void => {
      if (!o || typeof o !== 'object') return
      const r = o as Record<string, unknown>
      if (r.type === 'argument_reporter_string_number') delete r.fields
      Object.values(r).forEach(strip)
    }
    strip(broken)
    store.setWorkspace('brick_walker', broken)
    expect(store.getState().diagnostics['brick_walker'].map((d) => d.code)).toContain('block.nameless_input')
    expectSaveSurvives(store)
  })
})
