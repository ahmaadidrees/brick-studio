import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHARACTER_APPEARANCE } from '@brick-studio/core'
import type { CharacterDescriptor } from '../registries'
import type { ContentPickerSelection } from '../contentPicker/selection'
import { CharacterStudio } from './CharacterStudio'
import { WARDROBE_STORAGE_KEY } from './wardrobe'

// jsdom has no WebGL: stand in for the R3F Canvas so the DOM around it can be tested.
vi.mock('@react-three/fiber', async (importActual) => ({
  ...(await importActual<typeof import('@react-three/fiber')>()),
  Canvas: ({ frameloop }: { frameloop?: string }) => <canvas data-frameloop={frameloop} />,
}))

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
  const setup = (selection = draft, change = vi.fn()) => render(<CharacterStudio draft={selection} onDraftChange={change} characterDescriptors={characters} paletteGroups={paletteGroups} />)
  const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }))
  it('shows one focused workspace while keeping a single live preview mounted', () => {
    const view = setup()
    expect(screen.getByRole('radiogroup', { name: 'Choose a character' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Customize your figure' })).toBeNull()
    const stage = view.container.querySelector('.character-preview__stage')
    tab('Customize')
    expect(screen.getByRole('region', { name: 'Customize your figure' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Choose a character' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Overalls$/ })).toBeNull()
    tab('My looks')
    expect(screen.getByRole('region', { name: 'Saved outfits' })).toBeInTheDocument()
    expect(view.container.querySelector('.character-preview__stage')).toBe(stage)
    expect(screen.queryByRole('radiogroup', { name: 'Choose a scene' })).toBeNull()
  })
  it('supports keyboard tab navigation and model-appropriate customization', () => {
    const view = setup({ ...draft, characterId: 'pip' })
    const first = screen.getByRole('tab', { name: 'Characters' }); first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Customize' })).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Character colors' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Customize categories' })).toBeNull()
    view.rerender(<CharacterStudio draft={{ ...draft, characterId: 'cc0-hero' }} onDraftChange={vi.fn()} characterDescriptors={characters} paletteGroups={paletteGroups} />)
    expect(screen.queryByRole('button', { name: 'Mix it up' })).toBeNull()
    expect(screen.getByText('Ready for adventure')).toBeInTheDocument()
  })
  it('reports each edit as one complete draft and never mutates the input', () => {
    const change = vi.fn()
    const onRequestPreview = vi.fn()
    const input: ContentPickerSelection = { environmentId: 'classic', characterId: 'toy-figure', palette: {} }
    const snapshot = structuredClone(input)
    render(<CharacterStudio draft={input} onDraftChange={change} characterDescriptors={characters} paletteGroups={paletteGroups} onRequestPreview={onRequestPreview} />)
    fireEvent.click(screen.getByRole('radio', { name: /Robot Hero/ }))
    expect(change).toHaveBeenLastCalledWith({ environmentId: 'classic', characterId: 'cc0-hero', palette: {} })
    expect(onRequestPreview).toHaveBeenCalledWith('character', 'cc0-hero', 'selection')
    tab('Customize')
    fireEvent.click(within(screen.getByRole('group', { name: 'Customize categories' })).getByRole('button', { name: 'Colors' }))
    fireEvent.click(screen.getByRole('button', { name: 'Set Shirt to Rocket red' }))
    expect(change).toHaveBeenLastCalledWith({ environmentId: 'classic', characterId: 'toy-figure', palette: { primary: '#e7473c' } })
    fireEvent.click(within(screen.getByRole('group', { name: 'Customize categories' })).getByRole('button', { name: 'Head' }))
    fireEvent.click(screen.getByRole('button', { name: /^Curls$/ }))
    expect(change).toHaveBeenLastCalledWith({ environmentId: 'classic', characterId: 'toy-figure', palette: {}, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, hair: 'curls' } })
    for (const call of change.mock.calls) expect(call[0]).not.toBe(input)
    expect(input).toEqual(snapshot)
  })
  it('keeps shuffle reversible and clears undo after an explicit edit', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const change = vi.fn()
    const seeded = { ...draft, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, hair: 'bun' as const } }
    setup(seeded, change); tab('Customize')
    fireEvent.click(screen.getByRole('button', { name: 'Keep hair & hats when mixing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mix it up' }))
    expect(change.mock.lastCall?.[0].appearance.hair).toBe('bun')
    fireEvent.click(screen.getByRole('button', { name: 'Undo mix' }))
    expect(change).toHaveBeenLastCalledWith(seeded)
    fireEvent.click(screen.getByRole('button', { name: 'Mix it up' }))
    fireEvent.click(screen.getByRole('button', { name: /^Curls$/ }))
    expect(screen.queryByRole('button', { name: 'Undo mix' })).toBeNull()
    // Drafting never persists preferences, touches the store, or writes site storage.
    expect(persistence.save).not.toHaveBeenCalled()
    expect(persistence.setState).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem('brick-studio.content-preferences.v1')).toBeNull()
    setItem.mockRestore()
  })
  it('applies a saved look as a complete draft without persisting character preferences', () => {
    localStorage.setItem(WARDROBE_STORAGE_KEY, JSON.stringify({ version: 1, outfits: [
      { id: 'o1', name: 'Curly builder', characterId: 'toy-figure', palette: { primary: '#3e83d7' }, appearance: { hair: 'curls', accessory: 'glasses' }, favorite: true },
    ] }))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const change = vi.fn(); setup({ ...draft, characterId: 'pip' }, change); tab('My looks')
    fireEvent.click(screen.getByRole('button', { name: 'Curly builder' }))
    expect(change).toHaveBeenCalledWith({ environmentId: 'classic', characterId: 'toy-figure', palette: { primary: '#3e83d7' }, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, hair: 'curls', accessory: 'glasses' } })
    expect(setItem).not.toHaveBeenCalled()
    // Saving an outfit is the only storage write the studio makes, and only to the wardrobe key.
    fireEvent.change(screen.getByLabelText('Outfit name'), { target: { value: 'Draft look' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save outfit' }))
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(setItem.mock.calls[0][0]).toBe(WARDROBE_STORAGE_KEY)
    expect(persistence.save).not.toHaveBeenCalled()
    expect(persistence.setState).not.toHaveBeenCalled()
    expect(localStorage.getItem('brick-studio.content-preferences.v1')).toBeNull()
    setItem.mockRestore()
  })
  it('keeps navigation usable when wardrobe storage is blocked', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new DOMException('blocked', 'SecurityError') } })
    try {
      const change = vi.fn(); setup(draft, change); tab('My looks')
      expect(within(screen.getByRole('region', { name: 'Saved outfits' })).getByRole('status')).toHaveTextContent(/blocks site storage/)
      tab('Characters'); fireEvent.click(screen.getByRole('radio', { name: /Pip/ }))
      expect(change).toHaveBeenCalledWith({ ...draft, characterId: 'pip' })
    } finally { Object.defineProperty(globalThis, 'localStorage', descriptor) }
  })
})
