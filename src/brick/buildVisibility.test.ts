import { describe, expect, it } from 'vitest'
import { getBuildVisibilityRange } from './buildVisibility'

describe('build camera atmosphere', () => {
  it('preserves scene atmosphere when the build is already in its clear range', () => {
    expect(getBuildVisibilityRange(20, 10, 42, 90)).toEqual({ fogNear: 42, fogFar: 90, cameraFar: 240 })
  })

  it('keeps a portrait restored build visible beyond the original opaque fog distance', () => {
    const result = getBuildVisibilityRange(152, 45, 42, 90)
    expect(result.fogNear).toBeGreaterThanOrEqual(197)
    expect(result.fogFar - result.fogNear).toBe(48)
    expect(result.cameraFar).toBeGreaterThan(197)
  })

  it('keeps the far side of a maximum zoom build inside the camera clipping plane', () => {
    const result = getBuildVisibilityRange(256, 80, 42, 90)
    expect(result.cameraFar).toBeGreaterThan(336)
    expect(result.fogNear).toBeGreaterThanOrEqual(336)
  })
})
