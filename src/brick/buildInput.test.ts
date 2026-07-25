import { describe, expect, it } from 'vitest'
import {
  BUILD_TOUCH_DRAG_THRESHOLD,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_RADIUS_PX,
  GHOST_DRAG_SLOP_PX,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
  MOUSE_CLICK_DRAG_THRESHOLD,
  beginBuildPointer,
  beginLongPress,
  beginPointerTravel,
  cancelBuildPointer,
  cancelLongPress,
  createBuildGestureState,
  createLongPressState,
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
  takeDoubleTapPlacement,
  takeLongPressGrab,
  updateBuildPointer,
  updateLongPress,
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

  it('never drops the moving brick onto its own original', () => {
    expect(isGhostDropTarget({ brickId: 'brick-3' }, 'brick-3')).toBe(false)
    expect(isGhostDropTarget({ brickId: 'brick-4' }, 'brick-3')).toBe(true)
    expect(isGhostDropTarget({ isBaseplate: true }, 'brick-3')).toBe(true)
  })
})

describe('long press to grab a placed brick', () => {
  const arm = (now = 0) => {
    const state = createLongPressState()
    expect(beginLongPress(state, 1, 'touch', 'brick-1', 100, 100, now)).toBe(true)
    return state
  }

  it('fires once the hold threshold passes with a still pointer', () => {
    const state = arm()
    expect(takeLongPressGrab(state, 1, LONG_PRESS_MS)).toMatchObject({ pointerId: 1, brickId: 'brick-1' })
    expect(state.hold).toBeNull()
  })

  it('stays pending until the threshold so a quick tap still belongs to the camera', () => {
    const state = arm(1000)
    expect(takeLongPressGrab(state, 1, 1000 + LONG_PRESS_MS - 1)).toBeNull()
    expect(state.hold).not.toBeNull()
    expect(takeLongPressGrab(state, 1, 1000 + LONG_PRESS_MS)).not.toBeNull()
  })

  it('survives a tremor but is cancelled by a real drag', () => {
    const state = arm()
    expect(updateLongPress(state, 1, 100 + LONG_PRESS_MOVE_TOLERANCE_PX - 1, 100)).toBe(true)
    expect(updateLongPress(state, 1, 100, 100 + LONG_PRESS_MOVE_TOLERANCE_PX)).toBe(false)
    expect(state.hold).toBeNull()
    expect(takeLongPressGrab(state, 1, LONG_PRESS_MS)).toBeNull()
  })

  it('ignores movement reported for another pointer', () => {
    const state = arm()
    expect(updateLongPress(state, 2, 900, 900)).toBe(false)
    expect(state.hold).not.toBeNull()
  })

  it('is cancelled by a lift before the threshold', () => {
    const state = arm()
    expect(cancelLongPress(state)).toBe(true)
    expect(cancelLongPress(state)).toBe(false)
    expect(takeLongPressGrab(state, 1, LONG_PRESS_MS)).toBeNull()
  })

  it('is cancelled by a second pointer landing, which never arms its own hold', () => {
    const state = arm()
    expect(beginLongPress(state, 2, 'touch', 'brick-2', 300, 300, 10)).toBe(false)
    expect(state.hold).toBeNull()
    expect(takeLongPressGrab(state, 1, LONG_PRESS_MS)).toBeNull()
    expect(takeLongPressGrab(state, 2, LONG_PRESS_MS)).toBeNull()
  })

  it('ignores the mouse, which has its own drag-to-move affordances', () => {
    const state = createLongPressState()
    expect(beginLongPress(state, 1, 'mouse', 'brick-1', 10, 10, 0)).toBe(false)
    expect(beginLongPress(state, 1, '', 'brick-1', 10, 10, 0)).toBe(false)
    expect(state.hold).toBeNull()
    expect(beginLongPress(state, 1, 'pen', 'brick-1', 10, 10, 0)).toBe(true)
  })

  it('only hands the grab to the pointer that held it', () => {
    const state = arm()
    expect(takeLongPressGrab(state, 2, LONG_PRESS_MS)).toBeNull()
    expect(state.hold).not.toBeNull()
  })
})

