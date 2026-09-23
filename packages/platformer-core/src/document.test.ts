import { describe, expect, it } from 'vitest'
import { PLATFORMER_FORMAT, createPlatformerDocument, isPlatformerDocument, validatePlatformerDocument } from './document'
import { createBlankLevel, levelToJson } from './engine/level'
import { hashWorld, createWorld } from './engine/world'
import { demoLevel } from './levels/demo'

describe('2D level documents', () => {
  it('round-trip a level exactly', () => {
    const level = demoLevel()
    const result = validatePlatformerDocument(JSON.parse(JSON.stringify(createPlatformerDocument(level))))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.format).toBe(PLATFORMER_FORMAT)
    expect(hashWorld(createWorld(result.level))).toBe(hashWorld(createWorld(level)))
  })

  it('never mistake a 3D brick document for a 2D level', () => {
    const brick = { version: 3, bricks: [], plate: { width: 32, depth: 32 } }
    expect(isPlatformerDocument(brick)).toBe(false)
    expect(validatePlatformerDocument(brick).ok).toBe(false)
    expect(isPlatformerDocument(null)).toBe(false)
    expect(isPlatformerDocument('brickgineers-2d')).toBe(false)
  })

  it('reject other versions and broken levels', () => {
    const doc = createPlatformerDocument(createBlankLevel(40, 20, 'Test'))
    expect(validatePlatformerDocument({ ...doc, version: 2 }).ok).toBe(false)
    expect(validatePlatformerDocument({ ...doc, level: { ...doc.level, w: 99999 } }).ok).toBe(false)
    expect(validatePlatformerDocument({ ...doc, level: 'nope' }).ok).toBe(false)
  })

  it('store a canonical copy without unknown fields', () => {
    const doc = createPlatformerDocument(createBlankLevel(40, 20, 'Test'))
    const result = validatePlatformerDocument({ ...doc, extra: 'x', level: { ...doc.level, sneaky: true } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document).toEqual({ format: PLATFORMER_FORMAT, version: 1, level: levelToJson(result.level) })
    expect('extra' in result.document).toBe(false)
  })
})
