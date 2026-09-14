import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CharacterDescriptor } from '../registries'
import type { ContentPickerSelection } from '../contentPicker/selection'
import { CharacterStudio } from './CharacterStudio'

const characters = [
  { id: 'toy-figure', name: 'Toy Figure', description: 'An articulated toy character.', previewKey: 'character:toy-figure', customizable: true },
  { id: 'cc0-hero', name: 'Robot Hero', description: 'A friendly robot.', previewKey: 'character:cc0-hero', customizable: false },
] satisfies CharacterDescriptor[]

const paletteGroups = [{
  key: 'torso',
  label: 'Shirt',
  swatches: [{ value: '#e7473c', label: 'Rocket red' }],
}]

const draft: ContentPickerSelection = { environmentId: 'classic', characterId: 'toy-figure', palette: {} }

afterEach(cleanup)

describe('CharacterStudio', () => {
  it('renders the preview, cards, appearance, colors and wardrobe for the toy figure without a scene section', () => {
    const view = render(<CharacterStudio draft={draft} onDraftChange={vi.fn()} characterDescriptors={characters} paletteGroups={paletteGroups} />)
    expect(view.container.querySelector('[data-preview-key="character:toy-figure"]')).not.toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Choose a character' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Choose a scene' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Customize your figure' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Coordinated colors' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Saved outfits' })).toBeInTheDocument()
  })

  it('keeps the figure-only appearance controls off other characters', () => {
    render(<CharacterStudio draft={{ ...draft, characterId: 'cc0-hero' }} onDraftChange={vi.fn()} characterDescriptors={characters} paletteGroups={paletteGroups} />)
    expect(screen.queryByRole('region', { name: 'Customize your figure' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Coordinated colors' })).toBeInTheDocument()
  })

  it('reports each edit as one complete draft and never mutates the input', () => {
    const onDraftChange = vi.fn()
    const onRequestPreview = vi.fn()
    render(<CharacterStudio draft={draft} onDraftChange={onDraftChange} characterDescriptors={characters} paletteGroups={paletteGroups} onRequestPreview={onRequestPreview} />)
    fireEvent.click(screen.getByRole('radio', { name: /Robot Hero/ }))
    expect(onDraftChange).toHaveBeenLastCalledWith({ environmentId: 'classic', characterId: 'cc0-hero', palette: {} })
    expect(onRequestPreview).toHaveBeenCalledWith('character', 'cc0-hero', 'selection')
    fireEvent.click(screen.getByRole('button', { name: 'Set Shirt to Rocket red' }))
    expect(onDraftChange).toHaveBeenLastCalledWith({ environmentId: 'classic', characterId: 'toy-figure', palette: { torso: '#e7473c' } })
    expect(draft).toEqual({ environmentId: 'classic', characterId: 'toy-figure', palette: {} })
  })
})
