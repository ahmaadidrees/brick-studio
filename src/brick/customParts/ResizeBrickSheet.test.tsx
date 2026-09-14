import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RESIZE_GENERIC_REJECTION, RESIZE_NO_CHANGE, ResizeBrickSheet } from './ResizeBrickSheet'

afterEach(cleanup)

describe('ResizeBrickSheet', () => {
  it('applies one snapped delta to the full selection', () => {
    const onApply = vi.fn(() => true)
    const onClose = vi.fn()
    render(<ResizeBrickSheet open selectionCount={3} onApply={onApply} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Resize 3 bricks' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Increase width' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase height' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase height' }))
    expect(screen.getByText('Change: width +1 stud, height +2 plates.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply resize' }))

    expect(onApply).toHaveBeenCalledWith({ width: 1, depth: 0, height: 2 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the sheet open and explains a rejected atomic resize', () => {
    render(<ResizeBrickSheet open selectionCount={1} onApply={() => false} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decrease depth' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply resize' }))
    expect(screen.getByRole('alert')).toHaveTextContent(RESIZE_GENERIC_REJECTION)
    expect(screen.getByRole('dialog', { name: 'Resize brick' })).toBeInTheDocument()
  })

  it('shows the host’s real rejection message inline and clears it on the next adjustment', () => {
    const onClose = vi.fn()
    const onApply = vi.fn(() => ({ ok: false as const, message: 'This space is occupied. Try a smaller size.' }))
    render(<ResizeBrickSheet open selectionCount={2} onApply={onApply} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase width' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply resize' }))
    expect(screen.getByRole('alert')).toHaveTextContent('This space is occupied. Try a smaller size.')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Decrease width' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks for at least one change and accepts an { ok: true } result', () => {
    const onClose = vi.fn()
    const onApply = vi.fn(() => ({ ok: true as const }))
    render(<ResizeBrickSheet open selectionCount={1} onApply={onApply} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply resize' }))
    expect(screen.getByRole('alert')).toHaveTextContent(RESIZE_NO_CHANGE)
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Increase depth' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply resize' }))
    expect(onApply).toHaveBeenCalledWith({ width: 0, depth: 1, height: 0 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape, the close button and the backdrop, and resets on reopen', () => {
    const onClose = vi.fn()
    const view = render(<ResizeBrickSheet open selectionCount={1} onApply={() => true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase width' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close resize' }))
    fireEvent.pointerDown(document.querySelector('.ui-sheet-backdrop')!)
    expect(onClose).toHaveBeenCalledTimes(3)
    view.rerender(<ResizeBrickSheet open={false} selectionCount={1} onApply={() => true} onClose={onClose} />)
    view.rerender(<ResizeBrickSheet open selectionCount={1} onApply={() => true} onClose={onClose} />)
    expect(screen.getByText('No change yet. Use − and + to adjust each dimension.')).toBeInTheDocument()
  })
})
