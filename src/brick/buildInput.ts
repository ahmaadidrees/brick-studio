export const BUILD_TOUCH_DRAG_THRESHOLD = 8
export const BUILD_TOUCH_CLICK_GUARD_MS = 450
export const MOUSE_CLICK_DRAG_THRESHOLD = 5

/**
 * Tracks how far a mouse pointer travelled since it went down. Camera drags end
 * with a native click; consumers compare travel against
 * MOUSE_CLICK_DRAG_THRESHOLD to keep those clicks from placing or selecting.
 * Travel persists after the pointer lifts so the trailing click can read it;
 * the next pointer-down resets it.
 */
export type PointerTravel = {
  originX: number
  originY: number
  maxTravel: number
  active: boolean
}

export function createPointerTravel(): PointerTravel {
  return { originX: 0, originY: 0, maxTravel: 0, active: false }
}

export function beginPointerTravel(travel: PointerTravel, x: number, y: number) {
  travel.originX = x
  travel.originY = y
  travel.maxTravel = 0
  travel.active = true
}

export function updatePointerTravel(travel: PointerTravel, x: number, y: number) {
  if (!travel.active) return
  travel.maxTravel = Math.max(travel.maxTravel, Math.hypot(x - travel.originX, y - travel.originY))
}

export function endPointerTravel(travel: PointerTravel) {
  travel.active = false
}

export function pointerTravelExceeds(travel: PointerTravel, threshold = MOUSE_CLICK_DRAG_THRESHOLD) {
  return travel.maxTravel > threshold
}

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
