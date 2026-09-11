import { describe, expect, it } from 'vitest'
import { draftIsValid } from '../../packages/brick-core/src/brickRules'
import { BRICK_PART_MAP, GRID_SIZE, PLATE_HEIGHT, STUD, rotatedSize } from './parts'
import { draftFromSurfacePoint } from './surfacePlacement'
import type { BrickInstance } from './types'

const brick = (id: string, y: number, partId = 'brick_2x2'): BrickInstance => ({ id, partId, x: 12, y, z: 12, rotation: 0, color: '#fff' })
const draft = brick('draft', 0)
function point(y: number) {
  const size = rotatedSize(BRICK_PART_MAP[draft.partId], draft.rotation)
  return { x: (draft.x + size.width / 2 - GRID_SIZE / 2) * STUD, y, z: (draft.z + size.depth / 2 - GRID_SIZE / 2) * STUD }
}

describe('surface targeted placement', () => {
  it('places on an elevated interior floor without searching up to the roof', () => {
    const floor = brick('floor', 30)
    const roof = brick('roof', 45)
    const next = { ...draft, ...draftFromSurfacePoint(point(33 * PLATE_HEIGHT), draft, undefined, floor) }
    expect(next.y).toBe(33)
    expect(draftIsValid(next, [floor, roof])).toBe(true)
    expect(draftFromSurfacePoint(point(48 * PLATE_HEIGHT), draft, undefined, roof).y).toBe(48)
  })
  it('keeps a too-tall preview downstairs and rejects the ceiling collision', () => {
    const floor = brick('floor', 30)
    const roof = brick('roof', 39)
    const pillar = { ...draft, partId: 'pillar_1x1' }
    const next = { ...pillar, ...draftFromSurfacePoint(point(33 * PLATE_HEIGHT), pillar, undefined, floor) }
    expect(next.y).toBe(33)
    expect(draftIsValid(next, [floor, roof])).toBe(false)
  })
  it.each([-0.015, 0, 0.085, 0.1])('maps body and stud hits to the same grid surface (offset %s)', (offset) => {
    const floor = brick('floor', 30)
    expect(draftFromSurfacePoint(point(33 * PLATE_HEIGHT + offset), draft, undefined, floor).y).toBe(33)
  })
  it('maps the baseplate stud top to ground elevation', () => {
    expect(draftFromSurfacePoint(point(0.075), draft).y).toBe(0)
  })
  it('aligns group bottom to the surface while preserving elevated-anchor offsets', () => {
    const upper = brick('upper', 36)
    const lower = brick('lower', 33)
    const next = draftFromSurfacePoint(point(15 * PLATE_HEIGHT), upper, [upper, lower])
    expect(next.y).toBe(18)
    expect(lower.y + next.y - upper.y).toBe(15)
  })
  it('does not push a side-of-slope hit onto the slope top', () => {
    const slope = brick('slope', 30, 'slope_2x2')
    const next = { ...draft, ...draftFromSurfacePoint(point(31 * PLATE_HEIGHT), draft, undefined, slope) }
    expect(next.y).toBe(31)
    expect(draftIsValid(next, [slope])).toBe(false)
  })
})
