import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_HISTORY_ENTRIES, draftIsValid, useBrickStore, validateBrickGroup } from './store'
import type { BrickDraft, BrickInstance } from './types'

const base: BrickInstance = { id: 'a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }
const initialState = useBrickStore.getInitialState()

function resetStore() {
  useBrickStore.setState({
    ...initialState,
    bricks: [],
    selectedIds: [],
    selectedId: null,
    draft: initialState.draft ? { ...initialState.draft } : null,
    undoStack: [],
    redoStack: [],
    viewRequest: { ...initialState.viewRequest },
    touchMove: { ...initialState.touchMove },
  }, true)
}

function placeAt(x: number, z: number, partId = 'brick_1x1') {
  const store = useBrickStore.getState()
  store.choosePart(partId)
  useBrickStore.getState().setDraftPosition(x, 0, z)
  return useBrickStore.getState().placeDraft()
}

beforeEach(() => {
  vi.useRealTimers()
  resetStore()
})

describe('brick placement', () => {
  it('rejects overlapping volumes', () => {
    const draft: BrickDraft = { partId: 'brick_2x2', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }
    expect(draftIsValid(draft, [base])).toBe(false)
  })

  it('allows stacking above an existing brick', () => {
    const draft: BrickDraft = { partId: 'brick_2x2', x: 10, y: 3, z: 10, rotation: 0, color: '#fff' }
    expect(draftIsValid(draft, [base])).toBe(true)
  })

  it('rejects rotated bricks outside the build plate', () => {
    const draft: BrickDraft = { partId: 'brick_1x4', x: 61, y: 0, z: 63, rotation: 1, color: '#fff' }
    expect(draftIsValid(draft, [])).toBe(false)
  })

  it('does not add history or clear redo for an invalid placement', () => {
    expect(placeAt(2, 2)).toBe(true)
    useBrickStore.getState().undo()
    const redoBefore = useBrickStore.getState().redoStack
    useBrickStore.getState().choosePart('brick_2x4')
    useBrickStore.getState().setDraftPosition(63, 0, 63)

    expect(useBrickStore.getState().placeDraft()).toBe(false)
    expect(useBrickStore.getState().undoStack).toHaveLength(0)
    expect(useBrickStore.getState().redoStack).toEqual(redoBefore)
  })
})

describe('bounded command history', () => {
  it('undoes and redoes place, rotate, recolor, move, and delete commands', () => {
    expect(placeAt(4, 4, 'brick_1x2')).toBe(true)
    const id = useBrickStore.getState().selectedId!

    useBrickStore.getState().rotate()
    expect(useBrickStore.getState().bricks[0].rotation).toBe(1)
    useBrickStore.getState().setActiveColor('#e7473c')
    expect(useBrickStore.getState().bricks[0].color).toBe('#e7473c')
    useBrickStore.getState().startMove()
    useBrickStore.getState().setDraftPosition(9, 0, 9)
    expect(useBrickStore.getState().placeDraft()).toBe(true)
    useBrickStore.getState().deleteSelected()
    expect(useBrickStore.getState().bricks).toHaveLength(0)

    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks[0]).toMatchObject({ id, x: 9, z: 9 })
    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks[0]).toMatchObject({ id, x: 4, z: 4, color: '#e7473c' })
    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks[0].color).not.toBe('#e7473c')
    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks[0].rotation).toBe(0)
    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks).toHaveLength(0)

    for (let index = 0; index < 5; index += 1) useBrickStore.getState().redo()
    expect(useBrickStore.getState().bricks).toHaveLength(0)
    expect(useBrickStore.getState().undoStack).toHaveLength(5)
  })

  it('batches rapid repeated nudges into one undo command', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T12:00:00Z'))
    expect(placeAt(10, 10)).toBe(true)
    useBrickStore.getState().nudge(1, 0, 0)
    vi.advanceTimersByTime(100)
    useBrickStore.getState().nudge(1, 0, 0)
    vi.advanceTimersByTime(100)
    useBrickStore.getState().nudge(0, 0, 1)

    expect(useBrickStore.getState().undoStack).toHaveLength(2)
    expect(useBrickStore.getState().bricks[0]).toMatchObject({ x: 12, z: 11 })
    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks[0]).toMatchObject({ x: 10, z: 10 })
  })

  it('rejects an invalid selected rotation without adding history', () => {
    expect(placeAt(63, 60, 'brick_1x4')).toBe(true)
    const historyLength = useBrickStore.getState().undoStack.length
    useBrickStore.getState().rotate()

    expect(useBrickStore.getState().bricks[0].rotation).toBe(0)
    expect(useBrickStore.getState().undoStack).toHaveLength(historyLength)
    expect(useBrickStore.getState().toast).toContain('Not enough room')
  })

  it('caps delta history while preserving a 200-brick desktop build', () => {
    useBrickStore.getState().setBudgetProfile('desktop')
    for (let index = 0; index < 200; index += 1) {
      expect(placeAt(index % 64, Math.floor(index / 64))).toBe(true)
    }

    const state = useBrickStore.getState()
    expect(state.bricks).toHaveLength(200)
    expect(state.undoStack).toHaveLength(MAX_HISTORY_ENTRIES)
    expect(state.undoStack.every((entry) => !('bricks' in entry))).toBe(true)
  })
})

