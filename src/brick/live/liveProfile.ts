import type { PlayerProfile } from '../types'
import { normalizeDisplayName } from './liveRoomModel'

export const LIVE_PROFILE_STORAGE_KEY = 'brick-studio.live-profile.v1'

type ProfileStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): ProfileStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** Last profile the player joined with, so rejoining a classroom room is one tap. Absent or damaged data reads as null. */
export function loadStoredLiveProfile(storage: ProfileStorage | undefined = defaultStorage()): PlayerProfile | null {
  try {
    const serialized = storage?.getItem(LIVE_PROFILE_STORAGE_KEY)
    if (!serialized) return null
    const parsed: unknown = JSON.parse(serialized)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    const displayName = normalizeDisplayName(typeof record.displayName === 'string' ? record.displayName : '')
    if (!displayName) return null
    const characterId = typeof record.characterId === 'string' && record.characterId.trim() ? record.characterId : undefined
    return characterId ? { displayName, characterId } : { displayName }
  } catch {
    return null
  }
}

/** Best-effort save; storage being blocked never interrupts joining a room. */
export function saveStoredLiveProfile(
  profile: PlayerProfile,
  storage: ProfileStorage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(LIVE_PROFILE_STORAGE_KEY, JSON.stringify({
      displayName: normalizeDisplayName(profile.displayName),
      ...(profile.characterId ? { characterId: profile.characterId } : {}),
    }))
  } catch {
    /* Joining still works without a remembered name. */
  }
}
