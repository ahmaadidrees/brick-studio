import { describe, expect, it } from 'vitest'
import { PALETTE_LONG_PRESS_MS, paletteDragScrolls } from './touchFlyout'

describe('paletteDragScrolls', () => {
  it('scrolls the palette for a quick drag that is mostly up or down', () => {
    expect(paletteDragScrolls({ x: 0, y: -12 }, 80)).toBe(true)
    expect(paletteDragScrolls({ x: 5, y: 11 }, 80)).toBe(true)
  })

  it('takes the block out for a mostly sideways drag', () => {
    expect(paletteDragScrolls({ x: 12, y: -3 }, 80)).toBe(false)
    expect(paletteDragScrolls({ x: 8, y: 8 }, 80)).toBe(false)
  })

  it('takes the block out in any direction after a long press', () => {
    expect(paletteDragScrolls({ x: 0, y: -12 }, PALETTE_LONG_PRESS_MS + 1)).toBe(false)
  })
})