describe('double tap to place', () => {
  const firstTap = (state = createBuildGestureState(), x = 200, y = 300, at = 1000) => {
    expect(takeDoubleTapPlacement(state, x, y, at)).toBe(false)
    return state
  }

  it('places on a quick repeat tap in the same spot and re-arms for the next pair', () => {
    const state = firstTap()
    expect(takeDoubleTapPlacement(state, 204, 306, 1000 + DOUBLE_TAP_MS)).toBe(true)
    expect(state.lastTap).toBeNull()
    // The confirming tap is consumed, so a third tap opens a fresh pair.
    expect(takeDoubleTapPlacement(state, 204, 306, 1000 + DOUBLE_TAP_MS + 10)).toBe(false)
  })

  it('repositions instead when the second tap lands outside the radius', () => {
    const state = firstTap()
    expect(takeDoubleTapPlacement(state, 200 + DOUBLE_TAP_RADIUS_PX, 300, 1100)).toBe(true)

    const moved = firstTap()
    expect(takeDoubleTapPlacement(moved, 200 + DOUBLE_TAP_RADIUS_PX + 1, 300, 1100)).toBe(false)
    expect(moved.lastTap).toMatchObject({ x: 200 + DOUBLE_TAP_RADIUS_PX + 1, y: 300, at: 1100 })
  })

  it('repositions instead when the double tap window has expired', () => {
    const state = firstTap()
    expect(takeDoubleTapPlacement(state, 200, 300, 1000 + DOUBLE_TAP_MS + 1)).toBe(false)
    // The expired tap becomes the opener, so the next quick tap places.
    expect(takeDoubleTapPlacement(state, 200, 300, 1000 + DOUBLE_TAP_MS + 2)).toBe(true)
  })

  it('never counts a camera completion, so a tap after an orbit repositions', () => {
    const state = firstTap()
    beginBuildPointer(state, 1, 'touch', 400, 400)
    updateBuildPointer(state, 1, 400 + BUILD_TOUCH_DRAG_THRESHOLD, 400)
    expect(finishBuildPointer(state, 1, 400 + BUILD_TOUCH_DRAG_THRESHOLD, 400, 1050)?.intent).toBe('camera')
    expect(state.lastTap).toBeNull()
    expect(takeDoubleTapPlacement(state, 200, 300, 1100)).toBe(false)
  })

  it('keeps a pending first tap across a plain single-finger tap completion', () => {
    const state = firstTap()
    beginBuildPointer(state, 1, 'touch', 200, 300)
    expect(finishBuildPointer(state, 1, 200, 300, 1050)?.intent).toBe('position')
    expect(state.lastTap).not.toBeNull()
  })

  it('resets when a second finger lands, so a pinch never confirms a placement', () => {
    const state = firstTap()
    beginBuildPointer(state, 1, 'touch', 200, 300)
    beginBuildPointer(state, 2, 'touch', 260, 300)
    expect(state.lastTap).toBeNull()
    expect(takeDoubleTapPlacement(state, 200, 300, 1100)).toBe(false)
  })

  it('resets when a touch is cancelled, interrupted, or the gesture state is reset', () => {
    const cancelled = firstTap()
    beginBuildPointer(cancelled, 1, 'touch', 200, 300)
    cancelBuildPointer(cancelled, 1, 1050)
    expect(cancelled.lastTap).toBeNull()

    const interrupted = firstTap()
    beginBuildPointer(interrupted, 1, 'touch', 200, 300)
    interruptBuildPointers(interrupted, 1050)
    expect(interrupted.lastTap).toBeNull()

    const reset = firstTap()
    resetBuildPointers(reset)
    expect(reset.lastTap).toBeNull()
  })
})
