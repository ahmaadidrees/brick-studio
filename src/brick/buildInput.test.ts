import { describe, expect, it } from 'vitest'
import {
  BUILD_TOUCH_DRAG_THRESHOLD,
  beginBuildPointer,
  cancelBuildPointer,
  createBuildGestureState,
  finishBuildPointer,
  interruptBuildPointers,
  isConfirmationPlacementPointer,
  resetBuildPointers,
  shouldSuppressBuildTouchClick,
  takeBuildPointerCompletion,
  updateBuildPointer,
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
