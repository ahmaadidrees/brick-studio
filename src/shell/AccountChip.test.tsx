import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountChip } from './AccountChip'
import type { ClassroomWorld } from '../classroom/contracts'
import { markInvitesSeen } from '../classroom/inviteSeen'
import type { ClassroomSessionState } from './useClassroomSession'
import { invitesWaitingLabel, resetInviteCountCache, useInviteCount } from './useInviteCount'

afterEach(() => { cleanup(); window.localStorage.clear() })

const base = { signOut: vi.fn(async () => undefined), switchAccount: vi.fn(async () => undefined) }
const guest: ClassroomSessionState = { status: 'guest', ...base }
const loading: ClassroomSessionState = { status: 'loading', ...base }
const studentUser = { id: 'u1', username: 'ava', rosterName: 'Ava Rodriguez', role: 'student' as const, resetRequired: false }
const student: ClassroomSessionState = { status: 'student', user: studentUser, classes: [], className: 'Period 2 — Builders', displayName: 'Ava R.', ...base }
const teacher: ClassroomSessionState = { status: 'teacher', user: { ...studentUser, id: 't1', username: 'Teacher', rosterName: 'Teacher', role: 'teacher' }, classes: [], displayName: 'Teacher', ...base }

function menuItems() {
  return within(screen.getByRole('menu', { name: 'Account' })).getAllByRole('menuitem').map((item) => document.getElementById(item.getAttribute('aria-labelledby')!)?.textContent)
}

