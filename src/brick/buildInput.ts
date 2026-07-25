export const BUILD_TOUCH_DRAG_THRESHOLD = 8
export const BUILD_TOUCH_CLICK_GUARD_MS = 450
export const MOUSE_CLICK_DRAG_THRESHOLD = 5
/** Inflates the ghost's projected box so a small brick stays a fingertip-sized grab target. */
export const GHOST_DRAG_SLOP_PX = 24
/** Ghost rides this far above the fingertip so the hand never covers the drop target. */
export const GHOST_DRAG_FINGER_OFFSET_PX = 44
/** Hold a placed brick this long to pick it up for an immediate drag-move. */
export const LONG_PRESS_MS = 400
/** Drift past this during the hold and the touch stays a camera gesture. */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 8
export const DOUBLE_TAP_MS = 350
export const DOUBLE_TAP_RADIUS_PX = 24

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

export type TapMark = { x: number; y: number; at: number }

export type BuildGestureState = {
  pointers: Map<number, ActiveBuildPointer>
  completions: Map<number, BuildPointerCompletion>
  suppressClickUntil: number
  /** First half of a possible double tap; only single-finger taps record one. */
  lastTap: TapMark | null
}

export function createBuildGestureState(): BuildGestureState {
  return {
    pointers: new Map(),
    completions: new Map(),
    suppressClickUntil: 0,
    lastTap: null,
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
    state.lastTap = null
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
  // Orbiting between taps breaks the double tap: the ghost has moved under the
  // finger, so the next tap has to be a fresh reposition.
  if (completion.intent === 'camera') state.lastTap = null
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
  state.lastTap = null
  state.suppressClickUntil = now + BUILD_TOUCH_CLICK_GUARD_MS
  return true
}

export function interruptBuildPointers(state: BuildGestureState, now: number) {
  const hadActivePointer = state.pointers.size > 0
  state.pointers.clear()
  state.completions.clear()
  state.lastTap = null
  if (hadActivePointer) state.suppressClickUntil = now + BUILD_TOUCH_CLICK_GUARD_MS
  return hadActivePointer
}

export function resetBuildPointers(state: BuildGestureState) {
  state.pointers.clear()
  state.completions.clear()
  state.lastTap = null
  state.suppressClickUntil = 0
}

/**
 * Second half of the double-tap-to-place accelerator. Call this only when a
 * single-finger position intent completed with a draft armed: it answers "place
 * it" for a quick repeat tap in the same spot, and otherwise remembers this tap
 * as the opening one so the caller repositions.
 */
export function takeDoubleTapPlacement(
  state: BuildGestureState,
  x: number,
  y: number,
  now: number,
  windowMs = DOUBLE_TAP_MS,
  radius = DOUBLE_TAP_RADIUS_PX,
) {
  const previous = state.lastTap
  if (previous && now - previous.at <= windowMs && Math.hypot(x - previous.x, y - previous.y) <= radius) {
    state.lastTap = null
    return true
  }
  state.lastTap = { x, y, at: now }
  return false
}

export function shouldSuppressBuildTouchClick(state: BuildGestureState, now: number) {
  return now <= state.suppressClickUntil
}

export type ScreenBox = { left: number; top: number; right: number; bottom: number }

/** A null box means the ghost projected off-screen, which can never be grabbed. */
export function pointWithinInflatedRect(
  rect: ScreenBox | null,
  x: number,
  y: number,
  slop = GHOST_DRAG_SLOP_PX,
) {
  if (!rect) return false
  return x >= rect.left - slop && x <= rect.right + slop && y >= rect.top - slop && y <= rect.bottom + slop
}

/**
 * Ghost drops land on placed bricks or the build plate; the ghost mesh itself is
 * untagged. The brick being moved is still in the scene, so it is skipped —
 * otherwise a move drag would land the ghost on top of its own original.
 */
export function isGhostDropTarget(
  userData: { brickId?: unknown; isBaseplate?: unknown },
  ignoredBrickId: string | null = null,
) {
  if (typeof userData.brickId === 'string') return userData.brickId !== ignoredBrickId
  return userData.isBaseplate === true
}

/**
 * Hold-to-grab tracker. The hold is armed on a touch/pen down over a placed
 * brick but deliberately does not consume the event: until it fires the gesture
 * still belongs to the camera, so any drift, lift, or second finger voids it.
 */
export type LongPressHold = {
  pointerId: number
  brickId: string
  startX: number
  startY: number
  startedAt: number
}

export type LongPressState = { hold: LongPressHold | null }

export function createLongPressState(): LongPressState {
  return { hold: null }
}

export function beginLongPress(
  state: LongPressState,
  pointerId: number,
  pointerType: string,
  brickId: string,
  x: number,
  y: number,
  now: number,
) {
  // A second pointer means pinch/pan, never a grab — it voids what was pending.
  if (state.hold) {
    state.hold = null
    return false
  }
  if (!isConfirmationPlacementPointer(pointerType)) return false
  state.hold = { pointerId, brickId, startX: x, startY: y, startedAt: now }
  return true
}

/** False once the hold is gone: it drifted too far, or was never armed. */
export function updateLongPress(
  state: LongPressState,
  pointerId: number,
  x: number,
  y: number,
  tolerance = LONG_PRESS_MOVE_TOLERANCE_PX,
) {
  const hold = state.hold
  if (!hold || hold.pointerId !== pointerId) return false
  if (Math.hypot(x - hold.startX, y - hold.startY) < tolerance) return true
  state.hold = null
  return false
}

export function cancelLongPress(state: LongPressState) {
  if (!state.hold) return false
  state.hold = null
  return true
}

export function takeLongPressGrab(
  state: LongPressState,
  pointerId: number,
  now: number,
  holdMs = LONG_PRESS_MS,
) {
  const hold = state.hold
  if (!hold || hold.pointerId !== pointerId || now - hold.startedAt < holdMs) return null
  state.hold = null
  return hold
}
