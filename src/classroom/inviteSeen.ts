import type { ClassroomWorld } from './contracts'

/**
 * Which invites this browser has already surfaced ("Ahmaad invited you to build"): world ids the student
 * dismissed with Not now or joined. Per device on purpose, like the remembered class; nothing goes to the server.
 */
export const SEEN_INVITES_STORAGE_KEY = 'brickgineers.seen-invites.v1'
const LIMIT = 200

const read = (storage: Storage | undefined): string[] => {
  try {
    const raw = storage?.getItem(SEEN_INVITES_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] }
}

const storageOf = () => { try { return globalThis.localStorage } catch { return undefined } }

export const seenInviteIds = (storage = storageOf()): Set<string> => new Set(read(storage))

export function markInvitesSeen(ids: string[], storage = storageOf()) {
  try {
    const next = [...new Set([...read(storage), ...ids])].slice(-LIMIT)
    storage?.setItem(SEEN_INVITES_STORAGE_KEY, JSON.stringify(next))
  } catch { /* private mode: the banner simply shows again next time */ }
}

/** A world someone else invited the caller to (members-only, not owned by the caller). */
export const isInviteFor = (world: ClassroomWorld, userId: string | null | undefined) =>
  world.visibility === 'members' && world.ownerId !== userId

/** Invites the caller has not dismissed or joined yet, newest first. */
export function unseenInvites(worlds: ClassroomWorld[], userId: string | null | undefined, seen = seenInviteIds()): ClassroomWorld[] {
  return worlds.filter(world => isInviteFor(world, userId) && !seen.has(world.id))
    .sort((a, b) => (b.sharedAt ?? b.updatedAt).localeCompare(a.sharedAt ?? a.updatedAt))
}
