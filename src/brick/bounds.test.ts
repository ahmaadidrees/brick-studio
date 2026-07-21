import { describe, expect, it } from 'vitest'
import { getBuildBounds, getFrameDistance } from './bounds'
import { BRICK_PART_MAP, GRID_SIZE, PLATE_HEIGHT, STUD, brickWorldPosition, rotatedSize } from './parts'
import type { BrickInstance } from './types'

function expectBrickInsideBounds(brick: BrickInstance, bounds: ReturnType<typeof getBuildBounds>) {
  const part = BRICK_PART_MAP[brick.partId]
  const size = rotatedSize(part, brick.rotation)
  const position = brickWorldPosition(brick)
  expect(position[0] - size.width * STUD / 2).toBeGreaterThan(bounds.min[0])
  expect(position[0] + size.width * STUD / 2).toBeLessThan(bounds.max[0])
  expect(position[1]).toBeGreaterThan(bounds.min[1])
  expect(position[1] + part.height * PLATE_HEIGHT).toBeLessThan(bounds.max[1])
  expect(position[2] - size.depth * STUD / 2).toBeGreaterThan(bounds.min[2])
  expect(position[2] + size.depth * STUD / 2).toBeLessThan(bounds.max[2])
}

describe('Frame All bounds', () => {
  it('falls back to the whole plate when the build is empty', () => {
    const bounds = getBuildBounds([])
    expect(bounds.empty).toBe(true)
    expect(bounds.center[0]).toBeCloseTo(0)
    expect(bounds.center[2]).toBeCloseTo(0)
    expect(bounds.size[0]).toBeGreaterThan(GRID_SIZE * STUD)
    expect(bounds.size[2]).toBeGreaterThan(GRID_SIZE * STUD)
  })

  it('includes far-edge, elevated, and rotated brick extents with padding', () => {
    const bricks: BrickInstance[] = [
      { id: 'west', partId: 'brick_1x4', x: 0, y: 0, z: 0, rotation: 1, color: '#fff' },
      { id: 'east', partId: 'pillar_1x1', x: 63, y: 12, z: 63, rotation: 0, color: '#fff' },
    ]
    const bounds = getBuildBounds(bricks)

    expect(bounds.empty).toBe(false)
    for (const brick of bricks) expectBrickInsideBounds(brick, bounds)
    expect(bounds.center[1]).toBeGreaterThan(0)
  })

  it('uses a larger fit distance for an empty plate and for a narrower viewport', () => {
    const emptyBounds = getBuildBounds([])
    const singleBounds = getBuildBounds([
      { id: 'one', partId: 'brick_1x1', x: 32, y: 0, z: 32, rotation: 0, color: '#fff' },
    ])

    expect(getFrameDistance(emptyBounds, 45, 16 / 9)).toBeGreaterThan(getFrameDistance(singleBounds, 45, 16 / 9))
    expect(getFrameDistance(emptyBounds, 45, 3 / 4)).toBeGreaterThan(getFrameDistance(emptyBounds, 45, 16 / 9))
  })
})
