import { create } from 'zustand'
import { useBrickStore, type BrickState } from '../../brick/store'

/**
 * A part armed from a next step or a "Make it yours" idea is placed once (lane P): when that part
 * lands, the studio's brush is put down, so the command strip goes back to "Pick a brick from the
 * drawer" instead of still saying "Placing Seat" over a see-through seat, and the new part
 * flashes, so it is plain that it was placed. A part chosen in the drawer keeps the studio's
 * repeat placement; so does a row that asks for several (stacking bricks).
 */
let pending: { partId: string } | null = null
let stopWatching: (() => void) | null = null

export type PlacedFlash = { brickId: string; nonce: number }

export const usePlacedFlash = create<{ flash: PlacedFlash | null; show: (brickId: string) => void; clear: () => void }>((set) => ({
  flash: null,
  show: (brickId) => set((state) => ({ flash: { brickId, nonce: (state.flash?.nonce ?? 0) + 1 } })),
  clear: () => set({ flash: null }),
}))

/** Call right after arming `partId` (the drawer's `choosePart`): its next placement is its last. */
export function armOnce(partId: string) {
  pending = { partId }
  stopWatching ??= useBrickStore.subscribe(watch)
}

/** The part armed to be placed once, if one is (for tests and the harness). */
export function oneShotPartId(): string | null {
  return pending?.partId ?? null
}

function watch(state: BrickState, previous: BrickState) {
  if (!pending) return
  if (state.placeFeedback && state.placeFeedback !== previous.placeFeedback) {
    const placed = state.bricks.find((brick) => brick.id === state.placeFeedback!.id)
    // A fresh placement of that part (not a move, a duplicate or a kit landing).
    const fresh = Boolean(previous.draft) && !previous.movingId && !previous.movingSelection
    if (placed && fresh && placed.partId === pending.partId) {
      pending = null
      useBrickStore.setState({ draft: null, activePartId: null })
      usePlacedFlash.getState().show(placed.id)
      return
    }
  }
  // The student put the part down, swapped it for another or moved something: an ordinary brush from here.
  if (!state.draft || state.activePartId !== pending.partId || state.movingId || state.movingSelection) pending = null
}

/** For tests: forget any pending one-shot and the watcher. */
export function resetOneShotForTests() {
  pending = null
  stopWatching?.()
  stopWatching = null
  usePlacedFlash.setState({ flash: null })
}
