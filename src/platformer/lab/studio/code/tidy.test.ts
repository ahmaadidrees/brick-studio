import * as Blockly from 'blockly'
import { describe, expect, it } from 'vitest'
import { registerEditorBlocks } from '../../core/editor/definitions'
import { anyOverlap, columnLayout, LABEL_BAND, STACK_GAP, undoState, type PlacedStack } from './affordances'

const stack = (id: string, left: number, top: number, w: number, h: number, labelled = false): PlacedStack => ({
  id,
  left,
  top,
  right: left + w,
  bottom: top + h,
  labelled,
})

describe('tidy on open: only overlapping layouts are rearranged', () => {
  it('a layout the kid arranged, with no overlap, is left alone', () => {
    expect(anyOverlap([stack('a', 20, 20, 200, 100), stack('b', 300, 20, 200, 100), stack('c', 20, 400, 200, 100)])).toBe(false)
  })

  it('two scripts that overlap are found', () => {
    expect(anyOverlap([stack('a', 20, 20, 200, 100), stack('b', 100, 80, 200, 100)])).toBe(true)
  })

  it('a label that sits on the script above is an overlap even though the stacks do not touch', () => {
    // b's label occupies [top - LABEL_BAND, top]; a ends 10 below b's top - band
    const a = stack('a', 20, 20, 200, 100)
    const b = stack('b', 20, 120 + 5, 200, 100, true)
    expect(anyOverlap([a, b])).toBe(true)
    expect(anyOverlap([a, stack('b', 20, 120 + LABEL_BAND, 200, 100, true)])).toBe(false)
  })

  it('stacks that only touch edges are not overlapping', () => {
    expect(anyOverlap([stack('a', 20, 20, 100, 100), stack('b', 120, 20, 100, 100)])).toBe(false)
  })

  it('columnLayout makes one column in reading order, labels above their stacks, no overlap afterwards', () => {
    const input = [stack('b', 40, 60, 200, 80, true), stack('a', 20, 20, 150, 120, true), stack('c', 25, 30, 100, 50)]
    const target = columnLayout(input)
    // reading order: a (top 20), c (top 30), b (top 60); x = leftmost
    const placed = ['a', 'c', 'b'].map((id) => {
      const s = input.find((i) => i.id === id)!
      const at = target.get(id)!
      return { ...s, left: at.x, right: at.x + (s.right - s.left), top: at.y, bottom: at.y + (s.bottom - s.top) }
    })
    expect(placed.every((p) => p.left === 20)).toBe(true)
    expect(anyOverlap(placed)).toBe(false)
    // the first stack keeps its place; each next one is a gap (and its label) below
    expect(placed[0].top).toBe(20)
    expect(placed[1].top).toBe(placed[0].bottom + STACK_GAP)
    expect(placed[2].top).toBe(placed[1].bottom + STACK_GAP + LABEL_BAND)
  })

  it('keeps two columns as two columns, each tidied on its own, without the columns overlapping', () => {
    const input = [
      stack('a1', 20, 20, 300, 400, true), stack('a2', 20, 300, 300, 200, true),
      stack('b1', 900, 20, 250, 300, true), stack('b2', 905, 200, 250, 100, true),
    ]
    expect(anyOverlap(input)).toBe(true)
    const target = columnLayout(input)
    expect([target.get('a1')!.x, target.get('a2')!.x]).toEqual([20, 20])
    expect([target.get('b1')!.x, target.get('b2')!.x]).toEqual([900, 900])
    expect(target.get('a2')!.y).toBeGreaterThan(target.get('a1')!.y)
    expect(target.get('b2')!.y).toBeGreaterThan(target.get('b1')!.y)
    const placed = input.map((s) => {
      const at = target.get(s.id)!
      return { ...s, left: at.x, right: at.x + (s.right - s.left), top: at.y, bottom: at.y + (s.bottom - s.top) }
    })
    expect(anyOverlap(placed)).toBe(false)
  })
})

describe('undo and redo use Blockly\'s own stack', () => {
  it('undoState follows the stack, and ws.undo moves between the two', async () => {
    registerEditorBlocks()
    const ws = new Blockly.Workspace()
    try {
      expect(undoState(ws)).toEqual({ canUndo: false, canRedo: false })
      Blockly.serialization.blocks.append({ type: 'motion_movesteps' }, ws, { recordUndo: true })
      await new Promise((r) => setTimeout(r, 50)) // Blockly delivers events on the next tick
      expect(undoState(ws).canUndo).toBe(true)
      ws.undo(false)
      await new Promise((r) => setTimeout(r, 50))
      expect(ws.getAllBlocks(false)).toHaveLength(0)
      expect(undoState(ws)).toEqual({ canUndo: false, canRedo: true })
      ws.undo(true)
      expect(ws.getAllBlocks(false)).toHaveLength(1)
    } finally {
      ws.dispose()
    }
  })
})

describe('turning a script off', () => {
  it('keeps it in the workspace, saves it as off, and the program leaves it out; turning it on brings it back', async () => {
    const { registerEditorBlocks } = await import('../../core/editor/definitions')
    const { compileWorkspace } = await import('../../core/editor/compile')
    const { setScriptOff, isScriptOff } = await import('./affordances')
    const { createHeroBrick, heroVariables } = await import('../hero/heroBrick')
    const Blockly = await import('blockly/core')
    registerEditorBlocks({ getVariables: () => [...heroVariables(), { id: 'coins', name: 'coins', value: 0 }], getBricks: () => ['Hero'] })
    const { workspace, brick } = createHeroBrick()
    const ws = new Blockly.Workspace()
    try {
      Blockly.serialization.workspaces.load(workspace as never, ws)
      const coyote = ws.getTopBlocks(false).find((b) => (b.data ?? '').includes('Coyote time'))!
      setScriptOff(coyote, true)
      expect(isScriptOff(coyote)).toBe(true)
      const saved = Blockly.serialization.workspaces.save(ws)
      expect(ws.getTopBlocks(false)).toHaveLength(29)
      const off = compileWorkspace(saved, { variables: heroVariables() })
      expect(off.program.scripts).toHaveLength(brick.program.scripts.length - 1)
      setScriptOff(coyote, false)
      const on = compileWorkspace(Blockly.serialization.workspaces.save(ws), { variables: heroVariables() })
      expect(on.program.scripts).toHaveLength(brick.program.scripts.length)
    } finally {
      ws.dispose()
    }
  })

  it('a built-in brick with a script turned off stays built-in (it is tuning, not a remix), and Back to the original turns it on again', async () => {
    const { StudioStore } = await import('../store')
    const { createStarterProject } = await import('../starter')
    const store = new StudioStore(createStarterProject())
    const ws = structuredClone(store.getState().project.workspaces.brick_hero) as { blocks: { blocks: Array<Record<string, unknown>> } }
    const coyote = ws.blocks.blocks.find((b) => String(b.data ?? '').includes('Coyote time'))!
    coyote.disabledReasons = ['MANUALLY_DISABLED']
    const before = store.brick('brick_hero')!.program.scripts.length
    store.setWorkspace('brick_hero', ws)
    expect(store.brick('brick_hero')!.remixOf).toBeUndefined()
    expect(store.brick('brick_hero')!.name).toBe('Hero')
    expect(store.brick('brick_hero')!.program.scripts).toHaveLength(before - 1)
    expect(store.canResetBrick('brick_hero')).toBe(true)
    store.resetBrickOriginal('brick_hero')
    expect(store.brick('brick_hero')!.program.scripts).toHaveLength(before)
    expect(store.canResetBrick('brick_hero')).toBe(false)
  })
})
