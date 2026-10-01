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
