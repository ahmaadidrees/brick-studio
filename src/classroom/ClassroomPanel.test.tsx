import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassroomPanel } from './ClassroomPanel'
import { ClassroomClient } from './client'
import { createBrickStudioDocument } from '../brick/brickDocument'
import type { ClassroomAuthResult } from './contracts'
const auth: ClassroomAuthResult = { user: { id: 's1', username: 'Builder', rosterName: 'Alex', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 } }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const props = () => ({ intent: 'save' as const, getDocument: vi.fn(() => createBrickStudioDocument([])), onOpenWorld: vi.fn(), onJoinWorld: vi.fn(), onClose: vi.fn() })
beforeEach(() => sessionStorage.clear()); afterEach(cleanup)
describe('classroom entry flow', () => {
  it('leaves guest building available without reading or changing their draft', () => {
    const callbacks = props(); const fetcher = vi.fn(); render(<ClassroomPanel {...callbacks} client={new ClassroomClient('', fetcher)} />)
    fireEvent.click(screen.getByText('Keep building as a guest'))
    expect(callbacks.onClose).toHaveBeenCalledOnce(); expect(callbacks.getDocument).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
  })
  it('restricts a reset-required account to password replacement', () => {
    const fetcher = vi.fn(); const client = new ClassroomClient('', fetcher); client.setSession({ ...auth, user: { ...auth.user, resetRequired: true } })
    render(<ClassroomPanel {...props()} client={client} />)
    expect(screen.getByLabelText('New password')).toBeInTheDocument(); expect(screen.queryByText('My Worlds')).not.toBeInTheDocument(); expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not announce a confirmed save when persistence fails', async () => {
    const fetcher = vi.fn((url: string, options: RequestInit) => Promise.resolve(options.method === 'POST' ? json({ error: 'Storage is unavailable.' }, 503) : json(url.endsWith('/worlds') ? { worlds: [] } : { classes: [] })))
    const client = new ClassroomClient('', fetcher as typeof fetch); client.setSession(auth)
    render(<ClassroomPanel {...props()} client={client} />)
    fireEvent.click(await screen.findByText('Save world'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Storage is unavailable'))
    expect(screen.queryByText('Saved to your account.')).not.toBeInTheDocument()
  })
})

it('lets teachers oversee a shared world while student collaboration is closed', async () => {
  const classroom = { id: 'class1', name: 'Class One', loginCode: 'CLASS1', code: 'JOIN1', enrollmentOpen: true, collaborationOpen: false }
  const world = { id: 'world1', title: 'Group build', ownerId: 'teacher1', classId: 'class1', kind: 'class', revision: 1, updatedAt: new Date().toISOString() }
  const fetcher = vi.fn((url: string) => Promise.resolve(json(url.endsWith('/worlds') ? { worlds: [world] } : url.endsWith('/students') ? { students: [] } : { classes: [classroom] })))
  const client = new ClassroomClient('', fetcher as typeof fetch)
  client.setSession({ ...auth, user: { ...auth.user, id: 'teacher1', role: 'teacher' } })
  const callbacks = props()
  render(<ClassroomPanel {...callbacks} intent="class" client={client} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Shared worlds' }))
  await screen.findByText('Collaboration is closed to students. You can still open worlds to review and manage them.')
  fireEvent.click(screen.getByText('Join world'))
  await waitFor(() => expect(callbacks.onJoinWorld).toHaveBeenCalledWith(world))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('selects a newly created class and shows its enrollment code', async () => {
  const oldClass = { id: 'old', name: 'Existing class', loginCode: 'OLD', code: 'OLDJOIN', enrollmentOpen: true, collaborationOpen: true }
  const newClass = { ...oldClass, id: 'new', name: 'New class', loginCode: 'NEW', code: 'NEWJOIN' }
  let created = false
  const fetcher = vi.fn((url: string, options: RequestInit) => {
    if (url.endsWith('/classes') && options.method === 'POST') { created = true; return Promise.resolve(json({ class: newClass })) }
    return Promise.resolve(json(url.endsWith('/worlds') ? { worlds: [] } : url.endsWith('/students') ? { students: [] } : { classes: created ? [oldClass, newClass] : [oldClass] }))
  })
  const client = new ClassroomClient('', fetcher as typeof fetch)
  client.setSession({ ...auth, user: { ...auth.user, role: 'teacher' } })
  render(<ClassroomPanel {...props()} intent="class" client={client} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Class settings' }))
  const name = await screen.findByLabelText('New class name')
  fireEvent.change(name, { target: { value: 'New class' } })
  fireEvent.click(screen.getByText('Create class'))
  await screen.findByText('NEWJOIN')
  expect(screen.getByLabelText('Class')).toHaveValue('new')
  expect(screen.getByLabelText('New class name')).toHaveValue('')
})

it('shows a signup password without submitting or changing the submitted credentials', async () => {
  const client = new ClassroomClient('', vi.fn())
  const authenticate = vi.spyOn(client, 'authenticate').mockResolvedValue(auth)
  render(<ClassroomPanel {...props()} client={client} />)
  fireEvent.change(screen.getByLabelText('Enrollment code'), { target: { value: 'JOIN123' } })
  fireEvent.change(screen.getByLabelText('Choose a username'), { target: { value: 'Builder_2' } })
  fireEvent.change(screen.getByLabelText('Name your teacher knows'), { target: { value: 'Alex' } })
  const password = screen.getByLabelText('Choose a password')
  fireEvent.change(password, { target: { value: 'remember-this' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show choose a password' }))
  expect(password).toHaveAttribute('type', 'text')
  expect(password).toHaveValue('remember-this')
  expect(authenticate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Hide choose a password' }))
  expect(password).toHaveAttribute('type', 'password')
  fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }))
  await waitFor(() => expect(authenticate).toHaveBeenCalledWith('register', { classCode: 'JOIN123', username: 'Builder_2', rosterName: 'Alex', password: 'remember-this' }))
})

it('keeps returning student and teacher forms separate without carrying a visible password across', async () => {
  const client = new ClassroomClient('', vi.fn())
  const authenticate = vi.spyOn(client, 'authenticate').mockResolvedValue(auth)
  render(<ClassroomPanel {...props()} client={client} />)
  fireEvent.click(screen.getByRole('button', { name: 'Student sign in' }))
  fireEvent.change(screen.getByLabelText('Sign-in code'), { target: { value: 'CLASS123' } })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Builder' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(authenticate).toHaveBeenCalledWith('login', { classCode: 'CLASS123', username: 'Builder', password: 'test-password' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Teacher sign in' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Teacher sign in' }))
  expect(screen.getByLabelText('Password')).toHaveValue('')
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  expect(screen.queryByLabelText('Sign-in code')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
})

it('keeps password reset verification when new passwords are revealed', async () => {
  const fetcher = vi.fn()
  const client = new ClassroomClient('', fetcher)
  client.setSession({ ...auth, user: { ...auth.user, resetRequired: true } })
  const changePassword = vi.spyOn(client, 'changePassword').mockResolvedValue(auth)
  render(<ClassroomPanel {...props()} client={client} />)
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } })
  fireEvent.change(screen.getByLabelText('Repeat new password'), { target: { value: 'different-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show new password' }))
  expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text')
  expect(screen.getByLabelText('Repeat new password')).toHaveAttribute('type', 'password')
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The passwords do not match.')
  expect(changePassword).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Repeat new password'), { target: { value: 'new-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }))
  await waitFor(() => expect(changePassword).toHaveBeenCalledWith('new-password'))
  expect(fetcher).not.toHaveBeenCalled()
})

it('keeps the account signed in when its pending save cannot flush', async () => {
  const fetcher = vi.fn((url: string) => Promise.resolve(json(url.endsWith('/worlds') ? { worlds: [] } : { classes: [] })))
  const client = new ClassroomClient('', fetcher as typeof fetch)
  client.setSession(auth)
  const signOut = vi.spyOn(client, 'signOut').mockResolvedValue(undefined)
  const beforeWorldMutation = vi.fn().mockResolvedValue(false)
  render(<ClassroomPanel {...props()} client={client} beforeWorldMutation={beforeWorldMutation} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign out / switch account' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your world still has unsaved changes.')
  expect(beforeWorldMutation).toHaveBeenCalledOnce()
  expect(signOut).not.toHaveBeenCalled()
  expect(client.getSession()?.user.id).toBe(auth.user.id)
  beforeWorldMutation.mockResolvedValue(true)
  fireEvent.click(screen.getByRole('button', { name: 'Sign out / switch account' }))
  await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
})

it('keeps teacher controls available in focused sections and submits student edits to the selected class', async () => {
  const classroom = { id: 'class1', name: 'Class One', loginCode: 'CLASS1', code: 'JOIN1', enrollmentOpen: true, collaborationOpen: true }
  const student = { id: 's1', username: 'Builder', rosterName: 'Alex', suspended: false, resetRequired: false }
  const fetcher = vi.fn((url: string) => Promise.resolve(json(url.endsWith('/worlds') ? { worlds: [] } : url.endsWith('/students') ? { students: [student] } : { classes: [classroom] })))
  const client = new ClassroomClient('', fetcher as typeof fetch)
  client.setSession({ ...auth, user: { ...auth.user, id: 'teacher1', role: 'teacher' } })
  render(<ClassroomPanel {...props()} intent="class" client={client} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Manage Alex' }))
  expect(screen.queryByLabelText('New class name')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'NewBuilder' } })
  fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'temporary-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show temporary password' }))
  expect(screen.getByLabelText('Temporary password')).toHaveAttribute('type', 'text')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Student account updated.')
  const patch = fetcher.mock.calls.find(call => call[0].endsWith('/classes/class1/students/s1'))
  expect(patch).toBeDefined()
  const [, request] = patch! as unknown as [string, RequestInit]
  expect(request.method).toBe('PATCH')
  expect(JSON.parse(request.body as string)).toEqual({ username: 'NewBuilder', rosterName: 'Alex', temporaryPassword: 'temporary-password' })
  fireEvent.click(screen.getByRole('button', { name: 'Class settings' }))
  expect(screen.getByRole('button', { name: 'Close enrollment' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New enrollment code' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close collaboration' })).toBeInTheDocument()
  expect(screen.getByLabelText('New class name')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Manage Alex' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Shared worlds' }))
  expect(screen.getByLabelText('Shared world name')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Close enrollment' })).not.toBeInTheDocument()
})

