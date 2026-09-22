import type { BuildBounds } from '../../brick/bounds'
import { createBuildFramePose, type BuildFramePose } from '../../brick/buildCamera'

/**
 * Framing a creation inside the free canvas area. Panels sit over the canvas (the
 * brick drawer on the left, the creation card or panel on the right, the command
 * strip at the bottom), so a pose that centres the creation in the viewport puts it
 * under a panel. This computes the home-direction pose for the uncovered rectangle:
 * the distance is what fits the bounds in that rectangle's height and width, and
 * the camera is then slid sideways and up so the creation's centre lands at the
 * rectangle's centre rather than the viewport's. Pure, so it is tested directly.
 */
export type CanvasInsets = { left: number; right: number; top: number; bottom: number }

export const NO_INSETS: CanvasInsets = { left: 0, right: 0, top: 0, bottom: 0 }

/** Below this share of the viewport the panels are ignored: framing into a sliver helps nobody. */
const MIN_FREE_SHARE = 0.35

type Vec = { x: number; y: number; z: number }
const UP: Vec = { x: 0, y: 1, z: 0 }
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const mul = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (a: Vec): Vec => { const l = Math.hypot(a.x, a.y, a.z) || 1; return mul(a, 1 / l) }

export function freeArea(viewport: { width: number; height: number }, insets: CanvasInsets) {
  let left = Math.max(0, insets.left)
  let right = Math.max(left, viewport.width - Math.max(0, insets.right))
  let top = Math.max(0, insets.top)
  let bottom = Math.max(top, viewport.height - Math.max(0, insets.bottom))
  if (right - left < viewport.width * MIN_FREE_SHARE) { left = 0; right = viewport.width }
  if (bottom - top < viewport.height * MIN_FREE_SHARE) { top = 0; bottom = viewport.height }
  return { left, right, top, bottom, width: right - left, height: bottom - top }
}

export function framePoseInFreeArea(bounds: BuildBounds, verticalFovDegrees: number, viewport: { width: number; height: number }, insets: CanvasInsets = NO_INSETS): BuildFramePose {
  const free = freeArea(viewport, insets)
  const halfFov = (verticalFovDegrees * Math.PI) / 360
  // Only `free.height` of the viewport's rows are usable: the same as a narrower vertical field of view.
  const effectiveFov = (2 * Math.atan(Math.tan(halfFov) * (free.height / viewport.height)) * 180) / Math.PI
  const pose = createBuildFramePose(bounds, 'home', effectiveFov, free.width / free.height)
  // Slide the camera so the creation's centre appears at the free area's centre.
  const offsetX = (free.left + free.right) / 2 - viewport.width / 2
  const offsetY = (free.top + free.bottom) / 2 - viewport.height / 2
  const worldPerPixel = (2 * pose.distance * Math.tan(halfFov)) / viewport.height
  const direction = norm(sub(pose.target, pose.position))
  const right = norm(cross(direction, UP))
  const up = cross(right, direction)
  const shift = add(mul(right, -offsetX * worldPerPixel), mul(up, offsetY * worldPerPixel))
  return { target: add(pose.target, shift), position: add(pose.position, shift), distance: pose.distance }
}

/**
 * What covers the canvas right now, as insets in canvas pixels: the brick drawer
 * (left), the creation card or robotics panel (right) and the command strip
 * (bottom). Elements that are hidden or off the canvas count for nothing.
 */
export function measureCanvasInsets(canvas: HTMLElement, root: ParentNode = document): CanvasInsets {
  const frame = canvas.getBoundingClientRect()
  const insets: CanvasInsets = { ...NO_INSETS }
  if (frame.width <= 0 || frame.height <= 0) return insets
  const overlaps = (rect: DOMRect) => rect.width > 0 && rect.height > 0 && rect.right > frame.left && rect.left < frame.right && rect.bottom > frame.top && rect.top < frame.bottom
  for (const element of root.querySelectorAll<HTMLElement>('.part-library')) {
    const rect = element.getBoundingClientRect()
    if (overlaps(rect) && rect.left < frame.left + frame.width / 2) insets.left = Math.max(insets.left, rect.right - frame.left)
  }
  for (const element of root.querySelectorAll<HTMLElement>('.robotics-card, .robotics-panel')) {
    const rect = element.getBoundingClientRect()
    if (overlaps(rect) && rect.right > frame.left + frame.width / 2) insets.right = Math.max(insets.right, frame.right - rect.left)
  }
  for (const element of root.querySelectorAll<HTMLElement>('.command-strip')) {
    const rect = element.getBoundingClientRect()
    if (overlaps(rect) && rect.top > frame.top + frame.height / 2) insets.bottom = Math.max(insets.bottom, frame.bottom - rect.top)
  }
  return insets
}
