import { create } from 'zustand'
import { BRICK_BUDGETS } from './budgets'
import { BRICK_COLORS, BRICK_PART_MAP, BRICK_PARTS, GRID_SIZE, rotatedSize } from './parts'
import type { BrickBudgetProfile, BrickDraft, BrickInstance, BrickMode, ViewPreset } from './types'

export const MAX_HISTORY_ENTRIES = 100
const NUDGE_BATCH_WINDOW_MS = 500

export type BrickHistoryEntry = {
  before: BrickInstance | null
  after: BrickInstance | null
  beforeIndex: number | null
  afterIndex: number | null
  label: string
  group: string | null
  recordedAt: number
}

type BrickState = {
  mode: BrickMode
  bricks: BrickInstance[]
  selectedId: string | null
  activePartId: string | null
  activeColor: string
  draft: BrickDraft | null
  movingId: string | null
  clipboard: Omit<BrickInstance, 'id'> | null
  undoStack: BrickHistoryEntry[]
  redoStack: BrickHistoryEntry[]
  budgetProfile: BrickBudgetProfile
  brickBudget: number
  viewRequest: { preset: ViewPreset; nonce: number }
  touchMove: { x: number; z: number }
  touchYaw: number
  jumpNonce: number
  toast: string | null
  setMode: (mode: BrickMode) => void
  choosePart: (partId: string) => void
  setActiveColor: (color: string) => void
  setDraftPosition: (x: number, y: number, z: number) => void
  placeDraft: () => boolean
  cancelInteraction: () => void
  selectBrick: (id: string | null) => void
  selectAdjacentBrick: (direction: 1 | -1) => void
  deleteSelected: () => void
  rotate: () => void
  nudge: (dx: number, dy: number, dz: number) => void
  startMove: () => void
  copy: () => void
  paste: () => void
  duplicate: () => void
  undo: () => void
  redo: () => void
  setBudgetProfile: (profile: BrickBudgetProfile) => void
  requestView: (preset: ViewPreset) => void
  setTouchMove: (x: number, z: number) => void
  addTouchYaw: (delta: number) => void
  requestJump: () => void
  clearToast: () => void
}

const cloneBrick = (brick: BrickInstance) => ({ ...brick })

function applyHistoryEntry(bricks: BrickInstance[], entry: BrickHistoryEntry, direction: 'undo' | 'redo') {
  const replacement = direction === 'undo' ? entry.before : entry.after
  const requestedIndex = direction === 'undo' ? entry.beforeIndex : entry.afterIndex
  const id = entry.before?.id ?? entry.after?.id
  if (!id) return bricks

  const next = bricks.filter((brick) => brick.id !== id).map(cloneBrick)
  if (replacement) {
    const index = Math.max(0, Math.min(requestedIndex ?? next.length, next.length))
    next.splice(index, 0, cloneBrick(replacement))
  }
  return next
}

function appendHistory(stack: BrickHistoryEntry[], entry: BrickHistoryEntry) {
  const next = [...stack, entry]
  return next.length > MAX_HISTORY_ENTRIES ? next.slice(next.length - MAX_HISTORY_ENTRIES) : next
}

function recordNudge(stack: BrickHistoryEntry[], entry: BrickHistoryEntry) {
  const previous = stack.at(-1)
  if (
    previous
    && previous.group === entry.group
    && entry.group !== null
    && entry.recordedAt - previous.recordedAt <= NUDGE_BATCH_WINDOW_MS
  ) {
    return [
      ...stack.slice(0, -1),
      { ...previous, after: entry.after, afterIndex: entry.afterIndex, recordedAt: entry.recordedAt },
    ]
  }
  return appendHistory(stack, entry)
}

function historyEntry(
  before: BrickInstance | null,
  after: BrickInstance | null,
  beforeIndex: number | null,
  afterIndex: number | null,
  label: string,
  group: string | null = null,
): BrickHistoryEntry {
  return {
    before: before ? cloneBrick(before) : null,
    after: after ? cloneBrick(after) : null,
    beforeIndex,
    afterIndex,
    label,
    group,
    recordedAt: Date.now(),
  }
}

