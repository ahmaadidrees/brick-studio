/**
 * Undo and redo for the builder. The store has no history of its own, so the builder keeps a simple stack of edits
 * (tile strokes and copy add, remove and move) and replays them through the store's public actions.
 * Code, costume and knob changes are not part of it: they happen in the workshop and the knob card.
 */
import type { CopyPlacement } from '../../core/contracts'
import type { StudioStore } from '../store'
import { tileCharAt } from './tilePaint'

export interface Edit {
  undo(): void
  redo(): void
  /** A copy this edit refers to was re-created under a new id. */
  remap?(from: string, to: string): void
}

const LIMIT = 200

export class History {
  private undoStack: Edit[] = []
  private redoStack: Edit[] = []
  private listeners = new Set<() => void>()
  private version = 0

  constructor(readonly store: StudioStore) {}

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getVersion = (): number => this.version

  private bump() {
    this.version++
    for (const l of this.listeners) l()
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  push(edit: Edit) {
    this.undoStack.push(edit)
    if (this.undoStack.length > LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.bump()
  }

  undo() {
    const e = this.undoStack.pop()
    if (!e) return
    e.undo()
    this.redoStack.push(e)
    this.bump()
  }

  redo() {
    const e = this.redoStack.pop()
    if (!e) return
    e.redo()
    this.undoStack.push(e)
    this.bump()
  }

  clear() {
    this.undoStack = []
    this.redoStack = []
    this.bump()
  }

  remap(from: string, to: string) {
    if (from === to) return
    for (const e of this.undoStack) e.remap?.(from, to)
    for (const e of this.redoStack) e.remap?.(from, to)
  }
}

export interface TileChange {
  col: number
  row: number
  from: string
  to: string
}

/** One drag across the level: undone and redone as a single step. A cell is only touched if it still holds what the edit expects. */
export function tileStrokeEdit(store: StudioStore, changes: TileChange[]): Edit {
  const apply = (key: 'from' | 'to', expect: 'to' | 'from', list: TileChange[]) => {
    for (const c of list) {
      const layer = store.getState().project.design.tiles
      if (!layer) return
      if (tileCharAt(layer, c.col, c.row) !== c[expect]) continue
      store.setTile(c.col, c.row, c[key])
    }
  }
  return {
    undo: () => apply('from', 'to', [...changes].reverse()),
    redo: () => apply('to', 'from', changes),
  }
}

export function addCopyEdit(h: History, copy: CopyPlacement): Edit {
  let id = copy.id
  return {
    undo: () => h.store.deleteCopy(id),
    redo: () => {
      const next = h.store.addCopy(copy.brickId, copy.x, copy.y)
      const { id: _id, brickId: _b, x: _x, y: _y, ...rest } = copy
      if (Object.keys(rest).length) h.store.updateCopy(next, rest)
      const old = id
      id = next
      h.remap(old, next)
    },
    remap: (from, to) => {
      if (id === from) id = to
    },
  }
}

export function removeCopyEdit(h: History, copy: CopyPlacement): Edit {
  let id = copy.id
  return {
    undo: () => {
      const next = h.store.addCopy(copy.brickId, copy.x, copy.y)
      const { id: _id, brickId: _b, x: _x, y: _y, ...rest } = copy
      if (Object.keys(rest).length) h.store.updateCopy(next, rest)
      const old = id
      id = next
      h.remap(old, next)
    },
    redo: () => h.store.deleteCopy(id),
    remap: (from, to) => {
      if (id === from) id = to
    },
  }
}

export function moveCopyEdit(h: History, copyId: string, from: { x: number; y: number }, to: { x: number; y: number }): Edit {
  let id = copyId
  return {
    undo: () => h.store.updateCopy(id, from),
    redo: () => h.store.updateCopy(id, to),
    remap: (a, b) => {
      if (id === a) id = b
    },
  }
}
