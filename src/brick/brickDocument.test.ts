import { describe, expect, it } from 'vitest'
import {
  BRICK_STUDIO_MAX_JSON_LENGTH,
  BRICK_STUDIO_PART_LIBRARY_VERSION,
  BRICK_STUDIO_SCHEMA_VERSION,
  createBrickStudioDocument,
  parseBrickStudioDocument,
  serializeBrickStudioDocument,
  validateBrickStudioDocument,
} from './brickDocument'
import type { BrickInstance } from './types'

const mixed: BrickInstance[] = [
  { id: 'plain', partId: 'brick_1x2', x: 4, y: 0, z: 5, rotation: 0, color: '#fff' },
  { id: 'slope', partId: 'slope_2x2', x: 12, y: 3, z: 15, rotation: 1, color: '#e7473c' },
  { id: 'door', partId: 'door_1x4', x: 24, y: 0, z: 30, rotation: 3, color: '#3e83d7' },
]

describe('Brick Studio document schema', () => {
  it('round-trips exact durable brick state and special-part metadata', () => {
    const document = createBrickStudioDocument(mixed)

    expect(document).toEqual({
      schemaVersion: BRICK_STUDIO_SCHEMA_VERSION,
      partLibraryVersion: BRICK_STUDIO_PART_LIBRARY_VERSION,
      bricks: mixed,
    })
    expect(parseBrickStudioDocument(serializeBrickStudioDocument(document))).toEqual({
      ok: true,
      document,
    })
  })

  it.each([
    ['malformed JSON', '{ nope', 'invalid-json'],
    ['oversized text', ' '.repeat(BRICK_STUDIO_MAX_JSON_LENGTH + 1), 'invalid-json'],
    ['unsupported schema', JSON.stringify({ schemaVersion: 2, partLibraryVersion: 1, bricks: [] }), 'unsupported-schema'],
    ['unsupported library', JSON.stringify({ schemaVersion: 1, partLibraryVersion: 2, bricks: [] }), 'unsupported-library'],
  ])('rejects %s', (_label, serialized, code) => {
    const result = parseBrickStudioDocument(serialized)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
  })

  it.each([
    ['unknown part', { ...mixed[0], partId: 'future_part' }, 'invalid-brick'],
    ['fractional coordinate', { ...mixed[0], x: 1.5 }, 'invalid-brick'],
    ['negative coordinate', { ...mixed[0], z: -1 }, 'invalid-brick'],
    ['excessive height', { ...mixed[0], y: 1_025 }, 'invalid-brick'],
    ['invalid rotation', { ...mixed[0], rotation: 4 }, 'invalid-brick'],
    ['invalid color', { ...mixed[0], color: 'url(evil)' }, 'invalid-brick'],
  ])('rejects an %s without coercion', (_label, brick, code) => {
    const result = validateBrickStudioDocument({
      schemaVersion: 1,
      partLibraryVersion: 1,
      bricks: [brick],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
  })

  it('rejects duplicate ids, colliding layouts, plate overflow, and budget abuse', () => {
    const duplicate = validateBrickStudioDocument(createBrickStudioDocument([
      mixed[0],
      { ...mixed[1], id: mixed[0].id },
    ]))
    const overlap = validateBrickStudioDocument(createBrickStudioDocument([
      mixed[0],
      { ...mixed[1], x: mixed[0].x, y: mixed[0].y, z: mixed[0].z },
    ]))
    const outside = validateBrickStudioDocument(createBrickStudioDocument([
      { ...mixed[0], x: 64 },
    ]))
    const overBudget = validateBrickStudioDocument(createBrickStudioDocument(mixed), { maxBricks: 2 })

    expect(duplicate.ok ? null : duplicate.error.code).toBe('invalid-brick')
    expect(overlap.ok ? null : overlap.error.code).toBe('invalid-layout')
    expect(outside.ok ? null : outside.error.code).toBe('invalid-layout')
    expect(overBudget.ok ? null : overBudget.error.code).toBe('brick-limit')
  })

  it('clones input/output so callers cannot mutate the durable document by reference', () => {
    const document = createBrickStudioDocument(mixed)
    mixed[0].x = 40

    expect(document.bricks[0].x).toBe(4)
    const result = validateBrickStudioDocument(document)
    expect(result.ok).toBe(true)
    if (result.ok) {
      document.bricks[0].x = 41
      expect(result.document.bricks[0].x).toBe(4)
    }
  })
})
