import { describe, expect, it } from 'vitest'
import {
  BUILD_TOUCH_DRAG_THRESHOLD,
  GHOST_DRAG_SLOP_PX,
  MOUSE_CLICK_DRAG_THRESHOLD,
  beginBuildPointer,
  beginPointerTravel,
  cancelBuildPointer,
  createBuildGestureState,
  createPointerTravel,
  endPointerTravel,
  finishBuildPointer,
  interruptBuildPointers,
  isConfirmationPlacementPointer,
  isGhostDropTarget,
  pointWithinInflatedRect,
  pointerTravelExceeds,
  resetBuildPointers,
  shouldSuppressBuildTouchClick,
  takeBuildPointerCompletion,
  updateBuildPointer,
  updatePointerTravel,
} from './buildInput'

describe('device-adaptive Build input', () => {
  it('keeps mouse placement direct while requiring confirmation for touch and pen', () => {
    expect(isConfirmationPlacementPointer('mouse')).toBe(false)
    expect(isConfirmationPlacementPointer('')).toBe(false)
    expect(isConfirmationPlacementPointer('touch')).toBe(true)
    expect(isConfirmationPlacementPointer('pen')).toBe(true)
  })

  it('classifies a touch tap as position-only and guards its synthetic click', () => {
    const state = createBuildGestureState()
    expect(beginBuildPointer(state, 1, 'touch', 20, 30)).toBe(true)
    expect(finishBuildPointer(state, 1, 23, 32, 100)?.intent).toBe('position')
    expect(takeBuildPointerCompletion(state, 1)?.intent).toBe('position')
    expect(shouldSuppressBuildTouchClick(state, 200)).toBe(true)
    expect(shouldSuppressBuildTouchClick(state, 1000)).toBe(false)
  })

  it('classifies movement at the drag threshold as camera navigation, never placement', () => {
    const state = createBuildGestureState()
    beginBuildPointer(state, 2, 'touch', 0, 0)
    updateBuildPointer(state, 2, BUILD_TOUCH_DRAG_THRESHOLD, 0)

    expect(finishBuildPointer(state, 2, BUILD_TOUCH_DRAG_THRESHOLD, 0, 10)?.intent).toBe('camera')
  })

  it('marks both pointers as camera navigation when a pinch/pan begins', () => {
    const state = createBuildGestureState()
    beginBuildPointer(state, 3, 'touch', 10, 10)
    beginBuildPointer(state, 4, 'touch', 40, 10)

    expect(finishBuildPointer(state, 3, 10, 10, 50)?.intent).toBe('camera')
    expect(finishBuildPointer(state, 4, 40, 10, 60)?.intent).toBe('camera')
  })

  it('cancels interrupted gestures and clears all transient outcomes', () => {
    const state = createBuildGestureState()
    beginBuildPointer(state, 5, 'touch', 10, 10)
    expect(cancelBuildPointer(state, 5, 100)).toBe(true)
    expect(takeBuildPointerCompletion(state, 5)).toBeNull()

    beginBuildPointer(state, 6, 'touch', 10, 10)
    finishBuildPointer(state, 6, 10, 10, 200)
    resetBuildPointers(state)
    expect(state.pointers.size).toBe(0)
    expect(state.completions.size).toBe(0)
    expect(shouldSuppressBuildTouchClick(state, 201)).toBe(false)
  })

  it('guards the trailing click when blur, visibility, or viewport changes interrupt a touch', () => {
    const state = createBuildGestureState()
    beginBuildPointer(state, 7, 'touch', 10, 10)

    expect(interruptBuildPointers(state, 100)).toBe(true)
    expect(state.pointers.size).toBe(0)
    expect(shouldSuppressBuildTouchClick(state, 101)).toBe(true)
  })
})

describe('mouse click drag guard', () => {
  it('lets a steady click through and guards one that travelled past the threshold', () => {
    const travel = createPointerTravel()
    beginPointerTravel(travel, 100, 100)
    updatePointerTravel(travel, 103, 100)
    expect(pointerTravelExceeds(travel)).toBe(false)

    updatePointerTravel(travel, 100 + MOUSE_CLICK_DRAG_THRESHOLD + 1, 100)
    endPointerTravel(travel)
    expect(pointerTravelExceeds(travel)).toBe(true)
  })

  it('remembers peak travel for the trailing click even after returning to the origin', () => {
    const travel = createPointerTravel()
    beginPointerTravel(travel, 50, 50)
    updatePointerTravel(travel, 90, 50)
    updatePointerTravel(travel, 50, 50)
    endPointerTravel(travel)
    expect(pointerTravelExceeds(travel)).toBe(true)
  })

  it('re-arms a clean click on the next pointer down', () => {
    const travel = createPointerTravel()
    beginPointerTravel(travel, 0, 0)
    updatePointerTravel(travel, 40, 0)
    endPointerTravel(travel)

    beginPointerTravel(travel, 10, 10)
    updatePointerTravel(travel, 12, 10)
    expect(pointerTravelExceeds(travel)).toBe(false)
  })

  it('ignores movement while no pointer is down', () => {
    const travel = createPointerTravel()
    beginPointerTravel(travel, 0, 0)
    endPointerTravel(travel)
    updatePointerTravel(travel, 100, 100)
    expect(pointerTravelExceeds(travel)).toBe(false)
  })
})

describe('ghost drag grab test', () => {
  const ghost = { left: 100, top: 80, right: 140, bottom: 130 }

  it('grabs a touch inside the projected ghost box', () => {
    expect(pointWithinInflatedRect(ghost, 120, 100)).toBe(true)
    expect(pointWithinInflatedRect(ghost, 100, 80)).toBe(true)
    expect(pointWithinInflatedRect(ghost, 140, 130)).toBe(true)
  })

  it('keeps a near miss grabbable so small bricks stay fingertip-sized', () => {
    expect(pointWithinInflatedRect(ghost, 100 - GHOST_DRAG_SLOP_PX, 80 - GHOST_DRAG_SLOP_PX)).toBe(true)
    expect(pointWithinInflatedRect(ghost, 140 + GHOST_DRAG_SLOP_PX, 130 + GHOST_DRAG_SLOP_PX)).toBe(true)
  })

  it('leaves touches beyond the slop to the camera', () => {
    expect(pointWithinInflatedRect(ghost, 100 - GHOST_DRAG_SLOP_PX - 1, 100)).toBe(false)
    expect(pointWithinInflatedRect(ghost, 120, 130 + GHOST_DRAG_SLOP_PX + 1)).toBe(false)
    expect(pointWithinInflatedRect(ghost, 400, 400)).toBe(false)
  })

  it('never grabs a ghost that projected off-screen', () => {
    expect(pointWithinInflatedRect(null, 120, 100)).toBe(false)
  })

  it('honours an explicit slop override', () => {
    expect(pointWithinInflatedRect(ghost, 96, 100, 0)).toBe(false)
    expect(pointWithinInflatedRect(ghost, 96, 100, 4)).toBe(true)
  })

  it('drops onto placed bricks and the build plate but never the untagged ghost', () => {
    expect(isGhostDropTarget({ brickId: 'brick-3' })).toBe(true)
    expect(isGhostDropTarget({ isBaseplate: true })).toBe(true)
    expect(isGhostDropTarget({})).toBe(false)
    expect(isGhostDropTarget({ brickId: 7 })).toBe(false)
    expect(isGhostDropTarget({ isBaseplate: false })).toBe(false)
  })
})
