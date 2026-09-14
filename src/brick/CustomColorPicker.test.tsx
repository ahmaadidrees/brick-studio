import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomColorPicker, HEX_MESSAGE, hexToHsv, hsvToHex } from './CustomColorPicker'

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
    expect(screen.getByRole('img', { name: 'Color preview #00ff00' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Color brightness' }), { target: { value: '50' } })
    expect(apply).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Hex color' }), { target: { value: '#38A8E8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply color' }))
    expect(apply).toHaveBeenCalledExactlyOnceWith('#38a8e8')
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('does not commit invalid hex, Cancel, Escape or the backdrop', () => {
    const apply = vi.fn(), close = vi.fn()
    render(<CustomColorPicker color="#ffffff" onApply={apply} onClose={close} />)
    const hex = screen.getByRole('textbox', { name: 'Hex color' })
    fireEvent.change(hex, { target: { value: '#nope' } })
    expect(hex).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(HEX_MESSAGE)
    expect(screen.getByRole('button', { name: 'Apply color' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.pointerDown(document.querySelector('.ui-sheet-backdrop')!)
    expect(close).toHaveBeenCalledTimes(3)
    expect(apply).not.toHaveBeenCalled()
  })
  it('is a labelled child dialog that keeps keyboard focus inside, returns it to the opener and exposes native alternatives to the wheel', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Choose any brick color'
    document.body.append(opener)
    opener.focus()
    const view = render(<CustomColorPicker color="#fff000" onApply={vi.fn()} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'Choose any color' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Apply color' })).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Close color picker' })).toHaveFocus()
    expect(screen.getAllByRole('slider')).toHaveLength(3)
    expect(screen.getByRole('img', { name: /Color wheel/ })).toBeInTheDocument()
    view.unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
