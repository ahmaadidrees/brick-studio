import type { PlayerProfile } from '../types'
import { normalizeDisplayName } from './liveRoomModel'

export const LIVE_PROFILE_STORAGE_KEY = 'brick-studio.live-profile.v1'
export const LIVE_PROFILE_STORAGE_VERSION = 2 as const

const MAX_CHARACTER_ID_LENGTH = 64
const MAX_PALETTE_ENTRIES = 16
const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const PALETTE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const COLOR_PATTERN = /^#(?:[\da-f]{3}|[\da-f]{6})$/i

type ProfileStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): ProfileStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function normalizeCharacterId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const characterId = value.trim()
  return characterId.length <= MAX_CHARACTER_ID_LENGTH && PROFILE_ID_PATTERN.test(characterId)
    ? characterId
    : undefined
}

/**
 * Copies only the palette entries accepted by the live protocol. Keeping this
 * normalization beside local persistence prevents a damaged preference from
 * making an otherwise valid room join fail at the Worker boundary.
 */
export function normalizeLivePalette(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => (
      PALETTE_KEY_PATTERN.test(entry[0])
      && typeof entry[1] === 'string'
      && COLOR_PATTERN.test(entry[1])
    ))
    .slice(0, MAX_PALETTE_ENTRIES)
    .map(([key, color]) => [key, color.toLowerCase()] as const)
  return entries.length ? Object.fromEntries(entries) : undefined
}

/** Produces the minimal profile shape sent to and received from live rooms. */
export function normalizeLiveProfile(profile: PlayerProfile): PlayerProfile {
  const displayName = normalizeDisplayName(profile.displayName)
  const characterId = normalizeCharacterId(profile.characterId)
  const palette = normalizeLivePalette(profile.palette)
  return {
    displayName,
    ...(characterId ? { characterId } : {}),
    ...(palette ? { palette } : {}),
  }
}

/** Reuses the remembered character while replacing the gate-entered name. */
export function liveProfileWithDisplayName(
  displayName: string,
  storedProfile: PlayerProfile | null | undefined,
): PlayerProfile {
  return normalizeLiveProfile({
    displayName,
    ...(storedProfile?.characterId ? { characterId: storedProfile.characterId } : {}),
    ...(storedProfile?.palette ? { palette: storedProfile.palette } : {}),
  })
}

/** Last profile the player joined with, so rejoining a classroom room is one tap. Absent or damaged data reads as null. */
export function loadStoredLiveProfile(storage: ProfileStorage | undefined = defaultStorage()): PlayerProfile | null {
  try {
    const serialized = storage?.getItem(LIVE_PROFILE_STORAGE_KEY)
    if (!serialized) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(serialized)
    } catch {
      // The original launcher stored just the display name. Keep existing
      // builders remembered while migrating them to the JSON profile format.
      const displayName = normalizeDisplayName(serialized)
      return displayName ? { displayName } : null
    }
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    // The first JSON format had no explicit version. Accept it as a v1 value,
    // while rejecting unknown future versions we may not know how to interpret.
    if (record.version !== undefined
        && record.version !== 1
        && record.version !== LIVE_PROFILE_STORAGE_VERSION) return null
    const profile = normalizeLiveProfile({
      displayName: typeof record.displayName === 'string' ? record.displayName : '',
      ...(typeof record.characterId === 'string' ? { characterId: record.characterId } : {}),
      ...(typeof record.palette === 'object' && record.palette !== null
        ? { palette: record.palette as Record<string, string> }
        : {}),
    })
    return profile.displayName ? profile : null
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
    const normalized = normalizeLiveProfile(profile)
    storage?.setItem(LIVE_PROFILE_STORAGE_KEY, JSON.stringify({
      version: LIVE_PROFILE_STORAGE_VERSION,
      displayName: normalized.displayName,
      ...(normalized.characterId ? { characterId: normalized.characterId } : {}),
      ...(normalized.palette ? { palette: normalized.palette } : {}),
    }))
  } catch {
    /* Joining still works without a remembered name. */
  }
}
