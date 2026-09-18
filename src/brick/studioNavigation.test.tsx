import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { useBrickStore } from './store'
import { createBrickStudioDocument } from './brickDocument'
import type { ClassroomWorld } from '../classroom/contracts'
import type { ClassroomEntryIntent } from '../routes'
import type { CloudSaveStatus } from '../classroom/cloudAutosave'
import { browserClassroomClient, type ClassroomAuth } from '../classroom/client'

const student: ClassroomAuth = { user: { id: '00000000-0000-4000-8000-000000000002', username: 'ava.r', rosterName: 'Ava R.', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 } }

const cloud = vi.hoisted(() => ({
  world: null as ClassroomWorld | null,
  status: 'saved' as CloudSaveStatus,
  error: '',
  recovery: null,
  attach: vi.fn(),
  leave: vi.fn(),
  flush: vi.fn(async () => true),
  retry: vi.fn(),
  downloadRecovery: vi.fn(),
  reload: vi.fn(),
}))

const redirect = vi.hoisted(() => vi.fn<(intent: ClassroomEntryIntent, navigate?: (url: string) => void, search?: string) => boolean>(() => true))
const joinRedirect = vi.hoisted(() => vi.fn())
vi.mock('../shell/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('../shell/navigation')>()), classroomIntentRedirect: redirect, goToJoin: joinRedirect }))
vi.mock('../classroom/useClassroomWorld', () => ({ useClassroomWorld: () => cloud }))
vi.mock('./BrickStudioScene', () => ({ default: () => <div /> }))
vi.mock('./PartThumbnail', () => ({ PartThumbnail: () => <span /> }))
vi.mock('../classroom/ClassroomPanel', () => ({
  ClassroomPanel: ({ intent, invitedClassCode }: { intent: string; invitedClassCode?: string }) => <div role="dialog" aria-label={`Classroom ${intent}`} data-class-code={invitedClassCode ?? ''} />,
}))

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
  cloud.world = null
  cloud.status = 'saved'
  cloud.error = ''
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); browserClassroomClient.setSession(null); redirect.mockClear(); joinRedirect.mockClear(); cloud.attach.mockClear() })

