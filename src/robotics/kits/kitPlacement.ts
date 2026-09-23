import { create } from 'zustand'
import { getBuildPlateSize } from '../../brick/buildPlate'
import { STUD } from '../../brick/parts'
import { findGroupPasteDrafts, useBrickStore, validateBrickGroup, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { readiness } from '../drive/readiness'
import type { DerivedCreation } from '../model/creations'
import { writeRoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { computeModel, useRoboticsStore } from '../state/roboticsStore'
import type { Vec3 } from '../model/vec'
import { kitAt, kitById, kitFootprint, placeKitInSection, type Kit, type KitId } from './kits'

/**
 * Placing a kit (docs/robotics/KID-UX.md §K). A kit is armed as the studio's own group ghost:
 * the kit's bricks as a new group (`movingSelection` with `duplicate`), so the ghost follows the
 * pointer or the tap, shows valid or blocked like any brick, and one click, Enter or the Place
 * button places it through `placeDraft`. This module watches for that placement and, in the same
 * update, makes the new bricks a robot: its name, its cables, one Undo for all of it, and the
 * focus on it.
 */
export type ArmedKit = { kitId: KitId; originals: BrickInstance[] }

export type KitState = { armed: ArmedKit | null }

export const useKitStore = create<KitState>(() => ({ armed: null }))

const coarsePointer = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false)

const creationId = () => `creation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/** Where the kit's ghost first appears: centred on what the camera looks at, on free ground if there is some near. */
function startingBricks(kit: Kit, state: BrickState): BrickInstance[] {
  const plateSize = getBuildPlateSize(state.documentMetadata)
  const centred = kitAt(kit, state.viewTarget ?? { x: plateSize / 2, z: plateSize / 2 }, plateSize)
  if (validateBrickGroup(centred, state.bricks, state.brickBudget, plateSize).valid) return centred
  const nearby = findGroupPasteDrafts({ bricks: centred }, state.bricks, state.brickBudget, plateSize).drafts
  return nearby ? nearby.map((draft, index) => ({ ...draft, id: centred[index].id })) : centred
}

/**
 * Arms a kit: its ghost appears where the camera looks, ready to follow the pointer. Returns
 * false (and says why) when the world has no room for its bricks.
 */
export function armKit(kitId: KitId): boolean {
  installRoboticsParts()
  installKitWatcher()
  const state = useBrickStore.getState()
  if (state.mode !== 'build' || state.graphicsPaused) return false
  const kit = kitById(kitId)
  if (state.bricks.length + kit.bricks.length > state.brickBudget) {
    useBrickStore.setState({ toast: `There is no room for a ${kit.name} in this world. Delete some bricks first.` })
    return false
  }
  const originals = startingBricks(kit, state)
  // The kit store first, so the watcher never sees this ghost without knowing it is a kit.
  useKitStore.setState({ armed: { kitId, originals } })
  const [base] = originals
  useBrickStore.setState({
    draft: { partId: base.partId, x: base.x, y: base.y, z: base.z, rotation: base.rotation, color: base.color },
    movingId: null,
    movingSelection: { originals, duplicate: true, name: kit.name },
    activePartId: null,
    selectedIds: [],
    selectedId: null,
    toast: coarsePointer() ? `Tap where your ${kit.name} goes, then press Place.` : `Click the plate where your ${kit.name} goes.`,
    announcement: `${kit.name} ready to place.`,
  })
  return true
}

/**
 * Studs of ground kept in view around a placed kit: a little of where it will drive or where someone
 * walks up to it, without the camera closing in on the kit alone or pulling far back from it.
 */
const ROOM_AROUND_STUDS = 3

/** The ground corners around the placed kit, `ROOM_AROUND_STUDS` out, for the frame request. */
function roomAround(placed: readonly BrickInstance[], plateSize: number): Vec3[] {
  const minX = Math.min(...placed.map((brick) => brick.x))
  const minZ = Math.min(...placed.map((brick) => brick.z))
  const { width, depth } = kitFootprint(placed)
  const xs = [minX - ROOM_AROUND_STUDS, minX + width + ROOM_AROUND_STUDS]
  const zs = [minZ - ROOM_AROUND_STUDS, minZ + depth + ROOM_AROUND_STUDS]
  return xs.flatMap((x) => zs.map((z) => ({ x: (x - plateSize / 2) * STUD, y: 0, z: (z - plateSize / 2) * STUD })))
}

/** The newest undo entry that placed exactly these bricks, counted from the top of the stack. */
function entriesSincePlacement(placedIds: readonly string[]): number {
  const stack = useBrickStore.getState().undoStack
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index]
    if (!entry.documentBefore && entry.deltas.length === placedIds.length && entry.deltas.every((delta, position) => delta.before === null && delta.after?.id === placedIds[position])) return stack.length - index
  }
  return 0
}

/** The kit's bricks were just placed as `placedIds`: they become a named robot, plugged in, in one Undo. */
function finishPlacement(kit: Kit, placedIds: string[]) {
  const brickStore = useBrickStore.getState()
  const placement = placeKitInSection(computeModel(brickStore), kit, placedIds, creationId())
  // The whole kit stays selected, its base plate last: the panel follows the selected brick, so it
  // shows the robot rather than one of its parts, and Rotate, Color or Delete act on all of it.
  brickStore.selectBricks([...placedIds.slice(1), placedIds[0]])
  const label = placement.joined.length ? `Add a ${kit.name} to ${placement.name}` : `Add ${placement.name}`
  useBrickStore.getState().setRoboticsSection(writeRoboticsSection(placement.section), label)
  const steps = entriesSincePlacement(placedIds)
  if (steps > 0) useBrickStore.getState().mergeHistory(steps, label)
  const robotics = useRoboticsStore.getState()
  robotics.refreshModel()
  const robot = useRoboticsStore.getState().model.creations.find((creation) => creation.id === placement.creationId) ?? null
  // The new robot framed with ground around it, so the camera does not close in on it alone.
  const placed = useBrickStore.getState().bricks.filter((candidate) => placedIds.includes(candidate.id))
  robotics.requestFrame(robot?.brickIds ?? placedIds, roomAround(placed, getBuildPlateSize(useBrickStore.getState().documentMetadata)))
  const message = placedMessage(kit, placement.name, placement.joined.length > 0, robot)
  useBrickStore.setState({ toast: message, announcement: message })
}

function placedMessage(kit: Kit, name: string, joined: boolean, robot: DerivedCreation | null): string {
  if (joined) return robot ? `The ${kit.name} is part of ${name} now.` : `The ${kit.name} joined two robots.`
  if (!robot) return `${name} is on the plate.`
  const state = readiness(robot)
  if (state.ready) return state.kind === 'drive' ? `${name} is ready to drive!` : `${name} is ready. Try it!`
  return `${name} is ready for your parts!`
}

let stopWatching: (() => void) | null = null

/**
 * Watches the brick store while a kit is armed. Kits stand on the ground: a ghost the pointer
 * lifted onto another brick drops back down (where it shows blocked if it overlaps). When the
 * ghost goes away in the same update that a placement was made, the kit was placed; any other
 * way (Cancel, another part, Undo, Explore) it was put away.
 */
export function installKitWatcher() {
  if (stopWatching) return
  stopWatching = useBrickStore.subscribe((state, previous) => {
    const armed = useKitStore.getState().armed
    if (!armed) return
    if (state.movingSelection?.originals === armed.originals) {
      if (state.draft && state.draft.y !== 0) useBrickStore.setState({ draft: { ...state.draft, y: 0 } })
      return
    }
    useKitStore.setState({ armed: null })
    const placed = previous.movingSelection?.originals === armed.originals && state.placeFeedback !== null && state.placeFeedback !== previous.placeFeedback
    if (!placed) return
    const placedIds = state.bricks.slice(-armed.originals.length).map((candidate) => candidate.id)
    const kit = kitById(armed.kitId)
    if (!state.bricks.slice(-armed.originals.length).every((candidate, index) => candidate.partId === kit.bricks[index].partId)) return
    finishPlacement(kit, placedIds)
  })
}

/** For tests: forget the watcher so a fresh store can install it again. */
export function resetKitWatcherForTests() {
  stopWatching?.()
  stopWatching = null
  useKitStore.setState({ armed: null })
}
