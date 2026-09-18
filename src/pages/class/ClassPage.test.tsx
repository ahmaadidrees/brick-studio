import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ClassroomAuthResult } from '../../classroom/contracts'
import ClassPage from './ClassPage'
import type { ClassPageClient } from './classPageData'

vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,AA==') }))
afterEach(cleanup)

const session = (role: 'teacher' | 'student' = 'teacher'): ClassroomAuthResult => ({
  user: { id: 'teacher-1', username: 'mrsdiaz', rosterName: 'Ana Diaz', role, resetRequired: false },
  classes: [],
  session: { accessToken: 'a', refreshToken: 'r', expiresIn: 60 },
})

const CLASS = { id: 'class-1', name: 'Room 12 Builders', code: 'BRICK7', loginCode: 'BRICK7', enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true, buildingNow: 4 }
const STUDENTS = [
  { id: 's1', username: 'aiden_k', rosterName: 'Aiden Kim', suspended: false, resetRequired: false },
  { id: 's2', username: 'bella_r', rosterName: 'Bella Rivera', suspended: false, resetRequired: true },
]
const WORLDS = [
  { id: 'w1', title: 'Rocket Base', ownerId: 's1', classId: null, kind: 'personal' as const, revision: 8, updatedAt: '2026-09-16T15:00:00.000Z', ownerName: 'Aiden K.', visibility: 'class' as const, canEdit: false, sharedAt: '2026-09-16T15:02:00.000Z', hiddenByTeacher: false },
  { id: 'w2', title: 'Treehouse Village', ownerId: 's2', classId: null, kind: 'personal' as const, revision: 4, updatedAt: '2026-09-16T14:20:00.000Z', ownerName: 'Bella R.', visibility: 'class' as const, canEdit: true, sharedAt: '2026-09-16T14:25:00.000Z', hiddenByTeacher: true },
  { id: 'w3', title: 'Bridge Challenge', ownerId: 'teacher-1', classId: 'class-1', kind: 'class' as const, revision: 12, updatedAt: '2026-09-17T09:00:00.000Z' },
]

type Call = [string, string?, unknown?]

/** A client with a recording `request`; `classes` decides first run vs. every day. */
function testClient({ classes = [CLASS], role = 'teacher' as 'teacher' | 'student', hasSession = true } = {}) {
  const calls: Call[] = []
  let current = classes
  const request = vi.fn(async (path: string, method = 'GET', body?: unknown) => {
    calls.push([path, method, body])
    if (path === '/classes' && method === 'GET') return { classes: current }
    if (path === '/worlds' && method === 'GET') return { worlds: current.length ? WORLDS : [] }
    if (path.endsWith('/students')) return { students: current.length ? STUDENTS : [] }
    if (path.endsWith('/members')) return { members: [] }
    if (path.endsWith('/checkpoints')) return { checkpoints: [{ id: 'cp1', revision: 11, createdAt: '2026-09-17T08:40:00.000Z', reason: 'save' }] }
    if (path === '/classes' && method === 'POST') { current = [{ ...CLASS, name: String((body as { name: string }).name) }]; return { class: current[0] } }
    return {}
  })
  const snapshot = hasSession ? session(role) : null
  const client: ClassPageClient = {
    getSession: () => snapshot,
    subscribe: () => () => {},
    signOut: vi.fn(async () => {}),
    request: request as unknown as ClassPageClient['request'],
  }
  return { client, calls, request }
}

const lastBody = (calls: Call[], path: string) => calls.filter(call => call[0] === path && call[1] === 'PATCH').at(-1)?.[2]

it('sends a signed-out visitor to the teacher sign-in and a student to their worlds', async () => {
  const navigate = vi.fn()
  render(<ClassPage client={testClient({ hasSession: false }).client} navigate={navigate} />)
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/join?mode=teacher&next=/class'))
  cleanup()
  const studentNavigate = vi.fn()
  render(<ClassPage client={testClient({ role: 'student' }).client} navigate={studentNavigate} />)
  await waitFor(() => expect(studentNavigate).toHaveBeenCalledWith('/worlds'))
})