describe('studio navigation and save context', () => {
  it('distinguishes a browser-only draft without claiming an account save', () => {
    render(<BrickStudioApp />)
    // The header uses the shared SaveStatus primitive fed from the real enum; the chip carries its source.
    expect(screen.getByText('This browser only').closest('[role="status"]')).toHaveAttribute('data-kind', 'local')
    expect(screen.queryByText('Saved to your account')).not.toBeInTheDocument()
    // Guests get the neutral title, no Rename, and a Sign in link in the corner.
    expect(screen.getByText('My build', { selector: '.app-header-title' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toMatch(/^\/join\?mode=signin/)
  })

  it('keeps Rename beside a named cloud world while it moves through pending, saving, error and saved states', () => {
    browserClassroomClient.setSession(student)
    cloud.world = { id: 'world-one', title: 'My mountain castle', kind: 'personal', ownerId: 'student-one', classId: null, visibility: 'private', canEdit: true, classCanEdit: false, ownerName: 'Owner', ownerClassId: null, sharedAt: null, revision: 1, updatedAt: '2026-09-10T12:00:00Z' }
    cloud.status = 'pending'
    const view = render(<BrickStudioApp />)
    expect(screen.getByText('My mountain castle', { selector: '.app-header-title' })).toHaveAttribute('title', 'My mountain castle')
    expect(screen.getByRole('button', { name: 'Rename world' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    const states: [CloudSaveStatus, string][] = [
      ['pending', 'Waiting to save…'],
      ['saving', 'Saving to your account…'],
      ['error', 'Save needs attention'],
      ['saved', 'Saved to your account'],
    ]
    for (const [status, label] of states) {
      cloud.status = status
      view.rerender(<BrickStudioApp />)
      expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeEnabled()
      expect(screen.getByText(label).closest('[role="status"]')).toHaveAttribute('data-kind', 'cloud')
    }
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(screen.getByRole('dialog', { name: 'Rename world' })).toBeInTheDocument()
    // A cloud world is already saved: the account menu offers no second save path.
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Rename world' })).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Account: Ava R.' }))
    expect(screen.queryByRole('menuitem', { name: /Save this build/ })).not.toBeInTheDocument()
  })

  it('opens the existing customization sheet directly and keeps the draft uncommitted when canceled', () => {
    render(<BrickStudioApp />)
    const before = useBrickStore.getState().getDocumentSnapshot()
    fireEvent.click(screen.getByRole('button', { name: 'Start building' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
    const picker = screen.getByRole('dialog', { name: 'Scene & character' })
    expect(picker).toBeInTheDocument()
    fireEvent.keyDown(picker, { key: 'Enter' })
    fireEvent.keyDown(picker, { key: '2' })
    expect(useBrickStore.getState().mode).toBe('build')
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Scene & character' })).not.toBeInTheDocument()
    expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(before)
  })

  it('keeps My worlds and My class at the start of the account menu and saves through the in-editor sheet', () => {
    browserClassroomClient.setSession(student)
    render(<BrickStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Account: Ava R.' }))
    const menu = screen.getByRole('menu', { name: 'Account' })
    const entries = within(menu).getAllByRole('menuitem')
    expect(entries[0]).toHaveTextContent('My worlds')
    expect(entries[0]).toHaveAttribute('href', '/worlds')
    expect(entries[1]).toHaveTextContent('My class')
    expect(entries[1]).toHaveAttribute('href', '/worlds?view=class')
    expect(entries[2]).toHaveTextContent('Save this build to my account')
    fireEvent.click(entries[2])
    expect(screen.getByRole('dialog', { name: 'Classroom save' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the in-editor save sheet for /build?classroom=save and consumes the param', () => {
    window.history.replaceState(null, '', '/build?classroom=save&utm_source=poster#top')
    render(<BrickStudioApp />)
    expect(screen.getByRole('dialog', { name: 'Classroom save' })).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?utm_source=poster')
    expect(window.location.hash).toBe('#top')
  })

  it.each(['worlds', 'class', 'join', 'signin', 'teacher'] as const)('redirects /build?classroom=%s to its page and consumes the param', (intent) => {
    window.history.replaceState(null, '', `/build?classroom=${intent}&utm_source=poster#top`)
    render(<BrickStudioApp />)
    expect(redirect).toHaveBeenCalledWith(intent, undefined, `?classroom=${intent}&utm_source=poster`)
    expect(screen.queryByRole('dialog', { name: /^Classroom/ })).not.toBeInTheDocument()
    expect(window.location.search).toBe('?utm_source=poster')
    expect(window.location.hash).toBe('#top')
  })

  it('opens no panel for /build?classroom=bogus and still strips the param', () => {
    window.history.replaceState(null, '', '/build?classroom=bogus&utm_source=poster')
    render(<BrickStudioApp />)
    expect(screen.queryByRole('dialog', { name: /^Classroom/ })).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/build')
    expect(window.location.search).toBe('?utm_source=poster')
  })

  it('strips an invite class code from the address bar and hands the original query to the join redirect', () => {
    window.history.replaceState(null, '', '/build?classroom=join&classCode=CLASS-456&utm_source=poster')
    render(<BrickStudioApp />)
    expect(redirect).toHaveBeenCalledWith('join', undefined, '?classroom=join&classCode=CLASS-456&utm_source=poster')
    expect(screen.queryByRole('dialog', { name: /^Classroom/ })).not.toBeInTheDocument()
    expect(window.location.search).toBe('?utm_source=poster')
  })

  it('sends an older printed sign-in invite to the join page with its class code', async () => {
    const { classroomIntentRedirect } = await vi.importActual<typeof import('../shell/navigation')>('../shell/navigation')
    const navigate = vi.fn()
    redirect.mockImplementationOnce((intent, _navigate, search) => classroomIntentRedirect(intent, navigate, search))
    window.history.replaceState(null, '', '/build?classroom=signin&classCode=ABC&utm_source=poster')
    render(<BrickStudioApp />)
    expect(navigate).toHaveBeenCalledWith('/join?mode=signin&classCode=ABC')
    expect(screen.queryByRole('dialog', { name: /^Classroom/ })).not.toBeInTheDocument()
    expect(window.location.search).toBe('?utm_source=poster')
  })

  it('keeps a class code from a link without an intent for the save sheet opened from the account menu', () => {
    browserClassroomClient.setSession(student)
    window.history.replaceState(null, '', '/build?classCode=CLASS-456')
    render(<BrickStudioApp />)
    expect(redirect).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: /^Classroom/ })).not.toBeInTheDocument()
    expect(window.location.search).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Account: Ava R.' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Account' })).getByRole('menuitem', { name: 'Save this build to my account' }))
    expect(screen.getByRole('dialog', { name: 'Classroom save' })).toHaveAttribute('data-class-code', 'CLASS-456')
  })

  describe('/build?world=<id> from My worlds', () => {
    const world: ClassroomWorld = { id: 'world-7', title: 'Sky bridge', kind: 'personal', ownerId: student.user.id, classId: null, visibility: 'private', canEdit: true, classCanEdit: false, ownerName: 'Ava R.', ownerClassId: null, sharedAt: null, revision: 3, updatedAt: '2026-09-18T09:00:00Z', document: createBrickStudioDocument([{ id: 'sky-1', partId: 'brick_2x4', x: 2, y: 0, z: 2, rotation: 0, color: '#fff' }]) }

    it('sends a signed-out visitor to sign in and back to the same world, stripping the param', () => {
      window.history.replaceState(null, '', '/build?world=world-7&utm_source=poster')
      render(<BrickStudioApp />)
      expect(joinRedirect).toHaveBeenCalledWith({ mode: 'signin', next: '/build?world=world-7' })
      expect(cloud.attach).not.toHaveBeenCalled()
      expect(window.location.search).toBe('?utm_source=poster')
    })

    it('opens a signed-in owner\'s world through the same path as the save sheet', async () => {
      browserClassroomClient.setSession(student)
      vi.spyOn(browserClassroomClient, 'getWorld').mockResolvedValue(world)
      window.history.replaceState(null, '', '/build?world=world-7')
      render(<BrickStudioApp />)
      await waitFor(() => expect(cloud.attach).toHaveBeenCalledWith(world, world.document))
      expect(browserClassroomClient.getWorld).toHaveBeenCalledWith('world-7')
      expect(joinRedirect).not.toHaveBeenCalled()
      expect(window.location.search).toBe('')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('keeps the current build and links back to My worlds when the world is unavailable', async () => {
      browserClassroomClient.setSession(student)
      vi.spyOn(browserClassroomClient, 'getWorld').mockRejectedValue(Object.assign(new Error('World not found'), { status: 404 }))
      const before = useBrickStore.getState().getDocumentSnapshot()
      window.history.replaceState(null, '', '/build?world=nope')
      render(<BrickStudioApp />)
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent("That world isn't available")
      expect(within(alert).getByRole('link', { name: 'Back to My worlds' })).toHaveAttribute('href', '/worlds')
      expect(cloud.attach).not.toHaveBeenCalled()
      expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(before)
      fireEvent.click(within(alert).getByRole('button', { name: 'Keep building' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('does not report an account save for a connected or offline shared world', () => {
    const policy = { connection: 'online' as const, isOwner: true, onRequestMode: vi.fn() }
    const view = render(<BrickStudioApp livePolicy={policy} />)
    expect(screen.getByText('Shared world').closest('[role="status"]')).toHaveAttribute('data-kind', 'live')
    expect(screen.queryByText('Saved to your account')).not.toBeInTheDocument()
    view.rerender(<BrickStudioApp livePolicy={{ ...policy, connection: 'offline' }} />)
    expect(screen.getByText('Offline · edits paused').closest('[role="status"]')).toHaveAttribute('data-tone', 'offline')
    expect(screen.getByRole('radio', { name: 'Explore' })).toBeDisabled()
  })
})
