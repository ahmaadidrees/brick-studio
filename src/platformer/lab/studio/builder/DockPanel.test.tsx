import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampDockWidth, DockPanel } from './DockPanel'

afterEach(cleanup)

describe('the shared brick panel', () => {
  it('keeps the stage visible with a 380px minimum and 60 percent maximum', () => {
    expect(clampDockWidth(200, 1200)).toBe(380)
    expect(clampDockWidth(900, 1200)).toBe(720)
    expect(clampDockWidth(440, 1200)).toBe(440)
  })
  it('supports keyboard resizing and remembers the chosen width', () => {
    const change = vi.fn()
    render(<DockPanel width={440} onWidth={change}><p>Sliders</p></DockPanel>)
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize brick panel' }), { key: 'ArrowLeft' })
    expect(change).toHaveBeenCalledWith(460)
    expect(localStorage.getItem('brick-code-panel-width')).toBe('460')
    localStorage.removeItem('brick-code-panel-width')
  })
})
