import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHARACTER_APPEARANCE } from '@brick-studio/core'
import type { CharacterDescriptor } from '../registries'
import type { ContentPickerSelection } from '../contentPicker/selection'
import { CharacterStudio } from './CharacterStudio'
import { WARDROBE_STORAGE_KEY } from './wardrobe'

const persistence = vi.hoisted(() => ({ save: vi.fn(), setState: vi.fn() }))
vi.mock('../contentPreferences', async (importActual) => ({
  ...(await importActual<typeof import('../contentPreferences')>()),
  saveCharacterPreferences: persistence.save,
}))
vi.mock('../store', async (importActual) => {
  const actual = await importActual<typeof import('../store')>()
  actual.useBrickStore.setState = persistence.setState as typeof actual.useBrickStore.setState
  return actual
})

const characters = [
  { id: 'toy-figure', name: 'Toy Figure', description: 'An articulated toy character.', previewKey: 'character:toy-figure', customizable: true },
  { id: 'cc0-hero', name: 'Robot Hero', description: 'A friendly robot.', previewKey: 'character:cc0-hero', customizable: false },
  { id: 'pip', name: 'Pip', description: 'A pocket robot.', previewKey: 'character:pip', customizable: true },
] satisfies CharacterDescriptor[]

const paletteGroups = [
  { key: 'primary', label: 'Shirt', swatches: [{ value: '#e7473c', label: 'Rocket red' }, { value: '#3e83d7', label: 'Studio blue' }] },
  { key: 'secondary', label: 'Pants', swatches: [{ value: '#e7473c', label: 'Rocket red' }] },
  { key: 'accent', label: 'Badge', swatches: [{ value: '#e7473c', label: 'Rocket red' }] },
]

const draft: ContentPickerSelection = { environmentId: 'classic', characterId: 'toy-figure', palette: {} }

beforeEach(() => { persistence.save.mockClear(); persistence.setState.mockClear() })
afterEach(() => { cleanup(); localStorage.clear() })

