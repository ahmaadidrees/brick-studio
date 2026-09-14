import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassroomPanel } from './ClassroomPanel'
import { ClassroomClient } from './client'
import { createBrickStudioDocument } from '../brick/brickDocument'
import type { ClassroomAuthResult, ClassroomClass, ClassroomStudent, ClassroomWorld } from './contracts'
const auth: ClassroomAuthResult = { user: { id: 's1', username: 'Builder', rosterName: 'Alex', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 } }
const teacherAuth: ClassroomAuthResult = { ...auth, user: { ...auth.user, id: 'teacher1', username: 'ms_carter', rosterName: 'Ms. Carter', role: 'teacher' } }
const classroom: ClassroomClass = { id: 'class1', name: 'Studio 5', loginCode: 'CLASS-456', code: 'NEW-123', enrollmentOpen: true, collaborationOpen: true }
const student: ClassroomStudent = { id: 's1', username: 'sky_builder', rosterName: 'Alex R.', suspended: false, resetRequired: false }
const world = (overrides: Partial<ClassroomWorld> = {}): ClassroomWorld => ({ id: 'world1', title: 'Desk Castle', ownerId: 's1', classId: null, kind: 'personal', revision: 3, updatedAt: '2026-09-10T12:00:00Z', ...overrides })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const props = () => ({ intent: 'save' as const, getDocument: vi.fn(() => createBrickStudioDocument([])), onOpenWorld: vi.fn(), onJoinWorld: vi.fn(), onClose: vi.fn() })
/** Minimal fake classroom API: lists by URL suffix, with per-test overrides for mutations. */
function fakeApi(data: { worlds?: ClassroomWorld[]; classes?: ClassroomClass[]; students?: ClassroomStudent[] } = {}, handle?: (url: string, options: RequestInit) => Response | undefined) {
  return vi.fn((url: string, options: RequestInit = {}) => {
    const custom = handle?.(url, options)
    if (custom) return Promise.resolve(custom)
    if (url.endsWith('/worlds')) return Promise.resolve(json({ worlds: data.worlds ?? [] }))
    if (url.endsWith('/students')) return Promise.resolve(json({ students: data.students ?? [] }))
    if (url.endsWith('/classes')) return Promise.resolve(json({ classes: data.classes ?? [] }))
    return Promise.resolve(json({ error: `Unhandled ${options.method ?? 'GET'} ${url}` }, 500))
  }) as unknown as typeof fetch
}
const signedIn = (session: ClassroomAuthResult, fetcher: typeof fetch) => { const client = new ClassroomClient('', fetcher); client.setSession(session); return client }
beforeEach(() => sessionStorage.clear()); afterEach(cleanup)

