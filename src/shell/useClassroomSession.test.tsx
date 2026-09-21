import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClassroomAuthResult, ClassroomMe } from '../classroom/contracts'
import { displayNameFor, resetClassroomSessionCache, useClassroomSession, type ClassroomSessionClient } from './useClassroomSession'
import { readRememberedTeacherClass, REMEMBERED_TEACHER_CLASS_KEY } from './rememberedTeacherClass'

afterEach(() => { cleanup(); window.localStorage.clear() })

const student: ClassroomAuthResult = {
  user: { id: 'u1', username: 'ava', rosterName: 'Ava Rodriguez', role: 'student', resetRequired: false },
  classes: [{ id: 'c1', name: 'Period 2 — Builders', loginCode: 'AB7X', enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true, buildingNow: null, teacherName: null }],
  session: { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 },
}

function stubClient(initial: ClassroomAuthResult | null, me?: ClassroomMe | Error) {
  let auth = initial
  const listeners = new Set<() => void>()
  const client: ClassroomSessionClient & { set: (next: ClassroomAuthResult | null) => void } = {
    getSession: () => auth,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    request: vi.fn(async (path: string) => {
      if (path !== '/me') throw new Error(`unexpected ${path}`)
      if (me instanceof Error) throw me
      return (me ?? { user: auth!.user, classes: auth!.classes }) as never
    }),
    signOut: vi.fn(async () => { client.set(null) }),
    set: (next) => { auth = next; listeners.forEach((listener) => listener()) },
  }
  return client
}

describe('displayNameFor', () => {
  it('uses first name plus last initial, falling back to one word or the username', () => {
    expect(displayNameFor({ rosterName: 'Ava Rodriguez', username: 'ava' })).toBe('Ava R.')
    expect(displayNameFor({ rosterName: 'Ava Maria Rodriguez', username: 'ava' })).toBe('Ava R.')
    expect(displayNameFor({ rosterName: 'Ava', username: 'ava' })).toBe('Ava')
    expect(displayNameFor({ rosterName: '  ', username: 'ava_builds' })).toBe('ava_builds')
  })
})

describe('useClassroomSession', () => {
  it('is a guest with no stored session and never calls the server', () => {
    const client = stubClient(null)
    const { result } = renderHook(() => useClassroomSession(client))
    expect(result.current.status).toBe('guest')
    expect(result.current.user).toBeUndefined()
    expect(client.request).not.toHaveBeenCalled()
  })

  it('reports the stored student immediately, then refreshes once through /me', async () => {
    resetClassroomSessionCache()
    const refreshed: ClassroomMe = { user: { ...student.user, rosterName: 'Ava Ramirez' }, classes: [{ ...student.classes[0], name: 'Period 3 — Engineers' }] }
    const client = stubClient(student, refreshed)
    const { result } = renderHook(() => useClassroomSession(client))
    expect(result.current.status).toBe('student')
    expect(result.current.displayName).toBe('Ava R.')
    expect(result.current.className).toBe('Period 2 — Builders')
    await waitFor(() => expect(result.current.className).toBe('Period 3 — Engineers'))
    expect(client.request).toHaveBeenCalledTimes(1)
    expect(client.request).toHaveBeenCalledWith('/me')

    // A second hook instance for the same account shares the refresh.
    const second = renderHook(() => useClassroomSession(client))
    await waitFor(() => expect(second.result.current.className).toBe('Period 3 — Engineers'))
    expect(client.request).toHaveBeenCalledTimes(1)
  })

  it('keeps the stored session when the refresh fails', async () => {
    const client = stubClient(student, new Error('offline'))
    const { result } = renderHook(() => useClassroomSession(client))
    await waitFor(() => expect(client.request).toHaveBeenCalled())
    expect(result.current.status).toBe('student')
    expect(result.current.className).toBe('Period 2 — Builders')
  })

  it('reports teachers with no class name and follows session changes', () => {
    const teacher: ClassroomAuthResult = { ...student, user: { ...student.user, id: 't1', username: 'Teacher', rosterName: 'Teacher', role: 'teacher' } }
    const client = stubClient(teacher)
    const { result } = renderHook(() => useClassroomSession(client))
    expect(result.current.status).toBe('teacher')
    expect(result.current.className).toBeUndefined()
    act(() => client.set(null))
    expect(result.current.status).toBe('guest')
  })

  it('signOut ends the session and switchAccount goes to /join with next', async () => {
    const client = stubClient(student)
    const navigate = vi.fn()
    window.history.replaceState(null, '', '/worlds?view=class')
    const { result } = renderHook(() => useClassroomSession(client, navigate))
    await act(async () => { await result.current.switchAccount() })
    expect(client.signOut).toHaveBeenCalled()
    expect(result.current.status).toBe('guest')
    expect(navigate).toHaveBeenCalledWith('/join?mode=signin&next=%2Fworlds%3Fview%3Dclass')
  })

  it('forgets the remembered teacher class on sign-out, so the next account starts clean', async () => {
    window.localStorage.setItem(REMEMBERED_TEACHER_CLASS_KEY, JSON.stringify({ classId: 'class-2' }))
    const client = stubClient(student)
    const { result } = renderHook(() => useClassroomSession(client))
    await act(async () => { await result.current.signOut() })
    expect(readRememberedTeacherClass()).toBeNull()
  })

  it('forgets it on switchAccount too, which signs out first', async () => {
    window.localStorage.setItem(REMEMBERED_TEACHER_CLASS_KEY, JSON.stringify({ classId: 'class-2' }))
    const client = stubClient(student)
    const { result } = renderHook(() => useClassroomSession(client, vi.fn()))
    await act(async () => { await result.current.switchAccount() })
    expect(readRememberedTeacherClass()).toBeNull()
  })
})
