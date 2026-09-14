import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LookColors } from './LookColors'
afterEach(cleanup)
it('keeps locked colors when choosing a coordinated look', () => {
  const onChange = vi.fn()
  render(<LookColors palette={{ primary: '#123456' }} onChange={onChange} />)
  fireEvent.click(screen.getByLabelText('Keep main'))
  fireEvent.click(screen.getByRole('button', { name: 'Moon mission' }))
  expect(onChange).toHaveBeenCalledWith({ primary: '#123456', secondary: '#3c456e', accent: '#f2a54a' })
  fireEvent.click(screen.getByLabelText('Keep secondary'))
  fireEvent.click(screen.getByLabelText('Keep accent'))
  expect(screen.getByRole('button', { name: 'Shuffle colors' })).toBeDisabled()
})