describe('classroom entry flow', () => {
  it('leaves guest building available without reading or changing their draft', () => {
    const callbacks = props(); const fetcher = vi.fn(); render(<ClassroomPanel {...callbacks} client={new ClassroomClient('', fetcher)} />)
    fireEvent.click(screen.getByText('Keep building as a guest'))
    expect(callbacks.onClose).toHaveBeenCalledOnce(); expect(callbacks.getDocument).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
  })
  it('offers Keep building as a guest on every entry view', () => {
    render(<ClassroomPanel {...props()} client={new ClassroomClient('', vi.fn())} />)
    for (const mode of ['Student', 'Join a class', 'Teacher']) {
      fireEvent.click(screen.getByRole('radio', { name: mode }))
      expect(screen.getByRole('button', { name: 'Keep building as a guest' })).toBeInTheDocument()
      expect(screen.getByText('Your current build stays here while you sign in.')).toBeInTheDocument()
    }
  })
  it('restricts a reset-required account to password replacement', () => {
    const fetcher = vi.fn(); const client = new ClassroomClient('', fetcher); client.setSession({ ...auth, user: { ...auth.user, resetRequired: true } })
    render(<ClassroomPanel {...props()} client={client} />)
    expect(screen.getByLabelText('New password')).toBeInTheDocument(); expect(screen.queryByText('My Worlds')).not.toBeInTheDocument(); expect(fetcher).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show new password' })).toBeInTheDocument()
  })
  it('does not announce a confirmed save when persistence fails', async () => {
    const fetcher = vi.fn((url: string, options: RequestInit) => Promise.resolve(options.method === 'POST' ? json({ error: 'Storage is unavailable.' }, 503) : json(url.endsWith('/worlds') ? { worlds: [] } : { classes: [] })))
    const client = new ClassroomClient('', fetcher as typeof fetch); client.setSession(auth)
    render(<ClassroomPanel {...props()} client={client} />)
    fireEvent.click(await screen.findByText('Save world'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Storage is unavailable'))
    expect(screen.queryByText('Saved to your account.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('World name')).toHaveValue('My build')
  })
})

describe('student sign-in (board 03)', () => {
  it('shows the returning-student copy, class sign-in code and teacher recovery hint', () => {
    render(<ClassroomPanel {...props()} intent="signin" client={new ClassroomClient('', vi.fn())} />)
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to open your saved worlds.')).toBeInTheDocument()
    expect(screen.getByLabelText('Class sign-in code')).toBeInTheDocument()
    expect(screen.getByText('Forgot your details? Ask your teacher.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Enrollment code')).not.toBeInTheDocument()
  })
  it.each([
    ['wrong code or password', 401, 'Check your class code, username and password.'],
    ['a suspended account', 403, 'Your teacher has paused your classroom account.'],
    ['a throttled account', 429, 'Too many attempts. Please wait a few minutes.'],
  ])('surfaces the server message for %s and keeps the typed details', async (_case, status, message) => {
    const client = new ClassroomClient('', vi.fn().mockResolvedValue(json({ error: message, code: 'x' }, status)))
    render(<ClassroomPanel {...props()} intent="signin" client={client} />)
    fireEvent.change(screen.getByLabelText('Class sign-in code'), { target: { value: 'CLASS-456' } })
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'sky_builder' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-the-one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByLabelText('Class sign-in code')).toHaveValue('CLASS-456')
    expect(screen.getByLabelText('Username')).toHaveValue('sky_builder')
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled()
  })
  it('reports a lost connection without pretending the account changed', async () => {
    const client = new ClassroomClient('', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<ClassroomPanel {...props()} intent="signin" client={client} />)
    fireEvent.change(screen.getByLabelText('Class sign-in code'), { target: { value: 'CLASS-456' } })
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'sky_builder' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect. Your current build is still here.')
  })
})

describe('enrollment (board 03)', () => {
  it('shows a signup password without submitting or changing the submitted credentials', async () => {
    const client = new ClassroomClient('', vi.fn())
    const authenticate = vi.spyOn(client, 'authenticate').mockResolvedValue(auth)
    render(<ClassroomPanel {...props()} client={client} />)
    expect(screen.getByRole('heading', { name: 'Join your class' })).toBeInTheDocument()
    expect(screen.getByText('Shown to your teacher only.')).toBeInTheDocument()
    expect(screen.getByText(/At least 8 characters/)).toBeInTheDocument()
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
  it('explains the real username and password rules before sending anything', async () => {
    const client = new ClassroomClient('', vi.fn())
    const authenticate = vi.spyOn(client, 'authenticate').mockResolvedValue(auth)
    render(<ClassroomPanel {...props()} intent="join" client={client} />)
    fireEvent.change(screen.getByLabelText('Enrollment code'), { target: { value: 'JOIN123' } })
    fireEvent.change(screen.getByLabelText('Choose a username'), { target: { value: '_leading' } })
    fireEvent.change(screen.getByLabelText('Name your teacher knows'), { target: { value: 'Alex' } })
    fireEvent.change(screen.getByLabelText('Choose a password'), { target: { value: 'long-enough-password' } })
    fireEvent.submit(document.getElementById('classroom-entry-form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Usernames are 3–24 letters or numbers')
    fireEvent.change(screen.getByLabelText('Choose a username'), { target: { value: 'sky_builder' } })
    fireEvent.change(screen.getByLabelText('Choose a password'), { target: { value: 'short' } })
    fireEvent.submit(document.getElementById('classroom-entry-form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords need 8 to 128 characters.')
    expect(authenticate).not.toHaveBeenCalled()
  })
  it.each([
    ['a taken username', 409, 'That username is already used in this class.'],
    ['closed enrollment', 403, 'Your teacher has closed enrollment with this code.'],
  ])('surfaces the server message for %s', async (_case, status, message) => {
    const client = new ClassroomClient('', vi.fn().mockResolvedValue(json({ error: message, code: 'x' }, status)))
    render(<ClassroomPanel {...props()} intent="join" client={client} />)
    fireEvent.change(screen.getByLabelText('Enrollment code'), { target: { value: 'NEW-123' } })
    fireEvent.change(screen.getByLabelText('Choose a username'), { target: { value: 'sky_builder' } })
    fireEvent.change(screen.getByLabelText('Name your teacher knows'), { target: { value: 'Alex' } })
    fireEvent.change(screen.getByLabelText('Choose a password'), { target: { value: 'remember-this' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByLabelText('Choose a username')).toHaveValue('sky_builder')
  })
  it('links between joining and signing in without leaving the guest build', () => {
    const callbacks = props()
    render(<ClassroomPanel {...callbacks} intent="join" client={new ClassroomClient('', vi.fn())} />)
    fireEvent.click(screen.getByRole('button', { name: 'Already have an account? Sign in' }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New here? Join a class' }))
    expect(screen.getByRole('heading', { name: 'Join your class' })).toBeInTheDocument()
    expect(callbacks.onClose).not.toHaveBeenCalled(); expect(callbacks.getDocument).not.toHaveBeenCalled()
  })
})

describe('teacher sign-in (board 03)', () => {
  it('keeps returning student and teacher forms separate without carrying a visible password across', async () => {
    const client = new ClassroomClient('', vi.fn())
    const authenticate = vi.spyOn(client, 'authenticate').mockResolvedValue(auth)
    render(<ClassroomPanel {...props()} client={client} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Student' }))
    fireEvent.change(screen.getByLabelText('Class sign-in code'), { target: { value: 'CLASS123' } })
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Builder' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(authenticate).toHaveBeenCalledWith('login', { classCode: 'CLASS123', username: 'Builder', password: 'test-password' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Teacher' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('radio', { name: 'Teacher' }))
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Class sign-in code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use email and password' }))
    expect(screen.getByRole('button', { name: 'Use email and password' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })
  it('never advertises teacher self-registration', () => {
    render(<ClassroomPanel {...props()} intent="teacher" client={new ClassroomClient('', vi.fn())} />)
    expect(screen.getByText('Access your classroom and student worlds.')).toBeInTheDocument()
    expect(screen.getByText(/Use your existing teacher account/)).toBeInTheDocument()
    expect(screen.queryByText(/create a teacher account/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign up/i })).not.toBeInTheDocument()
  })
  it('submits the email fallback as a teacher login and shows the real rejection', async () => {
    const client = new ClassroomClient('', vi.fn().mockResolvedValue(json({ error: 'Check your sign-in details and try again.', code: 'invalid_credentials' }, 401)))
    render(<ClassroomPanel {...props()} intent="teacher" client={client} />)
    fireEvent.click(screen.getByRole('button', { name: 'Use email and password' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'teacher@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'teacher-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your sign-in details and try again.')
    expect(screen.getByLabelText('Email')).toHaveValue('teacher@example.test')
  })
  it('keeps the guest build and the entry view when Google sign-in cannot start', async () => {
    const client = new ClassroomClient('', vi.fn())
    vi.spyOn(client, 'startGoogleTeacher').mockRejectedValue(new Error('Google sign-in is not available right now.'))
    const callbacks = props()
    render(<ClassroomPanel {...callbacks} intent="teacher" client={client} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Google sign-in is not available right now.')
    expect(callbacks.getDocument).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).not.toBeDisabled()
    expect(callbacks.onClose).not.toHaveBeenCalled()
  })
})

describe('forced password change (board 04)', () => {
  it('keeps password reset verification when new passwords are revealed', async () => {
    const fetcher = vi.fn()
    const client = new ClassroomClient('', fetcher)
    client.setSession({ ...auth, user: { ...auth.user, resetRequired: true } })
    const changePassword = vi.spyOn(client, 'changePassword').mockResolvedValue(auth)
    render(<ClassroomPanel {...props()} client={client} />)
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
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
  it('shows the server reason when the temporary password is reused', async () => {
    const client = new ClassroomClient('', vi.fn().mockResolvedValue(json({ error: 'Choose a different password from your temporary password.', code: 'password_unchanged' }, 400)))
    client.setSession({ ...auth, user: { ...auth.user, resetRequired: true } })
    render(<ClassroomPanel {...props()} client={client} />)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'temporary-1' } })
    fireEvent.change(screen.getByLabelText('Repeat new password'), { target: { value: 'temporary-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a different password from your temporary password.')
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
  })
  it('lets the student sign out instead of choosing a password', async () => {
    const client = new ClassroomClient('', vi.fn())
    client.setSession({ ...auth, user: { ...auth.user, resetRequired: true } })
    const signOut = vi.spyOn(client, 'signOut').mockResolvedValue(undefined)
    render(<ClassroomPanel {...props()} client={client} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
  })
})

describe('save hand-off (board 04)', () => {
  it('opens the explicit save flow with honest storage wording and saves a new personal world', async () => {
    const saved = world({ id: 'new', title: 'Desk Castle' })
    const fetcher = fakeApi({}, (url, options) => url.endsWith('/worlds') && options.method === 'POST' ? json({ world: saved }) : undefined)
    const callbacks = { ...props(), onSaved: vi.fn() }
    render(<ClassroomPanel {...callbacks} client={signedIn(auth, fetcher)} />)
    expect(await screen.findByRole('heading', { name: 'Save this build to your account' })).toBeInTheDocument()
    expect(screen.getByText('Saved in this browser')).toBeInTheDocument()
    expect(screen.getByText('Save online')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('World name'), { target: { value: 'Desk Castle' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save world' }))
    await screen.findByText('Saved to your account.')
    expect(callbacks.onSaved).toHaveBeenCalledWith(saved)
    const post = (fetcher as ReturnType<typeof vi.fn>).mock.calls.find(call => call[1]?.method === 'POST')!
    expect(JSON.parse(post[1].body as string)).toMatchObject({ title: 'Desk Castle', kind: 'personal' })
    expect(screen.queryByRole('heading', { name: 'Save this build to your account' })).not.toBeInTheDocument()
  })
  it('warns before saving a second world with the same name and never overwrites the first', async () => {
    const existing = world({ id: 'w-existing', title: 'Desk Castle' })
    const fetcher = fakeApi({ worlds: [existing] }, (url, options) => url.endsWith('/worlds') && options.method === 'POST' ? json({ world: world({ id: 'w-second', title: 'desk castle' }) }) : undefined)
    render(<ClassroomPanel {...props()} client={signedIn(auth, fetcher)} />)
    await screen.findByRole('heading', { name: 'Save this build to your account' })
    fireEvent.change(screen.getByLabelText('World name'), { target: { value: 'desk castle' } })
    expect(screen.getByRole('status')).toHaveTextContent('You already have a world named “desk castle”')
    expect(screen.getByRole('button', { name: 'Save as a new world anyway' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save as a new world anyway' }))
    await screen.findByText('Saved to your account.')
    const calls = (fetcher as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some(call => call[1]?.method === 'PUT' || call[1]?.method === 'PATCH')).toBe(false)
    expect(calls.find(call => call[1]?.method === 'POST')![0]).toMatch(/\/worlds$/)
  })
  it('lets the student keep building instead of saving', async () => {
    const callbacks = props()
    render(<ClassroomPanel {...callbacks} client={signedIn(auth, fakeApi())} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Keep building' }))
    expect(callbacks.onClose).toHaveBeenCalledOnce()
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
})

describe('My Worlds (board 05)', () => {
  it('shows the empty state without fake thumbnails or counts', async () => {
    render(<ClassroomPanel {...props()} intent="worlds" client={signedIn(auth, fakeApi())} />)
    expect(await screen.findByText('Your first world starts here.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save current build' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Back to building' })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })
  it('lists only the account’s personal worlds with Open, Rename, Duplicate and Manage', async () => {
    const mine = world(); const shared = world({ id: 'w2', title: 'Our Class City', kind: 'class', classId: 'class1', ownerId: 'teacher1' }); const other = world({ id: 'w3', title: 'Not mine', ownerId: 'someone-else' })
    const fetcher = fakeApi({ worlds: [mine, shared, other], classes: [classroom] }, url => url.endsWith('/worlds/world1') ? json({ world: { ...mine, document: createBrickStudioDocument([]) } }) : undefined)
    const callbacks = props()
    render(<ClassroomPanel {...callbacks} intent="worlds" client={signedIn(auth, fetcher)} />)
    const card = await screen.findByRole('article', { name: 'Desk Castle' })
    expect(screen.queryByRole('article', { name: 'Our Class City' })).not.toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Not mine' })).not.toBeInTheDocument()
    expect(within(card).getByText(/Saved to your account/)).toBeInTheDocument()
    for (const name of ['Open', 'Rename', 'Duplicate', 'Manage']) expect(within(card).getByRole('button', { name })).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(callbacks.onOpenWorld).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'world1' })))
    expect(callbacks.onClose).toHaveBeenCalled()
  })
  it('renames through the world PATCH and duplicates through a new POST', async () => {
    const mine = world()
    const fetcher = fakeApi({ worlds: [mine] }, (url, options) => {
      if (url.endsWith('/worlds/world1') && options.method === 'PATCH') return json({ world: { ...mine, title: 'Sky Steps' } })
      if (url.endsWith('/worlds/world1')) return json({ world: { ...mine, document: createBrickStudioDocument([]) } })
      if (url.endsWith('/worlds') && options.method === 'POST') return json({ world: world({ id: 'copy' }) })
      return undefined
    })
    const onWorldUpdated = vi.fn()
    render(<ClassroomPanel {...props()} intent="worlds" client={signedIn(auth, fetcher)} onWorldUpdated={onWorldUpdated} />)
    const card = await screen.findByRole('article', { name: 'Desk Castle' })
    fireEvent.click(within(card).getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('World name'), { target: { value: 'Sky Steps' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(onWorldUpdated).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sky Steps' })))
    const patch = (fetcher as ReturnType<typeof vi.fn>).mock.calls.find(call => call[1]?.method === 'PATCH')!
    expect(JSON.parse(patch[1].body as string)).toEqual({ title: 'Sky Steps' })
    fireEvent.click(within(await screen.findByRole('article', { name: 'Desk Castle' })).getByRole('button', { name: 'Duplicate' }))
    await screen.findByText('Duplicated “Desk Castle”.')
    const post = (fetcher as ReturnType<typeof vi.fn>).mock.calls.find(call => call[1]?.method === 'POST')!
    expect(JSON.parse(post[1].body as string)).toMatchObject({ title: 'Desk Castle copy', kind: 'personal' })
  })
  it('refuses to open a world that arrived without its build', async () => {
    const mine = world()
    const fetcher = fakeApi({ worlds: [mine] }, url => url.endsWith('/worlds/world1') ? json({ world: mine }) : undefined)
    const callbacks = props()
    render(<ClassroomPanel {...callbacks} intent="worlds" client={signedIn(auth, fetcher)} />)
    fireEvent.click(within(await screen.findByRole('article', { name: 'Desk Castle' })).getByRole('button', { name: 'Open' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This world did not include a complete build.')
    expect(callbacks.onOpenWorld).not.toHaveBeenCalled(); expect(callbacks.onClose).not.toHaveBeenCalled()
  })
  it('surfaces a failed list load instead of an empty promise', async () => {
    render(<ClassroomPanel {...props()} intent="worlds" client={signedIn(auth, vi.fn(() => Promise.resolve(json({ error: 'The account service could not complete this request. Please retry.' }, 502))) as typeof fetch)} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The account service could not complete this request.')
    expect(screen.queryByText('Your first world starts here.')).toBeInTheDocument()
  })
})

describe('My Class for students (board 05)', () => {
  it('shows permitted class and group worlds with the honest collaboration note', async () => {
    const classWorld = world({ id: 'c1', title: 'Our Class City', kind: 'class', classId: 'class1', ownerId: 'teacher1' })
    const groupWorld = world({ id: 'g1', title: 'Bridge Team', kind: 'group', classId: 'class1', ownerId: 'teacher1' })
    const callbacks = props()
    render(<ClassroomPanel {...callbacks} intent="class" client={signedIn(auth, fakeApi({ worlds: [classWorld, groupWorld], classes: [classroom] }))} />)
    expect(await screen.findByRole('heading', { name: 'Build with your class' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Our Class City' })).toHaveTextContent('Whole class')
    expect(screen.getByRole('article', { name: 'Bridge Team' })).toHaveTextContent('Assigned group')
    expect(screen.getByText(/Your teacher can close collaboration at any time/)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Class settings' })).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('article', { name: 'Bridge Team' })).getByRole('button', { name: 'Join world' }))
    await waitFor(() => expect(callbacks.onJoinWorld).toHaveBeenCalledWith(groupWorld))
  })
  it('disables joining while the teacher has closed collaboration', async () => {
    const classWorld = world({ id: 'c1', title: 'Our Class City', kind: 'class', classId: 'class1', ownerId: 'teacher1' })
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(auth, fakeApi({ worlds: [classWorld], classes: [{ ...classroom, collaborationOpen: false }] }))} />)
    expect(await screen.findByText('Your teacher has closed collaboration. Saved worlds are preserved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join world' })).toBeDisabled()
  })
  it('shows the no-class empty state for a student', async () => {
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(auth, fakeApi())} />)
    expect(await screen.findByText('No class yet')).toBeInTheDocument()
  })
})

it('lets teachers oversee a shared world while student collaboration is closed', async () => {
  const closed = { ...classroom, id: 'class1', name: 'Class One', loginCode: 'CLASS1', code: 'JOIN1', collaborationOpen: false }
  const shared = world({ id: 'world1', title: 'Group build', ownerId: 'teacher1', classId: 'class1', kind: 'class', revision: 1 })
  const callbacks = props()
  render(<ClassroomPanel {...callbacks} intent="class" client={signedIn(teacherAuth, fakeApi({ worlds: [shared], classes: [closed] }))} />)
  fireEvent.click(await screen.findByRole('radio', { name: 'Shared worlds' }))
  await screen.findByText('Collaboration is closed to students. You can still open worlds to review and manage them.')
  fireEvent.click(screen.getByText('Join world'))
  await waitFor(() => expect(callbacks.onJoinWorld).toHaveBeenCalledWith(shared))
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
  render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher as typeof fetch)} />)
  fireEvent.click(await screen.findByRole('radio', { name: 'Class settings' }))
  const name = await screen.findByLabelText('New class name')
  fireEvent.change(name, { target: { value: 'New class' } })
  fireEvent.click(screen.getByText('Create class'))
  await screen.findByText('NEWJOIN')
  expect(screen.getByLabelText('Class')).toHaveValue('new')
  expect(screen.getByLabelText('New class name')).toHaveValue('')
})

describe('teacher roster (board 13)', () => {
  const roster: ClassroomStudent[] = [student, { id: 's2', username: 'comet_maker', rosterName: 'Sam K.', suspended: false, resetRequired: false }, { id: 's3', username: 'sunny_blocks', rosterName: 'Jamie L.', suspended: false, resetRequired: true }, { id: 's4', username: 'quiet_one', rosterName: 'Riley P.', suspended: true, resetRequired: false }]
  it('shows roster name, username and status, and filters by search', async () => {
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fakeApi({ classes: [classroom], students: roster }))} />)
    const list = await screen.findByRole('list', { name: 'Students in this class' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(within(list).getByText('Jamie L.').closest('[role=listitem]')).toHaveTextContent('Password change required')
    expect(within(list).getByText('Riley P.').closest('[role=listitem]')).toHaveTextContent('Suspended')
    expect(within(list).getByText('Alex R.').closest('[role=listitem]')).toHaveTextContent('Active')
    expect(screen.getByText(/^4 students in Studio 5/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: 'comet' } })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: 'nobody' } })
    expect(screen.getByRole('status')).toHaveTextContent('No students match “nobody”.')
    expect(screen.queryByText(/grade|analytics|score/i)).not.toBeInTheDocument()
  })
  it('points an empty roster at the class codes', async () => {
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fakeApi({ classes: [classroom] }))} />)
    expect(await screen.findByText('Ready for your students?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View class codes' }))
    expect(await screen.findByText('New student enrollment code')).toBeInTheDocument()
    expect(screen.getByText('NEW-123')).toBeInTheDocument()
  })
  it('keeps teacher controls available in focused sections and submits student edits to the selected class', async () => {
    const fetcher = fakeApi({ classes: [classroom], students: [student] }, (url, options) => url.includes('/students/') && options.method === 'PATCH' ? json({ student }) : undefined)
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Alex R.' }))
    expect(screen.queryByLabelText('New class name')).not.toBeInTheDocument()
    expect(screen.getByText('Setting this signs the student out and asks them to choose a new password.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'NewBuilder' } })
    fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'temporary-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show temporary password' }))
    expect(screen.getByLabelText('Temporary password')).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText(/Student account updated/)
    const patch = (fetcher as ReturnType<typeof vi.fn>).mock.calls.find(call => call[0].endsWith('/classes/class1/students/s1'))
    expect(patch).toBeDefined()
    const [, request] = patch! as unknown as [string, RequestInit]
    expect(request.method).toBe('PATCH')
    expect(JSON.parse(request.body as string)).toEqual({ username: 'NewBuilder', rosterName: 'Alex R.', temporaryPassword: 'temporary-password' })
    fireEvent.click(screen.getByRole('radio', { name: 'Class settings' }))
    expect(screen.getByRole('button', { name: 'Close enrollment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New enrollment code' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close collaboration' })).toBeInTheDocument()
    expect(screen.getByLabelText('New class name')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Manage Alex R.' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Shared worlds' }))
    expect(screen.getByLabelText('Shared world name')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close enrollment' })).not.toBeInTheDocument()
  })
  it('generates a temporary password into the field without submitting', async () => {
    const fetcher = fakeApi({ classes: [classroom], students: [student] })
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Alex R.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate temporary password' }))
    expect((screen.getByLabelText('Temporary password') as HTMLInputElement).value).toMatch(/^[A-Za-z2-9]{12}$/)
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls.some(call => call[1]?.method === 'PATCH')).toBe(false)
  })
  it('omits the temporary password when left blank', async () => {
    const fetcher = fakeApi({ classes: [classroom], students: [student] }, (url, options) => url.includes('/students/') && options.method === 'PATCH' ? json({ student }) : undefined)
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Alex R.' }))
    fireEvent.change(screen.getByLabelText('Roster name'), { target: { value: 'Alex Rivera' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Student account updated.')
    const patch = (fetcher as ReturnType<typeof vi.fn>).mock.calls.find(call => call[1]?.method === 'PATCH')!
    expect(JSON.parse(patch[1].body as string)).toEqual({ username: 'sky_builder', rosterName: 'Alex Rivera' })
  })
  it('asks before suspending, keeps saved work wording, and reactivates in one step', async () => {
    let current = student
    const fetcher = fakeApi({ classes: [classroom] }, (url, options) => {
      if (url.includes('/students/') && options.method === 'PATCH') { current = { ...current, suspended: JSON.parse(options.body as string).suspended }; return json({ student: current }) }
      if (url.endsWith('/students')) return json({ students: [current] })
      return undefined
    })
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Alex R.' }))
    expect(screen.getByText('Suspending access keeps saved work.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suspend access' }))
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls.some(call => call[1]?.method === 'PATCH')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Keep access' }))
    expect(screen.getByRole('button', { name: 'Suspend access' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suspend access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suspend now' }))
    await screen.findByText(/classroom access is suspended. Their saved work is kept./)
    const patch = (fetcher as ReturnType<typeof vi.fn>).mock.calls.find(call => call[1]?.method === 'PATCH')!
    expect(JSON.parse(patch[1].body as string)).toEqual({ suspended: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Alex R.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate access' }))
    await screen.findByText('Alex R. can use classroom features again.')
  })
  it('shows the server rejection for a taken username in Manage student', async () => {
    const fetcher = fakeApi({ classes: [classroom], students: [student] }, (url, options) => url.includes('/students/') && options.method === 'PATCH' ? json({ error: 'That username is already used in this class.', code: 'already_exists' }, 409) : undefined)
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Alex R.' }))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'comet_maker' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That username is already used in this class.')
    expect(screen.getByLabelText('Username')).toHaveValue('comet_maker')
  })
})

describe('class access and groups (board 14)', () => {
  it('shows separate code cards and copies each code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    try {
      render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fakeApi({ classes: [classroom] }))} />)
      fireEvent.click(await screen.findByRole('radio', { name: 'Class settings' }))
      expect(screen.getByText('NEW-123')).toBeInTheDocument(); expect(screen.getByText('CLASS-456')).toBeInTheDocument()
      expect(screen.getByText('Enrollment creates an account. Sign-in returns to an existing account.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Copy returning sign-in code' }))
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('CLASS-456'))
      expect(await screen.findByRole('button', { name: 'Copy returning sign-in code' })).toHaveTextContent('Copied')
    } finally { vi.unstubAllGlobals() }
  })
  it('falls back to a selectable code when the clipboard is blocked', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    try {
      render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fakeApi({ classes: [classroom] }))} />)
      fireEvent.click(await screen.findByRole('radio', { name: 'Class settings' }))
      fireEvent.click(screen.getByRole('button', { name: 'Copy new student enrollment code' }))
      expect(await screen.findByLabelText('New student enrollment code (select to copy)')).toHaveValue('NEW-123')
      expect(screen.getByText(/Copying is blocked in this browser/)).toBeInTheDocument()
    } finally { vi.unstubAllGlobals() }
  })
  it('toggles enrollment and rotates the enrollment code without touching the sign-in code', async () => {
    let current = classroom
    const fetcher = fakeApi({}, (url, options) => {
      if (url.endsWith('/classes/class1') && options.method === 'PATCH') { const body = JSON.parse(options.body as string); current = { ...current, ...(body.rotateCode ? { code: 'NEW-789' } : body) }; return json({ class: current }) }
      if (url.endsWith('/classes')) return json({ classes: [current] })
      return undefined
    })
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher)} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Class settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close enrollment' }))
    await screen.findByText('Enrollment is closed. Existing accounts still work.')
    expect(screen.getByRole('button', { name: 'Open enrollment' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New enrollment code' }))
    await screen.findByText('New enrollment code ready. The returning sign-in code did not change.')
    expect(screen.getByText('NEW-789')).toBeInTheDocument(); expect(screen.getByText('CLASS-456')).toBeInTheDocument()
    const bodies = (fetcher as ReturnType<typeof vi.fn>).mock.calls.filter(call => call[1]?.method === 'PATCH').map(call => JSON.parse(call[1].body as string))
    expect(bodies).toEqual([{ enrollmentOpen: false }, { rotateCode: true }])
  })
  it('confirms before closing collaboration and reopens in one step', async () => {
    let current = classroom
    const fetcher = fakeApi({}, (url, options) => {
      if (url.endsWith('/classes/class1') && options.method === 'PATCH') { current = { ...current, ...JSON.parse(options.body as string) }; return json({ class: current }) }
      if (url.endsWith('/classes')) return json({ classes: [current] })
      return undefined
    })
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher)} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Class settings' }))
    expect(screen.getByText(/Closing collaboration preserves saved worlds/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close collaboration' }))
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls.some(call => call[1]?.method === 'PATCH')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Close now' }))
    await screen.findByText('Collaboration is closed. Saved worlds are preserved.')
    fireEvent.click(screen.getByRole('button', { name: 'Open collaboration' }))
    await screen.findByText('Collaboration is open.')
    const bodies = (fetcher as ReturnType<typeof vi.fn>).mock.calls.filter(call => call[1]?.method === 'PATCH').map(call => JSON.parse(call[1].body as string))
    expect(bodies).toEqual([{ collaborationOpen: false }, { collaborationOpen: true }])
  })
  it('creates a shared world from the current build as whole class or assigned group', async () => {
    const fetcher = fakeApi({ classes: [classroom] }, (url, options) => url.endsWith('/worlds') && options.method === 'POST' ? json({ world: world({ id: 'shared', kind: 'group', classId: 'class1' }) }) : undefined)
    const callbacks = props()
    render(<ClassroomPanel {...callbacks} intent="class" client={signedIn(teacherAuth, fetcher)} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Shared worlds' }))
    expect(screen.getByRole('radio', { name: 'Whole class' })).toBeChecked()
    fireEvent.change(screen.getByLabelText('Shared world name'), { target: { value: 'Bridge Team' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Assigned group' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create from this build' }))
    await screen.findByText('“Bridge Team” is ready. Add students in World controls so they can join.')
    expect(callbacks.getDocument).toHaveBeenCalled()
    const post = (fetcher as ReturnType<typeof vi.fn>).mock.calls.find(call => call[1]?.method === 'POST')!
    expect(JSON.parse(post[1].body as string)).toMatchObject({ title: 'Bridge Team', classId: 'class1', kind: 'group' })
  })
  it('keeps group member management and checkpoint recovery in world controls', async () => {
    const groupWorld = world({ id: 'world1', title: 'Group build', ownerId: 'teacher1', classId: 'class1', kind: 'group', revision: 8 })
    let members = [student]
    const fetcher = fakeApi({ worlds: [groupWorld], classes: [classroom], students: [student] }, (url, options) => {
      if (options.method === 'DELETE') { members = []; return json({ members }) }
      if (url.endsWith('/members') && options.method === 'POST') { members = [student]; return json({ members }) }
      if (url.endsWith('/members')) return json({ members })
      if (url.endsWith('/checkpoints')) return json({ checkpoints: [{ id: 'cp1', revision: 2, createdAt: groupWorld.updatedAt, reason: 'saved' }] })
      return undefined
    })
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher)} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Shared worlds' }))
    expect(screen.queryByText(/Revision 8/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'World controls' }))
    expect(await screen.findByText('Removing a member keeps their contributions.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from group' }))
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls.some(call => call[1]?.method === 'DELETE')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove from group' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove now' }))
    await waitFor(() => expect(screen.getByLabelText('Add student')).toHaveValue('s1'))
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/worlds/world1/members/s1'), expect.objectContaining({ method: 'DELETE' }))
    expect(screen.getByRole('status')).toHaveTextContent('Alex R. was removed. Their contributions stay in the world.')
    fireEvent.click(screen.getByRole('button', { name: 'Add to group' }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/worlds/world1/members'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ userId: 's1' }) })))
    expect(screen.getByLabelText('Checkpoint')).toHaveValue('cp1')
    expect(screen.getByRole('option', { name: /Revision 2/ })).toBeInTheDocument()
    expect(screen.getByText('Choose an earlier save. A checkpoint of the current version is kept first.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to worlds/ }))
    expect(screen.getByRole('button', { name: 'Join world' })).toBeInTheDocument()
  })
  it('restores only after confirmation, against the current revision', async () => {
    const shared = world({ id: 'world1', title: 'Our Class City', ownerId: 'teacher1', classId: 'class1', kind: 'class', revision: 8 })
    const fetcher = fakeApi({ worlds: [shared], classes: [classroom] }, (url, options) => {
      if (url.endsWith('/members')) return json({ members: [] })
      if (url.endsWith('/checkpoints')) return json({ checkpoints: [{ id: 'cp1', revision: 2, createdAt: shared.updatedAt, reason: 'saved' }] })
      if (url.endsWith('/restore')) return json({ world: { ...shared, revision: 9 } })
      if (url.endsWith('/worlds/world1')) return json({ world: { ...shared, revision: 8 } })
      return undefined
    })
    const beforeWorldMutation = vi.fn().mockResolvedValue(true)
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher)} beforeWorldMutation={beforeWorldMutation} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Shared worlds' }))
    fireEvent.click(screen.getByRole('button', { name: 'World controls' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restore selected checkpoint' }))
    expect(screen.getByRole('status')).toHaveTextContent('The current version is kept as a checkpoint first')
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls.some(call => call[0].endsWith('/restore'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Restore now' }))
    await screen.findByText('World restored. Open the world to see the recovered version.')
    const restore = (fetcher as ReturnType<typeof vi.fn>).mock.calls.find(call => call[0].endsWith('/restore'))!
    expect(JSON.parse(restore[1].body as string)).toEqual({ checkpointId: 'cp1', expectedRevision: 8 })
    expect(beforeWorldMutation).toHaveBeenCalled()
  })
  it('explains a revision conflict instead of overwriting', async () => {
    const shared = world({ id: 'world1', title: 'Our Class City', ownerId: 'teacher1', classId: 'class1', kind: 'class', revision: 8 })
    const fetcher = fakeApi({ worlds: [shared], classes: [classroom] }, url => {
      if (url.endsWith('/members')) return json({ members: [] })
      if (url.endsWith('/checkpoints')) return json({ checkpoints: [{ id: 'cp1', revision: 2, createdAt: shared.updatedAt, reason: 'saved' }] })
      if (url.endsWith('/restore')) return json({ error: 'This world changed while you were choosing. Try again.', code: 'revision_conflict', currentRevision: 9 }, 409)
      if (url.endsWith('/worlds/world1')) return json({ world: shared })
      return undefined
    })
    render(<ClassroomPanel {...props()} intent="class" client={signedIn(teacherAuth, fetcher)} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Shared worlds' }))
    fireEvent.click(screen.getByRole('button', { name: 'World controls' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Restore selected checkpoint' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This world changed while you were choosing.')
    expect(screen.queryByText(/World restored/)).not.toBeInTheDocument()
  })
})

describe('entry intents', () => {
  it.each([
    ['join', 'Join a class', 'Enrollment code'],
    ['signin', 'Student', 'Class sign-in code'],
    ['save', 'Join a class', 'Enrollment code'],
    ['worlds', 'Join a class', 'Enrollment code'],
    ['class', 'Join a class', 'Enrollment code'],
  ] as const)('opens a guest on the %s mode', (intent, mode, field) => {
    render(<ClassroomPanel {...props()} intent={intent} client={new ClassroomClient('', vi.fn())} />)
    expect(screen.getByRole('radio', { name: mode })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText(field)).toBeInTheDocument()
    expect(screen.getByText('Keep building as a guest')).toBeInTheDocument()
  })
  it('opens a guest on the teacher mode with Google first', () => {
    render(<ClassroomPanel {...props()} intent="teacher" client={new ClassroomClient('', vi.fn())} />)
    expect(screen.getByRole('radio', { name: 'Teacher' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use email and password' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Keep building as a guest')).toBeInTheDocument()
  })

  it.each(['join', 'signin', 'teacher', 'worlds'] as const)('shows My Worlds to a signed-in user arriving with the %s intent', async intent => {
    const fetcher = vi.fn((url: string) => Promise.resolve(json(url.endsWith('/worlds') ? { worlds: [] } : { classes: [] })))
    const client = new ClassroomClient('', fetcher as typeof fetch); client.setSession(auth)
    render(<ClassroomPanel {...props()} intent={intent} client={client} />)
    expect(await screen.findByRole('radio', { name: 'My Worlds' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('radio', { name: 'Student' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save world' })).not.toBeInTheDocument()
  })

  it.each(['save', 'worlds', 'class', 'join', 'signin', 'teacher'] as const)('sends the %s intent through the Google teacher round-trip', async intent => {
    const client = new ClassroomClient('', vi.fn())
    const start = vi.spyOn(client, 'startGoogleTeacher').mockReturnValue(new Promise(() => {}))
    const callbacks = props()
    render(<ClassroomPanel {...callbacks} intent={intent} client={client} />)
    if (intent !== 'teacher') fireEvent.click(screen.getByRole('radio', { name: 'Teacher' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(start).toHaveBeenCalledWith(`/build?classroom=${intent}`))
    expect(callbacks.getDocument).toHaveBeenCalledOnce()
  })
})

describe('safe states (board 15, account-owned)', () => {
  it('explains an expired session and returns to the entry view instead of a silent sign-out', async () => {
    const fetcher = vi.fn(() => Promise.resolve(json({ error: 'Your session expired. Sign in again.', code: 'session_expired' }, 401)))
    const client = new ClassroomClient('', fetcher as typeof fetch); client.setSession(auth)
    render(<ClassroomPanel {...props()} intent="worlds" client={client} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session expired. Sign in again.')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Student' })).toHaveAttribute('aria-checked', 'true')
    expect(client.getSession()).toBeNull()
  })
  it('keeps the guest build and reports blocked storage when Google sign-in cannot stash the draft', async () => {
    const client = new ClassroomClient('', vi.fn())
    const start = vi.spyOn(client, 'startGoogleTeacher')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    try {
      const callbacks = props()
      render(<ClassroomPanel {...callbacks} intent="teacher" client={client} />)
      fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
      expect(await screen.findByRole('alert')).not.toHaveTextContent(/^$/)
      expect(start).not.toHaveBeenCalled()
      expect(callbacks.onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Continue with Google' })).not.toBeDisabled()
    } finally { setItem.mockRestore() }
  })
})

describe('dialog behaviour', () => {
  it('submits the entry form from the sheet footer and clears field errors on a mode change', async () => {
    const client = new ClassroomClient('', vi.fn())
    const authenticate = vi.spyOn(client, 'authenticate').mockResolvedValue(auth)
    render(<ClassroomPanel {...props()} intent="signin" client={client} />)
    fireEvent.change(screen.getByLabelText('Class sign-in code'), { target: { value: 'CLASS-456' } })
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: '_leading' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-1' } })
    const submit = screen.getByRole('button', { name: 'Sign in' })
    expect(submit).toHaveAttribute('form', 'classroom-entry-form')
    fireEvent.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent('Usernames are 3–24 letters or numbers')
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true')
    expect(authenticate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'Join a class' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('lets Escape close a confirmation without closing the panel', async () => {
    const callbacks = props()
    render(<ClassroomPanel {...callbacks} intent="class" client={signedIn(teacherAuth, fakeApi({ classes: [classroom], students: [student] }))} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Alex R.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suspend access' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Suspend access' })).toBeInTheDocument()
    expect(callbacks.onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(callbacks.onClose).toHaveBeenCalledOnce()
  })
  it('closes on Escape and returns focus to the opener', () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus()
    const callbacks = props()
    const view = render(<ClassroomPanel {...callbacks} client={new ClassroomClient('', vi.fn())} />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(callbacks.onClose).toHaveBeenCalledOnce()
    view.unmount(); expect(document.activeElement).toBe(opener); opener.remove()
  })
})