it('keeps group member management and checkpoint recovery in world controls', async () => {
  const classroom = { id: 'class1', name: 'Class One', loginCode: 'CLASS1', code: 'JOIN1', enrollmentOpen: true, collaborationOpen: true }
  const world = { id: 'world1', title: 'Group build', ownerId: 'teacher1', classId: 'class1', kind: 'group', revision: 8, updatedAt: new Date().toISOString() }
  const student = { id: 's1', username: 'Builder', rosterName: 'Alex', suspended: false, resetRequired: false }
  let members = [student]
  const fetcher = vi.fn((url: string, options: RequestInit) => {
    if (options.method === 'DELETE') { members = []; return Promise.resolve(json({ members })) }
    if (url.endsWith('/members')) return Promise.resolve(json({ members }))
    if (url.endsWith('/checkpoints')) return Promise.resolve(json({ checkpoints: [{ id: 'cp1', revision: 2, createdAt: world.updatedAt, reason: 'saved' }] }))
    return Promise.resolve(json(url.endsWith('/worlds') ? { worlds: [world] } : url.endsWith('/students') ? { students: [student] } : { classes: [classroom] }))
  })
  const client = new ClassroomClient('', fetcher as typeof fetch)
  client.setSession({ ...auth, user: { ...auth.user, id: 'teacher1', role: 'teacher' } })
  render(<ClassroomPanel {...props()} intent="class" client={client} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Shared worlds' }))
  expect(screen.queryByText(/Revision 8/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'World controls' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Remove from group' }))
  await waitFor(() => expect(screen.getByLabelText('Add student')).toHaveValue('s1'))
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/worlds/world1/members/s1'), expect.objectContaining({ method: 'DELETE' }))
  expect(screen.getByLabelText('Checkpoint')).toHaveValue('cp1')
  expect(screen.getByRole('option', { name: /Revision 2/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Back to worlds/ }))
  expect(screen.getByRole('button', { name: 'Join world' })).toBeInTheDocument()
})
