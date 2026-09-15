import { DEFAULT_CHARACTER_APPEARANCE, normalizeCharacterAppearance } from '@brick-studio/core'
import { describe, expect, it } from 'vitest'
import {
  CONTENT_PREFERENCES_STORAGE_KEY,
  loadCharacterPreferences,
  saveCharacterPreferences,
} from './contentPreferences'

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next },
    read: () => value,
  }
}

describe('content preferences', () => {
  it('round-trips a character and its supported color slots', () => {
    const storage = memoryStorage()
    expect(saveCharacterPreferences({
      characterId: 'toy-figure',
      palette: { primary: '#e7473c', accent: '#FFD34E' },
    }, storage, 'sky-island')).toBe(true)

    expect(loadCharacterPreferences(storage)).toEqual({
      characterId: 'toy-figure',
      palette: { primary: '#e7473c', accent: '#FFD34E' },
      appearance: DEFAULT_CHARACTER_APPEARANCE,
    })
    expect(JSON.parse(storage.read() ?? '')).toMatchObject({
      environmentId: 'sky-island',
      characterId: 'toy-figure',
    })
  })

  it('ignores the saved environment and strips unsupported palette data', () => {
    const storage = memoryStorage(JSON.stringify({
      version: 1,
      environmentId: 'brick-valley',
      characterId: 'cc0-hero',
      palette: { primary: '#3e83d7', skin: '#abcdef', bad: 'red' },
    }))

    expect(loadCharacterPreferences(storage)).toEqual({
      characterId: 'cc0-hero',
      palette: { primary: '#3e83d7' },
      appearance: DEFAULT_CHARACTER_APPEARANCE,
    })
  })

  it('falls back safely when storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(loadCharacterPreferences(storage)).toEqual({ characterId: 'classic', palette: {}, appearance: DEFAULT_CHARACTER_APPEARANCE })
    expect(saveCharacterPreferences({ characterId: 'classic', palette: {} }, storage)).toBe(false)
  })

  it('uses the versioned storage key', () => {
    expect(CONTENT_PREFERENCES_STORAGE_KEY).toBe('brick-studio.content-preferences.v1')
  })
})


describe('appearance persistence', () => {
  it('round-trips all distinct cosmetic choices without treating them as palette slots', () => {
    const storage = memoryStorage()
    const appearance = normalizeCharacterAppearance({ body: 'broad', face: 'freckles', hair: 'bun', outfit: 'overalls', accessory: 'glasses', skinColor: '#945D40', hairColor: '#212121' })
    saveCharacterPreferences({ characterId: 'toy-figure', palette: {}, appearance }, storage)
    expect(loadCharacterPreferences(storage).appearance).toEqual(appearance)
    expect(loadCharacterPreferences(storage).palette).toEqual({})
  })
  it('normalizes malformed and obsolete choices and strips unknown data', () => {
    expect(normalizeCharacterAppearance({ body: 'giant', face: [], hair: 'curls', skinColor: 'url(evil)', hairColor: '#ABC', injected: true })).toEqual({ ...DEFAULT_CHARACTER_APPEARANCE, hair: 'curls', hairColor: '#abc' })
    expect(normalizeCharacterAppearance(null)).toEqual(DEFAULT_CHARACTER_APPEARANCE)
  })
})
