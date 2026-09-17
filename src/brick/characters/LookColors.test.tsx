import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LookColors, LOOK_COLOR_SETS } from './LookColors'

afterEach(cleanup)

it('keeps locked slots when choosing a coordinated set', () => {
  const onChange = vi.fn()
  render(<LookColors palette={{ primary: '#123456' }} locked={new Set(['primary'])} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Moon mission' }))
  expect(onChange).toHaveBeenCalledWith({ primary: '#123456', secondary: '#3c456e', accent: '#f2a54a' })
})

it('shuffles into a whole set and disables itself when every slot is kept', () => {
  const onChange = vi.fn()
  const view = render(<LookColors palette={{}} locked={new Set()} onChange={onChange} random={() => 0} />)
  fireEvent.click(screen.getByRole('button', { name: 'Shuffle colors' }))
  const [primary, secondary, accent] = LOOK_COLOR_SETS[0].colors
  expect(onChange).toHaveBeenCalledWith({ primary, secondary, accent })
  view.rerender(<LookColors palette={{}} locked={new Set(['primary', 'secondary', 'accent'])} onChange={onChange} />)
  expect(screen.getByRole('button', { name: 'Shuffle colors' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Moon mission' })).toBeDisabled()
})
