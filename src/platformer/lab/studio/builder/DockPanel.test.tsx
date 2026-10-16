import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampDockWidth, CODE_PANEL_WIDTH_KEY, DockPanel } from './DockPanel'

afterEach(() => { cleanup(); localStorage.removeItem(CODE_PANEL_WIDTH_KEY) })

describe('the shared brick panel', () => {
  it('keeps room for readable code and a visible level', () => {
    expect(clampDockWidth(200, 1366)).toBe(480)
    expect(clampDockWidth(1200, 1366)).toBeCloseTo(915.22)
    expect(clampDockWidth(1366 * 0.58, 1366)).toBeCloseTo(792.28)
  })
  it('supports keyboard code resizing and remembers the chosen width', () => {
    const change = vi.fn()
    render(<DockPanel width={600} onWidth={change}><p>Code</p></DockPanel>)
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize brick panel' }), { key: 'ArrowLeft' })
    expect(change).toHaveBeenCalledWith(620)
    expect(localStorage.getItem(CODE_PANEL_WIDTH_KEY)).toBe('620')
  })
  it('keeps the slider card compact without a resizing control', () => {
    render(<DockPanel width={300} onWidth={vi.fn()} resizable={false}><p>Sliders</p></DockPanel>)
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.getByText('Sliders')).toBeTruthy()
  })
})