describe('CharacterStudio', () => {
  it('renders the intro, preview, cards, figure controls, colors, mix and wardrobe for the toy figure without a scene section', () => {
    const view = render(<CharacterStudio draft={draft} onDraftChange={vi.fn()} characterDescriptors={characters} paletteGroups={paletteGroups} />)
    expect(screen.getByRole('heading', { name: 'Make it yours.' })).toBeInTheDocument()
    expect(view.container.querySelector('[data-preview-key="character:toy-figure"]')).not.toBeNull()
    expect(screen.getByRole('group', { name: 'Preview animation' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Choose a character' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Choose a scene' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Customize your figure' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Character colors' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Coordinated colors' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mix it up' })).toBeEnabled()
    expect(screen.getByRole('region', { name: 'Saved outfits' })).toBeInTheDocument()
    expect(view.container.querySelectorAll('canvas, .character-preview__stage').length).toBeLessThanOrEqual(2)
  })

  it('shows only the categories that exist for the selected character', () => {
    const view = render(<CharacterStudio draft={{ ...draft, characterId: 'pip' }} onDraftChange={vi.fn()} characterDescriptors={characters} paletteGroups={[
      { key: 'primary', label: 'Helmet', swatches: paletteGroups[0].swatches }, { key: 'secondary', label: 'Panels', swatches: paletteGroups[1].swatches }, { key: 'accent', label: 'Glow', swatches: paletteGroups[2].swatches },
    ]} />)
    expect(screen.queryByRole('region', { name: 'Customize your figure' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Helmet' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Glow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mix it up' })).toBeEnabled()
    view.rerender(<CharacterStudio draft={{ ...draft, characterId: 'cc0-hero' }} onDraftChange={vi.fn()} characterDescriptors={characters} paletteGroups={paletteGroups} />)
    expect(screen.queryByRole('region', { name: 'Character colors' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Coordinated colors' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mix it up' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Saved outfits' })).toBeInTheDocument()
  })

  it('reports each edit as one complete draft and never mutates the input', () => {
    const onDraftChange = vi.fn()
    const onRequestPreview = vi.fn()
    render(<CharacterStudio draft={draft} onDraftChange={onDraftChange} characterDescriptors={characters} paletteGroups={paletteGroups} onRequestPreview={onRequestPreview} />)
    fireEvent.click(screen.getByRole('radio', { name: /Robot Hero/ }))
    expect(onDraftChange).toHaveBeenLastCalledWith({ environmentId: 'classic', characterId: 'cc0-hero', palette: {} })
    expect(onRequestPreview).toHaveBeenCalledWith('character', 'cc0-hero', 'selection')
    fireEvent.click(screen.getByRole('button', { name: 'Set Shirt to Rocket red' }))
    expect(onDraftChange).toHaveBeenLastCalledWith({ environmentId: 'classic', characterId: 'toy-figure', palette: { primary: '#e7473c' } })
    fireEvent.click(screen.getByRole('button', { name: /^Curls$/ }))
    expect(onDraftChange).toHaveBeenLastCalledWith({ environmentId: 'classic', characterId: 'toy-figure', palette: {}, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, hair: 'curls' } })
    expect(draft).toEqual({ environmentId: 'classic', characterId: 'toy-figure', palette: {} })
  })

  it('mixes only unlocked parts and colors, with locks shared by color sets and Mix it up', () => {
    const onDraftChange = vi.fn()
    const seeded = { ...draft, palette: { primary: '#123456' }, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, hair: 'bun' as const } }
    render(<CharacterStudio draft={seeded} onDraftChange={onDraftChange} characterDescriptors={characters} paletteGroups={paletteGroups} />)
    fireEvent.click(screen.getByRole('button', { name: 'Keep hair & hats when mixing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep Shirt when mixing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Moon mission' }))
    expect(onDraftChange).toHaveBeenLastCalledWith({ ...seeded, palette: { primary: '#123456', secondary: '#3c456e', accent: '#f2a54a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mix it up' }))
    const mixed = onDraftChange.mock.lastCall?.[0] as ContentPickerSelection
    expect(mixed.appearance?.hair).toBe('bun')
    expect(mixed.appearance?.face).not.toBe('friendly')
    expect(mixed.appearance?.skinColor).toBe(DEFAULT_CHARACTER_APPEARANCE.skinColor)
    expect(mixed.palette.primary).toBe('#123456')
    expect(mixed.palette.secondary).toMatch(/^#[0-9a-f]{6}$/)
    expect(mixed.characterId).toBe('toy-figure')
    for (const label of ['Keep body when mixing', 'Keep face when mixing', 'Keep outfit when mixing', 'Keep accessory when mixing', 'Keep Pants when mixing', 'Keep Badge when mixing']) {
      fireEvent.click(screen.getByRole('button', { name: label }))
    }
    expect(screen.getByRole('button', { name: 'Mix it up' })).toBeDisabled()
    expect(screen.getByText('Everything is kept. Unlock a part to mix it.')).toBeInTheDocument()
  })

  it('applies a saved outfit as one draft, including its character and appearance', () => {
    localStorage.setItem(WARDROBE_STORAGE_KEY, JSON.stringify({ version: 1, outfits: [
      { id: 'o1', name: 'Curly builder', characterId: 'toy-figure', palette: { primary: '#3e83d7' }, appearance: { hair: 'curls', accessory: 'glasses' }, favorite: true },
    ] }))
    const onDraftChange = vi.fn()
    render(<CharacterStudio draft={{ ...draft, characterId: 'pip' }} onDraftChange={onDraftChange} characterDescriptors={characters} paletteGroups={paletteGroups} />)
    fireEvent.click(screen.getByRole('button', { name: /Curly builder/ }))
    expect(onDraftChange).toHaveBeenCalledWith({
      environmentId: 'classic', characterId: 'toy-figure', palette: { primary: '#3e83d7' },
      appearance: { ...DEFAULT_CHARACTER_APPEARANCE, hair: 'curls', accessory: 'glasses' },
    })
  })

  it('never persists preferences, touches the store, or writes anything but the wardrobe while drafting', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const onDraftChange = vi.fn()
    render(<CharacterStudio draft={draft} onDraftChange={onDraftChange} characterDescriptors={characters} paletteGroups={paletteGroups} />)
    fireEvent.click(screen.getByRole('radio', { name: /Pip/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Set Shirt to Studio blue' }))
    fireEvent.click(screen.getByRole('button', { name: /^Glasses$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mix it up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Walk' }))
    expect(onDraftChange).toHaveBeenCalledTimes(4)
    expect(persistence.save).not.toHaveBeenCalled()
    expect(persistence.setState).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Outfit name'), { target: { value: 'Draft look' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save outfit' }))
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(setItem.mock.calls[0][0]).toBe(WARDROBE_STORAGE_KEY)
    expect(persistence.save).not.toHaveBeenCalled()
    expect(localStorage.getItem('brick-studio.content-preferences.v1')).toBeNull()
    setItem.mockRestore()
  })

  it('keeps the wardrobe usable when storage is blocked and still lets the character change', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new DOMException('blocked', 'SecurityError') } })
    try {
      const onDraftChange = vi.fn()
      render(<CharacterStudio draft={draft} onDraftChange={onDraftChange} characterDescriptors={characters} paletteGroups={paletteGroups} />)
      const wardrobe = screen.getByRole('region', { name: 'Saved outfits' })
      expect(within(wardrobe).getByRole('status')).toHaveTextContent(/blocks site storage/)
      fireEvent.click(screen.getByRole('radio', { name: /Pip/ }))
      expect(onDraftChange).toHaveBeenCalledWith({ environmentId: 'classic', characterId: 'pip', palette: {} })
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })
})
