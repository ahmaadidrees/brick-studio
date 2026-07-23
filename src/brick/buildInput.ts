export const BUILD_TOUCH_DRAG_THRESHOLD = 8
export const BUILD_TOUCH_CLICK_GUARD_MS = 450

type ActiveBuildPointer = {
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
  multiTouch: boolean
}

export type BuildPointerCompletion = {
  intent: 'position' | 'camera'
  pointerId: number
}

export type BuildGestureState = {
  pointers: Map<number, ActiveBuildPointer>
  completions: Map<number, BuildPointerCompletion>
  suppressClickUntil: number
}

export function createBuildGestureState(): BuildGestureState {
  return {
    pointers: new Map(),
    completions: new Map(),
    suppressClickUntil: 0,
  }
}

export function isConfirmationPlacementPointer(pointerType: string) {
  return pointerType !== '' && pointerType !== 'mouse'
}

export function beginBuildPointer(
  state: BuildGestureState,
  pointerId: number,
  pointerType: string,
  x: number,
  y: number,
) {
  if (!isConfirmationPlacementPointer(pointerType) || state.pointers.has(pointerId)) return false
  const multiTouch = state.pointers.size > 0
  if (multiTouch) {
    for (const pointer of state.pointers.values()) pointer.multiTouch = true
  }
  state.completions.delete(pointerId)
  state.pointers.set(pointerId, { startX: x, startY: y, x, y, moved: false, multiTouch })
  return true
}

export function updateBuildPointer(
  state: BuildGestureState,
  pointerId: number,
  x: number,
  y: number,
  threshold = BUILD_TOUCH_DRAG_THRESHOLD,
) {
  const pointer = state.pointers.get(pointerId)
  if (!pointer) return false
  pointer.x = x
  pointer.y = y
  pointer.moved ||= Math.hypot(x - pointer.startX, y - pointer.startY) >= threshold
  return true
}

export function finishBuildPointer(
  state: BuildGestureState,
  pointerId: number,
  x: number,
  y: number,
  now: number,
) {
  const pointer = state.pointers.get(pointerId)
  if (!pointer) return null
  updateBuildPointer(state, pointerId, x, y)
  const completion: BuildPointerCompletion = {
    intent: pointer.moved || pointer.multiTouch ? 'camera' : 'position',
    pointerId,
  }
  state.pointers.delete(pointerId)
  state.completions.set(pointerId, completion)
  state.suppressClickUntil = now + BUILD_TOUCH_CLICK_GUARD_MS
  return completion
}

export function takeBuildPointerCompletion(state: BuildGestureState, pointerId: number) {
  const completion = state.completions.get(pointerId) ?? null
  state.completions.delete(pointerId)
  return completion
}

export function cancelBuildPointer(state: BuildGestureState, pointerId: number, now: number) {
  if (!state.pointers.delete(pointerId)) return false
  state.completions.delete(pointerId)
  state.suppressClickUntil = now + BUILD_TOUCH_CLICK_GUARD_MS
  return true
}

export function interruptBuildPointers(state: BuildGestureState, now: number) {
  const hadActivePointer = state.pointers.size > 0
  state.pointers.clear()
  state.completions.clear()
  if (hadActivePointer) state.suppressClickUntil = now + BUILD_TOUCH_CLICK_GUARD_MS
  return hadActivePointer
}

export function resetBuildPointers(state: BuildGestureState) {
  state.pointers.clear()
  state.completions.clear()
  state.suppressClickUntil = 0
}

export function shouldSuppressBuildTouchClick(state: BuildGestureState, now: number) {
  return now <= state.suppressClickUntil
}
