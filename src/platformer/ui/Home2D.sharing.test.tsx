import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Home2D } from './Home2D'
const state = vi.hoisted(() => ({ create: vi.fn(), guest: vi.fn(), status: 'student' }))
vi.mock('../../shell', () => ({ AppHeader: () => null, DimensionSwitch: () => null, useClassroomSession: () => ({ status: state.status, user: { id: 'owner' } }) }))
vi.mock('../../classroom/client', () => ({ browserClassroomClient: { listWorlds: async () => [] } }))
vi.mock('./cloudLevel', () => ({ createCloudLevel: state.create }))
vi.mock('./rooms', () => ({ playWithFriends: state.guest, parseRoomRef: () => null }))
vi.mock('./thumbs', () => ({ levelThumb: () => '' }))
beforeEach(() => { state.create.mockReset(); state.guest.mockReset(); state.status = 'student'; localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('saves a signed-in starter to the account before opening invitations', async () => {
  const assign = vi.fn()
  state.create.mockResolvedValue({ id: 'saved-world' })
  await act(async () => { render(<Home2D />) })
  vi.stubGlobal('window', { ...window, location: { ...window.location, assign } })
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'With friends' })[0]); await Promise.resolve() })
  expect(state.create).toHaveBeenCalledOnce()
  expect(state.guest).not.toHaveBeenCalled()
  expect(assign).toHaveBeenCalledWith('/2d/build?world=saved-world&share=1')
})
it('keeps a failed account save on the page instead of falling back to a guest room', async () => {
  state.create.mockRejectedValue(new Error('Account save unavailable'))
  await act(async () => { render(<Home2D />) })
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'With friends' })[0]); await Promise.resolve() })
  expect(screen.getByText('Account save unavailable')).toBeInTheDocument()
  expect(state.guest).not.toHaveBeenCalled()
  expect(screen.getAllByRole('button', { name: 'With friends' })[0]).toBeEnabled()
})
