import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PlatformerApp from './PlatformerApp'

const state = vi.hoisted(() => ({ info: vi.fn(), session: { status: 'student', user: { id: 'owner' }, displayName: 'Owner' } }))
vi.mock('../shell', () => ({ useClassroomSession: () => state.session, AppHeader: () => null, currentPath: () => window.location.pathname, goToJoin: vi.fn() }))
vi.mock('../classroom/client', () => ({ browserClassroomClient: { getSession: () => state.session.status === 'student' ? {} : null } }))
vi.mock('./ui/cloudLevel', () => ({ cloudWorldInfo: state.info, loadCloudLevel: vi.fn(), NotALevelError: class extends Error {} }))
vi.mock('./ui/Home2D', () => ({ Home2D: () => null }))
vi.mock('./ui/GameScreen', () => ({ GameScreen: ({ source }: { source: { world?: { members?: { id: string }[]; ownerId: string } } }) => <div>Room owner: {source.world?.ownerId}; invited: {source.world?.members?.map(m => m.id).join(',')}</div> }))
beforeEach(() => {
  window.history.replaceState(null, '', '/2d/w/12345678123442348234123456789abc')
  state.session.status = 'student'
  state.info.mockReset()
})
afterEach(cleanup)

it('passes the fetched owner and invite list into the live room', async () => {
  state.info.mockResolvedValue({ format: '2d', title: 'Test world', ownerId: 'owner', members: [{ id: 'student-a' }] })
  render(<PlatformerApp />)
  expect(await screen.findByText('Room owner: owner; invited: student-a')).toBeInTheDocument()
  expect(state.info).toHaveBeenCalledWith('12345678-1234-4234-8234-123456789abc')
})
it('explains an inaccessible invitation and offers My worlds', async () => {
  state.info.mockRejectedValue(Object.assign(new Error('World not found.'), { status: 404 }))
  render(<PlatformerApp />)
  expect(await screen.findByText(/Ask its owner to invite you/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'My worlds' })).toHaveAttribute('href', '/worlds')
})
it('loads the intended room after signing in', async () => {
  state.session.status = 'guest'
  state.info.mockResolvedValue({ format: '2d', title: 'Test world', ownerId: 'owner', members: [] })
  const view = render(<PlatformerApp />)
  expect(screen.getByRole('heading', { name: 'Sign in to open this world' })).toBeInTheDocument()
  expect(state.info).not.toHaveBeenCalled()
  state.session.status = 'student'
  view.rerender(<PlatformerApp />)
  expect(await screen.findByText(/Room owner: owner/)).toBeInTheDocument()
})
