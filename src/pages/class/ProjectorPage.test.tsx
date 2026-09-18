import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ClassroomAuthResult } from '../../classroom/contracts'
import ProjectorPage from './ProjectorPage'
import type { ClassPageClient } from './classPageData'

vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,AA==') }))
afterEach(cleanup)

const CLASSES = [
  { id: 'class-1', name: 'Room 12 Builders', code: 'BRICK7', loginCode: 'OLD123', enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true },
  { id: 'class-2', name: 'After-school Club', code: 'CLUB42', loginCode: 'CLUB42', enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true },
]

function testClient({ role = 'teacher' as 'teacher' | 'student', hasSession = true } = {}) {
  const snapshot: ClassroomAuthResult | null = hasSession ? {
    user: { id: 'teacher-1', username: 'mrsdiaz', rosterName: 'Ana Diaz', role, resetRequired: false },
    classes: [],
    session: { accessToken: 'a', refreshToken: 'r', expiresIn: 60 },
  } : null
  const client: ClassPageClient = {
    getSession: () => snapshot,
    subscribe: () => () => {},
    request: (async () => ({ classes: CLASSES })) as unknown as ClassPageClient['request'],
  }
  return client
}

it('fills the board with the class name, the code and a scannable join link', async () => {
  render(<ProjectorPage client={testClient()} navigate={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: 'Room 12 Builders', level: 1 })).toBeInTheDocument()
  expect(screen.getByText('BRICK7')).toHaveClass('class-projector-code-big')
  expect(screen.getByText(/enter the code, then tap your name/)).toHaveTextContent(`${window.location.host}/join`)
  await waitFor(() => expect(screen.getByAltText('Scan to join Room 12 Builders')).toHaveAttribute('src', 'data:image/png;base64,AA=='))
  expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute('href', '/class')
})

it('shows the class named in the query so a second class can be projected', async () => {
  window.history.replaceState({}, '', '/class/projector?classId=class-2')
  render(<ProjectorPage client={testClient()} navigate={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: 'After-school Club', level: 1 })).toBeInTheDocument()
  expect(screen.getByText('CLUB42')).toBeInTheDocument()
  window.history.replaceState({}, '', '/')
})

it('keeps non-teachers out', async () => {
  const navigate = vi.fn()
  render(<ProjectorPage client={testClient({ hasSession: false })} navigate={navigate} />)
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/join?mode=teacher&next=/class/projector'))
  cleanup()
  const studentNavigate = vi.fn()
  render(<ProjectorPage client={testClient({ role: 'student' })} navigate={studentNavigate} />)
  await waitFor(() => expect(studentNavigate).toHaveBeenCalledWith('/worlds'))
})