export function draftIsValid(draft: BrickDraft, bricks: BrickInstance[], ignoredId: string | null = null) {
  const part = BRICK_PART_MAP[draft.partId]
  const size = rotatedSize(part, draft.rotation)
  if (draft.x < 0 || draft.z < 0 || draft.y < 0 || draft.x + size.width > GRID_SIZE || draft.z + size.depth > GRID_SIZE) return false

  for (const brick of bricks) {
    if (brick.id === ignoredId) continue
    const other = BRICK_PART_MAP[brick.partId]
    const otherSize = rotatedSize(other, brick.rotation)
    const overlapX = draft.x < brick.x + otherSize.width && draft.x + size.width > brick.x
    const overlapZ = draft.z < brick.z + otherSize.depth && draft.z + size.depth > brick.z
    const overlapY = draft.y < brick.y + other.height && draft.y + part.height > brick.y
    if (overlapX && overlapZ && overlapY) return false
  }
  return true
}

function suggestedDraft(partId: string, color: string): BrickDraft {
  const part = BRICK_PART_MAP[partId]
  return { partId, x: Math.floor(GRID_SIZE / 2 - part.width / 2), y: 0, z: Math.floor(GRID_SIZE / 2 - part.depth / 2), rotation: 0, color }
}

function describeBrick(brick: BrickInstance, index: number, count: number) {
  return `${BRICK_PART_MAP[brick.partId].name}, brick ${index + 1} of ${count}, at X ${brick.x}, Y ${brick.y}, Z ${brick.z}.`
}

