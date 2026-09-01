import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResizeBrickSheet } from './ResizeBrickSheet'

afterEach(cleanup)

describe('ResizeBrickSheet', () => {
  it('applies one snapped delta to the full selection', () => {
    const onApply = vi.fn(() => true)
    const onClose = vi.fn()
    render(<ResizeBrickSheet open selectionCount={3} onApply={onApply} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase width' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase height' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase height' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply resize' }))

    expect(onApply).toHaveBeenCalledWith({ width: 1, depth: 0, height: 2 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the sheet open and explains a rejected atomic resize', () => {
    render(<ResizeBrickSheet open selectionCount={1} onApply={() => false} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decrease depth' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply resize' }))
    expect(screen.getByRole('alert')).toHaveTextContent('does not fit')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
