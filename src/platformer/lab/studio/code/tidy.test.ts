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