describe('AccountChip', () => {
  it('signed out renders a quiet Sign in link to /join?mode=signin (no next on the landing)', () => {
    render(<AccountChip session={guest} context="landing" />)
    const link = screen.getByRole('link', { name: 'Sign in' })
    expect(link).toHaveAttribute('href', '/join?mode=signin')
    expect(link).toHaveClass('ui-button-quiet')
  })

  it('pages and the editor pass their location as next', () => {
    window.history.replaceState(null, '', '/build')
    render(<AccountChip session={guest} context="editor" />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/join?mode=signin&next=%2Fbuild')
  })

  it('shows a busy status while signing out', () => {
    render(<AccountChip session={loading} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('students see initial, name and class, and the student menu', () => {
    render(<AccountChip session={student} context="page" />)
    const trigger = screen.getByRole('button', { name: 'Account: Ava R., Period 2 — Builders' })
    expect(trigger).toHaveTextContent('A')
    expect(trigger).toHaveTextContent('Ava R.')
    expect(trigger).toHaveTextContent('Period 2 — Builders')
    fireEvent.click(trigger)
    expect(menuItems()).toEqual(['New build', 'My worlds', 'My class', 'Switch account', 'Sign out'])
    expect(screen.getByRole('menuitem', { name: 'New build' })).toHaveAttribute('href', '/build?new=1')
    expect(screen.getByRole('menuitem', { name: 'My worlds' })).toHaveAttribute('href', '/worlds')
    expect(screen.getByRole('menuitem', { name: 'My class' })).toHaveAttribute('href', '/worlds?view=class')
  })

  it('students in the editor get Save this build to my account only when the callback exists', () => {
    const onSaveToAccount = vi.fn()
    render(<AccountChip session={student} context="editor" onSaveToAccount={onSaveToAccount} />)
    fireEvent.click(screen.getByRole('button', { name: /^Account:/ }))
    // The editor keeps its own New build in the ⋯ menu, which resets in place.
    expect(menuItems()).toEqual(['My worlds', 'My class', 'Save this build to my account', 'Switch account', 'Sign out'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save this build to my account' }))
    expect(onSaveToAccount).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    cleanup()
    render(<AccountChip session={student} context="editor" />)
    fireEvent.click(screen.getByRole('button', { name: /^Account:/ }))
    expect(menuItems()).not.toContain('Save this build to my account')
  })

  it('teachers see the teacher menu with the projector entry', () => {
    render(<AccountChip session={teacher} context="page" />)
    const trigger = screen.getByRole('button', { name: 'Account: Teacher' })
    fireEvent.click(trigger)
    expect(menuItems()).toEqual(['New build', 'My class', 'My worlds', 'Show class code on projector', 'Switch account', 'Sign out'])
    expect(screen.getByRole('menuitem', { name: 'New build' })).toHaveAttribute('href', '/build?new=1')
    expect(screen.getByRole('menuitem', { name: 'My class' })).toHaveAttribute('href', '/class')
    expect(screen.getByRole('menuitem', { name: 'Show class code on projector' })).toHaveAttribute('href', '/class/projector')
  })

  it('Sign out and Switch account call the session', () => {
    const signOut = vi.fn(async () => undefined)
    const switchAccount = vi.fn(async () => undefined)
    render(<AccountChip session={{ ...student, signOut, switchAccount }} />)
    fireEvent.click(screen.getByRole('button', { name: /^Account:/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /^Account:/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch account' }))
    expect(switchAccount).toHaveBeenCalledTimes(1)
  })
})

describe('invite badge', () => {
  const invite = (id: string, ownerId = 'u2'): ClassroomWorld => ({ id, title: `World ${id}`, ownerId, classId: null, kind: 'personal', revision: 1, updatedAt: '2026-09-21T09:00:00Z', visibility: 'members', canEdit: true, classCanEdit: true, ownerName: 'Ben K.', ownerClassId: 'c1', sharedAt: '2026-09-21T09:00:00Z' })
  const own: ClassroomWorld = { ...invite('w-own', 'u1'), visibility: 'private', sharedAt: null }
  function stub(worlds: ClassroomWorld[] | Error) {
    const client = { request: vi.fn(async (path: string) => { if (worlds instanceof Error) throw worlds; return { worlds } as never }) }
    resetInviteCountCache(client)
    return client
  }

  it('shows a coral count on the avatar and "N invites waiting" on My worlds', () => {
    render(<AccountChip session={student} context="page" inviteCount={2} />)
    const trigger = screen.getByRole('button', { name: 'Account: Ava R., Period 2 — Builders, 2 invites waiting' })
    const badge = within(trigger).getByLabelText('2 invites waiting')
    expect(badge).toHaveClass('shell-account-badge')
    expect(badge).toHaveTextContent('2')
    fireEvent.click(trigger)
    const item = screen.getByRole('menuitem', { name: 'My worlds' })
    expect(document.getElementById(item.getAttribute('aria-describedby')!)).toHaveTextContent('2 invites waiting')
    expect(invitesWaitingLabel(1)).toBe('1 invite waiting')
    expect(invitesWaitingLabel(0)).toBe('')
  })

  it('keeps the plain chip and description when nothing is waiting', () => {
    render(<AccountChip session={student} context="page" inviteCount={0} />)
    const trigger = screen.getByRole('button', { name: 'Account: Ava R., Period 2 — Builders' })
    expect(trigger.querySelector('.shell-account-badge')).toBeNull()
    fireEvent.click(trigger)
    const item = screen.getByRole('menuitem', { name: 'My worlds' })
    expect(document.getElementById(item.getAttribute('aria-describedby')!)).toHaveTextContent('Your saved builds')
  })

  it('fetches /worlds once per student across mounts and counts only unseen invites', async () => {
    markInvitesSeen(['w-seen'])
    const client = stub([own, invite('w-new'), invite('w-seen'), { ...invite('w-class'), visibility: 'class' }])
    const first = renderHook(() => useInviteCount(student, client))
    await waitFor(() => expect(first.result.current).toBe(1))
    const second = renderHook(() => useInviteCount(student, client))
    await waitFor(() => expect(second.result.current).toBe(1))
    expect(client.request).toHaveBeenCalledTimes(1)
    expect(client.request).toHaveBeenCalledWith('/worlds')
  })

  it('never fetches for teachers or guests and stays at zero when the request fails', async () => {
    const client = stub([invite('w-new')])
    renderHook(() => useInviteCount(teacher, client))
    renderHook(() => useInviteCount(guest, client))
    await Promise.resolve()
    expect(client.request).not.toHaveBeenCalled()
    const failing = stub(new Error('offline'))
    const { result } = renderHook(() => useInviteCount(student, failing))
    await waitFor(() => expect(failing.request).toHaveBeenCalledTimes(1))
    expect(result.current).toBe(0)
  })
})
