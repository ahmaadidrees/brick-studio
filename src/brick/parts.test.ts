import { describe, expect, it } from 'vitest'
import {
  BRICK_PARTS,
  BRICK_PART_MAP,
  PLATE_HEIGHT,
  STUD,
  partFootprintCells,
  partWorldSize,
  supportHeightForFootprint,
} from './parts'
import type { BrickInstance } from './types'

function brick(partId: string, x: number, y: number, z: number, rotation: BrickInstance['rotation'] = 0): BrickInstance {
  return { id: `${partId}@${x},${y},${z}r${rotation}`, partId, x, y, z, rotation, color: '#fff' }
}

describe('brick catalogue', () => {
  it('keeps ids, names and dimensions well formed', () => {
    const ids = new Set<string>()
    const names = new Set<string>()
    for (const part of BRICK_PARTS) {
      expect(ids.has(part.id), part.id).toBe(false)
      expect(names.has(part.name), part.name).toBe(false)
      ids.add(part.id)
      names.add(part.name)
      expect(part.icon.length, part.id).toBeGreaterThan(0)
      expect(part.width, part.id).toBeGreaterThan(0)
      expect(part.depth, part.id).toBeGreaterThan(0)
      expect(part.height, part.id).toBeGreaterThan(0)
      expect(BRICK_PART_MAP[part.id]).toBe(part)
    }
  })

  it('holds brick_2x4 at the index the store seeds its first draft from', () => {
    expect(BRICK_PARTS[5].id).toBe('brick_2x4')
  })

  it('covers every part kind at least once', () => {
    const kinds = new Set(BRICK_PARTS.map((part) => part.kind))
    expect([...kinds].sort()).toEqual([
      'arch', 'brick', 'cone', 'corner', 'door', 'invertedSlope',
      'plate', 'round', 'slope', 'stair', 'window',
    ])
  })

  it('ships the added size variants', () => {
    const sizes = ['brick_1x3', 'brick_1x6', 'brick_2x6', 'brick_4x4', 'plate_6x8']
    for (const id of sizes) {
      const part = BRICK_PART_MAP[id]
      expect(part, id).toBeDefined()
      const [, dimensions] = id.split('_')
      const [width, depth] = dimensions.split('x').map(Number)
      expect([part.width, part.depth], id).toEqual([width, depth])
      expect(part.height, id).toBe(id.startsWith('plate') ? 1 : 3)
    }
  })

  it('derives inset world sizes from the stud grid', () => {
    const part = BRICK_PART_MAP.brick_2x4
    const size = partWorldSize(part)
    expect(size.width).toBeCloseTo(2 * STUD - 0.035)
    expect(size.depth).toBeCloseTo(4 * STUD - 0.035)
    expect(size.height).toBeCloseTo(3 * PLATE_HEIGHT - 0.015)
  })
})

describe('partFootprintCells', () => {
  it('fills the whole rectangle for ordinary parts', () => {
    expect(partFootprintCells(BRICK_PART_MAP.brick_2x4)).toHaveLength(8)
    expect(partFootprintCells(BRICK_PART_MAP.plate_6x8)).toHaveLength(48)
    expect(partFootprintCells(BRICK_PART_MAP.brick_1x1)).toEqual([[0, 0]])
  })

  it('drops the diagonal cell of a corner', () => {
    expect(partFootprintCells(BRICK_PART_MAP.corner_2x2)).toEqual([[0, 0], [0, 1], [1, 0]])
  })
})

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
