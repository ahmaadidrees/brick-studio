import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  THUMBNAIL_PIXELS,
  THUMBNAIL_VIEW_DIRECTION,
  disposePartThumbnails,
  partThumbnailCacheSize,
  renderPartThumbnail,
  thumbnailCacheKey,
  thumbnailFraming,
} from './brickThumbnails'
import { BRICK_PARTS, BRICK_PART_MAP } from './parts'

afterEach(() => {
  disposePartThumbnails()
})

/** Re-projects a box corner onto the camera basis the framing was built from. */
function projectCorner(
  corner: [number, number, number],
  center: [number, number, number],
  direction: [number, number, number],
) {
  const forward = new THREE.Vector3(...direction).normalize()
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize()
  const up = new THREE.Vector3().crossVectors(forward, right).normalize()
  const offset = new THREE.Vector3(corner[0] - center[0], corner[1] - center[1], corner[2] - center[2])
  return { x: Math.abs(offset.dot(right)), y: Math.abs(offset.dot(up)) }
}

describe('thumbnailCacheKey', () => {
  it('separates parts and colours but ignores hex case', () => {
    const part = BRICK_PART_MAP.brick_2x4
    expect(thumbnailCacheKey(part, '#E7473C')).toBe(thumbnailCacheKey(part, '#e7473c'))
    expect(thumbnailCacheKey(part, '#e7473c')).not.toBe(thumbnailCacheKey(part, '#65b85a'))
    expect(thumbnailCacheKey(part, '#e7473c')).not.toBe(thumbnailCacheKey(BRICK_PART_MAP.brick_1x1, '#e7473c'))
  })

  it('is stable across calls', () => {
    for (const part of BRICK_PARTS) {
      expect(thumbnailCacheKey(part, '#fff')).toBe(thumbnailCacheKey(part, '#fff'))
    }
  })
})

describe('thumbnailFraming', () => {
  it('centres on the box and contains every corner', () => {
    const min: [number, number, number] = [-0.6, 0, -1.2]
    const max: [number, number, number] = [0.6, 0.5, 1.2]
    const framing = thumbnailFraming(min, max)

    expect(framing.center).toEqual([0, 0.25, 0])
    for (let index = 0; index < 8; index += 1) {
      const corner: [number, number, number] = [
        (index & 1 ? max : min)[0],
        (index & 2 ? max : min)[1],
        (index & 4 ? max : min)[2],
      ]
      const projected = projectCorner(corner, framing.center, THUMBNAIL_VIEW_DIRECTION)
      expect(projected.x).toBeLessThanOrEqual(framing.halfWidth + 1e-6)
      expect(projected.y).toBeLessThanOrEqual(framing.halfHeight + 1e-6)
    }
  })

  it('scales linearly with padding and never collapses to zero', () => {
    const min: [number, number, number] = [-1, 0, -1]
    const max: [number, number, number] = [1, 1, 1]
    const tight = thumbnailFraming(min, max, THUMBNAIL_VIEW_DIRECTION, 1)
    const padded = thumbnailFraming(min, max, THUMBNAIL_VIEW_DIRECTION, 2)
    expect(padded.halfWidth).toBeCloseTo(tight.halfWidth * 2)
    expect(padded.halfHeight).toBeCloseTo(tight.halfHeight * 2)

    const degenerate = thumbnailFraming([0, 0, 0], [0, 0, 0])
    expect(degenerate.halfWidth).toBeGreaterThan(0)
    expect(degenerate.halfHeight).toBeGreaterThan(0)
  })

  it('grows with the part so a big plate still fits the frame', () => {
    const small = thumbnailFraming([-0.3, 0, -0.3], [0.3, 0.5, 0.3])
    const large = thumbnailFraming([-1.9, 0, -2.5], [1.9, 0.2, 2.5])
    expect(large.halfWidth).toBeGreaterThan(small.halfWidth)
  })

  it('stays finite for a straight-down view with no natural right vector', () => {
    const framing = thumbnailFraming([-1, 0, -1], [1, 1, 1], [0, -1, 0])
    expect(Number.isFinite(framing.halfWidth)).toBe(true)
    expect(Number.isFinite(framing.halfHeight)).toBe(true)
    expect(framing.halfWidth).toBeGreaterThan(0)
  })
})

describe('renderPartThumbnail without WebGL', () => {
  it('returns null for every part so callers fall back', () => {
    for (const part of BRICK_PARTS) {
      expect(renderPartThumbnail(part, '#e7473c'), part.id).toBeNull()
    }
    expect(partThumbnailCacheSize()).toBe(0)
  })

  it('stays null across repeated calls and colours', () => {
    const part = BRICK_PART_MAP.brick_2x4
    expect(renderPartThumbnail(part, '#e7473c')).toBeNull()
    expect(renderPartThumbnail(part, '#e7473c')).toBeNull()
    expect(renderPartThumbnail(part, '#65b85a')).toBeNull()
  })

  it('disposes safely whether or not a renderer was ever created', () => {
    expect(() => disposePartThumbnails()).not.toThrow()
    expect(() => disposePartThumbnails()).not.toThrow()
    expect(partThumbnailCacheSize()).toBe(0)
    expect(renderPartThumbnail(BRICK_PART_MAP.brick_1x1, '#fff')).toBeNull()
  })

  it('renders into a small square canvas', () => {
    expect(THUMBNAIL_PIXELS).toBeLessThanOrEqual(256)
    expect(THUMBNAIL_PIXELS).toBeGreaterThan(0)
  })
})
