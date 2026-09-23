import { create } from 'zustand'
import { getBuildPlateSize } from '../../brick/buildPlate'
import { findGroupPasteDrafts, useBrickStore, validateBrickGroup, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { readiness } from '../drive/readiness'
import type { DerivedCreation } from '../model/creations'
import { writeRoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { computeModel, useRoboticsStore } from '../state/roboticsStore'
import { kitAt, kitById, placeKitInSection, type Kit, type KitId } from './kits'

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
  // Nothing stays picked (lane P, Ava): a picked kit made the strip's Color say "Color all 9 bricks"
  // and paint the tyres, and swallowed the next click on one of its parts. The panel shows the new
  // robot without it (the newest robot touched), one Undo takes the whole kit away, and a box drawn
  // around it picks all of it again for Rotate or Delete.
  brickStore.selectBricks([])
  const label = !placement.joined.length ? `Add ${placement.name}` : placement.creationId ? `Add a ${kit.name} to ${placement.name}` : `Add a ${kit.name}`
  useBrickStore.getState().setRoboticsSection(writeRoboticsSection(placement.section), label)
  const steps = entriesSincePlacement(placedIds)
  if (steps > 0) useBrickStore.getState().mergeHistory(steps, label)
  const robotics = useRoboticsStore.getState()
  robotics.refreshModel()
  const robot = useRoboticsStore.getState().model.creations.find((creation) => creation.id === placement.creationId) ?? null
  // The new robot framed snug in the canvas the drawer and the panel leave free, with some ground showing
  // around it (lane P: with three studs of ground around it, a Buggy was drawn 130 px wide at 1024 × 768).
  robotics.requestFrame(robot?.brickIds ?? placedIds, undefined, { snug: true })
  const message = placedMessage(kit, placement.name, placement.joined, robot)
  useBrickStore.setState({ toast: message, announcement: message })
}

function placedMessage(kit: Kit, name: string, joined: readonly DerivedCreation[], robot: DerivedCreation | null): string {
  if (joined.length > 1) return `The ${kit.name} joins ${joined.map((creation) => creation.name).join(' and ')}.`
  if (joined.length) return `The ${kit.name} is part of ${name} now.`
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
