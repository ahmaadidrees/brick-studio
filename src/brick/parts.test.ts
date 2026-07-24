import { describe, expect, it } from 'vitest'
import { BRICK_PART_MAP, supportHeightForFootprint } from './parts'
import type { BrickInstance } from './types'

function brick(partId: string, x: number, y: number, z: number, rotation: BrickInstance['rotation'] = 0): BrickInstance {
  return { id: `${partId}@${x},${y},${z}r${rotation}`, partId, x, y, z, rotation, color: '#fff' }
}

describe('supportHeightForFootprint', () => {
  it('returns 0 on an empty plate', () => {
    expect(supportHeightForFootprint([], 10, 10, 2, 4)).toBe(0)
  })

  it('returns the top of a brick fully under the ghost footprint', () => {
    const bricks = [brick('brick_2x4', 10, 0, 10)]
    expect(supportHeightForFootprint(bricks, 10, 11, 2, 2)).toBe(BRICK_PART_MAP.brick_2x4.height)
  })

  it('lifts onto a support as soon as the footprint clips a single cell', () => {
    const bricks = [brick('brick_2x2', 4, 0, 4)]
    expect(supportHeightForFootprint(bricks, 5, 5, 2, 2)).toBe(3)
    expect(supportHeightForFootprint(bricks, 3, 3, 2, 2)).toBe(3)
  })

  it('returns the taller top when straddling two stacks of different heights', () => {
    const bricks = [
      brick('brick_2x2', 0, 0, 0),
      brick('brick_2x2', 0, 3, 0),
      brick('brick_2x2', 2, 0, 0),
    ]
    expect(supportHeightForFootprint(bricks, 1, 0, 2, 2)).toBe(6)
  })

  it('mixes part heights, taking the max over plates and bricks', () => {
    const bricks = [
      brick('plate_4x6', 8, 0, 8),
      brick('pillar_1x1', 12, 0, 8),
    ]
    expect(supportHeightForFootprint(bricks, 10, 8, 2, 2)).toBe(1)
    expect(supportHeightForFootprint(bricks, 11, 8, 2, 2)).toBe(9)
  })

  it('ignores edge-adjacent footprints that touch without overlapping', () => {
    const bricks = [brick('brick_2x2', 4, 0, 4)]
    expect(supportHeightForFootprint(bricks, 6, 4, 2, 2)).toBe(0)
    expect(supportHeightForFootprint(bricks, 2, 4, 2, 2)).toBe(0)
    expect(supportHeightForFootprint(bricks, 4, 6, 2, 2)).toBe(0)
    expect(supportHeightForFootprint(bricks, 4, 2, 2, 2)).toBe(0)
  })

  it('uses the rotated footprint of placed bricks', () => {
    const rotated = [brick('brick_1x4', 8, 0, 8, 1)]
    expect(supportHeightForFootprint(rotated, 11, 8, 1, 1)).toBe(3)
    expect(supportHeightForFootprint(rotated, 8, 9, 1, 1)).toBe(0)

    const unrotated = [brick('brick_1x4', 8, 0, 8, 0)]
    expect(supportHeightForFootprint(unrotated, 11, 8, 1, 1)).toBe(0)
    expect(supportHeightForFootprint(unrotated, 8, 9, 1, 1)).toBe(3)
  })
})
