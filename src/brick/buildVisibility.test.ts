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

  it('never pulls the far plane closer than the scene set it (Brick Valley horizon at 620)', () => {
    expect(getBuildVisibilityRange(20, 10, 70, 300, 620)).toEqual({ fogNear: 70, fogFar: 300, cameraFar: 620 })
    // A build framed beyond the scene horizon still pushes the plane out.
    expect(getBuildVisibilityRange(600, 80, 70, 300, 620).cameraFar).toBe(730)
  })

  it('writes into a caller-owned object so per-frame use allocates nothing', () => {
    const out = { fogNear: 0, fogFar: 0, cameraFar: 0 }
    expect(getBuildVisibilityRange(20, 10, 42, 90, 240, out)).toBe(out)
    expect(out).toEqual({ fogNear: 42, fogFar: 90, cameraFar: 240 })
  })
})
