import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomColorPicker, hexToHsv, hsvToHex } from './CustomColorPicker'

afterEach(cleanup)

describe('custom color picker', () => {
  it('round trips arbitrary RGB colors including grayscale and near hue boundaries', () => {
    expect(hsvToHex(hexToHsv('#f00'))).toBe('#ff0000')
    expect(hsvToHex(hexToHsv('#abc'))).toBe('#aabbcc')
    for (const color of ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#38a8e8', '#fe01ff', '#123456']) {
      expect(hsvToHex(hexToHsv(color))).toBe(color)
    }
  })
  it('previews slider and hex changes locally then applies exactly once', () => {
    const apply = vi.fn(), close = vi.fn()
    render(<CustomColorPicker color="#ff0000" onApply={apply} onClose={close} />)
    fireEvent.change(screen.getByRole('slider', { name: 'Color hue' }), { target: { value: '120' } })
    expect(screen.getByLabelText('Color preview #00ff00')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Color brightness' }), { target: { value: '50' } })
    expect(apply).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Hex color' }), { target: { value: '#38A8E8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply color' }))
    expect(apply).toHaveBeenCalledExactlyOnceWith('#38a8e8')
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('does not commit invalid hex, Cancel, or Escape', () => {
    const apply = vi.fn(), close = vi.fn()
    render(<CustomColorPicker color="#ffffff" onApply={apply} onClose={close} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Hex color' }), { target: { value: '#nope' } })
    expect(screen.getByRole('button', { name: 'Apply color' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(2)
    expect(apply).not.toHaveBeenCalled()
  })
  it('keeps keyboard focus in the modal and exposes native alternatives to the wheel', () => {
    render(<CustomColorPicker color="#fff000" onApply={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Apply color' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Close color picker' })).toHaveFocus()
    expect(screen.getAllByRole('slider')).toHaveLength(3)
  })
})
