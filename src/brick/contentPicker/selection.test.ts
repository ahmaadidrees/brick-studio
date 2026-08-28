import { describe, expect, it } from 'vitest'
import { CC0_HERO_DESCRIPTOR, TOY_FIGURE_DESCRIPTOR } from '../characters'
import {
  BRICK_VALLEY_DESCRIPTOR,
  SKY_ISLAND_DESCRIPTOR,
  TOY_ROOM_DESCRIPTOR,
} from '../environments'
import {
  normalizeContentPickerSelection,
  parseContentPickerPreferences,
  selectAvailableId,
  serializeContentPickerPreferences,
  updateCharacterPalette,
} from './selection'

const catalog = {
  environments: [TOY_ROOM_DESCRIPTOR, BRICK_VALLEY_DESCRIPTOR, SKY_ISLAND_DESCRIPTOR],
  characters: [TOY_FIGURE_DESCRIPTOR, CC0_HERO_DESCRIPTOR],
} as const

describe('content picker selection helpers', () => {
  it('keeps an available selection and applies explicit or first-item fallbacks', () => {
    expect(selectAvailableId('sky-island', catalog.environments)).toBe('sky-island')
    expect(selectAvailableId('retired-world', catalog.environments, 'brick-valley')).toBe('brick-valley')
    expect(selectAvailableId('retired-world', catalog.environments)).toBe('toy-room')
    expect(selectAvailableId('anything', [])).toBeNull()
  })

  it('normalizes stale IDs and copies only string palette entries', () => {
    const selection = normalizeContentPickerSelection({
      environmentId: 'retired-world',
      characterId: 'cc0-hero',
      palette: { primary: '#e7473c', invalid: 42 },
    }, {
      ...catalog,
      fallbackEnvironmentId: 'sky-island',
    })

    expect(selection).toEqual({
      environmentId: 'sky-island',
      characterId: 'cc0-hero',
      palette: { primary: '#e7473c' },
    })
  })

  it('updates palettes immutably and can clear an optional slot', () => {
    const palette = { primary: '#e7473c', accent: '#ffd34e' }

    expect(updateCharacterPalette(palette, 'primary', '#3e83d7')).toEqual({
      primary: '#3e83d7',
      accent: '#ffd34e',
    })
    expect(updateCharacterPalette(palette, 'accent', '')).toEqual({ primary: '#e7473c' })
    expect(palette).toEqual({ primary: '#e7473c', accent: '#ffd34e' })
  })
})

describe('content picker preference serialization', () => {
  it('round-trips a valid selection through the versioned payload', () => {
    const serialized = serializeContentPickerPreferences({
      environmentId: 'brick-valley',
      characterId: 'toy-figure',
      palette: { primary: '#3e83d7' },
    })

    expect(parseContentPickerPreferences(serialized, catalog)).toEqual({
      version: 1,
      environmentId: 'brick-valley',
      characterId: 'toy-figure',
      palette: { primary: '#3e83d7' },
    })
  })

  it('rejects malformed or unknown schema payloads and repairs stale catalog IDs', () => {
    expect(parseContentPickerPreferences('{', catalog)).toBeNull()
    expect(parseContentPickerPreferences('{"version":2}', catalog)).toBeNull()
    expect(parseContentPickerPreferences(JSON.stringify({
      version: 1,
      environmentId: 'gone',
      characterId: 'gone',
      palette: null,
    }), catalog)).toEqual({
      version: 1,
      environmentId: 'toy-room',
      characterId: 'toy-figure',
      palette: {},
    })
  })
})
