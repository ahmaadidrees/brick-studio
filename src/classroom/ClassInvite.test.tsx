import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ClassInvite } from './ClassInvite'
vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,AA==') }))
afterEach(cleanup)
it('uses the same current code in the teacher display, link and local QR', async () => {
  render(<ClassInvite classroom={{ id: 'class', name: 'STEM', code: 'NEWCODE', loginCode: 'OLDCODE', enrollmentOpen: true, collaborationOpen: true }} />)
  expect(screen.getByText('NEWCODE')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Invite students' }))
  expect(new URL((screen.getByLabelText('Class link') as HTMLInputElement).value).searchParams.get('classCode')).toBe('NEWCODE')
  await waitFor(() => expect(screen.getByAltText('Scan to open this class on another device')).toHaveAttribute('src', 'data:image/png;base64,AA=='))
})
it('explains closed enrollment while preserving the returning login link', () => {
  render(<ClassInvite classroom={{ id: 'class', name: 'STEM', loginCode: 'OLDCODE', enrollmentOpen: false, collaborationOpen: false }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Invite students' }))
  expect(screen.getByText('New accounts are closed. Existing students can still sign in.')).toBeInTheDocument()
  expect((screen.getByLabelText('Class link') as HTMLInputElement).value).toContain('classCode=OLDCODE')
})
it('shows the class code on a projector view that Escape closes', async () => {
  render(<ClassInvite classroom={{ id: 'class', name: 'STEM', code: 'NEWCODE', loginCode: 'OLDCODE', enrollmentOpen: true, collaborationOpen: true }} />)
  const opener = screen.getByRole('button', { name: 'Show on projector' })
  opener.focus()
  fireEvent.click(opener)
  const dialog = screen.getByRole('dialog', { name: 'STEM' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(within(dialog).getByText('NEWCODE')).toHaveClass('classroom-projector-code')
  expect(within(dialog).getByText(/enter the code, then sign in or create your account/)).toHaveTextContent(`${window.location.host}/join`)
  await waitFor(() => expect(within(dialog).getByAltText('Scan to open this class')).toHaveAttribute('src', 'data:image/png;base64,AA=='))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})
it('closes the projector view from its Close button', () => {
  render(<ClassInvite classroom={{ id: 'class', name: 'STEM', code: 'NEWCODE', loginCode: 'OLDCODE', enrollmentOpen: true, collaborationOpen: true }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show on projector' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close projector view' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
