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

/**
 * Build's starting view: the level's full height, from its left edge (where the Hero starts), so a long level is shown
 * big enough to build in rather than letterboxed small. A level that fits the view anyway is fitted whole.
 */
export function buildCamera(bounds: StageBounds, viewport: Viewport): Camera {
  const levelW = bounds.right - bounds.left
  const levelH = bounds.top - bounds.bottom
  if (viewport.width <= 0 || viewport.height <= 0 || levelW / levelH <= viewport.width / viewport.height) return fitCamera(bounds, viewport)
  const viewWidth = viewport.width / (viewport.height / levelH)
  return { x: bounds.left + viewWidth / 2, y: (bounds.bottom + bounds.top) / 2, viewWidth }
}

/** Whether the whole level fits at a readable scale. */
export function wholeLevelReadable(bounds: StageBounds, viewport: Viewport): boolean {
  return fitZoom(bounds, viewport) >= READABLE_MIN_ZOOM
}

export type PlayCameraMode = 'whole' | 'follow'

/** Play always starts following the Hero; Whole level remains an explicit choice. */
export function defaultPlayCameraMode(_bounds: StageBounds, _viewport: Viewport): PlayCameraMode {
  return 'follow'
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

/**
 * How wide a following camera looks: DEFAULT_VIEW_WIDTH, or narrower when the stage is taller than wide (a phone held
 * upright), so the level fills the height instead of sitting in a band with empty space above and below.
 */
export function followViewWidth(bounds: StageBounds, viewport: Viewport): number {
  const levelHeight = bounds.top - bounds.bottom
  if (viewport.width <= 0 || viewport.height <= 0 || levelHeight <= 0) return DEFAULT_VIEW_WIDTH
  return Math.min(DEFAULT_VIEW_WIDTH, (viewport.width * levelHeight) / viewport.height)
}

/** Build's Fit shows the whole level when that is at least this many pixels per step (a 16-step tile is 12 px)... */
export const BUILD_FIT_WHOLE_ZOOM = 0.75
/** ...and otherwise zooms to this (a 16-step tile is 16 px), so a portrait screen doesn't get 6 px bricks. */
export const BUILD_FIT_MIN_ZOOM = 1

/**
 * Build's Fit button: the whole level when that is readable; on a narrow (portrait) stage, the level's full height at
 * a readable zoom instead, centred on `centerX` (the current view) and kept inside the level's left and right edges.
 * It never zooms in further than the level's full height.
 */
export function buildFitCamera(bounds: StageBounds, viewport: Viewport, centerX?: number): Camera {
  const fit = fitZoom(bounds, viewport)
  if (fit >= BUILD_FIT_WHOLE_ZOOM) return fitCamera(bounds, viewport)
  const levelH = bounds.top - bounds.bottom
  const heightZoom = levelH > 0 && viewport.height > 0 ? viewport.height / levelH : fit
  const zoom = Math.max(fit, Math.min(BUILD_FIT_MIN_ZOOM, heightZoom))
  if (zoom <= fit || viewport.width <= 0) return fitCamera(bounds, viewport)
  const viewWidth = viewport.width / zoom
  const half = viewWidth / 2
  const x = Math.min(bounds.right - half, Math.max(bounds.left + half, centerX ?? bounds.left + half))
  return { x, y: (bounds.bottom + bounds.top) / 2, viewWidth }
}

/** Two fingers on the screen: where they are (canvas pixels) and how far apart. */
export interface PinchPoint {
  mid: [number, number]
  dist: number
}

export function pinchPoint(a: [number, number], b: [number, number]): PinchPoint {
  return { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist: Math.hypot(b[0] - a[0], b[1] - a[1]) }
}

/**
 * The camera after a two-finger gesture that started at `from` with camera `start` and is now at `to`: it zooms by how
 * much the fingers spread around where they started, and pans with their midpoint, so the spot of the level that was
 * between the fingers stays between them (1:1, like a photo).
 */
export function pinchCamera(start: Camera, viewport: Viewport, from: PinchPoint, to: PinchPoint): Camera {
  const factor = from.dist > 1 && to.dist > 1 ? to.dist / from.dist : 1
  const zoomed = zoomCameraAt(start, viewport, factor, from.mid)
  return panCamera(zoomed, viewport, to.mid[0] - from.mid[0], to.mid[1] - from.mid[1])
}

/** What a follow camera needs to know about the player each frame: where it is, how fast it goes, whether it stands. */
export interface FollowSubject {
  x: number
  /** For the side view, the feet (the bottom of the costume), like the classic camera. */
  y: number
  /** Steps per tick. */
  vx: number
  vy: number
  onGround: boolean
}

/** A move longer than this in one frame (respawning, Play again) cuts to the player instead of scrolling (8 tiles). */
const CUT_DISTANCE = 128

/**
 * Play's follow camera, ported from the classic game (parity bucket A, 2026-11-03). Classic steps at 60 frames a second
 * and moves in px/frame; here a step is a pixel, speeds are steps a tick (two frames), and `frames` says how many 60 Hz
 * frames passed since the last call, so every rate below is the classic per-frame one.
 *
 * - side (src/platformer/game/camera.ts): it leads the way you run (up to 40 px, easing in), scrolls after you softly
 *   and keeps you between 35% and 65% across; up and down it settles on the ground you stand on (you at 28% from the
 *   bottom) and only chases you in the air when you leave the band from 14% to 75%.
 * - top (Racing, game/session.ts stepRace): it looks ahead of the car by 16 frames of its speed and eases there.
 *
 * View state only: the world never sees it, so it changes nothing in a room.
 */
export class FollowRig {
  private left = 0
  private bottom = 0
  private look = 0
  private snapped = false
  private lastX = 0
  private lastY = 0

  constructor(readonly kind: 'side' | 'top') {}

  reset(): void {
    this.snapped = false
    this.look = 0
  }

  follow(subject: FollowSubject, bounds: StageBounds, viewport: Viewport, viewWidth: number, frames: number): Camera {
    const zoom = viewport.width > 0 && viewWidth > 0 ? viewport.width / viewWidth : 1
    const w = viewWidth
    const h = viewport.height / zoom
    const ease = (perFrame: number) => 1 - Math.pow(1 - perFrame, Math.max(0, frames))
    const { x: px, y: py } = subject
    if (this.snapped && Math.hypot(px - this.lastX, py - this.lastY) > CUT_DISTANCE) this.reset()
    this.lastX = px
    this.lastY = py

    if (this.kind === 'top') {
      // vx steps a tick is vx / 2 px a frame; classic looks 16 frames ahead.
      const wantLeft = px + subject.vx * 8 - w / 2
      const wantBottom = py + subject.vy * 8 - h / 2
      if (!this.snapped) {
        this.left = wantLeft
        this.bottom = wantBottom
        this.snapped = true
      }
      this.left += (wantLeft - this.left) * ease(0.12)
      this.bottom += (wantBottom - this.bottom) * ease(0.12)
    } else {
      // Classic: look toward vx (px/frame) x 18, at most 40 px, easing 4% a frame.
      const targetLook = Math.max(-40, Math.min(40, (subject.vx / 2) * 18))
      this.look += (targetLook - this.look) * ease(0.04)
      const wantLeft = px + this.look - w / 2
      const groundBottom = py - h * 0.28
      if (!this.snapped) {
        this.left = wantLeft
        this.bottom = groundBottom
        this.snapped = true
      }
      this.left += (wantLeft - this.left) * ease(0.12)
      this.left = Math.min(px - w * 0.35, Math.max(px - w * 0.65, this.left))
      if (subject.onGround) this.bottom += (groundBottom - this.bottom) * ease(0.1)
      if (py - this.bottom > h * 0.75) this.bottom = py - h * 0.75
      if (py - this.bottom < h * 0.14) this.bottom = py - h * 0.14
    }

    // Never past the level's edges; a level smaller than the view sits in the middle.
    const levelW = bounds.right - bounds.left
    const levelH = bounds.top - bounds.bottom
    this.left = levelW <= w ? bounds.left + (levelW - w) / 2 : Math.min(bounds.right - w, Math.max(bounds.left, this.left))
    this.bottom = levelH <= h ? bounds.bottom + (levelH - h) / 2 : Math.min(bounds.top - h, Math.max(bounds.bottom, this.bottom))
    return { x: this.left + w / 2, y: this.bottom + h / 2, viewWidth }
  }
}
