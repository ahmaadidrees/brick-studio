import { clampOrbitDistance } from './orbitCamera'

export const EXPLORE_LOOK_DRAG_THRESHOLD = 4
export const EXPLORE_YAW_SENSITIVITY = 0.012
export const EXPLORE_PITCH_SENSITIVITY = 0.009

type CameraPointer = { x: number; y: number }

export type ExploreCameraGesture = {
  pointers: Map<number, CameraPointer>
  lookOrigin: CameraPointer | null
  lookLast: CameraPointer | null
  dragging: boolean
  pinchStartDistance: number
  pinchStartZoom: number
}

export type ExploreCameraGestureUpdate = {
  yawDelta: number
  pitchDelta: number
  zoom: number | null
}

const NO_GESTURE_UPDATE: ExploreCameraGestureUpdate = { yawDelta: 0, pitchDelta: 0, zoom: null }

export function createExploreCameraGesture(): ExploreCameraGesture {
  return {
    pointers: new Map(),
    lookOrigin: null,
    lookLast: null,
    dragging: false,
    pinchStartDistance: 0,
    pinchStartZoom: 0,
  }
}

function pointerDistance(points: CameraPointer[]) {
  return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
}

export function beginExploreCameraPointer(
  gesture: ExploreCameraGesture,
  pointerId: number,
  x: number,
  y: number,
  currentZoom: number,
) {
  if (gesture.pointers.has(pointerId) || gesture.pointers.size >= 2) return false
  const point = { x, y }
  gesture.pointers.set(pointerId, point)
  if (gesture.pointers.size === 1) {
    gesture.lookOrigin = { ...point }
    gesture.lookLast = { ...point }
    gesture.dragging = false
  } else {
    gesture.pinchStartDistance = pointerDistance([...gesture.pointers.values()])
    gesture.pinchStartZoom = clampOrbitDistance(currentZoom)
    gesture.lookOrigin = null
    gesture.lookLast = null
    gesture.dragging = false
  }
  return true
}

export function zoomFromPinch(startZoom: number, startDistance: number, currentDistance: number) {
  if (!Number.isFinite(startDistance) || !Number.isFinite(currentDistance) || startDistance <= 0 || currentDistance <= 0) {
    return clampOrbitDistance(startZoom)
  }
  return clampOrbitDistance(startZoom * startDistance / currentDistance)
}

export function updateExploreCameraPointer(
  gesture: ExploreCameraGesture,
  pointerId: number,
  x: number,
  y: number,
): ExploreCameraGestureUpdate {
  const previous = gesture.pointers.get(pointerId)
  if (!previous) return NO_GESTURE_UPDATE
  const next = { x, y }
  gesture.pointers.set(pointerId, next)

  if (gesture.pointers.size === 2) {
    const currentDistance = pointerDistance([...gesture.pointers.values()])
    return {
      yawDelta: 0,
      pitchDelta: 0,
      zoom: zoomFromPinch(gesture.pinchStartZoom, gesture.pinchStartDistance, currentDistance),
    }
  }

  if (!gesture.lookOrigin || !gesture.lookLast) return NO_GESTURE_UPDATE
  if (!gesture.dragging) {
    gesture.dragging = Math.hypot(x - gesture.lookOrigin.x, y - gesture.lookOrigin.y) >= EXPLORE_LOOK_DRAG_THRESHOLD
    if (!gesture.dragging) return NO_GESTURE_UPDATE
  }
  const update = {
    yawDelta: (gesture.lookLast.x - x) * EXPLORE_YAW_SENSITIVITY,
    pitchDelta: (gesture.lookLast.y - y) * EXPLORE_PITCH_SENSITIVITY,
    zoom: null,
  }
  gesture.lookLast = next
  return update
}

export function endExploreCameraPointer(gesture: ExploreCameraGesture, pointerId: number) {
  if (!gesture.pointers.delete(pointerId)) return
  const remaining = [...gesture.pointers.values()][0]
  gesture.lookOrigin = remaining ? { ...remaining } : null
  gesture.lookLast = remaining ? { ...remaining } : null
  gesture.dragging = false
  gesture.pinchStartDistance = 0
  gesture.pinchStartZoom = 0
}

export function cancelExploreCameraGesture(gesture: ExploreCameraGesture) {
  gesture.pointers.clear()
  gesture.lookOrigin = null
  gesture.lookLast = null
  gesture.dragging = false
  gesture.pinchStartDistance = 0
  gesture.pinchStartZoom = 0
}

export function normalizeWheelZoom(deltaY: number, deltaMode: number) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1)
  return Math.max(-1.2, Math.min(1.2, pixels * 0.008))
}
