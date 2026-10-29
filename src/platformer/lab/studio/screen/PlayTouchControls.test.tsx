import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Runtime } from '../../core/runtime'
import { PlayTouchControls } from './PlayTouchControls'

describe('touch buttons in Play', () => {
  it('press and release the keys the Hero reads, and let go of everything when Play stops', () => {
    const runtime = { pressKey: vi.fn(), releaseKey: vi.fn() }
    const { getByRole, unmount } = render(<PlayTouchControls runtime={runtime as unknown as Runtime} />)
    fireEvent.pointerDown(getByRole('button', { name: 'Jump' }), { pointerId: 1 })
    expect(runtime.pressKey).toHaveBeenLastCalledWith('space')
    fireEvent.pointerUp(getByRole('button', { name: 'Jump' }), { pointerId: 1 })
    expect(runtime.releaseKey).toHaveBeenLastCalledWith('space')
    fireEvent.pointerDown(getByRole('button', { name: 'Run' }), { pointerId: 2 })
    expect(runtime.pressKey).toHaveBeenLastCalledWith('x')
    runtime.releaseKey.mockClear()
    unmount()
    expect(runtime.releaseKey).toHaveBeenCalledWith('x')
  })
})
