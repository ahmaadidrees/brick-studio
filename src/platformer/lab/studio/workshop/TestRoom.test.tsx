import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Runtime } from '../../core/index'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { RESTART_DEBOUNCE_MS, TestRoom } from './TestRoom'

// Capture the room's runtime so the test can look at what the mouse did to it.
const made: Runtime[] = []
vi.mock('../../core/index', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../core/index')>()
  return { ...real, createRuntime: (...args: Parameters<typeof real.createRuntime>) => { const rt = real.createRuntime(...args); made.push(rt); return rt } }
})

afterEach(() => {
  cleanup()
  made.length = 0
  vi.useRealTimers()
})

describe('Test room', () => {
  it('passes the mouse to the brick, like Play does: mouse down?, mouse x/y, and back up on release or leaving the room', () => {
    vi.useFakeTimers()
    const store = new StudioStore(createStarterProject())
    const coin = store.getState().project.design.bricks.find((b) => b.name === 'Coin')!
    render(<TestRoom store={store} brickId={coin.id} />)
    act(() => vi.advanceTimersByTime(RESTART_DEBOUNCE_MS + 10))
    const rt = made.at(-1)!
    const view = screen.getByLabelText('Test room view')

    fireEvent.pointerMove(view, { clientX: 300, clientY: 20 })
    const moved = { ...rt.world.mouse }
    fireEvent.pointerDown(view, { clientX: 10, clientY: 150 })
    expect(rt.world.mouse.down).toBe(true)
    // Different screen spots land on different level spots (left of the room is further left, lower is lower).
    expect(rt.world.mouse.x).toBeLessThan(moved.x)
    expect(rt.world.mouse.y).toBeLessThan(moved.y)
    fireEvent.pointerUp(view)
    expect(rt.world.mouse.down).toBe(false)
    fireEvent.pointerDown(view, { clientX: 10, clientY: 150 })
    fireEvent.pointerLeave(view)
    expect(rt.world.mouse.down).toBe(false)
  })
})