describe('budget and continuity gates', () => {
  it('enforces the phone budget without recording the rejected placement', () => {
    useBrickStore.getState().setBudgetProfile('phone')
    for (let index = 0; index < 75; index += 1) {
      expect(placeAt(index % 64, Math.floor(index / 64))).toBe(true)
    }
    const historyBefore = useBrickStore.getState().undoStack
    useBrickStore.getState().choosePart('brick_1x1')
    useBrickStore.getState().setDraftPosition(20, 20, 20)

    expect(useBrickStore.getState().placeDraft()).toBe(false)
    expect(useBrickStore.getState().bricks).toHaveLength(75)
    expect(useBrickStore.getState().undoStack).toEqual(historyBefore)
    expect(useBrickStore.getState().toast).toContain('75-brick')
  })

  it('keeps ordinary budget-limit undo and redo intact', () => {
    useBrickStore.getState().setBudgetProfile('phone')
    for (let index = 0; index < 75; index += 1) placeAt(index % 64, Math.floor(index / 64))

    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks).toHaveLength(74)
    expect(useBrickStore.getState().redoStack).toHaveLength(1)
    useBrickStore.getState().redo()
    expect(useBrickStore.getState().bricks).toHaveLength(75)
    expect(useBrickStore.getState().redoStack).toHaveLength(0)
  })

  it('preserves a blocked redo when the active device budget becomes lower', () => {
    useBrickStore.getState().setBudgetProfile('desktop')
    for (let index = 0; index < 76; index += 1) placeAt(index % 64, Math.floor(index / 64))
    useBrickStore.getState().undo()
    useBrickStore.getState().setBudgetProfile('phone')

    useBrickStore.getState().redo()
    expect(useBrickStore.getState().bricks).toHaveLength(75)
    expect(useBrickStore.getState().redoStack).toHaveLength(1)
    expect(useBrickStore.getState().toast).toContain('exceed')
  })

  it('keeps the build and history intact across repeated mode switches', () => {
    expect(placeAt(8, 8)).toBe(true)
    const id = useBrickStore.getState().bricks[0].id
    for (let index = 0; index < 10; index += 1) {
      useBrickStore.getState().setMode('explore')
      useBrickStore.getState().setMode('build')
    }

    expect(useBrickStore.getState().mode).toBe('build')
    expect(useBrickStore.getState().bricks).toEqual([expect.objectContaining({ id })])
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
  })
})

