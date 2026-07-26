import { describe, expect, it } from 'vitest'
import { chooseAvatarMotionState, createMotionSnapshot } from './avatarMotion'

describe('avatar motion state selection', () => {
  it('selects idle, walk, and run from normalized grounded speed', () => {
    expect(chooseAvatarMotionState(createMotionSnapshot())).toBe('idle')
    expect(chooseAvatarMotionState(createMotionSnapshot({ horizontalSpeed: 2, maxSpeed: 6 }))).toBe('walk')
    expect(chooseAvatarMotionState(createMotionSnapshot({ horizontalSpeed: 5, maxSpeed: 6 }))).toBe('run')
  })

  it('selects rise and fall from airborne vertical velocity', () => {
    expect(chooseAvatarMotionState(createMotionSnapshot({ grounded: false, verticalVelocity: 2 }))).toBe('rise')
    expect(chooseAvatarMotionState(createMotionSnapshot({ grounded: false, verticalVelocity: -0.1 }))).toBe('fall')
  })

  it('treats airborne state as independent of horizontal speed', () => {
    expect(chooseAvatarMotionState(createMotionSnapshot({ grounded: false, horizontalSpeed: 5, maxSpeed: 6, verticalVelocity: 3 }))).toBe('rise')
  })
})

describe('motion snapshot defaults', () => {
  it('starts grounded and still with zeroed edge counters', () => {
    expect(createMotionSnapshot()).toEqual({
      grounded: true,
      horizontalSpeed: 0,
      maxSpeed: 1,
      verticalVelocity: 0,
      facingYaw: 0,
      acceleration: 0,
      turnSignal: 0,
      jumpSequence: 0,
      landSequence: 0,
      impact: 0,
      flipSequence: 0,
    })
  })

  it('never divides by a zero max speed', () => {
    expect(chooseAvatarMotionState(createMotionSnapshot({ horizontalSpeed: 0, maxSpeed: 0 }))).toBe('idle')
  })
})
