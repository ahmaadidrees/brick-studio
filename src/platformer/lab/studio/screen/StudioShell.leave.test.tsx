import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { watchAndSave } from '../storage'
import { StudioShell } from './StudioShell'

vi.mock('../gridBricks', async (orig) => ({ ...(await orig<typeof import('../gridBricks')>()), gridBrickTemplate: (await import('../builder/testGridBricks')).fakeGridTemplate }))
vi.mock('../CodeEditor', () => ({ CodeEditor: () => <div aria-label="Docked code editor">Code editor</div> }))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

describe('leaving the Hackable Platformer from the header', () => {
  it('My projects saves the last edit first, then goes', async () => {
    const store = new StudioStore(createStarterProject())
    const watch = watchAndSave(store, { key: 'k', debounceMs: 1200 })
    const navigate = vi.fn()
    render(<StudioShell store={store} navigate={navigate} onLeave={() => watch.flush()} />)
    store.addCopy('brick_coin', 300, 100)
    expect(localStorage.getItem('k')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'My projects' }))
    await act(async () => {})
    expect(localStorage.getItem('k')).toContain('"brick_coin"')
    expect(navigate).toHaveBeenCalledWith('/projects')
    watch()
  })

  it('the logo waits for an account save, but never for more than a few seconds', async () => {
    vi.useFakeTimers()
    const store = new StudioStore(createStarterProject())
    const navigate = vi.fn()
    let finish!: () => void
    const onLeave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    render(<StudioShell store={store} navigate={navigate} onLeave={onLeave} />)
    fireEvent.click(screen.getByRole('link', { name: /Home/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
    finish()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(navigate).toHaveBeenCalledWith('/')

    // A save that never answers: go anyway after the wait (the page's own "Leave site?" covers what is unsaved).
    navigate.mockClear()
    onLeave.mockImplementation(() => new Promise<void>(() => {}))
    fireEvent.click(screen.getByRole('button', { name: 'My projects' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(navigate).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(navigate).toHaveBeenCalledWith('/projects')
  })
})
