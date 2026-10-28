import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StageControls } from './StageControls'

afterEach(cleanup)

describe('focused code preview controls', () => {
  it('shows only playback and a conditional restart note while preserving playback actions', () => {
    const restart = vi.fn()
    const props = { mode: 'play' as const, codeView: true, onTogglePlay: vi.fn(), onRestart: restart, onZoomIn: vi.fn(), onZoomOut: vi.fn(), onResetView: vi.fn(), onPlayCameraChoice: vi.fn() }
    const { rerender } = render(<StageControls {...props} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByText('Changes apply on Restart')).toBeNull()
    rerender(<StageControls {...props} pendingCodeChanges />)
    expect(screen.getByRole('status').textContent).toBe('Changes apply on Restart')
    fireEvent.click(screen.getByRole('button', { name: 'Restart level' }))
    expect(restart).toHaveBeenCalledOnce()
    rerender(<StageControls {...props} codeView={false} />)
    expect(screen.getByRole('group', { name: 'Camera follows' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy()
  })
})
