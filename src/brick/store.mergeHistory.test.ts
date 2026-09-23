import { beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from './store'

/**
 * `mergeHistory`: an edit the studio records in steps becomes one Undo. Generic and flag-free;
 * the robot kits use it to fold a group placement and its robotics-section write together.
 */
const store = () => useBrickStore.getState()
const labels = () => store().undoStack.map((entry) => entry.label)
const snapshot = () => JSON.stringify(store().getDocumentSnapshot())

function place(partId: string, x: number, z: number) {
  store().choosePart(partId)
  store().setDraftPosition(x, 0, z)
  expect(store().placeDraft()).toBe(true)
  store().cancelInteraction()
  return store().bricks.at(-1)!.id
}

beforeEach(() => {
  store().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [], selectedIds: [], selectedId: null })
})

describe('mergeHistory', () => {
  it('folds brick edits into one entry: one Undo takes them all back, one Redo brings them all', () => {
    place('brick_2x2', 4, 4)
    const oneBrick = snapshot()
    const first = place('brick_2x2', 10, 10)
    const second = place('brick_2x4', 20, 20)
    const built = snapshot()
    expect(store().mergeHistory(2, 'Build two')).toBe(true)
    expect(labels()).toEqual(['Place brick', 'Build two'])
    store().undo()
    expect(snapshot()).toBe(oneBrick)
    expect(store().toast).toBe('Undid: Build two.')
    store().redo()
    expect(snapshot()).toBe(built)
    expect(store().bricks.map((brick) => brick.id)).toEqual(expect.arrayContaining([first, second]))
  })

  it('folds a document-level entry too: Undo restores the robotics section with the bricks', () => {
    const before = snapshot()
    place('plate_6x8', 10, 10)
    store().setRoboticsSection({ version: 1, settings: { wiring: 'assisted' }, creations: [{ id: 'c', name: 'Buggy', anchorBrickIds: [store().bricks[0].id] }], devices: {}, connections: [] }, 'Name it')
    const after = snapshot()
    expect(store().mergeHistory(2, 'Add Buggy')).toBe(true)
    expect(labels()).toEqual(['Add Buggy'])
    const [entry] = store().undoStack
    expect(entry.documentBefore).toBeDefined()
    expect(entry.documentAfter).toBeDefined()
    store().undo()
    expect(snapshot()).toBe(before)
    expect(store().documentMetadata.robotics).toBeUndefined()
    store().redo()
    expect(snapshot()).toBe(after)
  })

  it('keeps the selection each end had, minus bricks that did not exist yet', () => {
    const kept = place('brick_1x1', 2, 2)
    store().selectBricks([kept])
    store().duplicate()
    store().setDraftPosition(8, 0, 8)
    expect(store().placeDraft()).toBe(true)
    const copy = store().selectedIds[0]
    store().setRoboticsSection({ version: 1, settings: { wiring: 'assisted' }, creations: [], devices: {}, connections: [] }, 'Tidy')
    store().mergeHistory(2, 'Copy it')
    const [, entry] = store().undoStack
    expect(entry.selectionBefore).toEqual([kept])
    expect(entry.selectionAfter).toEqual([copy])
  })

  it('a single entry can be relabelled; asking for more entries than there are changes nothing', () => {
    place('brick_1x1', 2, 2)
    const stack = store().undoStack
    expect(store().mergeHistory(2, 'Too many')).toBe(false)
    expect(store().mergeHistory(0, 'None')).toBe(false)
    expect(store().undoStack).toBe(stack)
    expect(store().mergeHistory(1, 'Put one down')).toBe(true)
    expect(labels()).toEqual(['Put one down'])
    store().undo()
    expect(store().bricks).toEqual([])
  })

  it('leaves the redo stack alone and keeps Redo within the brick budget', () => {
    place('brick_1x1', 2, 2)
    place('brick_1x1', 4, 4)
    store().mergeHistory(2, 'Two')
    store().undo()
    useBrickStore.setState({ brickBudget: 1 })
    store().redo()
    expect(store().bricks).toEqual([])
    expect(store().toast).toMatch(/limit/)
    useBrickStore.setState({ brickBudget: 5000 })
    store().redo()
    expect(store().bricks).toHaveLength(2)
  })
})
