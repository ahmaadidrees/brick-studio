import { describe, expect, it } from 'vitest'
import { loadWardrobe, saveWardrobe, WARDROBE_STORAGE_KEY, type SavedOutfit } from './wardrobe'

describe('local wardrobe', () => {
  const outfit: SavedOutfit = { id: 'first', name: 'Explorer', characterId: 'toy-figure', palette: { primary: '#123abc' }, favorite: true }
  it('preserves outfits and favorites through storage and rejects oversized writes', () => {
    let value: string | null = null
    const storage = { getItem: () => value, setItem: (key: string, next: string) => { expect(key).toBe(WARDROBE_STORAGE_KEY); value = next } }
    expect(saveWardrobe([outfit], storage)).toBe(true)
    expect(loadWardrobe(storage)).toEqual([outfit])
    expect(saveWardrobe(Array(25).fill(outfit), storage)).toBe(false)
    expect(loadWardrobe(storage)).toEqual([outfit])
  })
  it('recovers safely from corrupt or unavailable storage', () => {
    expect(loadWardrobe({ getItem: () => '{', setItem: () => {} })).toEqual([])
    const unavailable = { getItem: () => { throw Error('blocked') }, setItem: () => { throw Error('full') } }
    expect(loadWardrobe(unavailable)).toEqual([])
    expect(saveWardrobe([outfit], unavailable)).toBe(false)
  })
})
