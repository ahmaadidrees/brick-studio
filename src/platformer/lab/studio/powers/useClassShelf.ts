import { useCallback, useEffect, useState } from 'react'
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

/**
 * The class shelf, for Code Lab: what is on it, sharing a power to it, and fetching one to snap on. Signed-out kids
 * (Code Lab works without an account) just see a note; nothing is fetched.
 */
export function useClassShelf(active: boolean, api: ShelfClient = browserShelf, sessionOverride?: ClassroomSessionState) {
  const live = useClassroomSession()
  const session = sessionOverride ?? live
  const classId = shelfClassId(session)
  const [state, setState] = useState<ClassShelfState>({ kind: classId ? 'loading' : 'signed-out' })
  const reload = useCallback(async () => {
    if (!classId) return setState({ kind: 'signed-out' })
    setState((s) => (s.kind === 'ready' ? s : { kind: 'loading' }))
    try {
      setState({ kind: 'ready', classId, shelf: await api.list(classId) })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'The class shelf could not load.' })
    }
  }, [api, classId])
  useEffect(() => { if (active) void reload() }, [active, reload])

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
