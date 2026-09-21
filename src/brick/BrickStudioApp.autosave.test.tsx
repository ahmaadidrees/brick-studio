import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { createBrickStudioDocument } from './brickDocument'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from './documentPersistence'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'
import { browserClassroomClient, ClassroomError, type ClassroomAuth, type ClassroomWorld } from '../classroom/client'
import type { InviteSheetProps } from '../classroom/InviteSheet'
import { goToLiveWorld, goToNewLiveRoom } from '../shell/navigation'

/**
 * A signed-in builder's fresh build becomes an account world on its first brick, through the real
 * useClassroomWorld hook and cloud autosave; only the classroom HTTP calls are stubbed.
 */
vi.mock('../shell/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../shell/navigation')>()), goToJoin: vi.fn(), goToLiveWorld: vi.fn(), goToNewLiveRoom: vi.fn() }))
// Lane A owns the real sheet; the editor is tested against its props contract.
vi.mock('../classroom/InviteSheet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../classroom/InviteSheet')>()),
  InviteSheet: (props: InviteSheetProps) => (
    <div role="dialog" aria-modal="true" aria-label="Who do you want to build with?">
      <p>{props.className}</p>
      <p>{props.classmates === null ? 'Loading classmates' : props.classmatesError ?? (props.classmates.map(mate => mate.displayName).join(', ') || 'Nobody else yet')}</p>
      <p>{props.world.visibility === 'members' ? `Shared with ${props.world.members?.map(member => member.displayName).join(', ')}` : props.world.visibility}</p>
      <button type="button" disabled={props.busy} onClick={() => props.onInvite({ visibility: 'members', canEdit: true, members: ['u-ben'] })}>Invite Ben K. and build</button>
      <button type="button" disabled={props.busy} onClick={() => props.onInvite({ visibility: 'class', canEdit: false })}>Invite the class to look</button>
      {props.onStopSharing && <button type="button" onClick={props.onStopSharing}>Stop sharing</button>}
      <button type="button" onClick={props.onClose}>Close</button>
    </div>
  ),
}))
vi.mock('./BrickStudioScene', () => ({ default: () => <div /> }))
vi.mock('./PartThumbnail', () => ({ PartThumbnail: () => <span /> }))
vi.mock('../classroom/ClassroomPanel', () => ({ ClassroomPanel: ({ intent }: { intent: string }) => <div role="dialog" aria-label={`Classroom ${intent}`} /> }))

const student: ClassroomAuth = { user: { id: '00000000-0000-4000-8000-000000000002', username: 'ava.r', rosterName: 'Ava R.', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 } }
const brickA: BrickInstance = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }
const brickB: BrickInstance = { id: 'brick-b', partId: 'brick_2x4', x: 14, y: 0, z: 10, rotation: 0, color: '#f00' }
const ACTIVE_KEY = 'brick-studio.active-cloud-world.v1'

function serverWorld(document: ClassroomWorld['document'], revision = 1): ClassroomWorld {
  return { id: 'world-new', title: 'Untitled build', kind: 'personal', ownerId: student.user.id, classId: null, visibility: 'private', canEdit: true, classCanEdit: false, ownerName: 'Ava R.', ownerClassId: null, sharedAt: null, revision, updatedAt: '2026-09-21T09:00:00Z', document }
}

/** Stubs POST /worlds and PUT /worlds/:id (plus the classmates and sharing routes Build together uses); every call is recorded for assertions. */
function stubClassroomServer(create: (body: { title: string; document: ClassroomWorld['document'] }) => Promise<ClassroomWorld> | ClassroomWorld) {
  const calls: { path: string; method: string; body: unknown }[] = []
  vi.spyOn(browserClassroomClient, 'request').mockImplementation(async (path: string, method = 'GET', body?: unknown) => {
    // The account chip refreshes `/me` and lists `/worlds` (invite badge) on mount; only world writes matter here.
    if (path !== '/me' && !(path === '/worlds' && method === 'GET')) calls.push({ path, method, body })
    if (path === '/worlds' && method === 'POST') return { world: await create(body as { title: string; document: ClassroomWorld['document'] }) } as never
    if (path.startsWith('/worlds/') && method === 'PUT') { const { document, expectedRevision } = body as { document: ClassroomWorld['document']; expectedRevision: number }; return { world: serverWorld(document, expectedRevision + 1) } as never }
    if (path === '/classes/c1/classmates') return { classmates: [{ id: 'u-ben', displayName: 'Ben K.' }] } as never
    if (path === '/worlds/world-new/sharing' && method === 'PATCH') {
      const sharing = body as { visibility: ClassroomWorld['visibility']; canEdit: boolean; members?: string[] }
      return { world: { ...serverWorld(createBrickStudioDocument([brickA]), 2), visibility: sharing.visibility, classCanEdit: sharing.canEdit, sharedAt: sharing.visibility === 'private' ? null : '2026-09-21T10:00:00Z', members: sharing.visibility === 'members' ? [{ id: 'u-ben', displayName: 'Ben K.' }] : undefined } } as never
    }
    throw new Error(`Unexpected classroom request ${method} ${path}`)
  })
  return calls
}

