import type { CharacterPalette } from './characters/types'
import { CHARACTER_DESCRIPTORS, ENVIRONMENT_DESCRIPTORS } from './contentCatalog'
import {
  parseContentPickerPreferences,
  serializeContentPickerPreferences,
} from './contentPicker'
import type { CharacterId, EnvironmentId } from './types'

export const CONTENT_PREFERENCES_STORAGE_KEY = 'brick-studio.content-preferences.v1'

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export type CharacterPreferences = {
  characterId: CharacterId
  palette: CharacterPalette
}

const ALLOWED_PALETTE_SLOTS = new Set(['primary', 'secondary', 'accent'])
const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{6})$/i

function sanitizePalette(palette: Readonly<CharacterPalette>): CharacterPalette {
  return Object.fromEntries(
    Object.entries(palette).filter(([slot, value]) => (
      ALLOWED_PALETTE_SLOTS.has(slot) && HEX_COLOR.test(value)
    )),
  )
}

export function loadCharacterPreferences(storage: PreferenceStorage = window.localStorage): CharacterPreferences {
  try {
    const saved = parseContentPickerPreferences(storage.getItem(CONTENT_PREFERENCES_STORAGE_KEY), {
      environments: ENVIRONMENT_DESCRIPTORS,
      characters: CHARACTER_DESCRIPTORS,
      fallbackEnvironmentId: 'classic',
      fallbackCharacterId: 'classic',
    })
    return {
      characterId: saved?.characterId ?? 'classic',
      palette: sanitizePalette(saved?.palette ?? {}),
    }
  } catch {
    return { characterId: 'classic', palette: {} }
  }
}

export function saveCharacterPreferences(
  preferences: CharacterPreferences,
  storage: PreferenceStorage = window.localStorage,
  environmentId: EnvironmentId = 'classic',
): boolean {
  try {
    storage.setItem(CONTENT_PREFERENCES_STORAGE_KEY, serializeContentPickerPreferences({
      environmentId,
      characterId: preferences.characterId,
      palette: sanitizePalette(preferences.palette),
    }))
    return true
  } catch {
    return false
  }
}

