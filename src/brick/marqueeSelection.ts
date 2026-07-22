import * as THREE from 'three'
import { BRICK_PART_MAP, PLATE_HEIGHT, STUD, brickWorldPosition, rotatedSize } from './parts'
import type { BrickInstance } from './types'

export const MARQUEE_DRAG_THRESHOLD = 6

export type ScreenPoint = { x: number; y: number }

export type ScreenRect = {
  left: number
  top: number
  right: number
  bottom: number
}

export type MarqueeGesture = {
  start: ScreenPoint
  current: ScreenPoint
  dragging: boolean
}

export type SelectionPointerIntent = {
  mode: 'build' | 'explore'
  button: number
  pointerType: string
  shiftKey: boolean
  selectionMode: boolean
}

export function shouldCaptureSelectionGesture(intent: SelectionPointerIntent) {
  if (intent.mode !== 'build' || intent.button !== 0) return false
  return intent.selectionMode || (intent.pointerType !== 'touch' && intent.shiftKey)
}

export function normalizeScreenRect(start: ScreenPoint, end: ScreenPoint): ScreenRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  }
}

export function exceedsMarqueeThreshold(start: ScreenPoint, end: ScreenPoint, threshold = MARQUEE_DRAG_THRESHOLD) {
  return Math.hypot(end.x - start.x, end.y - start.y) >= threshold
}

export function beginMarqueeGesture(point: ScreenPoint): MarqueeGesture {
  return { start: { ...point }, current: { ...point }, dragging: false }
}

export function updateMarqueeGesture(gesture: MarqueeGesture, point: ScreenPoint, threshold = MARQUEE_DRAG_THRESHOLD) {
  gesture.current = { ...point }
  gesture.dragging ||= exceedsMarqueeThreshold(gesture.start, gesture.current, threshold)
  return gesture
}

export function finishMarqueeGesture(gesture: MarqueeGesture) {
  return {
    rectangle: normalizeScreenRect(gesture.start, gesture.current),
    suppressTrailingClick: gesture.dragging,
  }
}

export function screenRectsIntersect(first: ScreenRect, second: ScreenRect) {
  return first.left <= second.right
    && first.right >= second.left
    && first.top <= second.bottom
    && first.bottom >= second.top
}

/** Projects the eight corners of a placed brick's rotated world bounds. */
export function projectBrickScreenBounds(
  brick: BrickInstance,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
): ScreenRect | null {
  const part = BRICK_PART_MAP[brick.partId]
  const size = rotatedSize(part, brick.rotation)
  const center = brickWorldPosition(brick)
  const halfWidth = size.width * STUD / 2
  const halfDepth = size.depth * STUD / 2
  const minY = center[1]
  const maxY = minY + part.height * PLATE_HEIGHT
  const point = new THREE.Vector3()
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  let visibleCorners = 0

  for (const x of [center[0] - halfWidth, center[0] + halfWidth]) {
    for (const y of [minY, maxY]) {
      for (const z of [center[2] - halfDepth, center[2] + halfDepth]) {
        point.set(x, y, z).project(camera)
        if (point.z < -1 || point.z > 1) continue
        visibleCorners += 1
        const screenX = (point.x + 1) * viewportWidth / 2
        const screenY = (1 - point.y) * viewportHeight / 2
        left = Math.min(left, screenX)
        right = Math.max(right, screenX)
        top = Math.min(top, screenY)
        bottom = Math.max(bottom, screenY)
      }
    }
  }

  return visibleCorners ? { left, top, right, bottom } : null
}

export function selectBricksInMarquee(
  bricks: BrickInstance[],
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  marquee: ScreenRect,
) {
  return bricks.flatMap((brick) => {
    const bounds = projectBrickScreenBounds(brick, camera, viewportWidth, viewportHeight)
    return bounds && screenRectsIntersect(bounds, marquee) ? [brick.id] : []
  })
}
