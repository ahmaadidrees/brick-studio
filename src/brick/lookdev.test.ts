import { describe, expect, it } from 'vitest'
import {
  EXPLORE_BRICK_ROUGHNESS_BASE,
  EXPLORE_BRICK_ROUGHNESS_SPAN,
  brickSurfaceJitter,
  exploreBrickRoughness,
  exploreLookdevFeatures,
} from './lookdev'

describe('exploreLookdevFeatures', () => {
  it('enables the full toy-photography stack on the non-compact renderer', () => {
    expect(exploreLookdevFeatures(false, false)).toEqual({
      postprocessing: true,
      contactShadows: true,
      dustMotes: true,
      premiumMaterials: true,
      shadowMapSize: 2048,
    })
  })

  it('keeps every heavy effect off the compact renderer path', () => {
    const features = exploreLookdevFeatures(true, false)
    expect(features.postprocessing).toBe(false)
    expect(features.contactShadows).toBe(false)
    expect(features.dustMotes).toBe(false)
    expect(features.premiumMaterials).toBe(false)
    expect(features.shadowMapSize).toBe(512)
  })

  it('removes the animated dust when reduced motion is on, keeping static polish', () => {
    const features = exploreLookdevFeatures(false, true)
    expect(features.dustMotes).toBe(false)
    expect(features.postprocessing).toBe(true)
    expect(features.contactShadows).toBe(true)
    expect(features.premiumMaterials).toBe(true)
  })

  it('never re-enables dust on compact renderers regardless of motion setting', () => {
    expect(exploreLookdevFeatures(true, true).dustMotes).toBe(false)
  })
})

describe('brickSurfaceJitter', () => {
  it('is deterministic for a given brick id', () => {
    expect(brickSurfaceJitter('brick-123-abcdef')).toBe(brickSurfaceJitter('brick-123-abcdef'))
  })

  it('stays within [0, 1)', () => {
    for (let index = 0; index < 200; index += 1) {
      const jitter = brickSurfaceJitter(`brick-${index}-seed`)
      expect(jitter).toBeGreaterThanOrEqual(0)
      expect(jitter).toBeLessThan(1)
    }
  })

  it('spreads different ids across the range instead of collapsing to one value', () => {
    const values = new Set(
      Array.from({ length: 64 }, (_, index) => brickSurfaceJitter(`brick-${index}-spread`)),
    )
    expect(values.size).toBeGreaterThan(32)
  })
})

describe('exploreBrickRoughness', () => {
  it('keeps roughness inside the molded-plastic band', () => {
    for (let index = 0; index < 100; index += 1) {
      const roughness = exploreBrickRoughness(`brick-${index}-band`)
      expect(roughness).toBeGreaterThanOrEqual(EXPLORE_BRICK_ROUGHNESS_BASE)
      expect(roughness).toBeLessThan(EXPLORE_BRICK_ROUGHNESS_BASE + EXPLORE_BRICK_ROUGHNESS_SPAN)
    }
  })
})
