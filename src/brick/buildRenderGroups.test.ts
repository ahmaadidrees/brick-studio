import { describe, expect, it } from 'vitest'
import {
  brickIdForInstance,
  partitionBuildBricks,
  usesClassicEnvironmentRig,
  usesStudioBuildLights,
} from './buildRenderGroups'
import type { BrickInstance } from './types'

const brick = (id: string, partId = 'brick_2x4'): BrickInstance => ({
  id,
  partId,
  x: 1,
  y: 0,
  z: 1,
  rotation: 0,
  color: '#e7473c',
})

describe('partitionBuildBricks', () => {
  it('collapses idle bricks into one instance group per part', () => {
    const result = partitionBuildBricks([
      brick('a'),
      brick('b'),
      brick('c', 'plate_2x4'),
      brick('d', 'plate_2x4'),
    ], { selectedIds: [] })

    expect(result.interactiveBricks).toEqual([])
    expect(result.instancedGroups).toEqual([
      { partId: 'brick_2x4', capacity: 2, bricks: [brick('a'), brick('b')] },
      { partId: 'plate_2x4', capacity: 2, bricks: [brick('c', 'plate_2x4'), brick('d', 'plate_2x4')] },
    ])
  })

  it('keeps selected, moving, and newly placed bricks individually interactive', () => {
    const bricks = [brick('idle'), brick('selected'), brick('moving'), brick('new')]
    const result = partitionBuildBricks(bricks, {
      selectedIds: ['selected'],
      movingId: 'moving',
      recentlyPlacedId: 'new',
    })

    expect(result.interactiveBricks.map(({ id }) => id)).toEqual(['selected', 'moving', 'new'])
    expect(result.instancedGroups).toEqual([{
      partId: 'brick_2x4',
      capacity: 4,
      bricks: [brick('idle')],
    }])
  })

  it('turns a thousand same-part idle bricks into one draw group', () => {
    const bricks = Array.from({ length: 1_000 }, (_, index) => brick(`brick-${index}`))
    const result = partitionBuildBricks(bricks, { selectedIds: [] })

    expect(result.instancedGroups).toHaveLength(1)
    expect(result.instancedGroups[0]).toMatchObject({ capacity: 1_000 })
    expect(result.instancedGroups[0].bricks).toHaveLength(1_000)
  })
})

describe('instanced pointer identity', () => {
  it('maps raycast instance indices back to stable brick ids', () => {
    expect(brickIdForInstance(['brick-a', 'brick-b'], 1)).toBe('brick-b')
    expect(brickIdForInstance(['brick-a'], undefined)).toBeNull()
    expect(brickIdForInstance(['brick-a'], 4)).toBeNull()
  })
})

describe('Build environment rig selection', () => {
  it('uses a selected additive environment rig while retaining Classic fallback', () => {
    expect(usesClassicEnvironmentRig('classic')).toBe(true)
    expect(usesClassicEnvironmentRig('toy-room')).toBe(false)
    expect(usesClassicEnvironmentRig('brick-valley')).toBe(false)
    expect(usesClassicEnvironmentRig('sky-island')).toBe(false)
  })

  it('keeps Build lit when an environment authors its lights in the Explore-only slot', () => {
    expect(usesStudioBuildLights('toy-room')).toBe(true)
    expect(usesStudioBuildLights('brick-valley')).toBe(true)
    expect(usesStudioBuildLights('classic')).toBe(false)
    expect(usesStudioBuildLights('sky-island')).toBe(false)
  })
})
