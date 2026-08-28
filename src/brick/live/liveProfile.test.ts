import { describe, expect, it } from 'vitest'
import { LIVE_MAX_DISPLAY_NAME_LENGTH } from '../liveProtocol'
import {
  LIVE_PROFILE_STORAGE_KEY,
  LIVE_PROFILE_STORAGE_VERSION,
  liveProfileWithDisplayName,
  loadStoredLiveProfile,
  normalizeLivePalette,
  saveStoredLiveProfile,
} from './liveProfile'

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
    saveStoredLiveProfile({
      displayName: '  Maya   B ',
      characterId: 'toy-figure',
      palette: { primary: '#E7473C', accent: '#ffd34e' },
    }, storage)
    expect(loadStoredLiveProfile(storage)).toEqual({
      displayName: 'Maya B',
      characterId: 'toy-figure',
      palette: { primary: '#e7473c', accent: '#ffd34e' },
    })
    expect(JSON.parse(storage.values.get(LIVE_PROFILE_STORAGE_KEY)!)).toEqual({
      version: LIVE_PROFILE_STORAGE_VERSION,
      displayName: 'Maya B',
      characterId: 'toy-figure',
      palette: { primary: '#e7473c', accent: '#ffd34e' },
    })
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
    expect(loadStoredLiveProfile(memoryStorage({ [LIVE_PROFILE_STORAGE_KEY]: JSON.stringify({ version: 99, displayName: 'Future' }) }))).toBeNull()
    expect(loadStoredLiveProfile(undefined)).toBeNull()
  })

  it('reads the unversioned JSON profile and filters palette damage', () => {
    const stored = JSON.stringify({
      displayName: 'Legacy JSON',
      characterId: 'toy-figure',
      palette: { primary: '#ABC', invalid: 'red', 'bad key': '#fff' },
    })
    expect(loadStoredLiveProfile(memoryStorage({ [LIVE_PROFILE_STORAGE_KEY]: stored }))).toEqual({
      displayName: 'Legacy JSON',
      characterId: 'toy-figure',
      palette: { primary: '#abc' },
    })
  })

  it('reuses the complete remembered avatar when the gate replaces its name', () => {
    const palette = { primary: '#e7473c' }
    expect(liveProfileWithDisplayName('  New Name ', {
      displayName: 'Old Name',
      characterId: 'cc0-hero',
      palette,
    })).toEqual({
      displayName: 'New Name',
      characterId: 'cc0-hero',
      palette,
    })
    expect(normalizeLivePalette({ good: '#FFF', bad: 'blue' })).toEqual({ good: '#fff' })
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
