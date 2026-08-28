import { describe, expect, it } from 'vitest'
import { LIVE_MAX_DISPLAY_NAME_LENGTH } from '../liveProtocol'
import { LIVE_PROFILE_STORAGE_KEY, loadStoredLiveProfile, saveStoredLiveProfile } from './liveProfile'

function memoryStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

describe('stored live profile', () => {
  it('round-trips a normalized profile', () => {
    const storage = memoryStorage()
    saveStoredLiveProfile({ displayName: '  Maya   B ', characterId: 'toy-figure' }, storage)
    expect(loadStoredLiveProfile(storage)).toEqual({ displayName: 'Maya B', characterId: 'toy-figure' })
  })

  it('omits blank character ids', () => {
    const storage = memoryStorage()
    saveStoredLiveProfile({ displayName: 'Maya', characterId: '  ' }, storage)
    expect(loadStoredLiveProfile(storage)).toEqual({ displayName: 'Maya' })
  })

  it('reads damaged or empty data as null', () => {
    expect(loadStoredLiveProfile(memoryStorage())).toBeNull()
    expect(loadStoredLiveProfile(memoryStorage({ [LIVE_PROFILE_STORAGE_KEY]: 'Legacy Builder' }))).toEqual({ displayName: 'Legacy Builder' })
    expect(loadStoredLiveProfile(memoryStorage({ [LIVE_PROFILE_STORAGE_KEY]: '   ' }))).toBeNull()
    expect(loadStoredLiveProfile(memoryStorage({ [LIVE_PROFILE_STORAGE_KEY]: JSON.stringify({ displayName: '   ' }) }))).toBeNull()
    expect(loadStoredLiveProfile(undefined)).toBeNull()
  })

  it('clamps oversized names on save', () => {
    const storage = memoryStorage()
    saveStoredLiveProfile({ displayName: 'x'.repeat(LIVE_MAX_DISPLAY_NAME_LENGTH + 30) }, storage)
    expect(loadStoredLiveProfile(storage)?.displayName).toHaveLength(LIVE_MAX_DISPLAY_NAME_LENGTH)
  })

  it('never throws when storage is blocked', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(() => saveStoredLiveProfile({ displayName: 'Maya' }, blocked)).not.toThrow()
    expect(loadStoredLiveProfile(blocked)).toBeNull()
  })
})
