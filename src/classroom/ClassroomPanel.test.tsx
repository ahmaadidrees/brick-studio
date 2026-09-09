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
  const name = await screen.findByLabelText('New class name')
  fireEvent.change(name, { target: { value: 'New class' } })
  fireEvent.click(screen.getByText('Create class'))
  await screen.findByText('NEWJOIN')
  expect(screen.getByLabelText('Class')).toHaveValue('new')
  expect(screen.getByLabelText('New class name')).toHaveValue('')
})
