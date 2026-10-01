import type { ClassroomWorld } from './contracts'
import { browserClassroomClient } from './client'

/**
 * Account-scoped local dismissals for the polite arrival notice. Later never removes the library entry.
 * Server invite records own the separate seen/joined state; ambiguous browser-wide v1 data is ignored.
 */
export const SEEN_INVITES_STORAGE_KEY = 'brickgineers.seen-invites.v2'
const LIMIT = 200
const accountId = () => browserClassroomClient.getSession()?.user.id ?? null
const keyFor = (userId: string) => `${SEEN_INVITES_STORAGE_KEY}:${encodeURIComponent(userId)}`

const read = (storage: Storage | undefined, userId: string | null): string[] => {
  if (!userId) return []
  try {
    // Never import v1: it cannot tell us which child dismissed an invite on a shared device.
    const raw = storage?.getItem(keyFor(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] }
}

const storageOf = () => { try { return globalThis.localStorage } catch { return undefined } }

export const seenInviteIds = (userId = accountId(), storage = storageOf()): Set<string> => new Set(read(storage, userId))

export function markInvitesSeen(ids: string[], userId = accountId(), storage = storageOf()) {
  if (!userId) return
  try {
    const next = [...new Set([...read(storage, userId), ...ids])].slice(-LIMIT)
    storage?.setItem(keyFor(userId), JSON.stringify(next))
  } catch { /* private mode: the banner simply shows again next time */ }
}

/** A world someone else invited the caller to (members-only, not owned by the caller). */
export const isInviteFor = (world: ClassroomWorld, userId: string | null | undefined) =>
  world.visibility === 'members' && world.ownerId !== userId

/** Invites the caller has not dismissed or joined yet, newest first. */
export function unseenInvites(worlds: ClassroomWorld[], userId: string | null | undefined, seen = seenInviteIds(userId ?? null)): ClassroomWorld[] {
  return worlds.filter(world => isInviteFor(world, userId) && !seen.has(world.id))
    .sort((a, b) => (b.sharedAt ?? b.updatedAt).localeCompare(a.sharedAt ?? a.updatedAt))
}
