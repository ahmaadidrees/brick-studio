import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { createBrickStudioDocument } from './brickDocument'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from './documentPersistence'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'
import { browserClassroomClient, ClassroomError, type ClassroomAuth, type ClassroomWorld } from '../classroom/client'

/**
 * A signed-in builder's fresh build becomes an account world on its first brick, through the real
 * useClassroomWorld hook and cloud autosave; only the classroom HTTP calls are stubbed.
 */
vi.mock('../shell/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../shell/navigation')>()), goToJoin: vi.fn() }))
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

/** Stubs POST /worlds and PUT /worlds/:id; every call is recorded for assertions. */
function stubClassroomServer(create: (body: { title: string; document: ClassroomWorld['document'] }) => Promise<ClassroomWorld> | ClassroomWorld) {
  const calls: { path: string; method: string; body: unknown }[] = []
  vi.spyOn(browserClassroomClient, 'request').mockImplementation(async (path: string, method = 'GET', body?: unknown) => {
    // The account chip refreshes `/me` on mount; only world traffic matters here.
    if (path !== '/me') calls.push({ path, method, body })
    if (path === '/worlds' && method === 'POST') return { world: await create(body as { title: string; document: ClassroomWorld['document'] }) } as never
    if (path.startsWith('/worlds/') && method === 'PUT') { const { document, expectedRevision } = body as { document: ClassroomWorld['document']; expectedRevision: number }; return { world: serverWorld(document, expectedRevision + 1) } as never }
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
