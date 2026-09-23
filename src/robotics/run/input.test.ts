import { describe, expect, it } from 'vitest'
import { createInputSampler, programKeyFromEvent } from './input'

describe('the input sampler', () => {
  it('reports held keys and one pressed edge per key-down; key repeat adds no edge', () => {
    const sampler = createInputSampler()
    sampler.keyDown('up')
    sampler.keyDown('up')
    sampler.keyDown('up')
    const first = sampler.sample()
    expect(first.held.up).toBe(true)
    expect(first.pressed).toEqual(['up'])
    sampler.keyDown('up')
    const second = sampler.sample()
    expect(second.held.up).toBe(true)
    expect(second.pressed).toEqual([])
  })

  it('a tap between two samples still reports its edge once, and is not held', () => {
    const sampler = createInputSampler()
    sampler.keyDown('space')
    sampler.keyUp('space')
    const sample = sampler.sample()
    expect(sample.pressed).toEqual(['space'])
    expect(sample.held.space).toBe(false)
    expect(sampler.sample().pressed).toEqual([])
  })

  it('peek does not consume edges', () => {
    const sampler = createInputSampler()
    sampler.setKey('left', true)
    expect(sampler.peek().pressed).toEqual(['left'])
    expect(sampler.sample().pressed).toEqual(['left'])
  })

  it('arrow keys drive the joystick axes while the on-screen joystick is centred', () => {
    const sampler = createInputSampler()
    sampler.keyDown('up')
    sampler.keyDown('left')
    expect(sampler.sample().joystick).toEqual({ up: 100, right: -100 })
    sampler.keyDown('down')
    expect(sampler.sample().joystick).toEqual({ up: 0, right: -100 })
    sampler.setJoystick(30, 60)
    expect(sampler.sample().joystick).toEqual({ up: 30, right: 60 })
    sampler.setJoystick(0, 0)
    expect(sampler.sample().joystick).toEqual({ up: 0, right: -100 })
  })

  it('clamps the joystick and reads nonsense as centred', () => {
    const sampler = createInputSampler()
    sampler.setJoystick(250, -300)
    expect(sampler.sample().joystick).toEqual({ up: 100, right: -100 })
    sampler.setJoystick(Number.NaN, Number.POSITIVE_INFINITY)
    expect(sampler.sample().joystick).toEqual({ up: 0, right: 0 })
  })

  it('clearAll (blur) releases every key and centres the joystick', () => {
    const sampler = createInputSampler()
    sampler.keyDown('right')
    sampler.setJoystick(50, 50)
    sampler.clearAll()
    const sample = sampler.sample()
    expect(Object.values(sample.held).some(Boolean)).toBe(false)
    expect(sample.pressed).toEqual([])
    expect(sample.joystick).toEqual({ up: 0, right: 0 })
  })

  it('maps DOM keys to program keys', () => {
    expect(programKeyFromEvent({ key: 'ArrowUp' })).toBe('up')
    expect(programKeyFromEvent({ key: 'ArrowRight' })).toBe('right')
    expect(programKeyFromEvent({ key: ' ', code: 'Space' })).toBe('space')
    expect(programKeyFromEvent({ key: 'a', code: 'KeyA' })).toBeNull()
  })
})
