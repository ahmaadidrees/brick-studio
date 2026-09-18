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

  it('keeps the primary action disabled until every rule is green', () => {
    setup('?classCode=ROOM-42')
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
    setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/register'
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
    setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/register'
      ? json({ error: 'Enrollment is closed.', code: 'enrollment_closed' }, 403)
      : undefined))
    type('Choose a username', 'sky_builder')
    type('Name your teacher knows', 'Alex Rivera')
    type('Choose a password', 'brick tower')
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not taking new accounts right now')
  })

  it('sends the enrollment and opens the student’s worlds', async () => {
    const { onNavigate, fetcher } = setup('?classCode=ROOM-42', fakeApi(path => path === '/auth/register' ? json(studentAuth) : undefined))
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
    const { onNavigate } = setup('?classCode=ROOM-42&next=/build', fakeApi(path => path === '/auth/register' ? json(studentAuth) : undefined))
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
