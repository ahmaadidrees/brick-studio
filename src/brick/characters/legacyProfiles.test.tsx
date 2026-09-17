import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHARACTER_APPEARANCE, normalizeCharacterAppearance } from '@brick-studio/core'
import { CHARACTER_DESCRIPTORS, characterPaletteGroups, ENVIRONMENT_DESCRIPTORS } from '../contentCatalog'
import { loadCharacterPreferences } from '../contentPreferences'
import { normalizeContentPickerSelection, parseContentPickerPreferences } from '../contentPicker/selection'
import { CharacterStudio } from './CharacterStudio'
import { loadWardrobe, WARDROBE_STORAGE_KEY } from './wardrobe'

// jsdom has no WebGL: stand in for the R3F Canvas so the DOM around it can be tested.
vi.mock('@react-three/fiber', async (importActual) => ({
  ...(await importActual<typeof import('@react-three/fiber')>()),
  Canvas: ({ frameloop }: { frameloop?: string }) => <canvas data-frameloop={frameloop} />,
}))

/**
 * Records written by earlier releases: a v1 preference with a partial appearance
 * (before some categories existed), unknown keys, short hex colors and a stale
 * palette slot, plus a wardrobe entry of the same era. All of it must still
 * normalize and render in the studio without any migration.
 */
const LEGACY_PREFERENCES = JSON.stringify({
  version: 1,
  environmentId: 'toy-room',
  characterId: 'toy-figure',
  palette: { primary: '#E7473C', secondary: '#3e83d7', legacySlot: '#000000', bogus: 4 },
  appearance: { body: 'broad', hair: 'curls', accessory: 'glasses', skinColor: '#ABC', mood: 'happy', outfit: 'retired-value' },
  extra: { ignored: true },
})

const LEGACY_WARDROBE = JSON.stringify({ version: 1, outfits: [
  { id: 'legacy-1', name: 'Old favorite', characterId: 'toy-figure', palette: { primary: '#e7473c', junk: 'no' }, appearance: { face: 'rosy', hair: 'bun' }, favorite: true },
  { id: 'legacy-2', name: 'Pip look', characterId: 'pip', palette: { accent: '#ffd34e' }, favorite: false },
  { id: 'legacy-3', name: 'Gone character', characterId: 'removed-id', palette: {}, favorite: false },
] })

afterEach(() => { cleanup(); localStorage.clear() })

describe('legacy saved profiles', () => {
  it('normalizes an old preference record into a complete appearance and a clean palette', () => {
    const catalog = { environments: ENVIRONMENT_DESCRIPTORS, characters: CHARACTER_DESCRIPTORS }
    const parsed = parseContentPickerPreferences(LEGACY_PREFERENCES, catalog)
    expect(parsed).toMatchObject({ version: 1, environmentId: 'toy-room', characterId: 'toy-figure' })
    expect(parsed?.appearance).toEqual({ ...DEFAULT_CHARACTER_APPEARANCE, body: 'broad', hair: 'curls', accessory: 'glasses', skinColor: '#abc' })
    expect(parsed?.palette).toEqual({ primary: '#E7473C', secondary: '#3e83d7', legacySlot: '#000000' })
    localStorage.setItem('brick-studio.content-preferences.v1', LEGACY_PREFERENCES)
    const loaded = loadCharacterPreferences()
    expect(loaded.characterId).toBe('toy-figure')
    expect(loaded.appearance).toEqual(parsed?.appearance)
    expect(normalizeCharacterAppearance(undefined)).toEqual(DEFAULT_CHARACTER_APPEARANCE)
    expect(normalizeCharacterAppearance({ hair: 'mohawk' }).hair).toBe('cap')
  })

  it('renders the studio from a legacy record with the old choices selected', () => {
    localStorage.setItem(WARDROBE_STORAGE_KEY, LEGACY_WARDROBE)
    const draft = normalizeContentPickerSelection(JSON.parse(LEGACY_PREFERENCES), { environments: ENVIRONMENT_DESCRIPTORS, characters: CHARACTER_DESCRIPTORS })
    render(<CharacterStudio draft={draft} onDraftChange={() => {}} characterDescriptors={CHARACTER_DESCRIPTORS} paletteGroups={characterPaletteGroups('toy-figure')} />)
    expect(screen.getByRole('radio', { name: /^Toy Figure/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Customize' }))
    expect(screen.getByLabelText('Custom skin tone')).toHaveValue('#aabbcc')
    expect(screen.getByRole('button', { name: /^Curls$/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^Extras$/ }))
    expect(screen.getByRole('button', { name: /^Glasses$/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^Outfit$/ }))
    expect(screen.getByRole('button', { name: /^Broad$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Explorer$/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /^Colors$/ }))
    expect(screen.getByRole('button', { name: 'Set Trim to Sky blue' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'My looks' }))
    expect(screen.getByRole('button', { name: 'Favorite Old favorite' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Pip look' })).toBeInTheDocument()
    expect(screen.queryByText('Gone character')).toBeNull()
  })

  it('keeps old wardrobe entries that still resolve and drops the ones whose character is gone', () => {
    localStorage.setItem(WARDROBE_STORAGE_KEY, LEGACY_WARDROBE)
    const outfits = loadWardrobe(localStorage)
    expect(outfits.map(outfit => outfit.id)).toEqual(['legacy-1', 'legacy-2'])
    expect(outfits[0].palette).toEqual({ primary: '#e7473c' })
    expect(outfits[0].appearance).toEqual({ ...DEFAULT_CHARACTER_APPEARANCE, face: 'rosy', hair: 'bun' })
    expect(outfits[1].appearance).toBeUndefined()
  })
})
