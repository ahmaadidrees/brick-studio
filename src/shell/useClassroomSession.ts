import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { browserClassroomClient } from '../classroom/client'
import type { ClassroomAuthResult, ClassroomClass, ClassroomMe, ClassroomUser } from '../classroom/contracts'
import { currentPath, goToJoin, type Navigate } from './navigation'
import { clearRememberedTeacherClass } from './rememberedTeacherClass'

/** The slice of `ClassroomClient` the hook needs (tests pass a stub). */
export type ClassroomSessionClient = {
  getSession: () => ClassroomAuthResult | null
  subscribe: (listener: () => void) => () => void
  request: <T>(path: string, method?: string, body?: unknown, retry?: boolean) => Promise<T>
  signOut: () => Promise<void>
}

export type ClassroomSessionStatus = 'loading' | 'guest' | 'student' | 'teacher'

export type ClassroomSessionState = {
  /**
   * `guest` = no stored session; `student`/`teacher` = the stored session's
   * role; `loading` = a sign-out or account switch is in flight (the chip
   * shows a spinner and stays put, no flash of "Sign in").
   */
  status: ClassroomSessionStatus
  user?: ClassroomUser
  /** The signed-in account's classes (a student has one; a teacher may have several). */
  classes?: ClassroomClass[]
  /** Context line for students: their class name. Undefined for guests and teachers. */
  className?: string
  /** "Ava R." — first name plus last initial, the same rule the roster uses. */
  displayName?: string
  /** Ends the session on the server and locally; the page stays where it is. */
  signOut: () => Promise<void>
  /** Signs out, then opens `/join` in sign-in mode with `next` set to this page. */
  switchAccount: () => Promise<void>
}

/** First word of the roster name plus the last initial ("Ava R."); one-word names stay as they are. */
export function displayNameFor(user: Pick<ClassroomUser, 'rosterName' | 'username'>): string {
  const words = user.rosterName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return user.username
  if (words.length === 1) return words[0]
  return `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`
}

type Verified = { userId: string; me: ClassroomMe }

// One `me` refresh per account per page load, shared by every hook instance
// (header + page), keyed by the client so tests with stubs never collide.
const refreshes = new WeakMap<object, Map<string, Promise<ClassroomMe | null>>>()

function refreshMe(client: ClassroomSessionClient, userId: string): Promise<ClassroomMe | null> {
  let byUser = refreshes.get(client)
  if (!byUser) { byUser = new Map(); refreshes.set(client, byUser) }
  let pending = byUser.get(userId)
  if (!pending) {
    // A failed refresh keeps the stored session (the client already clears a
    // revoked login on 401); it is retried on the next mount.
    pending = client.request<ClassroomMe>('/me').catch(() => null).then((me) => { if (!me) byUser?.delete(userId); return me })
    byUser.set(userId, pending)
  }
  return pending
}

/** Test hook: forget cached refreshes for a client. */
export function resetClassroomSessionCache(client: object = browserClassroomClient) {
  refreshes.delete(client)
}

/**
 * The signed-in account as the header and pages see it. Reads the same
 * session the classroom client stores (`brick-studio.classroom-session.v1`,
 * no new keys), re-renders when the client publishes a change (sign-in,
 * sign-out, a revoked token), and refreshes the account once per page load
 * through the existing `GET /classroom/me` call. No polling.
 */
export function useClassroomSession(client: ClassroomSessionClient = browserClassroomClient, navigate?: Navigate): ClassroomSessionState {
  const session = useSyncExternalStore(client.subscribe, client.getSession, client.getSession)
  const [verified, setVerified] = useState<Verified | null>(null)
  const [busy, setBusy] = useState(false)
  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void refreshMe(client, userId).then((me) => {
      if (!cancelled && me) setVerified({ userId, me })
    })
    return () => { cancelled = true }
  }, [client, userId])

  const signOut = useCallback(async () => {
    setBusy(true)
    // The remembered class belongs to the account that is leaving, so it goes
    // with the session (switchAccount signs out first and is covered too).
    clearRememberedTeacherClass()
    try { await client.signOut() } catch { /* The client already dropped the local session. */ } finally { setBusy(false) }
  }, [client])

  const switchAccount = useCallback(async () => {
    const role = client.getSession()?.user.role
    await signOut()
    goToJoin({ mode: role === 'teacher' ? 'teacher' : 'signin', next: currentPath() }, navigate)
  }, [client, navigate, signOut])

  return useMemo<ClassroomSessionState>(() => {
    if (!session) return { status: busy ? 'loading' : 'guest', signOut, switchAccount }
    const me = verified?.userId === session.user.id ? verified.me : session
    const user = me.user
    const classes = me.classes ?? []
    return {
      status: busy ? 'loading' : user.role,
      user,
      classes,
      className: user.role === 'student' ? classes[0]?.name : undefined,
      displayName: displayNameFor(user),
      signOut,
      switchAccount,
    }
  }, [session, verified, busy, signOut, switchAccount])
}
