import { create } from 'zustand'
import { BRICK_PART_MAP } from '../../brick/parts'
import { useBrickStore, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { computeModel, useRoboticsStore } from '../state/roboticsStore'
import { attachSpot, onARobot } from './onRobot'

/**
 * A part armed from a next step or a "Make it yours" idea is placed once (lane P): when that part
 * lands, the studio's brush is put down, so the command strip goes back to "Pick a brick from the
 * drawer" instead of still saying "Placing Seat" over a see-through seat, and the new part
 * flashes, so it is plain that it was placed. A part chosen in the drawer keeps the studio's
 * repeat placement; so does a row that asks for several (stacking bricks).
 *
 * A part meant for a robot (an idea's seat or light) that lands on no robot goes back into the
 * hand, set on the robot's highest free spot again, and a line says where it goes (Ava's first
 * seat landed loose on the ground and nothing said so).
 */
let pending: { partId: string; robotId: string | null } | null = null
let stopWatching: (() => void) | null = null

export type PlacedFlash = { brickId: string; nonce: number }

export const usePlacedFlash = create<{ flash: PlacedFlash | null; show: (brickId: string) => void; clear: () => void }>((set) => ({
  flash: null,
  show: (brickId) => set((state) => ({ flash: { brickId, nonce: (state.flash?.nonce ?? 0) + 1 } })),
  clear: () => set({ flash: null }),
}))

/** Call right after arming `partId` (the drawer's `choosePart`): its next placement is its last. `robotId`: it must land on a robot. */
export function armOnce(partId: string, robotId: string | null = null) {
  pending = { partId, robotId }
  stopWatching ??= useBrickStore.subscribe(watch)
}

/** Moves the armed part onto the robot's highest free spot where it joins it; false when there is none. */
export function putOnRobot(robotId: string): boolean {
  const state = useBrickStore.getState()
  if (!state.draft) return false
  const spot = attachSpot(computeModel(state).input, robotId, state.draft)
  if (!spot) return false
  state.setDraftPosition(spot.x, spot.y, spot.z)
  return true
}

/**
 * The part just placed joined no robot: it is taken off the plate (its placement leaves the
 * history as if it never happened) and the part in hand is set on the robot again. Only a
 * placement that is the newest history entry is taken back.
 */
function takeBack(placed: BrickInstance, robotId: string) {
  const state = useBrickStore.getState()
  const top = state.undoStack.at(-1)
  const isThisPlacement = top && !top.documentBefore && top.deltas.length === 1 && top.deltas[0].before === null && top.deltas[0].after?.id === placed.id
  if (!isThisPlacement) { pending = null; return }
  useBrickStore.setState({ bricks: state.bricks.filter((brick) => brick.id !== placed.id), undoStack: state.undoStack.slice(0, -1) })
  // Whatever the placement said about the part (a card, a wiring line) is about a part that is not there.
  const robotics = useRoboticsStore.getState()
  if (robotics.card && !robotics.card.creationId) robotics.closeCard()
  robotics.dismissWiringNote()
  const robot = computeModel(useBrickStore.getState()).creations.find((creation) => creation.id === robotId)
  const what = (BRICK_PART_MAP[placed.partId]?.name ?? 'part').toLowerCase()
  const where = robot?.name ?? 'the robot'
  if (putOnRobot(robotId)) {
    const line = `The ${what} goes on ${where}. It is back on top: press Place.`
    useBrickStore.setState({ toast: line, announcement: line })
    return
  }
  pending = null
  const line = `There is no room on ${where} for the ${what}.`
  useBrickStore.setState({ draft: null, activePartId: null, toast: line, announcement: line })
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
      if (pending.robotId && !onARobot(computeModel(state).input, placed.id)) { takeBack(placed, pending.robotId); return }
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
