/**
 * "Take off" removes every block of a power's scripts, so it asks first when the kid changed them. These tests pin down
 * what counts as a change: editing or adding blocks does; the editor re-saving, moving a script, or On/Off does not.
 */
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { beforeAll, describe, expect, it } from 'vitest'
import { setEditorContext } from '../../core/editor/context'
import { registerEditorBlocks } from '../../core/editor/definitions'
import { registerToolboxPlugins } from '../../core/editor/toolbox'
import { buildEditorContext } from '../code/context'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { builtInPowers, powerChanged } from './powers'

beforeAll(() => {
  registerToolboxPlugins()
})

type Ws = { blocks: { blocks: Array<Record<string, unknown>> }; variables?: unknown[] }

/** The code editor's own load and save (CodeEditor.tsx). */
function throughBlockly(store: StudioStore, brickId: string): Ws {
  store.selectBrick(brickId)
  const ctx = buildEditorContext(store)
  setEditorContext(ctx)
  registerEditorBlocks(ctx)
  const ws = new Blockly.Workspace()
  try {
    Blockly.serialization.workspaces.load(JSON.parse(JSON.stringify(store.getState().project.workspaces[brickId])), ws)
    return Blockly.serialization.workspaces.save(ws) as Ws
  } finally {
    ws.dispose()
  }
}

const workspace = (store: StudioStore, id = 'brick_hero') => structuredClone(store.getState().project.workspaces[id]) as Ws
const changed = (store: StudioStore, snapId: string, id = 'brick_hero') => powerChanged(store.getState().project, id, snapId)

describe('has the kid changed a snapped power?', () => {
  for (const power of builtInPowers()) {
    it(`${power.name}: not after snapping, or after the editor opens and saves the brick`, () => {
      const store = new StudioStore(createStarterProject())
      const snap = store.snapPower('brick_hero', power)!
      expect(snap.fingerprint).toEqual(expect.any(String))
      expect(changed(store, snap.id)).toBe(false)
      store.setWorkspace('brick_hero', throughBlockly(store, 'brick_hero'))
      expect(changed(store, snap.id)).toBe(false)
    })
  }

  it('not after moving its scripts or turning it off and on', () => {
    const store = new StudioStore(createStarterProject())
    const snap = store.snapPower('brick_hero', builtInPowers().find((p) => p.id === 'dash')!)!
    const ws = workspace(store)
    for (const b of ws.blocks.blocks) if (snap.blockIds.includes(b.id as string)) { b.x = 5; b.y = 5 }
    store.setWorkspace('brick_hero', ws)
    store.setPowerOn('brick_hero', snap.id, false)
    expect(changed(store, snap.id)).toBe(false)
    store.setPowerOn('brick_hero', snap.id, true)
    expect(changed(store, snap.id)).toBe(false)
  })

  it('yes after one of its blocks is edited', () => {
    const store = new StudioStore(createStarterProject())
    const snap = store.snapPower('brick_hero', builtInPowers().find((p) => p.id === 'hop')!)!
    const ws = throughBlockly(store, 'brick_hero')
    const i = ws.blocks.blocks.findIndex((b) => b.id === snap.blockIds[0])
    const text = JSON.stringify(ws.blocks.blocks[i])
    // Hop's tick script checks "hop count > hop every ticks"; the kid turns the > into a <.
    const edited = text.replace(/"type":"operator_gt"/, '"type":"operator_lt"')
    expect(edited).not.toBe(text)
    ws.blocks.blocks[i] = JSON.parse(edited)
    store.setWorkspace('brick_hero', ws)
    expect(changed(store, snap.id)).toBe(true)
  })

  it('yes after a block is added under one of its scripts', () => {
    const store = new StudioStore(createStarterProject())
    const snap = store.snapPower('brick_hero', builtInPowers().find((p) => p.id === 'double-jump')!)!
    const ws = workspace(store)
    const land = ws.blocks.blocks.find((b) => snap.blockIds.includes(b.id as string) && b.type === 'platformer_whenland')!
    const last = (b: Record<string, unknown>): Record<string, unknown> => {
      const next = (b.next as { block?: Record<string, unknown> } | undefined)?.block
      return next ? last(next) : b
    }
    last(land).next = { block: { type: 'looks_nextcostume', id: 'kid_added_1' } }
    store.setWorkspace('brick_hero', ws)
    expect(changed(store, snap.id)).toBe(true)
  })

  it('yes after one of its scripts is deleted', () => {
    const store = new StudioStore(createStarterProject())
    const snap = store.snapPower('brick_hero', builtInPowers().find((p) => p.id === 'double-jump')!)!
    const ws = workspace(store)
    ws.blocks.blocks = ws.blocks.blocks.filter((b) => b.id !== snap.blockIds[1])
    store.setWorkspace('brick_hero', ws)
    expect(changed(store, snap.id)).toBe(true)
  })

  it('a power snapped before snaps remembered their blocks counts as changed, so Take off asks', () => {
    const store = new StudioStore(createStarterProject())
    const snap = store.snapPower('brick_hero', builtInPowers()[0])!
    const project = store.getState().project
    const hero = project.design.bricks.find((b) => b.id === 'brick_hero')!
    const old = { ...hero, powers: hero.powers!.map(({ fingerprint: _f, ...rest }) => rest) }
    const oldProject = { ...project, design: { ...project.design, bricks: project.design.bricks.map((b) => (b.id === 'brick_hero' ? old : b)) } }
    expect(powerChanged(oldProject, 'brick_hero', snap.id)).toBe(true)
  })
})
