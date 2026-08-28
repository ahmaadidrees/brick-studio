import type { CharacterDescriptor, EnvironmentDescriptor } from '../registries'
import type { CharacterPalette } from '../characters/types'
import type { CharacterId, EnvironmentId } from '../types'

export const CONTENT_PICKER_PREFERENCES_VERSION = 1 as const

export type ContentPickerSelection = {
  environmentId: EnvironmentId | null
  characterId: CharacterId | null
  palette: CharacterPalette
}

export type ContentPickerCatalog = {
  environments: readonly EnvironmentDescriptor[]
  characters: readonly CharacterDescriptor[]
  fallbackEnvironmentId?: EnvironmentId | null
  fallbackCharacterId?: CharacterId | null
}

export type ContentPickerPreferences = ContentPickerSelection & {
  version: typeof CONTENT_PICKER_PREFERENCES_VERSION
}

type PartialSelection = {
  environmentId?: unknown
  characterId?: unknown
  palette?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function copyStringPalette(value: unknown): CharacterPalette {
  if (!isRecord(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => entry[0].length > 0 && typeof entry[1] === 'string',
    ),
  )
}

/** Resolves a preferred ID against a visible catalog without mutating either input. */
export function selectAvailableId<T extends string>(
  preferredId: unknown,
  descriptors: readonly { id: T }[],
  fallbackId?: T | null,
): T | null {
  if (typeof preferredId === 'string' && descriptors.some(({ id }) => id === preferredId)) {
    return preferredId as T
  }
  if (fallbackId && descriptors.some(({ id }) => id === fallbackId)) return fallbackId
  return descriptors[0]?.id ?? null
}

/**
 * Produces a complete controlled selection for the supplied catalog. Unknown or stale IDs
 * fall back explicitly; callers should pass every descriptor they consider selectable.
 */
export function normalizeContentPickerSelection(
  selection: PartialSelection | null | undefined,
  catalog: ContentPickerCatalog,
): ContentPickerSelection {
  return {
    environmentId: selectAvailableId(
      selection?.environmentId,
      catalog.environments,
      catalog.fallbackEnvironmentId,
    ),
    characterId: selectAvailableId(
      selection?.characterId,
      catalog.characters,
      catalog.fallbackCharacterId,
    ),
    palette: copyStringPalette(selection?.palette),
  }
}

/** Returns a fresh palette, removing a slot when its value is blank. */
export function updateCharacterPalette(
  palette: Readonly<CharacterPalette> | null | undefined,
  slot: string,
  value: string,
): CharacterPalette {
  const next = { ...(palette ?? {}) }
  if (!slot) return next
  if (value) next[slot] = value
  else delete next[slot]
  return next
}

export function serializeContentPickerPreferences(selection: ContentPickerSelection): string {
  const preferences: ContentPickerPreferences = {
    version: CONTENT_PICKER_PREFERENCES_VERSION,
    environmentId: selection.environmentId,
    characterId: selection.characterId,
    palette: copyStringPalette(selection.palette),
  }
  return JSON.stringify(preferences)
}

/** Parses and catalog-normalizes saved preferences. Invalid JSON/schema returns null. */
export function parseContentPickerPreferences(
  serialized: string | null | undefined,
  catalog: ContentPickerCatalog,
): ContentPickerPreferences | null {
  if (!serialized) return null

  try {
    const value: unknown = JSON.parse(serialized)
    if (!isRecord(value) || value.version !== CONTENT_PICKER_PREFERENCES_VERSION) return null

    return {
      version: CONTENT_PICKER_PREFERENCES_VERSION,
      ...normalizeContentPickerSelection(value, catalog),
    }
  } catch {
    return null
  }
}