describe('keyboard-oriented selection commands', () => {
  it('enumerates placed bricks in both directions and announces coordinates', () => {
    placeAt(2, 3)
    const firstId = useBrickStore.getState().selectedId!
    placeAt(7, 8)
    const secondId = useBrickStore.getState().selectedId!
    useBrickStore.getState().selectBrick(null)

    useBrickStore.getState().selectAdjacentBrick(1)
    expect(useBrickStore.getState().selectedId).toBe(firstId)
    expect(useBrickStore.getState().toast).toContain('brick 1 of 2')
    useBrickStore.getState().selectAdjacentBrick(-1)
    expect(useBrickStore.getState().selectedId).toBe(secondId)
    expect(useBrickStore.getState().toast).toContain('X 7, Y 0, Z 8')
  })

  it('cancels a draft or move without creating history', () => {
    placeAt(5, 5)
    const historyLength = useBrickStore.getState().undoStack.length
    useBrickStore.getState().startMove()
    useBrickStore.getState().setDraftPosition(12, 0, 12)
    useBrickStore.getState().cancelInteraction()

    expect(useBrickStore.getState().draft).toBeNull()
    expect(useBrickStore.getState().movingId).toBeNull()
    expect(useBrickStore.getState().bricks[0]).toMatchObject({ x: 5, z: 5 })
    expect(useBrickStore.getState().undoStack).toHaveLength(historyLength)
  })
})

