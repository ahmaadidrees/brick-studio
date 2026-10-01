import { describe, expect, it } from 'vitest'
import {
  clampCamera,
  createDefaultCamera,
  getCameraZoom,
  panCamera,
  screenToWorld,
  snapToGrid,
  worldToScreen,
  zoomCameraAt,
  type Camera,
  type Viewport,
} from './camera'

describe('camera math', () => {
  const viewport: Viewport = { width: 960, height: 540 }
  const camera: Camera = { x: 240, y: 180, viewWidth: 480 }

  it('calculates camera zoom accurately', () => {
    // 960 screen pixels for 480 world steps => zoom = 2 pixels/step
    expect(getCameraZoom(camera, viewport)).toBe(2)
  })

  it('projects world origin and camera center to screen correctly', () => {
    // Camera center is at (240, 180), so world (240, 180) maps to screen center (480, 270)
    const [sxCenter, syCenter] = worldToScreen(camera, viewport, 240, 180)
    expect(sxCenter).toBeCloseTo(480)
    expect(syCenter).toBeCloseTo(270)

    // World (0, 0) is bottom-left relative to center (240, 180).
    // dx = -240 steps * 2 = -480 screen pixels => 480 - 480 = 0.
    // dy = -180 steps * 2 = -360 screen pixels => in screen (y-down), 270 + 360 = 630.
    const [sxOrigin, syOrigin] = worldToScreen(camera, viewport, 0, 0)
    expect(sxOrigin).toBeCloseTo(0)
    expect(syOrigin).toBeCloseTo(630)
  })

  it('demonstrates y-flip: moving up in world decreases screen Y', () => {
    const [, syLow] = worldToScreen(camera, viewport, 100, 50)
    const [, syHigh] = worldToScreen(camera, viewport, 100, 150)
    expect(syHigh).toBeLessThan(syLow)
  })

  it('performs exact world ⇄ screen round trips across arbitrary points', () => {
    const testPoints: [number, number][] = [
      [0, 0],
      [123.45, 67.89],
      [-50, 300],
      [960, 360],
      [480, 270],
    ]

    for (const [wx, wy] of testPoints) {
      const [sx, sy] = worldToScreen(camera, viewport, wx, wy)
      const [rx, ry] = screenToWorld(camera, viewport, sx, sy)
      expect(rx).toBeCloseTo(wx, 6)
      expect(ry).toBeCloseTo(wy, 6)
    }

    const screenPoints: [number, number][] = [
      [0, 0],
      [960, 540],
      [480, 270],
      [100, 200],
      [750, 420],
    ]

    for (const [sx, sy] of screenPoints) {
      const [wx, wy] = screenToWorld(camera, viewport, sx, sy)
      const [rsx, rsy] = worldToScreen(camera, viewport, wx, wy)
      expect(rsx).toBeCloseTo(sx, 6)
      expect(rsy).toBeCloseTo(sy, 6)
    }
  })

  it('pans camera correctly in response to screen drag deltas', () => {
    // Zoom = 2 (960 / 480). Dragging screen 100px right should move camera 50 world steps left.
    // Dragging screen 60px down should move camera 30 world steps up.
    const panned = panCamera(camera, viewport, 100, 60)
    expect(panned.x).toBeCloseTo(190)
    expect(panned.y).toBeCloseTo(210)
  })

  it('zooms in keeping screen anchor invariant in world coordinates', () => {
    const anchor: [number, number] = [300, 200]
    const [anchorWorldX, anchorWorldY] = screenToWorld(camera, viewport, anchor[0], anchor[1])

    const zoomed = zoomCameraAt(camera, viewport, 1.5, anchor)
    const [afterWorldX, afterWorldY] = screenToWorld(zoomed, viewport, anchor[0], anchor[1])

    expect(afterWorldX).toBeCloseTo(anchorWorldX, 5)
    expect(afterWorldY).toBeCloseTo(anchorWorldY, 5)
    expect(zoomed.viewWidth).toBeCloseTo(camera.viewWidth / 1.5)
  })

  it('clamps camera coordinates within bounds margin', () => {
    const bounds = { left: 0, right: 960, bottom: 0, top: 360 }
    const outCamera: Camera = { x: 5000, y: -2000, viewWidth: 480 }
    const clamped = clampCamera(outCamera, bounds, 100)

    expect(clamped.x).toBe(1060)
    expect(clamped.y).toBe(-100)
  })

  it('snaps values to 8-step grid', () => {
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(3)).toBe(0)
    expect(snapToGrid(4)).toBe(8)
    expect(snapToGrid(7)).toBe(8)
    expect(snapToGrid(15.9)).toBe(16)
    expect(snapToGrid(-5)).toBe(-8)
  })

  it('creates sensible default camera from level bounds', () => {
    const bounds = { left: 0, right: 960, bottom: 0, top: 360 }
    const defaultCam = createDefaultCamera(bounds)
    expect(defaultCam.x).toBe(240)
    expect(defaultCam.y).toBe(180)
    expect(defaultCam.viewWidth).toBe(480)
  })
})
