import { describe, expect, it } from 'vitest'
import {
  clampCamera,
  defaultPlayCameraMode,
  fitCamera,
  fitZoom,
  followCamera,
  wholeLevelReadable,
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

describe('fit and follow camera', () => {
  const level = { left: 0, right: 960, bottom: 0, top: 360 }
  const sizes: Array<[string, { left: number; right: number; bottom: number; top: number }]> = [
    ['default 960x360', level],
    ['tall 200x800', { left: 0, right: 200, bottom: 0, top: 800 }],
    ['small 100x100', { left: 0, right: 100, bottom: 0, top: 100 }],
    ['offset origin', { left: -480, right: 480, bottom: -100, top: 260 }],
  ]
  const viewports: Viewport[] = [
    { width: 570, height: 723 },
    { width: 1366, height: 400 },
    { width: 500, height: 500 },
    { width: 960, height: 540 },
    { width: 300, height: 1000 },
  ]

  for (const [name, b] of sizes) {
    for (const vp of viewports) {
      it(`fit shows the whole level inside ${vp.width}x${vp.height} for ${name}`, () => {
        const cam = fitCamera(b, vp)
        const [l, t] = worldToScreen(cam, vp, b.left, b.top)
        const [r, bt] = worldToScreen(cam, vp, b.right, b.bottom)
        const eps = 1e-6
        expect(l).toBeGreaterThanOrEqual(-eps)
        expect(t).toBeGreaterThanOrEqual(-eps)
        expect(r).toBeLessThanOrEqual(vp.width + eps)
        expect(bt).toBeLessThanOrEqual(vp.height + eps)
        // Letterboxed: the tighter axis touches both edges, and the level is centered.
        const touchesX = Math.abs(l) < 1e-6 && Math.abs(r - vp.width) < 1e-6
        const touchesY = Math.abs(t) < 1e-6 && Math.abs(bt - vp.height) < 1e-6
        expect(touchesX || touchesY).toBe(true)
        expect((l + r) / 2).toBeCloseTo(vp.width / 2, 6)
        expect((t + bt) / 2).toBeCloseTo(vp.height / 2, 6)
      })
    }
  }

  it('fit on the default level in a wide stage shows all 960 steps (x = 480..960 visible)', () => {
    const vp = { width: 1366, height: 768 }
    const cam = fitCamera(level, vp)
    const [sx] = worldToScreen(cam, vp, 900, 100)
    expect(sx).toBeGreaterThan(0)
    expect(sx).toBeLessThan(vp.width)
    expect(fitZoom(level, vp)).toBeCloseTo(1366 / 960, 6)
  })

  it('readable threshold: whole level at 570 px wide (0.59 px/step) is readable, 300 px is not', () => {
    expect(wholeLevelReadable(level, { width: 570, height: 723 })).toBe(true)
    expect(defaultPlayCameraMode(level, { width: 570, height: 723 })).toBe('whole')
    expect(wholeLevelReadable(level, { width: 300, height: 400 })).toBe(false)
    expect(defaultPlayCameraMode(level, { width: 300, height: 400 })).toBe('follow')
  })

  it('zoom around the view center keeps the center world point steady (in and out, from a fit camera)', () => {
    const vp = { width: 700, height: 500 }
    const cam = fitCamera(level, vp)
    const [cx, cy] = screenToWorld(cam, vp, vp.width / 2, vp.height / 2)
    for (const f of [1.25, 0.8, 1.25, 1.25]) {
      const z = zoomCameraAt(cam, vp, f)
      const [zx, zy] = screenToWorld(z, vp, vp.width / 2, vp.height / 2)
      expect(zx).toBeCloseTo(cx, 6)
      expect(zy).toBeCloseTo(cy, 6)
      expect(z.x).toBeCloseTo(cam.x, 6)
      expect(z.y).toBeCloseTo(cam.y, 6)
    }
  })

  it('zoom around center is steady for an off-center camera too', () => {
    const vp = { width: 700, height: 500 }
    const cam: Camera = { x: 333, y: 77, viewWidth: 480 }
    const z = zoomCameraAt(zoomCameraAt(cam, vp, 1.25), vp, 0.8)
    expect(z.x).toBeCloseTo(333, 6)
    expect(z.y).toBeCloseTo(77, 6)
  })

  describe('follow clamping', () => {
    const vp = { width: 480, height: 360 } // 1 px per step at viewWidth 480: half view = 240 x 180
    it('follows a point in the middle of the level exactly', () => {
      const c = followCamera(level, vp, { x: 500, y: 180 })
      expect(c.x).toBe(500)
      expect(c.y).toBe(180)
      expect(c.viewWidth).toBe(480)
    })
    it('clamps at the left edge so the view starts at the level left', () => {
      const c = followCamera(level, vp, { x: 10, y: 180 })
      expect(c.x).toBe(240)
      const [l] = worldToScreen(c, vp, 0, 0)
      expect(l).toBeCloseTo(0)
    })
    it('clamps at the right edge so the view ends at the level right', () => {
      const c = followCamera(level, vp, { x: 950, y: 180 })
      expect(c.x).toBe(720)
      const [r] = worldToScreen(c, vp, 960, 0)
      expect(r).toBeCloseTo(vp.width)
    })
    it('clamps vertically when the view is shorter than the level', () => {
      const c = followCamera(level, { width: 480, height: 200 }, { x: 500, y: 0 })
      expect(c.y).toBe(100)
      expect(followCamera(level, { width: 480, height: 200 }, { x: 500, y: 400 }).y).toBe(260)
    })
    it('centers the level on an axis where the view is larger than the level', () => {
      const c = followCamera(level, { width: 480, height: 600 }, { x: 500, y: 20 })
      expect(c.y).toBe(180)
      const wide = followCamera({ left: 0, right: 200, bottom: 0, top: 360 }, vp, { x: 190, y: 180 })
      expect(wide.x).toBe(100)
    })
  })
})
