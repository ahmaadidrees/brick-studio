import { describe, expect, it } from 'vitest'
import { acosDeg, asinDeg, atan2Deg, atanDeg, cosDeg, exp, ln, log10, pow10, sinDeg, tanDeg } from './detmath'
import { costumeToWorld, transformOf, worldToCostume } from './geometry'
import { boxBrick, makeTarget } from './testkit'

const R = Math.PI / 180

describe('detmath', () => {
  it('is exact on the quadrants', () => {
    expect([sinDeg(0), sinDeg(90), sinDeg(180), sinDeg(270), sinDeg(-90)]).toEqual([0, 1, 0, -1, -1])
    expect([cosDeg(0), cosDeg(90), cosDeg(180), cosDeg(270), cosDeg(360)]).toEqual([1, 0, -1, 0, 1])
    expect(tanDeg(90)).toBe(Infinity)
    expect(tanDeg(270)).toBe(-Infinity)
  })

  it('matches Math to 1e-14 over a sweep', () => {
    for (let d = -720; d <= 720; d += 0.37) {
      expect(Math.abs(sinDeg(d) - Math.sin(d * R))).toBeLessThan(1e-14)
      expect(Math.abs(cosDeg(d) - Math.cos(d * R))).toBeLessThan(1e-14)
    }
    for (let t = -50; t <= 50; t += 0.093) {
      expect(Math.abs(atanDeg(t) - Math.atan(t) / R)).toBeLessThan(1e-12)
    }
    for (let v = -1; v <= 1; v += 0.0137) {
      expect(Math.abs(asinDeg(v) - Math.asin(v) / R)).toBeLessThan(1e-11)
      expect(Math.abs(acosDeg(v) - Math.acos(v) / R)).toBeLessThan(1e-11)
    }
    for (let x = -30; x <= 30; x += 0.071) {
      const e = exp(x)
      expect(Math.abs(e - Math.exp(x)) / Math.exp(x)).toBeLessThan(1e-14)
    }
    for (let x = 0.001; x < 1e6; x *= 1.37) {
      expect(Math.abs(ln(x) - Math.log(x))).toBeLessThan(1e-13)
      expect(Math.abs(log10(x) - Math.log10(x))).toBeLessThan(1e-13)
    }
    expect(Math.abs(pow10(2) - 100)).toBeLessThan(1e-11)
  })

  it('handles atan2 quadrants and edge values', () => {
    expect(atan2Deg(1, 0)).toBe(90)
    expect(atan2Deg(-1, 0)).toBe(-90)
    expect(atan2Deg(0, -1)).toBeCloseTo(180, 12)
    expect(atan2Deg(-1, -1)).toBeCloseTo(-135, 12)
    expect(ln(0)).toBe(-Infinity)
    expect(Number.isNaN(ln(-1))).toBe(true)
    expect(exp(-Infinity)).toBe(0)
  })
})

describe('geometry', () => {
  it('round-trips costume and world points for every rotation style', () => {
    const costume = boxBrick('b', 'B', 30, 10).costumes[0]
    for (const rotationStyle of ['all around', 'left-right', "don't rotate"] as const) {
      for (const direction of [90, 0, -90, 45, 180, -30]) {
        const t = transformOf(makeTarget({ x: 17, y: -4, size: 150, direction, rotationStyle }))
        const [wx, wy] = costumeToWorld(t, costume, 3, 7)
        const [cx, cy] = worldToCostume(t, costume, wx, wy)
        expect(cx).toBeCloseTo(3, 9)
        expect(cy).toBeCloseTo(7, 9)
      }
    }
  })

  it('puts the costume top above the center at direction 90 (y up)', () => {
    const costume = boxBrick('b', 'B', 20, 20).costumes[0]
    const t = transformOf(makeTarget({ x: 100, y: 50 }))
    expect(costumeToWorld(t, costume, 10, 0)).toEqual([100, 60])
  })
})
