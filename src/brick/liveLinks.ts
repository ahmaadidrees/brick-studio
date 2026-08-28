export const BRICK_STUDIO_LIVE_PROFILE_KEY = 'brick-studio.live-profile.v1'
export const LIVE_OWNER_HASH_KEY = 'owner'

export function liveRoomIdFromPath(pathname: string) {
  const match = pathname.match(/^\/live\/([^/]+)\/?$/)
  if (!match) return ''
  try { return decodeURIComponent(match[1]) } catch { return '' }
}

export function liveOwnerTokenFromHash(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, '')).get(LIVE_OWNER_HASH_KEY) ?? undefined
}

export function createLiveGuestUrl(roomId: string, origin = window.location.origin) {
  return new URL(`/live/${encodeURIComponent(roomId)}`, origin).toString()
}

export function createLiveOwnerUrl(roomId: string, ownerToken: string, origin = window.location.origin) {
  const url = new URL(createLiveGuestUrl(roomId, origin))
  url.hash = new URLSearchParams({ [LIVE_OWNER_HASH_KEY]: ownerToken }).toString()
  return url.toString()
}

export function readSavedLiveDisplayName(storage: Pick<Storage, 'getItem'> = window.localStorage) {
  try {
    const stored = storage.getItem(BRICK_STUDIO_LIVE_PROFILE_KEY)?.trim()
    if (!stored) return ''
    try {
      const parsed = JSON.parse(stored) as { displayName?: unknown }
      return typeof parsed?.displayName === 'string' ? parsed.displayName.trim() : ''
    } catch {
      // Migrate the original plain-string profile format on the next save.
      return stored
    }
  } catch {
    return ''
  }
}

export function saveLiveDisplayName(displayName: string, storage: Pick<Storage, 'setItem'> = window.localStorage) {
  try {
    storage.setItem(BRICK_STUDIO_LIVE_PROFILE_KEY, JSON.stringify({ displayName: displayName.trim() }))
  } catch { /* profile persistence is optional */ }
}
