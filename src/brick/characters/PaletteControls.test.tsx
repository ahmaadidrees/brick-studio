import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PaletteControls } from './PaletteControls'

afterEach(cleanup)

const groups = [
  { key: 'primary', label: 'Helmet', swatches: [{ value: '#e7473c', label: 'Brick red' }, { value: '#3e83d7', label: 'Sky blue' }] },
  { key: 'secondary', label: 'Panels', swatches: [{ value: '#e7473c', label: 'Brick red' }] },
]

it('renders one labelled group per real slot, marks the chosen swatch, and emits a fresh palette', () => {
  const onChange = vi.fn()
  const palette = { primary: '#e7473c' }
  render(<PaletteControls groups={groups} palette={palette} locked={new Set()} onToggleLock={vi.fn()} onChange={onChange} />)
  expect(screen.getByRole('group', { name: 'Helmet' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Panels' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Set Helmet to Brick red' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Set Helmet to Sky blue' }))
  expect(onChange).toHaveBeenCalledWith({ primary: '#3e83d7' })
  expect(palette).toEqual({ primary: '#e7473c' })
  fireEvent.click(screen.getByRole('button', { name: 'Reset colors' }))
  expect(onChange).toHaveBeenLastCalledWith({})
})

it('disables reset with no choices and reports lock toggles per slot', () => {
  const onToggleLock = vi.fn()
  render(<PaletteControls groups={groups} palette={{}} locked={new Set(['secondary'])} onToggleLock={onToggleLock} onChange={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Reset colors' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Keep Panels when mixing' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Keep Helmet when mixing' }))
  expect(onToggleLock).toHaveBeenCalledWith('primary')
})
