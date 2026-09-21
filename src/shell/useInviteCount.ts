import { useEffect, useState } from 'react'
import { browserClassroomClient } from '../classroom/client'
import type { ClassroomWorld } from '../classroom/contracts'
import { unseenInvites } from '../classroom/inviteSeen'
import type { ClassroomSessionState } from './useClassroomSession'

/** The slice of the classroom client the hook needs (tests pass a stub). */
export type InviteCountClient = { request: <T>(path: string) => Promise<T> }

/** One `GET /worlds` per account per minute, shared by every chip on the page (editor header, page header, menus). */
export const INVITE_COUNT_TTL_MS = 60_000

type CacheEntry = { userId: string; fetchedAt: number; worlds: ClassroomWorld[] | null; pending: Promise<ClassroomWorld[] | null> | null }
const cache = new WeakMap<object, CacheEntry>()

/** Test hook: forget the cached worlds for a client. */
export function resetInviteCountCache(client: object = browserClassroomClient) {
  cache.delete(client)
}

function loadWorlds(client: InviteCountClient, userId: string, now = Date.now()): Promise<ClassroomWorld[] | null> {
  const entry = cache.get(client)
  if (entry && entry.userId === userId) {
    if (entry.pending) return entry.pending
    if (entry.worlds && now - entry.fetchedAt < INVITE_COUNT_TTL_MS) return Promise.resolve(entry.worlds)
  }
  const next: CacheEntry = { userId, fetchedAt: now, worlds: entry?.userId === userId ? entry.worlds : null, pending: null }
  // Failures are silent: the badge simply stays hidden and the next mount after the TTL tries again.
  next.pending = client.request<{ worlds: ClassroomWorld[] }>('/worlds')
    .then(result => result.worlds, () => null)
    .then(worlds => {
      const current = cache.get(client)
      if (current === next) { next.pending = null; next.worlds = worlds ?? next.worlds; next.fetchedAt = worlds ? Date.now() : 0 }
      return worlds
    })
  cache.set(client, next)
  return next.pending
}

/**
 * How many classmate invites this student has not looked at yet ("Ahmaad invited you to build"). Students only:
 * teachers and guests never fetch. One request per account per minute across every mount, so the editor and the
 * pages do not refetch on every render of the account chip. Failures count as zero.
 */
export function useInviteCount(session: Pick<ClassroomSessionState, 'status' | 'user'>, client: InviteCountClient = browserClassroomClient): number {
  const userId = session.status === 'student' && session.user?.role === 'student' ? session.user.id : null
  const [state, setState] = useState<{ userId: string; count: number } | null>(null)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void loadWorlds(client, userId).then(worlds => {
      if (cancelled || !worlds) return
      setState({ userId, count: unseenInvites(worlds, userId).length })
    })
    return () => { cancelled = true }
  }, [client, userId])
  return userId && state?.userId === userId ? state.count : 0
}

/** "1 invite waiting" / "3 invites waiting"; empty when nothing is waiting. */
export function invitesWaitingLabel(count: number): string {
  if (count <= 0) return ''
  return `${count} ${count === 1 ? 'invite' : 'invites'} waiting`
}
