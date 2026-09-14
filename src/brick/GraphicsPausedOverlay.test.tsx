import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GraphicsPausedOverlay } from './GraphicsPausedOverlay'
import { useBrickStore } from './store'

const initialState = useBrickStore.getInitialState()

beforeEach(() => {
  useBrickStore.setState({ ...initialState }, true)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('GraphicsPausedOverlay', () => {
  it('offers a download right away and a reload only after the browser had time to restore', () => {
    vi.useFakeTimers()
    const download = vi.fn(() => ({ ok: true as const }))
    const reload = vi.fn()
    render(<GraphicsPausedOverlay download={download} reload={reload} reloadDelayMs={1000} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Graphics paused')
    expect(screen.queryByRole('button', { name: 'Reload the studio' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Download my build' }))
    expect(download).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledWith(useBrickStore.getState().getDocumentSnapshot())
    expect(screen.getByRole('status')).toHaveTextContent('Downloaded a copy')
    expect(reload).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reload the studio' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reports a failed download instead of pretending it worked', () => {
    const download = vi.fn(() => ({ ok: false as const, error: { code: 'download' as const, message: 'No downloads here.' } }))
    render(<GraphicsPausedOverlay download={download} reload={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download my build' }))
    expect(screen.getByRole('status')).toHaveTextContent('No downloads here.')
  })
})
