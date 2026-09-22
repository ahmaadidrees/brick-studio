import { describe, expect, it } from 'vitest'
import { getBuildBounds } from '../../brick/bounds'
import { createBuildFramePose } from '../../brick/buildCamera'
import { roverBricks } from '../model/fixtures'
import { installRoboticsParts } from '../parts/install'
import { framePoseInFreeArea, freeArea, measureCanvasInsets, NO_INSETS } from './framing'

// The rover fixture uses robotics parts; the studio's part map must know them before bounds are read.
installRoboticsParts(true)

const viewport = { width: 1366, height: 768 }
const FOV = 50

/** Where a world point lands on screen for a camera at `position` looking at `target` (pinhole, vertical fov). */
function project(point: { x: number; y: number; z: number }, position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) {
  const forward = norm({ x: target.x - position.x, y: target.y - position.y, z: target.z - position.z })
  const right = norm({ x: -forward.z, y: 0, z: forward.x }) // forward × up
  const up = { x: right.y * forward.z - right.z * forward.y, y: right.z * forward.x - right.x * forward.z, z: right.x * forward.y - right.y * forward.x }
  const rel = { x: point.x - position.x, y: point.y - position.y, z: point.z - position.z }
  const depth = rel.x * forward.x + rel.y * forward.y + rel.z * forward.z
  const sx = rel.x * right.x + rel.y * right.y + rel.z * right.z
  const sy = rel.x * up.x + rel.y * up.y + rel.z * up.z
  const halfHeight = depth * Math.tan((FOV * Math.PI) / 360)
  const halfWidth = halfHeight * (viewport.width / viewport.height)
  return { x: viewport.width / 2 + (sx / halfWidth) * (viewport.width / 2), y: viewport.height / 2 - (sy / halfHeight) * (viewport.height / 2) }
}
const norm = (v: { x: number; y: number; z: number }) => { const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l } }

describe('freeArea', () => {
  it('subtracts the insets and ignores them when they would leave a sliver', () => {
    expect(freeArea(viewport, { left: 280, right: 450, top: 0, bottom: 70 })).toMatchObject({ left: 280, right: 916, top: 0, bottom: 698, width: 636, height: 698 })
    expect(freeArea(viewport, { left: 700, right: 600, top: 0, bottom: 0 })).toMatchObject({ left: 0, right: 1366 })
  })
})

describe('framePoseInFreeArea', () => {
  const bounds = getBuildBounds(roverBricks(), 64)
  const center = { x: bounds.center[0], y: bounds.center[1], z: bounds.center[2] }

  it('with no insets is the studio home pose', () => {
    const pose = framePoseInFreeArea(bounds, FOV, viewport)
    const home = createBuildFramePose(bounds, 'home', FOV, viewport.width / viewport.height)
    expect(pose.target).toEqual(home.target)
    expect(pose.position).toEqual(home.position)
  })

  it('puts the creation at the centre of the uncovered rectangle, further back so it fits it', () => {
    const insets = { left: 280, right: 450, top: 0, bottom: 70 }
    const pose = framePoseInFreeArea(bounds, FOV, viewport, insets)
    const free = freeArea(viewport, insets)
    const onScreen = project(center, pose.position, pose.target)
    expect(onScreen.x).toBeCloseTo((free.left + free.right) / 2, 0)
    expect(onScreen.y).toBeCloseTo((free.top + free.bottom) / 2, 0)
    const full = framePoseInFreeArea(bounds, FOV, viewport)
    expect(pose.distance).toBeGreaterThan(full.distance)
    // The creation's footprint corners stay inside the free rectangle.
    for (const x of [bounds.min[0], bounds.max[0]]) for (const z of [bounds.min[2], bounds.max[2]]) for (const y of [bounds.min[1], bounds.max[1]]) {
      const corner = project({ x, y, z }, pose.position, pose.target)
      expect(corner.x).toBeGreaterThanOrEqual(free.left - 1)
      expect(corner.x).toBeLessThanOrEqual(free.right + 1)
      expect(corner.y).toBeGreaterThanOrEqual(free.top - 1)
      expect(corner.y).toBeLessThanOrEqual(free.bottom + 1)
    }
  })
})

describe('measureCanvasInsets', () => {
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return this } }) as DOMRect
  const element = (className: string, box: DOMRect) => ({ className, getBoundingClientRect: () => box })
  const root = (elements: ReturnType<typeof element>[]) => ({
    querySelectorAll: (selector: string) => elements.filter((candidate) => selector.split(',').some((part) => candidate.className === part.trim().slice(1))),
  }) as unknown as ParentNode

  it('reads the drawer, the card and the command strip against the canvas', () => {
    const canvas = { getBoundingClientRect: () => rect(0, 56, 1366, 712) } as unknown as HTMLElement
    const insets = measureCanvasInsets(canvas, root([
      element('part-library', rect(8, 68, 264, 690)),
      element('robotics-card', rect(1366 - 84 - 360, 68, 360, 500)),
      element('command-strip', rect(400, 768 - 70, 500, 60)),
    ]))
    expect(insets).toEqual({ left: 272, right: 444, top: 0, bottom: 70 })
  })

  it('ignores hidden panels', () => {
    const canvas = { getBoundingClientRect: () => rect(0, 56, 1366, 712) } as unknown as HTMLElement
    expect(measureCanvasInsets(canvas, root([element('robotics-panel', rect(0, 0, 0, 0))]))).toEqual(NO_INSETS)
  })
})
