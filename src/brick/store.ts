import { create } from 'zustand'
import { BRICK_COLORS, BRICK_PART_MAP, BRICK_PARTS, GRID_SIZE, rotatedSize } from './parts'
import type { BrickDraft, BrickInstance, BrickMode, ViewPreset } from './types'

type Snapshot = BrickInstance[]

type BrickState = {
  mode: BrickMode
  bricks: BrickInstance[]
  selectedId: string | null
  activePartId: string | null
  activeColor: string
  draft: BrickDraft | null
  movingId: string | null
  clipboard: Omit<BrickInstance, 'id'> | null
  undoStack: Snapshot[]
  redoStack: Snapshot[]
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
  selectBrick: (id: string | null) => void
  deleteSelected: () => void
  rotate: () => void
  nudge: (dx: number, dy: number, dz: number) => void
  startMove: () => void
  copy: () => void
  paste: () => void
  duplicate: () => void
  undo: () => void
  redo: () => void
  requestView: (preset: ViewPreset) => void
  setTouchMove: (x: number, z: number) => void
  addTouchYaw: (delta: number) => void
  requestJump: () => void
  clearToast: () => void
}

const clone = (bricks: BrickInstance[]) => bricks.map((brick) => ({ ...brick }))

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
  viewRequest: { preset: 'home', nonce: 0 },
  touchMove: { x: 0, z: 0 },
  touchYaw: Math.PI,
  jumpNonce: 0,
  toast: 'Pick a brick, move over the plate, and tap to place it.',

  setMode: (mode) => set({ mode, selectedId: null, draft: mode === 'build' ? get().draft : null, toast: mode === 'explore' ? 'Walk around the exact world you built.' : 'Back at the build plate.' }),
  choosePart: (partId) => set((state) => ({ activePartId: partId, selectedId: null, movingId: null, draft: suggestedDraft(partId, state.activeColor), toast: `${BRICK_PART_MAP[partId].name} ready to place.` })),
  setActiveColor: (color) => {
    const state = get()
    if (state.selectedId) {
      set({ bricks: state.bricks.map((brick) => brick.id === state.selectedId ? { ...brick, color } : brick), activeColor: color, undoStack: [...state.undoStack, clone(state.bricks)], redoStack: [] })
    } else {
      set({ activeColor: color, draft: state.draft ? { ...state.draft, color } : state.draft })
    }
  },
  setDraftPosition: (x, y, z) => set((state) => ({ draft: state.draft ? { ...state.draft, x, y, z } : state.draft })),
  placeDraft: () => {
    const state = get()
    if (!state.draft || !draftIsValid(state.draft, state.bricks, state.movingId)) {
      set({ toast: 'That placement overlaps another brick or falls outside the plate.' })
      return false
    }
    const history = [...state.undoStack, clone(state.bricks)]
    if (state.movingId) {
      set({ bricks: state.bricks.map((brick) => brick.id === state.movingId ? { ...state.draft!, id: brick.id } : brick), selectedId: state.movingId, movingId: null, draft: null, activePartId: null, undoStack: history, redoStack: [], toast: 'Brick moved.' })
    } else {
      const id = `brick-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      set({ bricks: [...state.bricks, { ...state.draft, id }], selectedId: id, activePartId: null, draft: null, undoStack: history, redoStack: [], toast: 'Brick snapped into place.' })
    }
    return true
  },
  selectBrick: (selectedId) => set({ selectedId, activePartId: null, draft: null, movingId: null }),
  deleteSelected: () => {
    const state = get()
    if (!state.selectedId) return
    set({ bricks: state.bricks.filter((brick) => brick.id !== state.selectedId), selectedId: null, undoStack: [...state.undoStack, clone(state.bricks)], redoStack: [], toast: 'Brick deleted.' })
  },
  rotate: () => {
    const state = get()
    if (state.draft) set({ draft: { ...state.draft, rotation: ((state.draft.rotation + 1) % 4) as BrickDraft['rotation'] } })
    else if (state.selectedId) {
      const brick = state.bricks.find((item) => item.id === state.selectedId)!
      const rotated = { ...brick, rotation: ((brick.rotation + 1) % 4) as BrickInstance['rotation'] }
      if (draftIsValid(rotated, state.bricks, brick.id)) set({ bricks: state.bricks.map((item) => item.id === brick.id ? rotated : item), undoStack: [...state.undoStack, clone(state.bricks)], redoStack: [] })
      else set({ toast: 'Not enough room to rotate this brick.' })
    }
  },
  nudge: (dx, dy, dz) => {
    const state = get()
    const target = state.draft ?? state.bricks.find((brick) => brick.id === state.selectedId)
    if (!target) return
    const next = { ...target, x: target.x + dx, y: Math.max(0, target.y + dy), z: target.z + dz }
    const ignored = state.draft ? state.movingId : state.selectedId
    if (!draftIsValid(next, state.bricks, ignored)) return
    if (state.draft) set({ draft: next })
    else set({ bricks: state.bricks.map((brick) => brick.id === state.selectedId ? { ...next, id: brick.id } : brick), undoStack: [...state.undoStack, clone(state.bricks)], redoStack: [] })
  },
  startMove: () => {
    const state = get()
    const brick = state.bricks.find((item) => item.id === state.selectedId)
    if (brick) set({ draft: { ...brick }, movingId: brick.id, activePartId: brick.partId, toast: 'Choose a new valid location.' })
  },
  copy: () => {
    const brick = get().bricks.find((item) => item.id === get().selectedId)
    if (brick) set({ clipboard: { ...brick }, toast: 'Brick copied.' })
  },
  paste: () => {
    const state = get()
    if (!state.clipboard) return
    set({ draft: { ...state.clipboard, x: state.clipboard.x + 1, z: state.clipboard.z + 1 }, movingId: null, selectedId: null, activePartId: state.clipboard.partId, toast: 'Move the copy, then place it.' })
  },
  duplicate: () => { get().copy(); get().paste() },
  undo: () => {
    const state = get(); const previous = state.undoStack.at(-1); if (!previous) return
    set({ bricks: clone(previous), undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, clone(state.bricks)], selectedId: null, draft: null })
  },
  redo: () => {
    const state = get(); const next = state.redoStack.at(-1); if (!next) return
    set({ bricks: clone(next), undoStack: [...state.undoStack, clone(state.bricks)], redoStack: state.redoStack.slice(0, -1), selectedId: null, draft: null })
  },
  requestView: (preset) => set((state) => ({ viewRequest: { preset, nonce: state.viewRequest.nonce + 1 } })),
  setTouchMove: (x, z) => set({ touchMove: { x, z } }),
  addTouchYaw: (delta) => set((state) => ({ touchYaw: state.touchYaw + delta })),
  requestJump: () => set((state) => ({ jumpNonce: state.jumpNonce + 1 })),
  clearToast: () => set({ toast: null }),
}))
