import { normalizeCharacterAppearance } from '@brick-studio/core'
import { CHARACTER_DESCRIPTORS } from '../contentCatalog'
import type { CharacterPreferences } from '../contentPreferences'

export const WARDROBE_STORAGE_KEY = 'brick-studio.wardrobe.v1'
export const MAX_SAVED_OUTFITS = 24
export type SavedOutfit = CharacterPreferences & { id: string; name: string; favorite: boolean }
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
const hex = /^#(?:[\da-f]{3}|[\da-f]{6})$/i

/** Bounded local collection; a failed write leaves the prior collection untouched. */
export function saveWardrobe(outfits: SavedOutfit[], storage: StorageLike): boolean {
  try {
    if (outfits.length > MAX_SAVED_OUTFITS) return false
    storage.setItem(WARDROBE_STORAGE_KEY, JSON.stringify({ version: 1, outfits }))
    return true
  } catch { return false }
}

export function loadWardrobe(storage: StorageLike): SavedOutfit[] {
  try {
    const value = JSON.parse(storage.getItem(WARDROBE_STORAGE_KEY) ?? 'null')
    if (value?.version !== 1 || !Array.isArray(value.outfits)) return []
    const ids = new Set<string>()
    return value.outfits.slice(0, MAX_SAVED_OUTFITS).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return []
      const outfit = item as Record<string, unknown>
      if (typeof outfit.id !== 'string' || !outfit.id || ids.has(outfit.id)
        || typeof outfit.name !== 'string' || !outfit.name.trim()
        || !CHARACTER_DESCRIPTORS.some(item => item.id === outfit.characterId)) return []
      ids.add(outfit.id)
      const palette = Object.fromEntries(Object.entries(outfit.palette && typeof outfit.palette === 'object' ? outfit.palette : {})
        .filter(([key, color]) => ['primary', 'secondary', 'accent'].includes(key) && typeof color === 'string' && hex.test(color)))
      return [{ id: outfit.id.slice(0, 100), name: outfit.name.trim().slice(0, 40), characterId: outfit.characterId as SavedOutfit['characterId'], palette, ...(outfit.appearance ? { appearance: normalizeCharacterAppearance(outfit.appearance) } : {}), favorite: outfit.favorite === true }]
    })
  } catch { return [] }
}
