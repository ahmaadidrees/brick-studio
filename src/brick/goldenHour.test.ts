import { describe, expect, it } from 'vitest'
import {
  DUST_MOTE_COUNT,
  GOLDEN_HOUR,
  createDustMoteField,
  createMulberry32,
  getDustMoteBounds,
  getGoldenHourQuality,
  goldenSunDirection,
  goldenSunPosition,
} from './goldenHour'

describe('goldenSunDirection', () => {
  it('returns a unit vector', () => {
    const [x, y, z] = goldenSunDirection()
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6)
  })

  it('keeps the sun low on the horizon for the golden-hour look', () => {
    const [, y] = goldenSunDirection()
    expect(y).toBeCloseTo(Math.sin((GOLDEN_HOUR.sunElevationDeg * Math.PI) / 180), 6)
    expect(y).toBeGreaterThan(0.1)
    expect(y).toBeLessThan(0.4)
  })

  it('places the sun ahead of the default explore camera (toward -Z)', () => {
    const [x, , z] = goldenSunDirection()
    expect(z).toBeLessThan(0)
    expect(x).toBeGreaterThan(0)
  })

  it('respects explicit elevation and azimuth', () => {
    const [x, y, z] = goldenSunDirection(90, 45)
    expect(y).toBeCloseTo(1, 6)
    expect(x).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(0, 6)
  })
})

describe('goldenSunPosition', () => {
  it('scales the sun direction to a world position', () => {
    const direction = goldenSunDirection()
    const position = goldenSunPosition(46)
    expect(position[0]).toBeCloseTo(direction[0] * 46, 6)
    expect(position[1]).toBeCloseTo(direction[1] * 46, 6)
    expect(position[2]).toBeCloseTo(direction[2] * 46, 6)
  })
})

describe('getGoldenHourQuality', () => {
  it('enables the full cinematic rig on the non-compact path', () => {
    expect(getGoldenHourQuality(false, false)).toEqual({
      postProcessing: true,
      scatteringSky: true,
      environmentMap: true,
      clearcoatBricks: true,
      dustMotes: true,
      shadowMapSize: 2048,
    })
  })

  it('keeps every heavy effect off on the compact renderer', () => {
    const quality = getGoldenHourQuality(true, false)
    expect(quality.postProcessing).toBe(false)
    expect(quality.scatteringSky).toBe(false)
    expect(quality.environmentMap).toBe(false)
    expect(quality.clearcoatBricks).toBe(false)
    expect(quality.dustMotes).toBe(false)
    expect(quality.shadowMapSize).toBe(512)
  })

  it('disables dust-mote motion when reduced motion is on, even on desktop', () => {
    const quality = getGoldenHourQuality(false, true)
    expect(quality.dustMotes).toBe(false)
    expect(quality.postProcessing).toBe(true)
    expect(quality.scatteringSky).toBe(true)
  })
})

describe('createMulberry32', () => {
  it('is deterministic for a given seed and produces values in [0, 1)', () => {
    const first = createMulberry32(42)
    const second = createMulberry32(42)
    for (let index = 0; index < 32; index += 1) {
      const value = first()
      expect(value).toBe(second())
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('produces different sequences for different seeds', () => {
    const first = createMulberry32(1)()
    const second = createMulberry32(2)()
    expect(first).not.toBe(second)
  })
})

describe('createDustMoteField', () => {
  it('allocates one position, seed, and scale per mote', () => {
    const field = createDustMoteField()
    expect(field.count).toBe(DUST_MOTE_COUNT)
    expect(field.positions).toHaveLength(DUST_MOTE_COUNT * 3)
    expect(field.seeds).toHaveLength(DUST_MOTE_COUNT)
    expect(field.scales).toHaveLength(DUST_MOTE_COUNT)
  })

  it('keeps every mote inside the light volume over the plate', () => {
    const field = createDustMoteField(64)
    const bounds = getDustMoteBounds()
    for (let index = 0; index < field.count; index += 1) {
      expect(Math.abs(field.positions[index * 3])).toBeLessThanOrEqual(bounds.horizontal)
      expect(field.positions[index * 3 + 1]).toBeGreaterThanOrEqual(bounds.minY)
      expect(field.positions[index * 3 + 1]).toBeLessThanOrEqual(bounds.maxY)
      expect(Math.abs(field.positions[index * 3 + 2])).toBeLessThanOrEqual(bounds.horizontal)
      expect(field.seeds[index]).toBeGreaterThanOrEqual(0)
      expect(field.seeds[index]).toBeLessThan(1)
      expect(field.scales[index]).toBeGreaterThanOrEqual(0.55)
      expect(field.scales[index]).toBeLessThanOrEqual(1.65)
    }
  })

  it('is stable between mounts (same seed, same field)', () => {
    const first = createDustMoteField(32, 7)
    const second = createDustMoteField(32, 7)
    expect(Array.from(first.positions)).toEqual(Array.from(second.positions))
    expect(Array.from(first.seeds)).toEqual(Array.from(second.seeds))
    expect(Array.from(first.scales)).toEqual(Array.from(second.scales))
  })
})
