import { describe, expect, it } from 'vitest'
import {
  BRICK_STUDIO_LIVE_PROFILE_KEY,
  createLiveGuestUrl,
  createLiveOwnerUrl,
  liveOwnerTokenFromHash,
  liveRoomIdFromPath,
  readSavedLiveDisplayName,
  saveLiveDisplayName,
} from './liveLinks'

describe('live world links', () => {
  it('keeps the owner capability in the URL fragment and out of guest links', () => {
    expect(createLiveGuestUrl('room / one', 'https://example.test')).toBe('https://example.test/live/room%20%2F%20one')
    const owner = createLiveOwnerUrl('room-one', 'secret-token', 'https://example.test')
    expect(owner).toBe('https://example.test/live/room-one#owner=secret-token')
    expect(new URL(owner).search).toBe('')
    expect(liveOwnerTokenFromHash(new URL(owner).hash)).toBe('secret-token')
  })

  it('parses valid live paths without throwing on damaged encoding', () => {
    expect(liveRoomIdFromPath('/live/abc123')).toBe('abc123')
    expect(liveRoomIdFromPath('/live/room%20one/')).toBe('room one')
    expect(liveRoomIdFromPath('/live/%E0%A4%A')).toBe('')
    expect(liveRoomIdFromPath('/race/abc123')).toBe('')
  })

  it('persists a profile-compatible display name and reads the legacy plain string', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    saveLiveDisplayName('  Ada Builder  ', storage)
    expect(values.get(BRICK_STUDIO_LIVE_PROFILE_KEY)).toBe(JSON.stringify({ displayName: 'Ada Builder' }))
    expect(readSavedLiveDisplayName(storage)).toBe('Ada Builder')
    values.set(BRICK_STUDIO_LIVE_PROFILE_KEY, 'Legacy Builder')
    expect(readSavedLiveDisplayName(storage)).toBe('Legacy Builder')
  })
})
