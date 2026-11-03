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

describe('the camera choice names the kit’s things', () => {
  it('a race says Whole track and Follow the Car; the Platformer keeps Whole level and Follow the Hero', () => {
    const choose = vi.fn()
    const props = { mode: 'play' as const, onTogglePlay: vi.fn(), onRestart: vi.fn(), onZoomIn: vi.fn(), onZoomOut: vi.fn(), onResetView: vi.fn(), onPlayCameraChoice: choose, playCamera: 'follow' as const }
    const { rerender } = render(<StageControls {...props} followLabel="Follow the Car" wholeLabel="Whole track" />)
    fireEvent.click(screen.getByRole('button', { name: 'Whole track' }))
    expect(choose).toHaveBeenCalledWith('whole')
    expect(screen.getByRole('button', { name: 'Follow the Car' }).getAttribute('aria-pressed')).toBe('true')
    rerender(<StageControls {...props} />)
    expect(screen.getByRole('button', { name: 'Camera shows the whole level' }).textContent).toBe('Whole level')
    expect(screen.getByRole('button', { name: 'Follow the Hero' })).toBeTruthy()
  })
})
