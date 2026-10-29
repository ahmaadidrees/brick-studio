import { useCallback, useEffect, useRef, useState } from 'react'
import { useClassroomSession, type ClassroomSessionState } from '../../../../shell'
import { readRememberedTeacherClass } from '../../../../shell/rememberedTeacherClass'
import { browserClassroomClient } from '../../../../classroom/client'
import { shelfClient, type ShelfClient, type ShelfList } from '../../../../classroom/shelfClient'
import { powerFromFile, powerToFile, type PowerBrick } from './powers'

export type ClassShelfState =
  | { kind: 'signed-out' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; classId: string; shelf: ShelfList }

/** The class whose shelf this account uses: a student's own class, or the class a teacher last looked at. */
export function shelfClassId(session: Pick<ClassroomSessionState, 'status' | 'classes'>): string | null {
  if (session.status !== 'student' && session.status !== 'teacher') return null
  const classes = session.classes ?? []
  if (session.status === 'teacher') {
    const remembered = readRememberedTeacherClass()
    return classes.find((c) => c.id === remembered)?.id ?? classes[0]?.id ?? null
  }
  return classes[0]?.id ?? null
}

const browserShelf = shelfClient(browserClassroomClient)

/** How often an open "+ Power" panel checks the class shelf again (so a teacher's OK shows up), while on screen. */
export const SHELF_PICKER_REFRESH_MS = 15_000

/**
 * The class shelf, for Code Lab: what is on it, sharing a power to it, and fetching one to snap on. Signed-out kids
 * (Code Lab works without an account) just see a note; nothing is fetched.
 */
export function useClassShelf(active: boolean, api: ShelfClient = browserShelf, sessionOverride?: ClassroomSessionState) {
  const live = useClassroomSession()
  const session = sessionOverride ?? live
  const classId = shelfClassId(session)
  // Whose shelf this is: another kid signing in on this device (same class) is a different shelf ("mine" differs).
  const account = classId ? `${session.user?.id ?? session.displayName ?? ''}|${classId}` : ''
  // What was loaded, and for whom. A shelf loaded for another account is never shown, not even for one render.
  const [loaded, setLoaded] = useState<{ account: string; state: ClassShelfState }>({ account, state: { kind: 'loading' } })
  const state: ClassShelfState = !classId ? { kind: 'signed-out' } : loaded.account === account ? loaded.state : { kind: 'loading' }
  // Every request takes a ticket; an answer older than the newest ticket is dropped (a newer check, another account,
  // or the panel closing since it was asked).
  const latest = useRef(0)

  /** Load the shelf. `quiet` (a background check) keeps the list on screen if it fails; the next check tries again. */
  const reload = useCallback(async (opts: { quiet?: boolean } = {}) => {
    if (!classId) return
    const ticket = ++latest.current
    setLoaded((s) => (s.account === account && s.state.kind === 'ready' ? s : { account, state: { kind: 'loading' } }))
    try {
      const shelf = await api.list(classId)
      if (ticket === latest.current) setLoaded({ account, state: { kind: 'ready', classId, shelf } })
    } catch (error) {
      if (ticket !== latest.current) return
      const message = error instanceof Error ? error.message : 'The class shelf could not load.'
      setLoaded((s) => (opts.quiet && s.account === account && s.state.kind === 'ready' ? s : { account, state: { kind: 'error', message } }))
    }
  }, [api, classId, account])
  // Another account: whatever is still on its way is for the old one.
  useEffect(() => () => { latest.current++ }, [account])
  useEffect(() => { if (active) void reload() }, [active, reload])
  // While the panel is open and on screen, check again now and then, and as soon as the page comes back.
  useEffect(() => {
    if (!active || !classId) return
    const check = () => { if (document.visibilityState === 'visible') void reload({ quiet: true }) }
    const timer = window.setInterval(check, SHELF_PICKER_REFRESH_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      latest.current++ // closing the panel drops any answer still on its way
    }
  }, [active, classId, reload])

  /** Share a power with the class. Returns whether it waits for the teacher. */
  const share = useCallback(async (power: PowerBrick): Promise<'waiting' | 'shared'> => {
    if (!classId) throw new Error('Sign in to share with your class.')
    const item = await api.share(classId, { name: power.name, what: power.what, payload: JSON.parse(powerToFile(power)) })
    void reload()
    return item.status === 'approved' ? 'shared' : 'waiting'
  }, [api, classId, reload])

  /** A power from the shelf, ready to snap on (and counted as used). Null when its file is not a power after all. */
  const fetchPower = useCallback(async (itemId: string): Promise<PowerBrick | null> => {
    if (!classId) return null
    const item = await api.get(classId, itemId)
    const power = powerFromFile(JSON.stringify(item.payload))
    if (power) void api.used(classId, itemId).catch(() => undefined)
    return power
  }, [api, classId])

  return { state, share, fetchPower, reload, signedIn: !!classId, displayName: session.displayName }
}
