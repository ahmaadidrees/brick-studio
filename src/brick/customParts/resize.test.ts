import { beforeEach, describe, expect, it } from 'vitest'
import { registerCustomParts } from '../parts'
import type { BrickInstance } from '../types'
import { resizeSelectionDefinitions } from './resize'

const bricks: BrickInstance[] = [
  { id: 'first', partId: 'brick_1x2', x: 4, y: 0, z: 4, rotation: 0, color: '#fff' },
  { id: 'second', partId: 'slope_2x2', x: 12, y: 0, z: 4, rotation: 0, color: '#fff' },
]

beforeEach(() => registerCustomParts([]))

describe('resizeSelectionDefinitions', () => {
  it('creates deduplicated bounded definitions for a mixed selection', () => {
    const result = resizeSelectionDefinitions(bricks, { width: 1, depth: 0, height: 2 }, [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.definitions).toHaveLength(2)
    expect(result.definitions[0]).toMatchObject({ template: 'solid', width: 2, depth: 2, height: 5 })
    expect(result.definitions[1]).toMatchObject({ template: 'slope', width: 3, depth: 2, height: 5 })
    expect(Object.keys(result.partIdsByBrickId)).toEqual(['first', 'second'])
  })

  it('rejects the complete selection when any dimension leaves the safe range', () => {
    const result = resizeSelectionDefinitions(bricks, { width: -1, depth: 0, height: 0 }, [])
    expect(result).toEqual({ ok: false, message: 'Brick sizes stay between 1–8 studs wide/deep and 1–12 plates high.' })
  })

  it('retains existing document definitions while adding resized parts', () => {
    const existing = { id: 'custom_existing', name: 'Existing', template: 'solid', width: 2, depth: 2, height: 3, studs: 'auto' } as const
    registerCustomParts([existing])
    const result = resizeSelectionDefinitions([bricks[0]], { width: 1, depth: 0, height: 0 }, [existing])
    expect(result.ok && result.definitions[0]).toEqual(existing)
    expect(result.ok && result.definitions).toHaveLength(2)
  })
})
