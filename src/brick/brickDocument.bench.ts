import { bench, describe } from 'vitest'
import {
  BRICK_STUDIO_MAX_BRICKS,
  createBrickStudioDocument,
  validateBrickStudioDocument,
} from './brickDocument'
import type { BrickInstance } from './types'

const document = createBrickStudioDocument(Array.from(
  { length: BRICK_STUDIO_MAX_BRICKS },
  (_, index): BrickInstance => ({
    id: `benchmark-${index}`,
    partId: 'brick_1x1',
    x: index % 4,
    y: Math.floor(index / 4) * 3,
    z: 0,
    rotation: 0,
    color: '#3e83d7',
  }),
))

describe('1,000-brick capacity', () => {
  bench('validate a heavily stacked authoritative document', () => {
    const result = validateBrickStudioDocument(document)
    if (!result.ok) throw new Error(result.error.message)
  }, { iterations: 100 })
})
