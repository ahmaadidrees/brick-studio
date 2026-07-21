import { describe, expect, it } from 'vitest'
import {
  EXPLORE_MAX_PITCH,
  EXPLORE_MIN_PITCH,
  clampExplorePitch,
  normalizeTouchStick,
} from './touchInput'

describe('touch input boundary', () => {
  it('maps stick-up to positive forward and stick-right to positive right', () => {
    expect(normalizeTouchStick(0, -42, 42)).toEqual({ x: 0, z: 1, magnitude: 1, running: true })
    expect(normalizeTouchStick(42, 0, 42)).toEqual({ x: 1, z: 0, magnitude: 1, running: true })
  })

  it('normalizes diagonal input and removes the radial dead zone', () => {
    const diagonal = normalizeTouchStick(42, -42, 42)
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1)
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2)
    expect(diagonal.z).toBeCloseTo(Math.SQRT1_2)
    expect(normalizeTouchStick(2, -2, 42)).toEqual({ x: 0, z: 0, magnitude: 0, running: false })
  })

  it('auto-runs only at high raw stick magnitude', () => {
    expect(normalizeTouchStick(0, -30, 42).running).toBe(false)
    expect(normalizeTouchStick(0, -36, 42).running).toBe(true)
  })

  it('clamps look pitch to a stable orbit range', () => {
    expect(clampExplorePitch(-10)).toBe(EXPLORE_MIN_PITCH)
    expect(clampExplorePitch(10)).toBe(EXPLORE_MAX_PITCH)
    expect(clampExplorePitch(0.65)).toBe(0.65)
  })
})
