import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Runtime } from '../../../core/runtime'
import type { StudioStore } from '../../store'
import { RaceTouch, raceTouchKeys } from './RaceTouch'

/** A runtime that only remembers which keys are held. */
function fakeRuntime() {
  const held = new Set<string>()
  const log: string[] = []
  const runtime = {
    pressKey: (k: string) => { held.add(k); log.push(`+${k}`) },
    releaseKey: (k: string) => { held.delete(k); log.push(`-${k}`) },
  } as unknown as Runtime
  return { runtime, held, log }
}

describe('RaceTouch', () => {
  afterEach(cleanup)

  it('Gas presses the up arrow and Brake the down arrow, and lifting lets go', () => {
    const { runtime, held } = fakeRuntime()
    render(<RaceTouch runtime={runtime} store={{} as StudioStore} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Gas' }), { pointerId: 1 })
    expect([...held]).toEqual(['up arrow'])
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Brake' }), { pointerId: 2 })
    expect(held.has('down arrow')).toBe(true)
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Brake' }), { pointerId: 2 })
    expect([...held]).toEqual(['up arrow'])
    // No item button in Hackable Racing.
    expect(screen.queryByRole('button', { name: /item/i })).toBeNull()
  })

  it('lets go of Gas when it goes away (Play stops, pauses or restarts)', () => {
    const { runtime, held, log } = fakeRuntime()
    const view = render(<RaceTouch runtime={runtime} store={{} as StudioStore} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Gas' }), { pointerId: 1 })
    expect(held.has('up arrow')).toBe(true)
    view.unmount()
    expect(held.size).toBe(0)
    expect(log).toEqual(['+up arrow', '-up arrow'])
  })

  it('the steering pad presses left or right by where the thumb is', () => {
    const { runtime, held } = fakeRuntime()
    render(<RaceTouch runtime={runtime} store={{} as StudioStore} />)
    const pad = screen.getByRole('group', { name: /Steer/ })
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(pad, { pointerId: 3, clientX: 20, clientY: 50 })
    expect([...held]).toEqual(['left arrow'])
    fireEvent.pointerMove(pad, { pointerId: 3, clientX: 180, clientY: 50, buttons: 1 })
    expect([...held]).toEqual(['right arrow'])
    fireEvent.pointerUp(pad, { pointerId: 3 })
    expect(held.size).toBe(0)
  })

  it('the keys adapter ignores buttons the Car has no key for and never presses a key twice', () => {
    const { runtime, log } = fakeRuntime()
    const keys = raceTouchKeys(runtime)
    keys.setTouch('jump', true)
    keys.setTouch('up', true)
    keys.setTouch('up', true)
    keys.releaseAll()
    expect(log).toEqual(['+up arrow', '-up arrow'])
  })
})
