import type { StageBounds } from '../../core/contracts'

export interface Camera {
  /** Center X in world steps. */
  x: number
  /** Center Y in world steps. */
  y: number
  /** World width displayed across the viewport in world steps. Default 480 (spec "Units"). */
  viewWidth: number
}

export interface Viewport {
  width: number
  height: number
}

/** Default view width in world steps (spec "Units": view is about 480 steps wide). */
export const DEFAULT_VIEW_WIDTH = 480

/** Create a default camera centered on the level bounds or (240, 180). */
export function createDefaultCamera(bounds?: StageBounds): Camera {
  if (!bounds) {
    return { x: 240, y: 180, viewWidth: DEFAULT_VIEW_WIDTH }
  }
  const levelW = bounds.right - bounds.left
  const levelH = bounds.top - bounds.bottom
  return {
    x: bounds.left + Math.min(DEFAULT_VIEW_WIDTH / 2, levelW / 2),
    y: bounds.bottom + levelH / 2,
    viewWidth: DEFAULT_VIEW_WIDTH,
  }
}

/** Zoom factor: pixels per world step. */
export function getCameraZoom(camera: Camera, viewport: Viewport): number {
  if (viewport.width <= 0 || camera.viewWidth <= 0) return 1
  return viewport.width / camera.viewWidth
}

/** Convert world coordinates (y-up, steps) to screen coordinates (y-down, canvas pixels). */
export function worldToScreen(camera: Camera, viewport: Viewport, wx: number, wy: number): [number, number] {
  const zoom = getCameraZoom(camera, viewport)
  const sx = (wx - camera.x) * zoom + viewport.width / 2
  const sy = viewport.height / 2 - (wy - camera.y) * zoom
  return [sx, sy]
}

/** Convert screen coordinates (y-down, canvas pixels) to world coordinates (y-up, steps). */
export function screenToWorld(camera: Camera, viewport: Viewport, sx: number, sy: number): [number, number] {
  const zoom = getCameraZoom(camera, viewport)
  const wx = (sx - viewport.width / 2) / zoom + camera.x
  const wy = camera.y - (sy - viewport.height / 2) / zoom
  return [wx, wy]
}

/** Pan camera by a delta given in screen pixels. */
export function panCamera(camera: Camera, viewport: Viewport, dxPixels: number, dyPixels: number): Camera {
  const zoom = getCameraZoom(camera, viewport)
  // Dragging right (+dx) moves the view left in world space.
  // Dragging down (+dy) moves the view up in screen space -> lower y in screen -> higher in world.
  return {
    ...camera,
    x: camera.x - dxPixels / zoom,
    y: camera.y + dyPixels / zoom,
  }
}

/** Zoom camera around a screen anchor point (default center of viewport). */
export function zoomCameraAt(
  camera: Camera,
  viewport: Viewport,
  factor: number,
  screenAnchor?: [number, number],
  minViewWidth = 160,
  maxViewWidth = 1920,
): Camera {
  const oldZoom = getCameraZoom(camera, viewport)
  const anchorX = screenAnchor ? screenAnchor[0] : viewport.width / 2
  const anchorY = screenAnchor ? screenAnchor[1] : viewport.height / 2

  // World coordinate under the anchor before zoom:
  const [worldAnchorX, worldAnchorY] = screenToWorld(camera, viewport, anchorX, anchorY)

  const newViewWidth = Math.min(maxViewWidth, Math.max(minViewWidth, camera.viewWidth / factor))
  const newCamera: Camera = { ...camera, viewWidth: newViewWidth }
  const newZoom = getCameraZoom(newCamera, viewport)

  // Adjust camera.x and camera.y so the world anchor stays under anchorX, anchorY:
  // anchorX = (worldAnchorX - newCam.x) * newZoom + viewport.width / 2
  // => newCam.x = worldAnchorX - (anchorX - viewport.width / 2) / newZoom
  const newCamX = worldAnchorX - (anchorX - viewport.width / 2) / newZoom
  const newCamY = worldAnchorY + (anchorY - viewport.height / 2) / newZoom

  return {
    ...newCamera,
    x: newCamX,
    y: newCamY,
  }
}

/** Clamp camera center so the level bounds don't get completely lost. */
export function clampCamera(camera: Camera, bounds: StageBounds, margin = 200): Camera {
  const minX = bounds.left - margin
  const maxX = bounds.right + margin
  const minY = bounds.bottom - margin
  const maxY = bounds.top + margin
  return {
    ...camera,
    x: Math.min(maxX, Math.max(minX, camera.x)),
    y: Math.min(maxY, Math.max(minY, camera.y)),
  }
}

/** Snap a coordinate to a grid step (e.g. 8). */
export function snapToGrid(value: number, step = 8): number {
  return Math.round(value / step) * step
}

/** Smallest pixels-per-step at which the whole level still counts as readable (a 960-step level needs 480 px). */
export const READABLE_MIN_ZOOM = 0.5

/** Pixels per step when the whole level fits the viewport (letterboxed: the tighter axis wins). */
export function fitZoom(bounds: StageBounds, viewport: Viewport): number {
  const levelW = bounds.right - bounds.left
  const levelH = bounds.top - bounds.bottom
  if (levelW <= 0 || levelH <= 0 || viewport.width <= 0 || viewport.height <= 0) return 1
  return Math.min(viewport.width / levelW, viewport.height / levelH)
}

/** Camera that shows the whole level, centered, with letterbox bars on the looser axis. */
export function fitCamera(bounds: StageBounds, viewport: Viewport): Camera {
  const zoom = fitZoom(bounds, viewport)
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.bottom + bounds.top) / 2,
    viewWidth: viewport.width > 0 ? viewport.width / zoom : DEFAULT_VIEW_WIDTH,
  }
}

/** Whether the whole level fits at a readable scale. */
export function wholeLevelReadable(bounds: StageBounds, viewport: Viewport): boolean {
  return fitZoom(bounds, viewport) >= READABLE_MIN_ZOOM
}

export type PlayCameraMode = 'whole' | 'follow'

/** Play default: the whole level when readable, otherwise follow the action. */
export function defaultPlayCameraMode(bounds: StageBounds, viewport: Viewport): PlayCameraMode {
  return wholeLevelReadable(bounds, viewport) ? 'whole' : 'follow'
}

/**
 * Camera centered on a world point at the given view width, clamped so the view never shows beyond the level edges.
 * On an axis where the view is larger than the level, the level is centered instead.
 */
export function followCamera(
  bounds: StageBounds,
  viewport: Viewport,
  point: { x: number; y: number },
  viewWidth = DEFAULT_VIEW_WIDTH,
): Camera {
  const zoom = viewport.width > 0 && viewWidth > 0 ? viewport.width / viewWidth : 1
  const halfW = viewport.width / 2 / zoom
  const halfH = viewport.height / 2 / zoom
  const axis = (p: number, lo: number, hi: number, half: number) =>
    hi - lo <= half * 2 ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, p))
  return {
    x: axis(point.x, bounds.left, bounds.right, halfW),
    y: axis(point.y, bounds.bottom, bounds.top, halfH),
    viewWidth,
  }
}
