import { describe, expect, it } from 'vitest'
import { usesCompactRenderer } from './rendererQuality'

describe('responsive renderer quality', () => {
  it('uses the compact renderer in both phone orientations', () => {
    expect(usesCompactRenderer(390, 844)).toBe(true)
    expect(usesCompactRenderer(844, 390)).toBe(true)
  })

  it('keeps full quality for tablet and desktop viewports', () => {
    expect(usesCompactRenderer(820, 1180)).toBe(false)
    expect(usesCompactRenderer(1180, 820)).toBe(false)
    expect(usesCompactRenderer(1440, 900)).toBe(false)
  })
})
