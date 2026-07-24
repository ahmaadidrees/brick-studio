import { describe, expect, it } from 'vitest'
import { EXPLORE_SHOWCASE, SHOWCASE_BRICK_MATERIAL, shouldUseExploreShowcase } from './exploreLookdev'

describe('shouldUseExploreShowcase', () => {
  it('never runs in build mode, so the build look stays untouched', () => {
    expect(shouldUseExploreShowcase('build', false)).toBe(false)
    expect(shouldUseExploreShowcase('build', true)).toBe(false)
  })

  it('stays off for compact renderers per the performance ladder', () => {
    expect(shouldUseExploreShowcase('explore', true)).toBe(false)
  })

  it('enables on explore with a full-size renderer', () => {
    expect(shouldUseExploreShowcase('explore', false)).toBe(true)
  })
})

describe('showcase tuning', () => {
  it('keeps brick plastic non-metallic with a full clearcoat', () => {
    expect(SHOWCASE_BRICK_MATERIAL.metalness).toBe(0)
    expect(SHOWCASE_BRICK_MATERIAL.clearcoat).toBe(1)
    expect(SHOWCASE_BRICK_MATERIAL.roughness).toBeGreaterThan(0)
    expect(SHOWCASE_BRICK_MATERIAL.roughness).toBeLessThan(1)
  })

  it('keeps exposure near neutral and the grade punchy but subtle', () => {
    expect(EXPLORE_SHOWCASE.toneMappingExposure).toBeGreaterThanOrEqual(1)
    expect(EXPLORE_SHOWCASE.toneMappingExposure).toBeLessThan(1.5)
    expect(EXPLORE_SHOWCASE.grade.saturation).toBeGreaterThan(0)
    expect(EXPLORE_SHOWCASE.grade.saturation).toBeLessThanOrEqual(0.3)
    expect(EXPLORE_SHOWCASE.grade.vignetteDarkness).toBeLessThanOrEqual(0.35)
  })

  it('uses a crisp high-resolution shadow map for the key light', () => {
    expect(EXPLORE_SHOWCASE.key.shadowMapSize).toBeGreaterThanOrEqual(2048)
  })
})
