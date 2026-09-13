import { beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from './store'
import { finishVerticalSelectionMove, verticalDragHeight } from './verticalSelectionDrag'
import type { BrickInstance } from './types'

const group: BrickInstance[] = [
  { id: 'top', partId: 'brick_1x1', x: 10, y: 6, z: 10, rotation: 0, color: '#fff' },
  { id: 'bottom', partId: 'brick_1x1', x: 11, y: 0, z: 10, rotation: 0, color: '#fff' },
]
beforeEach(() => {
  useBrickStore.setState({ ...useBrickStore.getInitialState(), bricks: group.map((brick) => ({ ...brick })), draft: null, selectedIds: ['top', 'bottom'], selectedId: 'bottom', undoStack: [], redoStack: [] }, true)
})

describe('vertical selection drag', () => {
  it('snaps to plate heights and floors the lowest group member, not just its anchor', () => {
    expect(verticalDragHeight(6, 0, 200, 179, 8, 6)).toBe(9)
    expect(verticalDragHeight(6, 0, 200, 300, 8, 6)).toBe(6)
    expect(verticalDragHeight(6, 3, 200, 300, 8, 9)).toBe(3)
    expect(verticalDragHeight(1000, 990, 200, -10000, 8, 1020)).toBe(1004)
  })
  it('remains controllable when the top view projects vertical movement to zero pixels', () => {
    expect(verticalDragHeight(0, 0, 100, 80, 0)).toBe(5)
    expect(verticalDragHeight(0, 0, 100, 80, Number.NaN)).toBe(3)
  })
  it('keeps preview changes out of the document and commits the group as one undo step', () => {
    const store = useBrickStore.getState()
    store.startMove()
    store.setDraftPosition(10, 7, 10)
    store.setDraftPosition(10, 12, 10)
    expect(useBrickStore.getState().bricks).toEqual(group)
    expect(useBrickStore.getState().undoStack).toHaveLength(0)
    expect(finishVerticalSelectionMove(store, true)).toBe(true)
    expect(useBrickStore.getState().bricks.map(({ x, y, z }) => ({ x, y, z }))).toEqual([{ x: 10, y: 12, z: 10 }, { x: 11, y: 6, z: 10 }])
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
    store.undo()
    expect(useBrickStore.getState().bricks).toEqual(group)
  })
  it('cancels a gesture without document or history changes', () => {
    const store = useBrickStore.getState()
    store.startMove()
    store.setDraftPosition(10, 18, 10)
    expect(finishVerticalSelectionMove(store, false)).toBe(false)
    expect(useBrickStore.getState().bricks).toEqual(group)
    expect(useBrickStore.getState().draft).toBeNull()
    expect(useBrickStore.getState().movingSelection).toBeNull()
    expect(useBrickStore.getState().undoStack).toHaveLength(0)
  })
  it('restores originals when the release would collide with an unselected brick', () => {
    const obstacle: BrickInstance = { ...group[0], id: 'obstacle', y: 9 }
    useBrickStore.setState({ bricks: [...group, obstacle] })
    const store = useBrickStore.getState()
    store.startMove()
    store.setDraftPosition(10, 9, 10)
    expect(finishVerticalSelectionMove(store, true)).toBe(false)
    expect(useBrickStore.getState().bricks).toEqual([...group, obstacle])
    expect(useBrickStore.getState().draft).toBeNull()
    expect(useBrickStore.getState().undoStack).toHaveLength(0)
  })
})