it('walks a brand new teacher through naming a class and then shows the code to project', async () => {
  const { client, calls } = testClient({ classes: [] })
  render(<ClassPage client={client} navigate={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: 'Set up your class' })).toBeInTheDocument()
  expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Name your class')
  fireEvent.change(screen.getByLabelText('Class name'), { target: { value: 'Room 12 Builders' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create class' }))
  await waitFor(() => expect(screen.getAllByText('BRICK7').length).toBeGreaterThan(0))
  expect(calls).toContainEqual(['/classes', 'POST', { name: 'Room 12 Builders' }])
  expect(screen.getByRole('link', { name: 'Show on projector' })).toHaveAttribute('href', '/class/projector')
  expect(screen.getByText(/enter the code, then tap their name/)).toHaveTextContent(`${window.location.host}/join`)
  await waitFor(() => expect(screen.getByAltText('Scan to join Room 12 Builders')).toHaveAttribute('src', 'data:image/png;base64,AA=='))
})

it('opens on the everyday page with the class head, chips and the three tabs', async () => {
  render(<ClassPage client={testClient().client} navigate={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: 'Room 12 Builders', level: 1 })).toBeInTheDocument()
  expect(screen.getByText('Enrollment open')).toBeInTheDocument()
  expect(screen.getByText('Collaboration open')).toBeInTheDocument()
  expect(screen.getByText('4 building now')).toBeInTheDocument()
  for (const tab of ['Students', 'Worlds', 'Settings']) expect(screen.getByRole('radio', { name: tab })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Students' })).toBeChecked()
})

it('lists what students shared with the owner, the sharing chip and the roster', async () => {
  render(<ClassPage client={testClient().client} navigate={vi.fn()} />)
  const shared = await screen.findByRole('list', { name: 'Worlds students shared with this class' })
  expect(within(shared).getByText('Rocket Base')).toBeInTheDocument()
  expect(within(shared).getByText('Look only')).toBeInTheDocument()
  expect(within(shared).getByText('Build together')).toBeInTheDocument()
  expect(within(shared).getByText(/Bella R\./)).toHaveTextContent('Hidden from the class')
  expect(screen.getByText('Students can share: On')).toBeInTheDocument()
  expect(await screen.findByText('Aiden Kim')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reset password for Bella Rivera' })).toBeInTheDocument()
})

it('hides a shared world and shows it again through the teacher visibility endpoint', async () => {
  const { client, calls } = testClient()
  render(<ClassPage client={client} navigate={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Hide from class' }))
  await waitFor(() => expect(calls).toContainEqual(['/worlds/w1/visibility', 'PATCH', { hiddenByTeacher: true }]))
  fireEvent.click(screen.getAllByRole('button', { name: 'Show again' })[0])
  await waitFor(() => expect(calls).toContainEqual(['/worlds/w2/visibility', 'PATCH', { hiddenByTeacher: false }]))
})

it('shows the worlds the teacher started and starts another one', async () => {
  const { client, calls } = testClient()
  render(<ClassPage client={client} navigate={vi.fn()} />)
  fireEvent.click(await screen.findByRole('radio', { name: 'Worlds' }))
  const list = await screen.findByRole('list', { name: 'Worlds you started for this class' })
  expect(within(list).getByText('Bridge Challenge')).toBeInTheDocument()
  expect(within(list).getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/live/w3')
  expect(within(list).getByRole('button', { name: 'World controls for Bridge Challenge' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Shared world name'), { target: { value: 'Tower Day' } })
  fireEvent.click(screen.getByRole('button', { name: 'Start a shared world' }))
  await waitFor(() => {
    const post = calls.find(call => call[0] === '/worlds' && call[1] === 'POST')
    expect(post?.[2]).toMatchObject({ title: 'Tower Day', classId: 'class-1', kind: 'class' })
  })
})

it('opens World controls with checkpoints for a world the teacher started', async () => {
  render(<ClassPage client={testClient().client} navigate={vi.fn()} />)
  fireEvent.click(await screen.findByRole('radio', { name: 'Worlds' }))
  fireEvent.click(await screen.findByRole('button', { name: 'World controls for Bridge Challenge' }))
  expect(await screen.findByRole('heading', { name: 'Bridge Challenge' })).toHaveFocus()
  expect(screen.getByText('Restore world')).toBeInTheDocument()
})

it('sends each settings switch as its own PATCH body and confirms the destructive ones', async () => {
  const { client, calls } = testClient()
  render(<ClassPage client={client} navigate={vi.fn()} />)
  fireEvent.click(await screen.findByRole('radio', { name: 'Settings' }))
  fireEvent.click(await screen.findByRole('switch', { name: 'New students can join' }))
  await waitFor(() => expect(lastBody(calls, '/classes/class-1')).toEqual({ enrollmentOpen: false }))
  fireEvent.click(screen.getByRole('switch', { name: 'Students can share their own builds' }))
  await waitFor(() => expect(lastBody(calls, '/classes/class-1')).toEqual({ studentsCanShare: false }))
  fireEvent.click(screen.getByRole('switch', { name: 'Show names on the join screen' }))
  await waitFor(() => expect(lastBody(calls, '/classes/class-1')).toEqual({ showNamesOnJoin: false }))

  fireEvent.click(screen.getByRole('switch', { name: 'Building together' }))
  expect(await screen.findByRole('dialog', { name: 'Close building together?' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close now' }))
  await waitFor(() => expect(lastBody(calls, '/classes/class-1')).toEqual({ collaborationOpen: false }))

  fireEvent.click(screen.getByRole('button', { name: 'New class code' }))
  expect(await screen.findByRole('dialog', { name: 'Get a new class code?' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Get a new code' }))
  await waitFor(() => expect(lastBody(calls, '/classes/class-1')).toEqual({ rotateCode: true }))
})

it('renames the class and creates another one from Settings', async () => {
  const { client, calls } = testClient()
  render(<ClassPage client={client} navigate={vi.fn()} />)
  fireEvent.click(await screen.findByRole('radio', { name: 'Settings' }))
  fireEvent.change(await screen.findByRole('textbox', { name: 'Class name' }), { target: { value: 'Room 12 Engineers' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
  await waitFor(() => expect(lastBody(calls, '/classes/class-1')).toEqual({ name: 'Room 12 Engineers' }))
  fireEvent.change(screen.getByLabelText('New class name'), { target: { value: 'Club' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create class' }))
  await waitFor(() => expect(calls).toContainEqual(['/classes', 'POST', { name: 'Club' }]))
})
