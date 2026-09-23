import { describe, expect, it } from 'vitest'
import { getBuildBounds } from '../../brick/bounds'
import { createBuildFramePose } from '../../brick/buildCamera'
import { roverBricks } from '../model/fixtures'
import { installRoboticsParts } from '../parts/install'
import { boundsWithPoints, framePoseInFreeArea, freeArea, measureCanvasInsets, NO_INSETS, viewOffsetFor } from './framing'

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

  it('reads the Code view beside the stage: the editor on the left, the bar and readings on top, the goal below', () => {
    const canvas = { getBoundingClientRect: () => rect(0, 56, 1366, 712) } as unknown as HTMLElement
    const insets = measureCanvasInsets(canvas, root([
      element('robo-code-editor', rect(0, 56, 820, 712)),
      element('robo-code-stagebar', rect(820, 56, 546, 60)),
      element('robo-code-readings', rect(820, 116, 546, 82)),
      element('robo-code-goal', rect(820, 768 - 51, 546, 51)),
    ]))
    expect(insets).toEqual({ left: 820, right: 0, top: 142, bottom: 51 })
  })

  it('reads the Code view stacked in portrait: the editor across the top, the stage bar and readings under it', () => {
    // An iPad Air in portrait: the canvas under the studio header, the editor over its top half.
    const canvas = { getBoundingClientRect: () => rect(0, 64, 820, 1030) } as unknown as HTMLElement
    const insets = measureCanvasInsets(canvas, root([
      element('robo-code-editor', rect(0, 64, 820, 515)),
      element('robo-code-stagebar', rect(0, 579, 820, 60)),
      element('robo-code-readings', rect(0, 639, 820, 82)),
      element('robo-code-goal', rect(0, 1094 - 51, 820, 51)),
    ]))
    expect(insets).toEqual({ left: 0, right: 0, top: 721 - 64, bottom: 51 })
    // The stage strip (820×322) is a short but wide free area, not a sliver: framing and the view offset use it.
    const free = freeArea({ width: 820, height: 1030 }, insets)
    expect(free).toMatchObject({ left: 0, right: 820, top: 657, bottom: 979 })
    expect(viewOffsetFor({ width: 820, height: 1030 }, insets)).toEqual({ x: 0, y: (657 + 979) / 2 - 515 })
  })
})

describe('presets and travel', () => {
  const bounds = getBuildBounds(roverBricks(), 64)
  const insets = { left: 280, right: 450, top: 0, bottom: 70 }

  it('every studio preset lands the build at the centre of the free area', () => {
    const free = freeArea(viewport, insets)
    for (const preset of ['home', 'front', 'right', 'perspective'] as const) {
      const pose = framePoseInFreeArea(bounds, FOV, viewport, insets, preset)
      const onScreen = project({ x: bounds.center[0], y: bounds.center[1], z: bounds.center[2] }, pose.position, pose.target)
      expect(onScreen.x).toBeCloseTo((free.left + free.right) / 2, 0)
      expect(onScreen.y).toBeCloseTo((free.top + free.bottom) / 2, 0)
    }
  })

  it('boundsWithPoints grows the box to hold where a creation will drive, and leaves it alone with no points', () => {
    expect(boundsWithPoints(bounds, [])).toBe(bounds)
    const grown = boundsWithPoints(bounds, [{ x: bounds.center[0], y: 0, z: bounds.min[2] - 5 }])
    expect(grown.min[2]).toBeLessThan(bounds.min[2] - 5)
    expect(grown.max).toEqual(bounds.max)
  })
})

describe('view offset instead of a sideways slide', () => {
  const bounds = getBuildBounds(roverBricks(), 64)
  const insets = { left: 280, right: 450, top: 0, bottom: 70 }

  it('without the slide the camera looks straight at the build, fitted to the free area', () => {
    const pose = framePoseInFreeArea(bounds, FOV, viewport, insets, 'home', null, false)
    expect(pose.target).toEqual({ x: bounds.center[0], y: bounds.center[1], z: bounds.center[2] })
    expect(pose.distance).toBeGreaterThan(framePoseInFreeArea(bounds, FOV, viewport).distance)
  })

  it('the offset is the free area centre relative to the viewport centre', () => {
    const free = freeArea(viewport, insets)
    expect(viewOffsetFor(viewport, insets)).toEqual({ x: (free.left + free.right) / 2 - viewport.width / 2, y: (free.top + free.bottom) / 2 - viewport.height / 2 })
    expect(viewOffsetFor(viewport, NO_INSETS)).toEqual({ x: 0, y: 0 })
  })
})
