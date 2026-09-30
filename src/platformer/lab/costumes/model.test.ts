import { describe, expect, it } from 'vitest'
import { blankFrame, fillPixels, normalizeCostumeSet, paintPixel, pixelAt, TRANSPARENT, type CostumeSet } from './model'

function sheet(): CostumeSet {
  return { version: 1, width: 3, height: 3, fps: 8, frames: [blankFrame({ width: 3, height: 3 }, 'one', 'Stand')] }
}

describe('painted costume data', () => {
  it('paints one pixel without mutating previous saved frames', () => {
    const original = sheet()
    const painted = paintPixel(original, 0, 1, 1, 'e7473cff')
    expect(pixelAt(original, original.frames[0], 1, 1)).toBe(TRANSPARENT)
    expect(pixelAt(painted, painted.frames[0], 1, 1)).toBe('e7473cff')
    expect(painted.frames[0].pixels).toHaveLength(3 * 3 * 8)
    expect(normalizeCostumeSet(painted)).toBe(painted)
  })

  it('fills only a connected region', () => {
    let s = sheet()
    for (let y = 0; y < 3; y++) s = paintPixel(s, 0, 1, y, '26323fff')
    const filled = fillPixels(s, 0, 0, 0, 'e7473cff')
    expect(pixelAt(filled, filled.frames[0], 0, 2)).toBe('e7473cff')
    expect(pixelAt(filled, filled.frames[0], 2, 0)).toBe(TRANSPARENT)
    expect(pixelAt(filled, filled.frames[0], 1, 1)).toBe('26323fff')
  })

  it('rejects oversized and malformed sheets before storage or rendering', () => {
    const s = sheet()
    expect(normalizeCostumeSet({ ...s, width: -1 })).toBeNull()
    expect(normalizeCostumeSet({ ...s, width: 65 })).toBeNull()
    expect(normalizeCostumeSet({ ...s, frames: Array(33).fill(s.frames[0]) })).toBeNull()
    expect(normalizeCostumeSet({ ...s, frames: [{ ...s.frames[0], pixels: 'bad' }] })).toBeNull()
  })
})
