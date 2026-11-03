import { describe, expect, it } from 'vitest'
import type { Costume, Target, World } from '../../core/contracts'
import { blendDirection, renderPlayMode, type ImageCache } from './renderer'

describe('blendDirection: turns take the short way round', () => {
  it('179 → -179 turns 2 degrees through 180, not 358 the long way', () => {
    expect(blendDirection(179, -179, 0)).toBe(179)
    expect(blendDirection(179, -179, 0.25)).toBeCloseTo(179.5)
    expect(blendDirection(179, -179, 0.5)).toBeCloseTo(180)
    // Past 180 it reads as Scratch does: -179.5, not 180.5.
    expect(blendDirection(179, -179, 0.75)).toBeCloseTo(-179.5)
    expect(blendDirection(-179, 179, 0.25)).toBeCloseTo(-179.5)
    expect(blendDirection(-179, 179, 0.75)).toBeCloseTo(179.5)
    expect(blendDirection(-170, 170, 0.5)).toBeCloseTo(180)
  })

  it('every turn of 180 degrees or less blends exactly as before (a straight line between the two)', () => {
    const before = (a: number, b: number, t: number) => a + (b - a) * t
    const pairs: Array<[number, number]> = [[90, -90], [-90, 90], [90, 90], [0, 180], [180, 0], [10, 20], [-45, 135], [170, -10], [-180, 0]]
    for (const [a, b] of pairs) for (const t of [0, 0.25, 0.5, 0.999]) expect(blendDirection(a, b, t)).toBe(before(a, b, t))
  })
})

describe('renderPlayMode draws a car turning across 180 the short way', () => {
  it('points the car down (180) halfway from 179 to -179, not right (0 rotation from 90)', () => {
    const costume: Costume = { name: 'You', asset: 'car.png', width: 11, height: 11, rotationCenterX: 5.5, rotationCenterY: 5.5 } as Costume
    const target = {
      id: 't1', brickId: 'car', isStage: false, isClone: false, x: 100, y: 100, direction: -179, size: 100, visible: true,
      costumeIndex: 0, rotationStyle: 'all around', effects: { ghost: 0, brightness: 0 }, bubble: null,
    } as unknown as Target
    const world = {
      bounds: { left: 0, right: 400, bottom: 0, top: 300 },
      bricks: { car: { id: 'car', name: 'Car', costumes: [costume] }, stage: { id: 'stage', costumes: [] } },
      stage: { brickId: 'stage', costumeIndex: 0 },
      targets: [target],
    } as unknown as World
    const rotations: number[] = []
    const noop = () => {}
    const ctx = new Proxy({ rotate: (r: number) => rotations.push(r) } as Record<string, unknown>, {
      get: (obj, key) => (key in obj ? obj[key as string] : noop),
      set: (obj, key, value) => { obj[key as string] = value; return true },
    }) as unknown as CanvasRenderingContext2D
    const images = { getImage: () => ({ width: 11, height: 11 }) } as unknown as ImageCache
    renderPlayMode(ctx, world, {
      camera: { x: 100, y: 100, viewWidth: 400 },
      viewport: { width: 400, height: 300 },
      background: 'grass',
      prevPoses: new Map([['t1', { x: 100, y: 100, direction: 179, size: 100 }]]),
      interpAlpha: 0.5,
    }, images)
    // Direction 180 is drawn as a 90 degree turn from the costume's rightward art.
    expect(rotations).toHaveLength(1)
    expect(rotations[0]).toBeCloseTo(Math.PI / 2)
  })
})
