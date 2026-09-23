import { useMemo } from 'react'
import { create } from 'zustand'
import { STUD } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { useCodeView } from '../code/codeViewState'
import { useDriveView } from '../drive/driveViewState'
import type { DerivedCreation } from '../model/creations'
import type { Vec3 } from '../model/vec'
import { roboticsSpec } from '../parts/catalog'
import { useRoboticsStore } from '../state/roboticsStore'

/**
 * Which robot the panel is about (lane P): the one the student last touched. Selecting any of
 * its bricks, placing a part on it, starting it, or opening it in Drive, Try it or Code makes a
 * robot the focused one, and it stays focused while nothing is selected, however many robots
 * come after it in the list. A motor test running on another robot never takes the panel: it
 * stops when the student picks a brick of a different robot.
 */
export type RobotFocusState = {
  creationId: string | null
  focus: (creationId: string | null) => void
}

export const useRobotFocus = create<RobotFocusState>((set) => ({
  creationId: null,
  focus: (creationId) => set((state) => (state.creationId === creationId ? state : { creationId })),
}))

/** The robot a brick belongs to: one of its bricks, or a wheel listed with it (a loose wheel beside its axle). */
export function ownerOf(creations: readonly DerivedCreation[], brickId: string | null | undefined): DerivedCreation | null {
  if (!brickId) return null
  return creations.find((creation) => creation.brickIds.includes(brickId) || creation.wheels.some((wheel) => wheel.brickId === brickId)) ?? null
}

/**
 * The robot the panel shows (pure): the owner of the selected brick; else the robot last focused,
 * if it is still there; else the newest robot.
 */
export function pickFocusedCreation(creations: readonly DerivedCreation[], selectedId: string | null, focusedId: string | null): DerivedCreation | null {
  const owner = ownerOf(creations, selectedId)
  if (owner) return owner
  const focused = focusedId ? creations.find((creation) => creation.id === focusedId) : undefined
  return focused ?? creations.at(-1) ?? null
}

export function useFocusedCreation(): DerivedCreation | null {
  const creations = useRoboticsStore((state) => state.model.creations)
  const selectedId = useBrickStore((state) => state.selectedId)
  const focusedId = useRobotFocus((state) => state.creationId)
  return useMemo(() => pickFocusedCreation(creations, selectedId, focusedId), [creations, selectedId, focusedId])
}

/** Studs of ground kept in view around a robot framed on the way back to Build (as a placed kit is). */
const ROOM_AROUND_STUDS = 3

/** The ground corners `studs` out around these bricks' footprint, in world units (for a frame request). */
export function groundAround(bricks: readonly BrickInstance[], partMap: Readonly<Record<string, { width: number; depth: number } | undefined>>, plateSize: number, studs = ROOM_AROUND_STUDS): Vec3[] {
  if (!bricks.length) return []
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const brick of bricks) {
    const part = roboticsSpec(brick.partId)?.part ?? partMap[brick.partId]
    if (!part) continue
    const turned = brick.rotation % 2 === 1
    minX = Math.min(minX, brick.x)
    minZ = Math.min(minZ, brick.z)
    maxX = Math.max(maxX, brick.x + (turned ? part.depth : part.width))
    maxZ = Math.max(maxZ, brick.z + (turned ? part.width : part.depth))
  }
  if (!Number.isFinite(minX)) return []
  const xs = [minX - studs, maxX + studs]
  const zs = [minZ - studs, maxZ + studs]
  return xs.flatMap((x) => zs.map((z) => ({ x: (x - plateSize / 2) * STUD, y: 0, z: (z - plateSize / 2) * STUD })))
}

/**
 * Back to build from Drive, Try it or Code: the robot that was open is the panel's, framed with
 * a little ground around it in the part of the canvas the drawer and the panel leave free (the
 * scene measures them once they are back, a frame later), as Frame does for the whole build.
 */
export function frameOnReturn(creationId: string) {
  useRobotFocus.getState().focus(creationId)
  const robotics = useRoboticsStore.getState()
  const robot = robotics.model.creations.find((creation) => creation.id === creationId)
  if (!robot) return
  const ids = new Set(robot.brickIds)
  const bricks = robotics.model.input.bricks.filter((brick) => ids.has(brick.id))
  robotics.requestFrame(robot.brickIds, groundAround(bricks, robotics.model.input.partMap, robotics.model.input.plateSize))
}

/**
 * A view closed. Opening Drive closes Code in the same breath, so this waits until the stores
 * settle and frames only when the student is really back in Build.
 */
function backToBuild(creationId: string) {
  queueMicrotask(() => {
    if (useDriveView.getState().creationId || useCodeView.getState().creationId) return
    frameOnReturn(creationId)
  })
}

let unsubscribers: (() => void)[] = []

/** Keeps the focus with the robot the student touches, once (the robot panel installs it). */
export function installRobotFocusWatcher() {
  if (unsubscribers.length) return
  const focus = (id: string) => useRobotFocus.getState().focus(id)
  const creations = () => useRoboticsStore.getState().model.creations
  /** A placed brick not (yet) part of a robot: the next model says whether it joined one. */
  let placedPending: string | null = null
  unsubscribers = [
    useBrickStore.subscribe((state, previous) => {
      if (state.selectedId && state.selectedId !== previous.selectedId) {
        const owner = ownerOf(creations(), state.selectedId)
        if (owner) {
          focus(owner.id)
          // Another robot's motor test stops: the panel (and its More) is about this robot now.
          const robotics = useRoboticsStore.getState()
          if ((robotics.sim && robotics.sim.creationId !== owner.id) || (!robotics.sim && robotics.simLoading)) robotics.resetSim()
        }
      }
      if (state.placeFeedback && state.placeFeedback !== previous.placeFeedback) {
        const owner = ownerOf(creations(), state.placeFeedback.id)
        if (owner) focus(owner.id)
        else placedPending = state.placeFeedback.id
      }
    }),
    useRoboticsStore.subscribe((state, previous) => {
      if (state.sim && state.sim !== previous.sim) focus(state.sim.creationId)
      if (state.model === previous.model) return
      // A robot that was not there before is the one being made (a kit placed, a card confirmed).
      const before = new Set(previous.model.creations.map((creation) => creation.id))
      const added = state.model.creations.filter((creation) => !before.has(creation.id))
      if (added.length) focus(added[added.length - 1].id)
      if (placedPending) {
        const owner = ownerOf(state.model.creations, placedPending)
        placedPending = null
        if (owner) focus(owner.id)
      }
    }),
    useDriveView.subscribe((state, previous) => {
      if (state.creationId) focus(state.creationId)
      else if (previous.creationId) backToBuild(previous.creationId)
    }),
    useCodeView.subscribe((state, previous) => {
      if (state.creationId) focus(state.creationId)
      else if (previous.creationId) backToBuild(previous.creationId)
    }),
  ]
}

/** For tests: forget the focus and the wiring, so fresh stores can install it again. */
export function resetRobotFocusForTests() {
  for (const unsubscribe of unsubscribers) unsubscribe()
  unsubscribers = []
  useRobotFocus.setState({ creationId: null })
}
