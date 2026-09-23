import { beforeAll, describe, expect, it } from 'vitest'
import { PLATE_HEIGHT, STUD } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { installRoboticsParts } from '../parts/install'
import { FAR_OUTSIDE_STUDS, buildAreaOf, deepAndAway, isFarDrop, segmentCrossesBox, skimsPastBrick, studsOutside } from './farDrop'

beforeAll(() => installRoboticsParts(true))

const at = (id: string, partId: string, x: number, y: number, z: number): BrickInstance => ({ id, partId, x, y, z, rotation: 0, color: '#fff' })
/** Stud-grid coordinates to world units (the studio's own rule on a 64-stud plate). */
const world = (x: number, y: number, z: number) => ({ x: (x - 32) * STUD, y: y * PLATE_HEIGHT, z: (z - 32) * STUD })

// Noah's scene, simplified: a gate (two tall pillars and a beam) near the middle of the plate.
const gate = [at('l', 'pillar_1x1', 30, 0, 30), at('r', 'pillar_1x1', 34, 0, 30), at('beam', 'brick_1x6', 30, 9, 30)].map((brick) => ({ ...brick, rotation: brick.id === 'beam' ? 1 as const : 0 as const }))
// The home view: the camera up and to the front right of the gate, looking at it.
const target = world(32, 4, 31)
const camera = { x: target.x + 14 * 0.8, y: target.y + 12 * 0.8, z: target.z + 16 * 0.8 }

describe('no surprise far-away drops', () => {
  it('building on the gate, beside it or nearby is never far', () => {
    expect(isFarDrop(camera, target, world(32, 12, 30.5), gate)).toBe(false)
    expect(isFarDrop(camera, target, world(36, 0, 33), gate)).toBe(false)
    expect(isFarDrop(camera, target, world(27, 0, 33), gate)).toBe(false)
    // An empty plate the camera looks at: anywhere near what it looks at is fine.
    expect(isFarDrop(camera, target, world(38, 0, 36), [])).toBe(false)
  })

  it('a ray that only just missed the top of the gate and landed far behind it is far', () => {
    // From the camera, aim 1 plate above the beam's middle and follow the ray down to the ground.
    const aim = world(33, 13, 30.5)
    const t = camera.y / (camera.y - aim.y)
    const ground = { x: camera.x + (aim.x - camera.x) * t, y: 0, z: camera.z + (aim.z - camera.z) * t }
    expect(studsOutside(ground, buildAreaOf(gate, target))).toBeGreaterThan(4)
    expect(skimsPastBrick(camera, ground, gate)).toBe(true)
    expect(isFarDrop(camera, target, ground, gate)).toBe(true)
  })

  it('a spot much deeper than the orbit target and well outside the build is far', () => {
    const behind = world(20, 0, 8)
    expect(deepAndAway(camera, target, behind, buildAreaOf(gate, target))).toBe(true)
    expect(isFarDrop(camera, target, behind, gate)).toBe(true)
    // As deep, but close to the build (inside the margin): not far.
    expect(deepAndAway(camera, target, world(31, 0, 22), buildAreaOf(gate, target))).toBe(false)
  })

  it('axles and wheels do not count as something the ray skimmed', () => {
    const axleOnly = [at('a', 'robo_axle_long', 30, 0, 30)]
    const aim = world(31, 9, 30.5)
    const t = camera.y / (camera.y - aim.y)
    const ground = { x: camera.x + (aim.x - camera.x) * t, y: 0, z: camera.z + (aim.z - camera.z) * t }
    expect(skimsPastBrick(camera, ground, axleOnly)).toBe(false)
  })

  it('measures distance outside the build and segment crossings', () => {
    const area = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }
    expect(studsOutside({ x: 0.5, y: 0, z: 0.5 }, area)).toBe(0)
    expect(studsOutside({ x: 1 + STUD * 3, y: 0, z: 0.5 }, area)).toBeCloseTo(3)
    expect(FAR_OUTSIDE_STUDS).toBeGreaterThan(4)
    const box = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 }
    expect(segmentCrossesBox({ x: -1, y: 0.5, z: 0.5 }, { x: 2, y: 0.5, z: 0.5 }, box)).toBe(true)
    expect(segmentCrossesBox({ x: -1, y: 2, z: 0.5 }, { x: 2, y: 2, z: 0.5 }, box)).toBe(false)
    expect(segmentCrossesBox({ x: -2, y: 0.5, z: 0.5 }, { x: -1, y: 0.5, z: 0.5 }, box)).toBe(false)
  })
})
