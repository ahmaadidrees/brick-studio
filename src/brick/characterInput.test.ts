import { describe, expect, it } from 'vitest'
import {
  cameraRelativeMove,
  clampPlanarInput,
  combineMoveAxes,
  planarMagnitude,
  readKeyboardMove,
  type MutablePlanarVector,
} from './characterInput'

function direction(right: number, forward: number, yaw: number) {
  return cameraRelativeMove(right, forward, yaw, { x: 0, z: 0 })
}

function expectDirection(actual: MutablePlanarVector, x: number, z: number) {
  expect(actual.x).toBeCloseTo(x, 6)
  expect(actual.z).toBeCloseTo(z, 6)
}

describe('character input boundary', () => {
  it('normalizes W/Up to positive forward and S/Down to negative forward', () => {
    expect(readKeyboardMove(new Set(['w']), { x: 0, z: 0 })).toEqual({ x: 0, z: 1 })
    expect(readKeyboardMove(new Set(['arrowup']), { x: 0, z: 0 })).toEqual({ x: 0, z: 1 })
    expect(readKeyboardMove(new Set(['s']), { x: 0, z: 0 })).toEqual({ x: 0, z: -1 })
    expect(readKeyboardMove(new Set(['arrowdown']), { x: 0, z: 0 })).toEqual({ x: 0, z: -1 })
  })

  it('clamps keyboard plus touch diagonals while preserving analog magnitude', () => {
    const output = { x: 0, z: 0 }
    combineMoveAxes({ x: 1, z: 0 }, { x: 0, z: 1 }, output)
    expect(planarMagnitude(output)).toBeCloseTo(1)
    expect(output.x).toBeCloseTo(Math.SQRT1_2)
    expect(output.z).toBeCloseTo(Math.SQRT1_2)

    clampPlanarInput(0.25, 0.5, output)
    expect(output).toEqual({ x: 0.25, z: 0.5 })
  })
})

describe('camera-relative direction mapping', () => {
  it('moves W away from the camera at every cardinal yaw', () => {
    expectDirection(direction(0, 1, 0), 0, 1)
    expectDirection(direction(0, 1, Math.PI / 2), 1, 0)
    expectDirection(direction(0, 1, Math.PI), 0, -1)
    expectDirection(direction(0, 1, Math.PI * 1.5), -1, 0)
  })

  it('keeps D screen-right at every cardinal yaw', () => {
    expectDirection(direction(1, 0, 0), -1, 0)
    expectDirection(direction(1, 0, Math.PI / 2), 0, 1)
    expectDirection(direction(1, 0, Math.PI), 1, 0)
    expectDirection(direction(1, 0, Math.PI * 1.5), 0, -1)
  })

  it('maps forward and right consistently at intermediate yaw', () => {
    expectDirection(direction(0, 1, Math.PI / 4), Math.SQRT1_2, Math.SQRT1_2)
    expectDirection(direction(1, 0, Math.PI / 4), -Math.SQRT1_2, Math.SQRT1_2)
    expectDirection(direction(1, 1, Math.PI / 4), 0, 1)
  })
})
