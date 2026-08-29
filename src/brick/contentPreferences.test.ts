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
    })
  })

  it('falls back safely when storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(loadCharacterPreferences(storage)).toEqual({ characterId: 'classic', palette: {} })
    expect(saveCharacterPreferences({ characterId: 'classic', palette: {} }, storage)).toBe(false)
  })

  it('uses the versioned storage key', () => {
    expect(CONTENT_PREFERENCES_STORAGE_KEY).toBe('brick-studio.content-preferences.v1')
  })
})

