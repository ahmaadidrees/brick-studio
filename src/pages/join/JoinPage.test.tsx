import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JoinExperience } from './JoinPage'
import { ClassroomClient } from '../../classroom/client'
import type { ClassroomAuthResult, ClassroomRoster } from '../../classroom/contracts'

/**
 * The page is driven through the real `ClassroomClient` over a fake `fetch`, so the
 * request shapes and the error codes in these tests are the ones the worker sends.
 * (W1's `src/classroom/mockClient.ts` had not landed when this suite was written.)
 */
const studentAuth: ClassroomAuthResult = {
  user: { id: 's1', username: 'sky_builder', rosterName: 'Alex Rivera', role: 'student', resetRequired: false },
  classes: [{ id: 'c1', name: 'Studio 5', loginCode: 'ROOM-42', enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true, buildingNow: null, teacherName: 'Ms. Carter' }],
  session: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 },
}
const teacherAuth: ClassroomAuthResult = { ...studentAuth, user: { ...studentAuth.user, id: 't1', username: 'ms_carter', rosterName: 'Ms. Carter', role: 'teacher' } }
const roster: ClassroomRoster = {
  name: 'Studio 5',
  canEnroll: true,
  showNames: true,
  students: [{ username: 'ben_k', displayName: 'Ben K.' }, { username: 'mia_t', displayName: 'Mia T.' }],
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** Fake worker: the roster lookup answers by default; auth routes come from the test. */
function fakeApi(handle?: (path: string, body: Record<string, string>) => Response | undefined) {
  return vi.fn((url: string, options: RequestInit = {}) => {
    const path = new URL(url, 'http://localhost').pathname.replace('/classroom', '')
    const body = options.body ? JSON.parse(String(options.body)) : {}
    const custom = handle?.(path, body)
    if (custom) return Promise.resolve(custom)
    if (path === '/auth/roster') return Promise.resolve(json(roster))
    return Promise.resolve(json({ error: `Unhandled ${options.method ?? 'GET'} ${path}`, code: '' }, 500))
  }) as unknown as typeof fetch
}
const setup = (search: string, fetcher: typeof fetch = fakeApi(), session?: ClassroomAuthResult) => {
  const client = new ClassroomClient('', fetcher)
  if (session) client.setSession(session)
  const onNavigate = vi.fn()
  render(<JoinExperience client={client} search={search} onNavigate={onNavigate} />)
  return { client, onNavigate, fetcher }
}
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const rule = (text: string) => screen.getByText(text).closest('li')!

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(cleanup)

describe('/join?classCode= — a code from the board, the QR or the landing box', () => {
  it('looks the class up, then shows the names to tap plus I’m new', async () => {
    setup('?classCode=room-42')
    expect(screen.getByRole('status')).toHaveTextContent('Finding your class…')
    expect(screen.queryByLabelText('Choose a username')).not.toBeInTheDocument()
    const grid = await screen.findByRole('list', { name: 'Tap your name, then type your password.' }, { timeout: 2000 })
    expect(screen.getByRole('heading', { name: 'Find your name' })).toBeInTheDocument()
    expect(within(grid).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(within(grid).getByRole('button', { name: /Mia T\./ }))
    expect(screen.getByLabelText('Username')).toHaveValue('mia_t')
    expect(screen.getByLabelText('Mia T., type your password')).toHaveFocus()
    expect(screen.queryByText('3 to 24 characters')).not.toBeInTheDocument()
  })

  it('I’m new opens account creation with the code kept', async () => {
    setup('?classCode=ROOM-42')
    fireEvent.click(await screen.findByRole('button', { name: 'I’m new' }, { timeout: 2000 }))
    expect(screen.getByRole('heading', { name: 'Join your class' })).toBeInTheDocument()
    expect(screen.getByLabelText('Class code')).toHaveValue('ROOM-42')
    expect(screen.getByRole('button', { name: 'Create account and join' })).toBeInTheDocument()
    expect(screen.getByText('Studio 5')).toBeInTheDocument()
  })

  it('signs a returning student in from a tapped name', async () => {
    const { onNavigate, fetcher } = setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/login' ? json(studentAuth) : undefined))
    const grid = await screen.findByRole('list', { name: 'Tap your name, then type your password.' }, { timeout: 2000 })
    fireEvent.click(within(grid).getByRole('button', { name: /Ben K\./ }))
    type('Ben K., type your password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/worlds'))
    const login = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => String(url).endsWith('/auth/login'))!
    expect(JSON.parse(String((login[1] as RequestInit).body))).toEqual({ username: 'ben_k', password: 'brick tower', classCode: 'ROOM-42' })
  })

  it('hides I’m new when the class is not taking new accounts', async () => {
    setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/roster' ? json({ ...roster, canEnroll: false }) : undefined))
    await screen.findByRole('list', { name: 'Tap your name, then type your password.' }, { timeout: 2000 })
    expect(screen.queryByRole('button', { name: 'I’m new' })).not.toBeInTheDocument()
  })

  it('falls back to account creation when the class shows no names', async () => {
    setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/roster' ? json({ ...roster, showNames: false, students: [] }) : undefined))
    expect(await screen.findByRole('button', { name: 'Create account and join' }, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Join your class' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Tap your name, then type your password.' })).not.toBeInTheDocument()
  })

  it('falls back to account creation for a brand-new class with nobody in it yet', async () => {
    setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/roster' ? json({ ...roster, students: [] }) : undefined))
    expect(await screen.findByRole('button', { name: 'Create account and join' }, { timeout: 2000 })).toBeInTheDocument()
  })

  it('falls back to sign-in when the class shows no names and is not taking new accounts', async () => {
    setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/roster' ? json({ ...roster, canEnroll: false, showNames: false, students: [] }) : undefined))
    expect(await screen.findByRole('button', { name: 'Sign in' }, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create account and join' })).not.toBeInTheDocument()
  })

  it('shows sign-in with the code to fix when the code is wrong, then the names once it is right', async () => {
    setup('?classCode=ROOM-24', fakeApi((path, body) => path !== '/auth/roster' ? undefined
      : body.classCode === 'ROOM-42' ? json(roster) : json({ error: 'Class not found.', code: 'class_not_found' }, 404)))
    expect(await screen.findByText('Check the class code with your teacher.', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    type('Class code', 'ROOM-42')
    expect(await screen.findByRole('list', { name: 'Tap your name, then type your password.' }, { timeout: 2000 })).toBeInTheDocument()
  })

  it('keeps sign-in open when the class list cannot load', async () => {
    setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/roster' ? json({ error: 'Down.', code: 'internal_error' }, 500) : undefined))
    expect(await screen.findByText('The class list could not load right now. You can still sign in.', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('an explicit mode=join link still opens account creation straight away', () => {
    setup('?mode=join&classCode=ROOM-42')
    expect(screen.getByRole('button', { name: 'Create account and join' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('/join — new student', () => {
  it('asks for the class code first and names the class once it resolves', async () => {
    setup('')
    expect(screen.getByRole('heading', { name: 'Join your class' })).toBeInTheDocument()
    type('Class code', 'room-42')
    expect(await screen.findByText('Studio 5', {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('prefills the code from an invite link', async () => {
    setup('?classCode=room-42')
    expect(screen.getByLabelText('Class code')).toHaveValue('ROOM-42')
    expect(await screen.findByText('Studio 5', {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('turns each username and password rule green or red as the student types', () => {
    setup('')
    for (const label of ['3 to 24 characters', 'Letters, numbers, _ or - only', 'Starts with a letter or number', 'No spaces']) {
      expect(rule(label)).toHaveClass('join-rule-pending')
    }
    type('Choose a username', '_sky builder')
    expect(rule('Starts with a letter or number')).toHaveClass('join-rule-bad')
    expect(rule('No spaces')).toHaveClass('join-rule-bad')
    type('Choose a username', 'sky_builder')
    for (const label of ['3 to 24 characters', 'Letters, numbers, _ or - only', 'Starts with a letter or number', 'No spaces']) {
      expect(rule(label)).toHaveClass('join-rule-ok')
    }
    type('Choose a password', 'sky_builder')
    expect(rule('Different from your username')).toHaveClass('join-rule-bad')
    type('Choose a password', 'password')
    expect(rule('Not an easy-to-guess password')).toHaveClass('join-rule-bad')
    type('Choose a password', 'brick tower')
    for (const label of ['At least 6 characters', 'Different from your username', 'Not an easy-to-guess password']) {
      expect(rule(label)).toHaveClass('join-rule-ok')
    }
  })

  it('says what is still missing while Create account is greyed out', () => {
    setup('?mode=join&classCode=ROOM-42')
    const submit = screen.getByRole('button', { name: 'Create account and join' })
    expect(screen.queryByText(/^Still needed:/)).not.toBeInTheDocument()
    type('Choose a username', 'sky_builder')
    type('Choose a password', 'brick tower')
    expect(submit).toBeDisabled()
    expect(submit).toHaveAccessibleDescription('Still needed: the name your teacher knows.')
    type('Choose a username', 'sky builder')
    type('Choose a password', '123')
    expect(screen.getByText(/^Still needed:/)).toHaveTextContent('Still needed: the name your teacher knows, a username that follows the rules and a password that follows the rules.')
    type('Choose a username', 'sky_builder')
    type('Choose a password', 'brick tower')
    type('Name your teacher knows', 'Alex Rivera')
    expect(submit).toBeEnabled()
    expect(screen.queryByText(/^Still needed:/)).not.toBeInTheDocument()
  })

  it('names a missing class code too', () => {
    setup('?mode=join')
    type('Name your teacher knows', 'Alex Rivera')
    expect(screen.getByText(/^Still needed:/)).toHaveTextContent('Still needed: your class code, a username and a password.')
  })

  it('keeps the primary action disabled until every rule is green', () => {
    setup('?mode=join&classCode=ROOM-42')
    const submit = screen.getByRole('button', { name: 'Create account and join' })
    expect(submit).toBeDisabled()
    type('Choose a username', 'sky_builder')
    type('Name your teacher knows', 'Alex Rivera')
    type('Choose a password', '12345')
    expect(submit).toBeDisabled()
    type('Choose a password', 'brick tower')
    expect(submit).toBeEnabled()
  })

  it('offers the server’s free usernames as tap-to-fill chips after username_taken', async () => {
    setup('?mode=join&classCode=ROOM-42', fakeApi(path => path === '/auth/register'
      ? json({ error: 'That username is taken.', code: 'username_taken', suggestions: ['sky_builder2', 'sky_builder_r'] }, 409)
      : undefined))
    type('Choose a username', 'sky_builder')
    type('Name your teacher knows', 'Alex Rivera')
    type('Choose a password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone already has that username.')
    fireEvent.click(screen.getByRole('button', { name: 'sky_builder2' }))
    expect(screen.getByLabelText('Choose a username')).toHaveValue('sky_builder2')
  })

  it('says what to change when the class is not taking new accounts', async () => {
    setup('?mode=join&classCode=ROOM-42', fakeApi(path => path === '/auth/register'
      ? json({ error: 'Enrollment is closed.', code: 'enrollment_closed' }, 403)
      : undefined))
    type('Choose a username', 'sky_builder')
    type('Name your teacher knows', 'Alex Rivera')
    type('Choose a password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not taking new accounts right now')
  })

  it('sends the enrollment and opens the student’s worlds', async () => {
    const { onNavigate, fetcher } = setup('?mode=join&classCode=ROOM-42', fakeApi(path => path === '/auth/register' ? json(studentAuth) : undefined))
    type('Choose a username', 'sky_builder')
    type('Name your teacher knows', 'Alex Rivera')
    type('Choose a password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/worlds'))
    const register = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => String(url).endsWith('/auth/register'))!
    expect(JSON.parse(String((register[1] as RequestInit).body))).toEqual({ classCode: 'ROOM-42', username: 'sky_builder', rosterName: 'Alex Rivera', password: 'brick tower' })
    expect(JSON.parse(localStorage.getItem('brickgineers.last-class.v1')!)).toEqual({ code: 'ROOM-42', name: 'Studio 5' })
  })

  it('returns to the page the link asked for', async () => {
    const { onNavigate } = setup('?mode=join&classCode=ROOM-42&next=/build', fakeApi(path => path === '/auth/register' ? json(studentAuth) : undefined))
    type('Choose a username', 'sky_builder')
    type('Name your teacher knows', 'Alex Rivera')
    type('Choose a password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/build'))
  })
})

describe('/join?mode=signin — returning student', () => {
  it('asks for a username and password only', () => {
    setup('?mode=signin')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.queryByLabelText('Class code')).not.toBeInTheDocument()
    expect(screen.queryByText('3 to 24 characters')).not.toBeInTheDocument()
  })

  it('reveals the code field and the tap-your-name grid', async () => {
    setup('?mode=signin')
    fireEvent.click(screen.getByRole('button', { name: 'I have a class code' }))
    type('Class code', 'ROOM-42')
    expect(await screen.findByText('Studio 5', {}, { timeout: 2000 })).toBeInTheDocument()
    const grid = screen.getByRole('list', { name: 'Tap your name, then type your password.' })
    expect(within(grid).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(within(grid).getByRole('button', { name: /Ben K\./ }))
    expect(screen.getByLabelText('Username')).toHaveValue('ben_k')
    expect(screen.getByLabelText('Ben K., type your password')).toHaveFocus()
  })

  it('greets a remembered class and lets the student change it', async () => {
    localStorage.setItem('brickgineers.last-class.v1', JSON.stringify({ code: 'ROOM-42', name: 'Studio 5' }))
    setup('?mode=signin')
    expect(screen.getByLabelText('Class code')).toHaveValue('ROOM-42')
    expect(await screen.findByText('Studio 5', {}, { timeout: 2000 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Not you? Change class' }))
    expect(localStorage.getItem('brickgineers.last-class.v1')).toBeNull()
    expect(screen.getByLabelText('Class code')).toHaveValue('')
  })

  it('shows the class code field with the reason when two accounts share a username', async () => {
    setup('?mode=signin', fakeApi(path => path === '/auth/login'
      ? json({ error: 'Class code required.', code: 'class_code_required' }, 409)
      : undefined))
    type('Username', 'sky_builder')
    type('Password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Two accounts use that username.')
    expect(screen.getByLabelText('Class code')).toBeInTheDocument()
    expect(screen.getByText('Two accounts use this username. Your class code picks yours.')).toBeInTheDocument()
  })

  it('explains a wrong password instead of showing a code', async () => {
    setup('?mode=signin', fakeApi(path => path === '/auth/login'
      ? json({ error: 'Invalid credentials.', code: 'invalid_credentials' }, 401)
      : undefined))
    type('Username', 'sky_builder')
    type('Password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('do not go together')
  })
})

describe('/join?mode=teacher', () => {
  it('leads with Google and keeps email and password behind a disclosure', async () => {
    const { onNavigate } = setup('?mode=teacher', fakeApi(path => path === '/auth/teacher-google-start'
      ? json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=x' })
      : undefined))
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use email and password' }))
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=x'))
  })

  it('signs a teacher in with email and password and opens the class', async () => {
    const { onNavigate } = setup('?mode=teacher', fakeApi(path => path === '/auth/teacher-login' ? json(teacherAuth) : undefined))
    fireEvent.click(screen.getByRole('button', { name: 'Use email and password' }))
    type('Email', 'carter@school.example')
    type('Password', 'teacher pass')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/class'))
  })
})

describe('/join on a shared device — someone is still signed in', () => {
  /** What another kid may have left on this device: guest drafts and a tab's recovery copy. */
  const seedDeviceWork = () => {
    localStorage.setItem('brick-studio.current-project.v1', JSON.stringify({ version: 1, bricks: [{ id: 'kept' }] }))
    localStorage.setItem('brick-studio.platformer-drafts.v1', '[{"id":"d1","title":"Jumps"}]')
    sessionStorage.setItem('brick-studio.cloud-recovery.s1.w1', '{"unsaved":true}')
  }
  const deviceWork = () => [
    localStorage.getItem('brick-studio.current-project.v1'),
    localStorage.getItem('brick-studio.platformer-drafts.v1'),
    sessionStorage.getItem('brick-studio.cloud-recovery.s1.w1'),
  ]

  it('asks “Are you …?” before opening that account when a class code came with the link', async () => {
    const { onNavigate } = setup('?classCode=ROOM-42', fakeApi(), studentAuth)
    expect(screen.getByRole('heading', { name: 'Are you Alex R.?' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Tap your name, then type your password.' })).not.toBeInTheDocument()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, that’s me' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/worlds'))
  })

  it('Not me signs that account out and shows this class’s names, leaving work on the device alone', async () => {
    seedDeviceWork()
    const before = deviceWork()
    const { client, onNavigate, fetcher } = setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/logout' ? json({ ok: true }) : undefined), studentAuth)
    fireEvent.click(screen.getByRole('button', { name: 'Not me' }))
    expect(await screen.findByRole('list', { name: 'Tap your name, then type your password.' }, { timeout: 2000 })).toBeInTheDocument()
    expect(client.getSession()).toBeNull()
    expect((fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => String(url).endsWith('/auth/logout'))).toBe(true)
    expect(deviceWork()).toEqual(before)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('Not me still signs out on this device when the server cannot be reached', async () => {
    const { client } = setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/logout' ? json({ error: 'Down.', code: 'internal_error' }, 500) : undefined), studentAuth)
    fireEvent.click(screen.getByRole('button', { name: 'Not me' }))
    expect(await screen.findByRole('list', { name: 'Tap your name, then type your password.' }, { timeout: 2000 })).toBeInTheDocument()
    expect(client.getSession()).toBeNull()
  })

  it('the next kid can sign in after Not me', async () => {
    const other: ClassroomAuthResult = { ...studentAuth, user: { ...studentAuth.user, id: 's2', username: 'mia_t', rosterName: 'Mia Torres' } }
    const { onNavigate } = setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/logout' ? json({ ok: true }) : path === '/auth/login' ? json(other) : undefined), studentAuth)
    fireEvent.click(screen.getByRole('button', { name: 'Not me' }))
    const grid = await screen.findByRole('list', { name: 'Tap your name, then type your password.' }, { timeout: 2000 })
    fireEvent.click(within(grid).getByRole('button', { name: /Mia T\./ }))
    type('Mia T., type your password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/worlds'))
  })

  it('without a class code, a signed-in account goes straight on', async () => {
    const { onNavigate } = setup('?mode=signin', fakeApi(), studentAuth)
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/worlds'))
    expect(screen.queryByRole('heading', { name: /Are you/ })).not.toBeInTheDocument()
  })
})

describe('/join leaves no bounce in Back', () => {
  // jsdom implements fragment navigations: `assign` adds a history entry, `replace` does not.
  const hereWith = (hash: string) => `${window.location.pathname}${window.location.search}${hash}`

  it('replaces itself when it sends a signed-in account on, so Back does not land on /join again', async () => {
    const client = new ClassroomClient('', fakeApi())
    client.setSession(studentAuth)
    const before = window.history.length
    const next = hereWith('#opened-projects')
    render(<JoinExperience client={client} search={`?mode=signin&next=${encodeURIComponent(next)}`} />)
    await waitFor(() => expect(window.location.hash).toBe('#opened-projects'))
    expect(window.history.length).toBe(before)
  })

  it('replaces itself after a successful sign-in too', async () => {
    const client = new ClassroomClient('', fakeApi(path => path === '/auth/login' ? json(studentAuth) : undefined))
    const before = window.history.length
    const next = hereWith('#signed-in')
    render(<JoinExperience client={client} search={`?mode=signin&next=${encodeURIComponent(next)}`} />)
    type('Username', 'sky_builder')
    type('Password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(window.location.hash).toBe('#signed-in'))
    expect(window.history.length).toBe(before)
  })
})

describe('/join — everywhere', () => {
  it('keeps guest building one link away in every mode', () => {
    setup('')
    for (const next of ['I already have an account', 'I’m a teacher']) {
      expect(screen.getByRole('link', { name: 'Keep building as a guest' })).toHaveAttribute('href', '/build')
      fireEvent.click(screen.getByRole('button', { name: next }))
    }
    expect(screen.getByRole('link', { name: 'Keep building as a guest' })).toHaveAttribute('href', '/build')
  })

  it('switches to sign-in from the corner link', () => {
    setup('')
    fireEvent.click(screen.getByRole('button', { name: 'I already have an account' }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New here? Join a class' })).toBeInTheDocument()
  })

  it('checks the new password rules and the match live on the reset view', () => {
    setup('?mode=signin', fakeApi(), { ...studentAuth, user: { ...studentAuth.user, resetRequired: true } })
    const rules = screen.getByRole('list', { name: 'New password rules' })
    for (const item of within(rules).getAllByRole('listitem')) expect(item).toHaveClass('join-rule-pending')
    type('New password', 'sky_builder')
    expect(rule('Different from your username')).toHaveClass('join-rule-bad')
    type('New password', 'password')
    expect(rule('Not an easy-to-guess password')).toHaveClass('join-rule-bad')
    type('New password', 'brick tower')
    type('Repeat new password', 'brick towel')
    expect(rule('Both passwords match')).toHaveClass('join-rule-bad')
    type('Repeat new password', 'brick tower')
    for (const label of ['At least 6 characters', 'Different from your username', 'Not an easy-to-guess password', 'Both passwords match']) {
      expect(rule(label)).toHaveClass('join-rule-ok')
    }
  })

  it('sends an account whose password was reset to the inline reset view, not to a page', async () => {
    const { onNavigate } = setup('?mode=signin', fakeApi(path => path === '/auth/change-password' ? json(studentAuth) : undefined), { ...studentAuth, user: { ...studentAuth.user, resetRequired: true } })
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(onNavigate).not.toHaveBeenCalled()
    type('New password', 'brick tower')
    type('Repeat new password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Set my new password' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/worlds'))
  })

  it('never follows a next that leaves this app', async () => {
    const { onNavigate } = setup('?mode=signin&next=https://example.com/steal', fakeApi(path => path === '/auth/login' ? json(studentAuth) : undefined))
    type('Username', 'sky_builder')
    type('Password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/worlds'))
  })
})