export const useBrickStore = create<BrickState>((set, get) => ({
  mode: 'build',
  bricks: [],
  selectedId: null,
  activePartId: BRICK_PARTS[5].id,
  activeColor: BRICK_COLORS[5],
  draft: suggestedDraft(BRICK_PARTS[5].id, BRICK_COLORS[5]),
  movingId: null,
  clipboard: null,
  undoStack: [],
  redoStack: [],
  budgetProfile: 'desktop',
  brickBudget: BRICK_BUDGETS.desktop,
  viewRequest: { preset: 'home', nonce: 0 },
  touchMove: { x: 0, z: 0 },
  touchYaw: Math.PI,
  jumpNonce: 0,
  toast: 'Pick a brick, move over the plate, and tap to place it.',

  setMode: (mode) => set({
    mode,
    selectedId: null,
    draft: mode === 'build' ? get().draft : null,
    movingId: mode === 'explore' ? null : get().movingId,
    toast: mode === 'explore' ? 'Walk around the exact world you built.' : 'Back at the build plate.',
  }),
  choosePart: (partId) => set((state) => ({
    activePartId: partId,
    selectedId: null,
    movingId: null,
    draft: suggestedDraft(partId, state.activeColor),
    toast: `${BRICK_PART_MAP[partId].name} ready to place.`,
  })),
  setActiveColor: (color) => {
    const state = get()
    if (state.draft) {
      set({ activeColor: color, draft: { ...state.draft, color } })
    } else if (state.selectedId) {
      const index = state.bricks.findIndex((brick) => brick.id === state.selectedId)
      const before = state.bricks[index]
      if (!before || before.color === color) {
        set({ activeColor: color })
        return
      }
      const after = { ...before, color }
      set({
        bricks: state.bricks.map((brick) => brick.id === before.id ? after : brick),
        activeColor: color,
        undoStack: appendHistory(state.undoStack, historyEntry(before, after, index, index, 'Change brick color')),
        redoStack: [],
      })
    } else set({ activeColor: color })
  },
  setDraftPosition: (x, y, z) => set((state) => ({ draft: state.draft ? { ...state.draft, x, y, z } : state.draft })),
  placeDraft: () => {
    const state = get()
    if (!state.draft || !draftIsValid(state.draft, state.bricks, state.movingId)) {
      set({ toast: 'That placement overlaps another brick or falls outside the plate.' })
      return false
    }
    if (!state.movingId && state.bricks.length >= state.brickBudget) {
      set({ toast: `This device's ${state.brickBudget}-brick build budget is full. Delete a brick or continue on a larger device.` })
      return false
    }

    if (state.movingId) {
      const index = state.bricks.findIndex((brick) => brick.id === state.movingId)
      const before = state.bricks[index]
      if (!before) return false
      const after = { ...state.draft, id: before.id }
      set({
        bricks: state.bricks.map((brick) => brick.id === before.id ? after : brick),
        selectedId: before.id,
        movingId: null,
        draft: null,
        activePartId: null,
        undoStack: appendHistory(state.undoStack, historyEntry(before, after, index, index, 'Move brick')),
        redoStack: [],
        toast: 'Brick moved.',
      })
    } else {
      const id = `brick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const brick = { ...state.draft, id }
      const index = state.bricks.length
      set({
        bricks: [...state.bricks, brick],
        selectedId: id,
        activePartId: null,
        draft: null,
        undoStack: appendHistory(state.undoStack, historyEntry(null, brick, null, index, 'Place brick')),
        redoStack: [],
        toast: 'Brick snapped into place.',
      })
    }
    return true
  },
  cancelInteraction: () => {
    const state = get()
    if (state.draft) {
      set({
        draft: null,
        movingId: null,
        activePartId: null,
        selectedId: state.movingId ?? null,
        toast: state.movingId ? 'Move canceled.' : 'Placement canceled.',
      })
    } else if (state.selectedId) {
      set({ selectedId: null, toast: 'Selection cleared.' })
    }
  },
  selectBrick: (selectedId) => {
    const state = get()
    const selected = state.bricks.find((brick) => brick.id === selectedId)
    const index = selected ? state.bricks.indexOf(selected) : -1
    set({
      selectedId: selected?.id ?? null,
      activePartId: null,
      draft: null,
      movingId: null,
      toast: selected ? describeBrick(selected, index, state.bricks.length) : state.toast,
    })
  },
  selectAdjacentBrick: (direction) => {
    const state = get()
    if (state.bricks.length === 0) {
      set({ toast: 'There are no placed bricks to select.' })
      return
    }
    const currentIndex = state.bricks.findIndex((brick) => brick.id === state.selectedId)
    const nextIndex = currentIndex === -1
      ? (direction === 1 ? 0 : state.bricks.length - 1)
      : (currentIndex + direction + state.bricks.length) % state.bricks.length
    const selected = state.bricks[nextIndex]
    set({
      selectedId: selected.id,
      activePartId: null,
      draft: null,
      movingId: null,
      toast: describeBrick(selected, nextIndex, state.bricks.length),
    })
  },
  deleteSelected: () => {
    const state = get()
    if (!state.selectedId) return
    const index = state.bricks.findIndex((brick) => brick.id === state.selectedId)
    const before = state.bricks[index]
    if (!before) return
    set({
      bricks: state.bricks.filter((brick) => brick.id !== before.id),
      selectedId: null,
      undoStack: appendHistory(state.undoStack, historyEntry(before, null, index, null, 'Delete brick')),
      redoStack: [],
      toast: 'Brick deleted.',
    })
  },
  rotate: () => {
    const state = get()
    if (state.draft) {
      set({ draft: { ...state.draft, rotation: ((state.draft.rotation + 1) % 4) as BrickDraft['rotation'] } })
    } else if (state.selectedId) {
      const index = state.bricks.findIndex((item) => item.id === state.selectedId)
      const before = state.bricks[index]
      if (!before) return
      const after = { ...before, rotation: ((before.rotation + 1) % 4) as BrickInstance['rotation'] }
      if (draftIsValid(after, state.bricks, before.id)) {
        set({
          bricks: state.bricks.map((item) => item.id === before.id ? after : item),
          undoStack: appendHistory(state.undoStack, historyEntry(before, after, index, index, 'Rotate brick')),
          redoStack: [],
          toast: 'Brick rotated.',
        })
      } else {
        set({ toast: 'Not enough room to rotate this brick.' })
      }
    }
  },
  nudge: (dx, dy, dz) => {
    const state = get()
    const target = state.draft ?? state.bricks.find((brick) => brick.id === state.selectedId)
    if (!target) return
    const next = { ...target, x: target.x + dx, y: Math.max(0, target.y + dy), z: target.z + dz }
    const ignored = state.draft ? state.movingId : state.selectedId
    if (!draftIsValid(next, state.bricks, ignored)) {
      set({ toast: 'That move is blocked by the plate edge or another brick.' })
      return
    }
    if (state.draft) {
      set({ draft: next })
    } else {
      const index = state.bricks.findIndex((brick) => brick.id === state.selectedId)
      const before = state.bricks[index]
      if (!before) return
      const after = { ...next, id: before.id }
      const entry = historyEntry(before, after, index, index, 'Move brick', `nudge:${before.id}`)
      set({
        bricks: state.bricks.map((brick) => brick.id === before.id ? after : brick),
        undoStack: recordNudge(state.undoStack, entry),
        redoStack: [],
        toast: `Brick moved to X ${after.x}, Y ${after.y}, Z ${after.z}.`,
      })
    }
  },
  startMove: () => {
    const state = get()
    const brick = state.bricks.find((item) => item.id === state.selectedId)
    if (brick) set({ draft: { ...brick }, movingId: brick.id, activePartId: brick.partId, toast: 'Choose a new valid location.' })
  },
  copy: () => {
    const brick = get().bricks.find((item) => item.id === get().selectedId)
    if (brick) {
      const { id: _id, ...clipboard } = brick
      set({ clipboard, toast: 'Brick copied.' })
    }
  },
  paste: () => {
    const state = get()
    if (!state.clipboard) return
    set({
      draft: { ...state.clipboard, x: state.clipboard.x + 1, z: state.clipboard.z + 1 },
      movingId: null,
      selectedId: null,
      activePartId: state.clipboard.partId,
      toast: 'Move the copy, then place it.',
    })
  },
  duplicate: () => { get().copy(); get().paste() },
  undo: () => {
    const state = get()
    const previous = state.undoStack.at(-1)
    if (!previous) return
    set({
      bricks: applyHistoryEntry(state.bricks, previous, 'undo'),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: appendHistory(state.redoStack, previous),
      selectedId: previous.before?.id ?? null,
      movingId: null,
      draft: null,
      toast: `Undid: ${previous.label}.`,
    })
  },
  redo: () => {
    const state = get()
    const next = state.redoStack.at(-1)
    if (!next) return
    if (next.before === null && next.after !== null && state.bricks.length >= state.brickBudget) {
      set({ toast: `Redo would exceed this device's ${state.brickBudget}-brick budget.` })
      return
    }
    set({
      bricks: applyHistoryEntry(state.bricks, next, 'redo'),
      undoStack: appendHistory(state.undoStack, next),
      redoStack: state.redoStack.slice(0, -1),
      selectedId: next.after?.id ?? null,
      movingId: null,
      draft: null,
      toast: `Redid: ${next.label}.`,
    })
  },
  setBudgetProfile: (budgetProfile) => set({ budgetProfile, brickBudget: BRICK_BUDGETS[budgetProfile] }),
  requestView: (preset) => set((state) => ({ viewRequest: { preset, nonce: state.viewRequest.nonce + 1 } })),
  setTouchMove: (x, z) => set({ touchMove: { x, z } }),
  addTouchYaw: (delta) => set((state) => ({ touchYaw: state.touchYaw + delta })),
  requestJump: () => set((state) => ({ jumpNonce: state.jumpNonce + 1 })),
  clearToast: () => set({ toast: null }),
}))