const pillText = () => document.querySelector('.app-header [role="status"][data-kind]')?.textContent ?? ''
const placeBrick = (brick: BrickInstance) => act(() => { useBrickStore.setState({ bricks: [...useBrickStore.getState().bricks, brick] }) })

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage']) {
    const values = new Map<string, string>()
    vi.stubGlobal(name, {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    })
  }
  useBrickStore.setState(useBrickStore.getInitialState(), true)
})
afterEach(() => { cleanup(); browserClassroomClient.setSession(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

describe('automatic account world for a signed-in fresh build', () => {
  it('creates "Untitled build" on the first brick, attaches it, and autosaves the next edit to it', async () => {
    browserClassroomClient.setSession(student)
    let release!: () => void
    const calls = stubClassroomServer(async ({ title, document }) => { await new Promise<void>(resolve => { release = resolve }); return { ...serverWorld(document, 1), title } })
    render(<BrickStudioApp />)
    expect(pillText()).toContain('This browser only')

    placeBrick(brickA)
    await waitFor(() => expect(pillText()).toContain('Saving to your account…'))
    // The save sheet entry is withheld while the world is being created, so a second world cannot appear.
    fireEvent.click(screen.getByRole('button', { name: /^Account:/ }))
    expect(within(screen.getByRole('menu', { name: 'Account' })).queryByRole('menuitem', { name: 'Save this build to my account' })).not.toBeInTheDocument()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await act(async () => { release() })
    await waitFor(() => expect(pillText()).toContain('Saved to your account'))
    expect(calls[0]).toMatchObject({ path: '/worlds', method: 'POST', body: { title: 'Untitled build', kind: 'personal' } })
    expect((calls[0].body as { document: { bricks: BrickInstance[] } }).document.bricks.map(brick => brick.id)).toEqual(['brick-a'])
    expect(screen.getByText('Untitled build', { selector: '.app-header-title' })).toBeInTheDocument()
    // The account owns the build now: the tab resumes it, and no separate browser copy is left behind.
    expect(JSON.parse(sessionStorage.getItem(ACTIVE_KEY)!)).toEqual({ userId: student.user.id, worldId: 'world-new' })
    expect(localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toBeNull()

    placeBrick(brickB)
    const putBricks = (call: { body: unknown }) => (call.body as { document: { bricks: BrickInstance[] } }).document.bricks.map(brick => brick.id)
    await waitFor(() => expect(calls.some(call => call.method === 'PUT' && call.path === '/worlds/world-new' && putBricks(call).includes('brick-b'))).toBe(true), { timeout: 3000 })
    const puts = calls.filter(call => call.method === 'PUT')
    expect(putBricks(puts[puts.length - 1])).toEqual(['brick-a', 'brick-b'])
    // Every save carried the revision it was built on, starting from the created world's.
    expect(puts.map(call => (call.body as { expectedRevision: number }).expectedRevision)).toEqual(puts.map((_, index) => index + 1))
    await waitFor(() => expect(pillText()).toContain('Saved to your account'))
    expect(calls.filter(call => call.method === 'POST')).toHaveLength(1)
  })

  it('keeps the browser draft and reports the reason when the account cannot take a new world', async () => {
    browserClassroomClient.setSession(student)
    const calls = stubClassroomServer(() => { throw new ClassroomError('You have reached the saved-world limit. Ask your teacher for help.', 409, 'world_limit') })
    render(<BrickStudioApp />)
    placeBrick(brickA)
    await waitFor(() => expect(pillText()).toContain('Save needs attention'))
    const pill = document.querySelector('.app-header [role="status"][data-kind]')!
    expect(pill).toHaveAttribute('data-kind', 'local')
    expect(pill).toHaveAttribute('data-tone', 'error')
    expect(screen.getByText(/saved-world limit/)).toBeInTheDocument()
    // The draft is still autosaved to this browser, and the manual save path stays available.
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(JSON.parse(localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)!).bricks.map((brick: BrickInstance) => brick.id)).toEqual(['brick-a'])
    expect(sessionStorage.getItem(ACTIVE_KEY)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Account:/ }))
    expect(within(screen.getByRole('menu', { name: 'Account' })).getByRole('menuitem', { name: 'Save this build to my account' })).toBeInTheDocument()
    // A limit is not retried on every brick.
    placeBrick(brickB)
    await act(async () => { await Promise.resolve() })
    expect(calls.filter(call => call.method === 'POST')).toHaveLength(1)
  })

  it('retries after a connection failure on the next edit', async () => {
    browserClassroomClient.setSession(student)
    let online = false
    const calls = stubClassroomServer(({ document }) => { if (!online) throw new ClassroomError('Could not connect.', 0); return serverWorld(document) })
    render(<BrickStudioApp />)
    placeBrick(brickA)
    await waitFor(() => expect(pillText()).toContain('Save needs attention'))
    online = true
    placeBrick(brickB)
    await waitFor(() => expect(pillText()).toContain('Saved to your account'))
    expect(calls.filter(call => call.method === 'POST')).toHaveLength(2)
    expect((calls[1].body as { document: { bricks: BrickInstance[] } }).document.bricks.map(brick => brick.id)).toEqual(['brick-a', 'brick-b'])
  })

  it('leaves guests browser-only with no account required', async () => {
    const calls = stubClassroomServer(({ document }) => serverWorld(document))
    render(<BrickStudioApp />)
    placeBrick(brickA)
    await act(async () => { await Promise.resolve() })
    expect(calls).toHaveLength(0)
    expect(pillText()).toContain('This browser only')
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('does not upload a browser draft that already existed when a signed-in builder opened the editor', async () => {
    localStorage.setItem(BRICK_STUDIO_LOCAL_STORAGE_KEY, JSON.stringify(createBrickStudioDocument([brickA])))
    browserClassroomClient.setSession(student)
    const calls = stubClassroomServer(({ document }) => serverWorld(document))
    render(<BrickStudioApp />)
    expect(useBrickStore.getState().bricks.map(brick => brick.id)).toEqual(['brick-a'])
    placeBrick(brickB)
    await act(async () => { await Promise.resolve() })
    expect(calls).toHaveLength(0)
    expect(pillText()).toContain('This browser only')
    fireEvent.click(screen.getByRole('button', { name: /^Account:/ }))
    expect(within(screen.getByRole('menu', { name: 'Account' })).getByRole('menuitem', { name: 'Save this build to my account' })).toBeInTheDocument()
  })
})

describe('/build?new=1', () => {
  it('clears the current draft after the New build confirm, strips the param, and forgets the resumable world', async () => {
    localStorage.setItem(BRICK_STUDIO_LOCAL_STORAGE_KEY, JSON.stringify(createBrickStudioDocument([brickA])))
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ userId: student.user.id, worldId: 'world-old' }))
    browserClassroomClient.setSession(student)
    const calls = stubClassroomServer(({ document }) => serverWorld(document))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    window.history.replaceState(null, '', '/build?new=1&utm_source=poster')
    render(<BrickStudioApp />)
    expect(window.location.search).toBe('?utm_source=poster')
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toMatch(/Start a new blank build/)
    expect(useBrickStore.getState().bricks).toEqual([])
    expect(sessionStorage.getItem(ACTIVE_KEY)).toBeNull()
    expect(calls.filter(call => call.method === 'GET')).toHaveLength(0)
    // The fresh build is now a signed-in first edit: it becomes an account world.
    placeBrick(brickB)
    await waitFor(() => expect(pillText()).toContain('Saved to your account'))
    expect(calls[0]).toMatchObject({ path: '/worlds', method: 'POST', body: { title: 'Untitled build' } })
  })

  it('keeps the draft when the confirm is declined and asks nothing for a blank draft', () => {
    localStorage.setItem(BRICK_STUDIO_LOCAL_STORAGE_KEY, JSON.stringify(createBrickStudioDocument([brickA])))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    window.history.replaceState(null, '', '/build?new=1')
    const view = render(<BrickStudioApp />)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(useBrickStore.getState().bricks.map(brick => brick.id)).toEqual(['brick-a'])
    expect(window.location.search).toBe('')
    view.unmount()
    localStorage.removeItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)
    useBrickStore.setState(useBrickStore.getInitialState(), true)
    window.history.replaceState(null, '', '/build?new=1')
    render(<BrickStudioApp />)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(useBrickStore.getState().bricks).toEqual([])
  })
})