describe('ordered multi-selection', () => {
  beforeEach(() => {
    useBrickStore.setState({
      bricks: [
        { ...base, id: 'a' },
        { ...base, id: 'b', x: 20, partId: 'slope_2x2', rotation: 1, color: '#e7473c' },
        { ...base, id: 'c', x: 30, partId: 'door_1x4', rotation: 3, color: '#3e83d7' },
      ],
      selectedIds: [],
      selectedId: null,
      draft: null,
      undoStack: [],
      redoStack: [],
    })
  })

  it('replaces, toggles, clears, and keeps primary selection compatible', () => {
    useBrickStore.getState().selectBrick('a')
    expect(useBrickStore.getState()).toMatchObject({ selectedIds: ['a'], selectedId: 'a' })

    useBrickStore.getState().toggleBrick('b')
    expect(useBrickStore.getState()).toMatchObject({ selectedIds: ['a', 'b'], selectedId: 'b' })
    useBrickStore.getState().toggleBrick('b')
    expect(useBrickStore.getState()).toMatchObject({ selectedIds: ['a'], selectedId: 'a' })

    useBrickStore.getState().selectBricks(['c', 'a', 'c', 'missing'])
    expect(useBrickStore.getState()).toMatchObject({ selectedIds: ['c', 'a'], selectedId: 'a' })
    useBrickStore.getState().clearSelection()
    expect(useBrickStore.getState()).toMatchObject({ selectedIds: [], selectedId: null })
  })

  it('clears transient selection and Select mode when entering Explore', () => {
    useBrickStore.getState().selectBricks(['a', 'b'])
    useBrickStore.getState().setSelectionMode(true)
    useBrickStore.getState().setMarquee({ start: { x: 2, y: 3 }, current: { x: 30, y: 40 }, dragging: true })

    useBrickStore.getState().setMode('explore')

    expect(useBrickStore.getState()).toMatchObject({ selectedIds: [], selectedId: null, selectionMode: false, marquee: null })
    expect(useBrickStore.getState().bricks).toHaveLength(3)
  })

  it('treats an already-cleared marquee reset as an idempotent no-op', () => {
    useBrickStore.setState({ marquee: null })
    const listener = vi.fn()
    const unsubscribe = useBrickStore.subscribe(listener)

    useBrickStore.getState().setMarquee(null)

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})

describe('atomic group clipboard and history', () => {
  const mixed: BrickInstance[] = [
    { id: 'plain', partId: 'brick_1x2', x: 8, y: 0, z: 8, rotation: 0, color: '#fff' },
    { id: 'slope', partId: 'slope_2x2', x: 14, y: 3, z: 11, rotation: 1, color: '#e7473c' },
    { id: 'door', partId: 'door_1x4', x: 20, y: 0, z: 16, rotation: 3, color: '#3e83d7' },
  ]

  beforeEach(() => {
    useBrickStore.setState({
      bricks: mixed.map((brick) => ({ ...brick })),
      selectedIds: mixed.map((brick) => brick.id),
      selectedId: 'door',
      draft: null,
      clipboard: null,
      undoStack: [],
      redoStack: [],
      brickBudget: 250,
    })
  })

  it('preserves relative transforms and metadata and pastes in one undo step', () => {
    useBrickStore.getState().copy()
    const historyBefore = useBrickStore.getState().undoStack.length
    useBrickStore.getState().paste()

    const state = useBrickStore.getState()
    const pasted = state.bricks.slice(mixed.length)
    expect(pasted).toHaveLength(3)
    expect(state.undoStack).toHaveLength(historyBefore + 1)
    expect(pasted.map(({ id: _id, ...brick }) => ({ ...brick, x: brick.x - pasted[0].x, y: brick.y - pasted[0].y, z: brick.z - pasted[0].z })))
      .toEqual(mixed.map(({ id: _id, ...brick }) => ({ ...brick, x: brick.x - mixed[0].x, y: brick.y - mixed[0].y, z: brick.z - mixed[0].z })))

    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks).toEqual(mixed)
    useBrickStore.getState().redo()
    expect(useBrickStore.getState().bricks.slice(mixed.length)).toEqual(pasted)
  })

  it('duplicates and deletes whole groups as single atomic commands', () => {
    useBrickStore.getState().duplicate()
    expect(useBrickStore.getState().bricks).toHaveLength(6)
    expect(useBrickStore.getState().undoStack).toHaveLength(1)

    useBrickStore.getState().deleteSelected()
    expect(useBrickStore.getState().bricks).toEqual(mixed)
    expect(useBrickStore.getState().undoStack).toHaveLength(2)

    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks).toHaveLength(6)
    expect(useBrickStore.getState().selectedIds).toHaveLength(3)
    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks).toEqual(mixed)
  })

  it.each([
    ['phone', 75],
    ['tablet', 150],
    ['desktop', 250],
  ] as const)('rejects an over-budget %s paste without partial mutation or history', (profile, budget) => {
    const filler = Array.from({ length: budget - 2 }, (_, index): BrickInstance => ({
      id: `filler-${index}`,
      partId: 'brick_1x1',
      x: index % 64,
      y: 20 + Math.floor(index / 64) * 3,
      z: Math.floor(index / 64),
      rotation: 0,
      color: '#fff',
    }))
    useBrickStore.setState({ bricks: filler, selectedIds: [], selectedId: null, brickBudget: budget, budgetProfile: profile })
    useBrickStore.setState({ clipboard: { bricks: mixed.map(({ id: _id, ...brick }) => brick) } })
    const before = useBrickStore.getState()

    useBrickStore.getState().paste()

    expect(useBrickStore.getState().bricks).toEqual(before.bricks)
    expect(useBrickStore.getState().undoStack).toEqual(before.undoStack)
    expect(useBrickStore.getState().toast).toContain(`${budget}-brick`)
  })

  it('rejects an invalid group as a whole, including candidate-to-candidate collision', () => {
    const colliding = [
      { partId: 'brick_2x2', x: 2, y: 0, z: 2, rotation: 0, color: '#fff' },
      { partId: 'brick_1x1', x: 3, y: 0, z: 3, rotation: 0, color: '#e7473c' },
    ] satisfies BrickDraft[]
    const outside = mixed.map(({ id: _id, ...brick }) => ({ ...brick, x: brick.x + 60 }))

    expect(validateBrickGroup(colliding, [], 250)).toEqual({ valid: false, reason: 'placement' })
    expect(validateBrickGroup(outside, [], 250)).toEqual({ valid: false, reason: 'placement' })
  })
})
