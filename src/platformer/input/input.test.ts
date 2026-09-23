import { describe, it, expect, beforeEach } from 'vitest'
import { Input } from './input'

/** A fake standard-mapping controller for tests. */
function pad(pressed: number[], axes: [number, number] = [0, 0]) {
  return { id: 'Test Pad', connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) }
}

describe('controller input', () => {
  let current: ReturnType<typeof pad>[] = []
  beforeEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => current }, configurable: true })
  })

  it('maps face buttons, sticks and the d-pad by position', () => {
    const input = new Input()
    current = [pad([0])]
    let f = input.frame()
    expect(f.jump).toBe(true)
    expect(f.jumpPressed).toBe(true)
    f = input.frame()
    expect(f.jump).toBe(true)
    expect(f.jumpPressed).toBe(false)
    current = [pad([2], [0.9, 0])]
    f = input.frame()
    expect(f.run && f.runPressed && f.right && !f.left).toBe(true)
    current = [pad([14])]
    expect(input.frame().left).toBe(true)
    current = [pad([8])]
    expect(input.frame().togglePressed).toBe(true)
    expect(input.gamepadName).toBe('Test Pad')
  })

  it('reads the menu button even while game input is suspended', () => {
    const input = new Input()
    current = [pad([0])]
    input.frame()
    input.setSuspended(true)
    // Held buttons are let go of, and presses other than the menu are ignored.
    current = [pad([0, 1])]
    expect(input.frame().jump).toBe(false)
    current = [pad([9])]
    expect(input.consume('menu')).toBe(true)
    expect(input.consume('menu')).toBe(false)
    input.setSuspended(false)
    current = []
    input.frame()
    current = [pad([0])]
    expect(input.frame().jumpPressed).toBe(true)
  })

  it('keeps a menu press for the display frame to read', () => {
    const input = new Input()
    current = [pad([9])]
    input.frame()
    expect(input.consume('menu')).toBe(true)
  })

  it('ignores a resting stick', () => {
    const input = new Input()
    current = [pad([], [0.2, -0.3])]
    const f = input.frame()
    expect(f.left || f.right || f.up || f.down).toBe(false)
  })

  it('latches a touch tap shorter than a tick', () => {
    const input = new Input()
    current = []
    input.setTouch('jump', true)
    input.setTouch('jump', false)
    const f = input.frame()
    expect(f.jumpPressed).toBe(true)
    expect(f.jump).toBe(false)
  })
})