describe('Build together from the editor', () => {
  const classmate: ClassroomAuth = { ...student, classes: [{ id: 'c1', name: 'Room 12', loginCode: 'ABC', enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true, buildingNow: 0, teacherName: 'Ms. Idrees' }] }
  const toast = () => useBrickStore.getState().toast
  beforeEach(() => { vi.mocked(goToLiveWorld).mockClear(); vi.mocked(goToNewLiveRoom).mockClear() })

  it('opens the invite sheet for a student on an account world and lands them in the live room after inviting', async () => {
    browserClassroomClient.setSession(classmate)
    const calls = stubClassroomServer(({ document }) => serverWorld(document))
    render(<BrickStudioApp />)
    placeBrick(brickA)
    await waitFor(() => expect(pillText()).toContain('Saved to your account'))

    fireEvent.click(screen.getByRole('button', { name: 'Build together' }))
    const sheet = await screen.findByRole('dialog', { name: 'Who do you want to build with?' })
    expect(sheet).toHaveTextContent('Room 12')
    await waitFor(() => expect(sheet).toHaveTextContent('Ben K.'))
    expect(calls).toContainEqual({ path: '/classes/c1/classmates', method: 'GET', body: undefined })
    expect(goToNewLiveRoom).not.toHaveBeenCalled()
    // Shortcuts pause behind the sheet: Delete must not touch the build.
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(useBrickStore.getState().bricks).toHaveLength(1)

    fireEvent.click(within(sheet).getByRole('button', { name: 'Invite Ben K. and build' }))
    await waitFor(() => expect(goToLiveWorld).toHaveBeenCalledWith('world-new', { invited: true }))
    expect(calls).toContainEqual({ path: '/worlds/world-new/sharing', method: 'PATCH', body: { visibility: 'members', canEdit: true, members: ['u-ben'] } })
  })

  it('creates the account world first when a student starts Build together on an unsaved fresh build', async () => {
    browserClassroomClient.setSession(classmate)
    const calls = stubClassroomServer(({ document }) => serverWorld(document))
    render(<BrickStudioApp />)
    expect(pillText()).toContain('This browser only')
    fireEvent.click(screen.getByRole('button', { name: 'Build together' }))
    await screen.findByRole('dialog', { name: 'Who do you want to build with?' })
    expect(calls[0]).toMatchObject({ path: '/worlds', method: 'POST', body: { title: 'Untitled build' } })
    await waitFor(() => expect(pillText()).toContain('Saved to your account'))
    expect(JSON.parse(sessionStorage.getItem(ACTIVE_KEY)!)).toEqual({ userId: student.user.id, worldId: 'world-new' })
    expect(goToNewLiveRoom).not.toHaveBeenCalled()
  })

  it('look-only sharing stays in the editor with a toast, and reopening preloads the sharing', async () => {
    browserClassroomClient.setSession(classmate)
    stubClassroomServer(({ document }) => serverWorld(document))
    render(<BrickStudioApp />)
    placeBrick(brickA)
    await waitFor(() => expect(pillText()).toContain('Saved to your account'))
    fireEvent.click(screen.getByRole('button', { name: 'Build together' }))
    const sheet = await screen.findByRole('dialog', { name: 'Who do you want to build with?' })
    expect(within(sheet).queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Invite the class to look' }))
    await waitFor(() => expect(toast()).toBe('Shared with the class. They can look from their Worlds page.'))
    expect(screen.queryByRole('dialog', { name: 'Who do you want to build with?' })).not.toBeInTheDocument()
    expect(goToLiveWorld).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Build together' }))
    const reopened = await screen.findByRole('dialog', { name: 'Who do you want to build with?' })
    expect(reopened).toHaveTextContent('class')
    fireEvent.click(within(reopened).getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(toast()).toBe('Stopped sharing. Only you can open this world now.'))
  })

  it('guests and teachers keep the seeded guest room', async () => {
    stubClassroomServer(({ document }) => serverWorld(document))
    render(<BrickStudioApp />)
    placeBrick(brickA)
    fireEvent.click(screen.getByRole('button', { name: 'Build together' }))
    await waitFor(() => expect(goToNewLiveRoom).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog', { name: 'Who do you want to build with?' })).not.toBeInTheDocument()
    cleanup()
    vi.mocked(goToNewLiveRoom).mockClear()
    browserClassroomClient.setSession({ ...classmate, user: { ...classmate.user, role: 'teacher' } })
    render(<BrickStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Build together' }))
    await waitFor(() => expect(goToNewLiveRoom).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog', { name: 'Who do you want to build with?' })).not.toBeInTheDocument()
  })
})
