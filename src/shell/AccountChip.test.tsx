import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountChip } from './AccountChip'
import type { ClassroomSessionState } from './useClassroomSession'

afterEach(cleanup)

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
    expect(menuItems()).toEqual(['My worlds', 'My class', 'Switch account', 'Sign out'])
    expect(screen.getByRole('menuitem', { name: 'My worlds' })).toHaveAttribute('href', '/worlds')
    expect(screen.getByRole('menuitem', { name: 'My class' })).toHaveAttribute('href', '/worlds?view=class')
  })

  it('students in the editor get Save this build to my account only when the callback exists', () => {
    const onSaveToAccount = vi.fn()
    render(<AccountChip session={student} context="editor" onSaveToAccount={onSaveToAccount} />)
    fireEvent.click(screen.getByRole('button', { name: /^Account:/ }))
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
    expect(menuItems()).toEqual(['My class', 'My worlds', 'Show class code on projector', 'Switch account', 'Sign out'])
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
