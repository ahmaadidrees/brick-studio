import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CharacterDescriptor, EnvironmentDescriptor } from '../registries'
import type { ContentPickerSelection } from './selection'
import WorldAndCharacterSheet, { type WorldAndCharacterSheetProps } from './WorldAndCharacterSheet'

const environments = [
  { id: 'classic', name: 'Classic Studio', description: 'The original bright baseplate.', previewKey: 'environment:classic' },
  { id: 'toy-room', name: 'Toy Room', description: 'A play table inside a warm bedroom.', previewKey: 'environment:toy-room' },
  { id: 'sky-island', name: 'Sky Island', description: 'A floating island above the clouds.', previewKey: 'environment:sky-island' },
] satisfies EnvironmentDescriptor[]

const characters = [
  { id: 'toy-figure', name: 'Toy Figure', description: 'An articulated toy character.', previewKey: 'character:toy-figure', customizable: true },
  { id: 'cc0-hero', name: 'CC0 Hero', description: 'A public-domain hero.', previewKey: 'character:cc0-hero', customizable: false },
] satisfies CharacterDescriptor[]

const paletteGroups = [{
  key: 'torso',
  label: 'Shirt',
  swatches: [
    { value: '#e7473c', label: 'Rocket red' },
    { value: '#3e83d7', label: 'Studio blue' },
  ],
}]

const baseSelection: ContentPickerSelection = { environmentId: 'classic', characterId: 'toy-figure', palette: {} }

function renderSheet(overrides: Partial<WorldAndCharacterSheetProps> = {}) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  const props: WorldAndCharacterSheetProps = {
    open: true,
    environmentDescriptors: environments,
    characterDescriptors: characters,
    selection: baseSelection,
    paletteGroups,
    onApply,
    onClose,
    ...overrides,
  }
  const view = render(<WorldAndCharacterSheet {...props} />)
  return { onApply, onClose, view, props }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('dialog semantics and focus', () => {
  it('renders nothing at all while closed', () => {
    const { view } = renderSheet({ open: false })
    expect(view.container).toBeEmptyDOMElement()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a labelled modal dialog that takes focus on open and restores it on close', () => {
    const outside = document.createElement('button')
    outside.textContent = 'World & character trigger'
    document.body.append(outside)
    outside.focus()

    const { view } = renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'World & character' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(/press Apply/i)
    expect(dialog).toHaveFocus()

    view.rerender(<WorldAndCharacterSheet
      open={false}
      environmentDescriptors={environments}
      characterDescriptors={characters}
      selection={baseSelection}
      onApply={vi.fn()}
      onClose={vi.fn()}
    />)
    expect(outside).toHaveFocus()
    outside.remove()
  })

  it('closes on Escape, the close button, and the backdrop — but not on panel clicks', () => {
    const { onClose, onApply, view } = renderSheet()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close without applying' }))
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.click(view.container.querySelector('.world-character-sheet-backdrop')!)
    expect(onClose).toHaveBeenCalledTimes(3)

    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('traps Tab focus inside the sheet in both directions', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog')
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button')]
      .filter((element) => element.tabIndex >= 0 && !element.hasAttribute('disabled'))
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    last.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(first).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    // From the panel itself (initial state), Shift+Tab also stays inside.
    dialog.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })
})

describe('draft selection: Cancel vs Apply', () => {
  it('applies one combined draft only when Apply is pressed', () => {
    const { onApply, onClose } = renderSheet()

    fireEvent.click(screen.getByRole('radio', { name: /Sky Island/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Toy Figure/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Set Shirt to Studio blue' }))
    expect(onApply).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith({
      environmentId: 'sky-island',
      characterId: 'toy-figure',
      palette: { torso: '#3e83d7' },
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('discards draft edits on Cancel and reseeds from committed props on reopen', () => {
    function Host() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>reopen</button>
          <WorldAndCharacterSheet
            open={open}
            environmentDescriptors={environments}
            characterDescriptors={characters}
            selection={baseSelection}
            paletteGroups={paletteGroups}
            onApply={vi.fn()}
            onClose={() => setOpen(false)}
          />
        </>
      )
    }
    render(<Host />)

    fireEvent.click(screen.getByRole('radio', { name: /Sky Island/ }))
    expect(screen.getByRole('radio', { name: /Sky Island/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'reopen' }))
    expect(screen.getByRole('radio', { name: /Classic Studio/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /Sky Island/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('normalizes a stale committed selection to the visible catalog before editing', () => {
    const { onApply } = renderSheet({
      selection: { environmentId: 'brick-valley', characterId: 'toy-figure', palette: {} },
    })
    expect(screen.getByRole('radio', { name: /Classic Studio/ })).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith({ environmentId: 'classic', characterId: 'toy-figure', palette: {} })
  })

  it('disables Apply when a catalog is empty instead of committing nothing', () => {
    renderSheet({
      environmentDescriptors: [],
      selection: { environmentId: null, characterId: 'toy-figure', palette: {} },
    })
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(screen.getByText('No environments are available yet.')).toBeInTheDocument()
    expect(screen.getByText('Pick a world and a character')).toBeInTheDocument()
  })
})

describe('keyboard selection and summary', () => {
  it('keeps the radio arrow-key semantics inside the sheet and narrates the draft', () => {
    renderSheet()
    const classic = screen.getByRole('radio', { name: /Classic Studio/ })
    classic.focus()
    fireEvent.keyDown(classic, { key: 'ArrowRight' })

    expect(screen.getByRole('radio', { name: /Toy Room/ })).toHaveFocus()
    expect(screen.getByRole('radio', { name: /Toy Room/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Toy Room · Toy Figure')).toBeInTheDocument()
  })

  it('forwards draft preview intents without committing them', () => {
    const onRequestPreview = vi.fn()
    const { onApply } = renderSheet({ onRequestPreview })
    fireEvent.click(screen.getByRole('radio', { name: /Sky Island/ }))
    expect(onRequestPreview).toHaveBeenCalledWith('environment', 'sky-island', 'selection')
    expect(onApply).not.toHaveBeenCalled()
  })
})

describe('character color customization', () => {
  it('shows palette controls only while the drafted character is customizable', () => {
    renderSheet()
    expect(screen.getByRole('group', { name: 'Shirt' })).toBeInTheDocument()
    expect(screen.getByText('Character colors')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /CC0 Hero/ }))
    expect(screen.queryByRole('group', { name: 'Shirt' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Toy Figure/ }))
    expect(screen.getByRole('group', { name: 'Shirt' })).toBeInTheDocument()
  })
})

describe('responsive-safe structure', () => {
  it('keeps the scroll container, footer actions, and backdrop as separate layers', () => {
    const { view } = renderSheet()
    const root = view.container.querySelector('.world-character-sheet')!
    const [backdrop, panel] = [...root.children]
    expect(backdrop).toHaveClass('world-character-sheet-backdrop')
    expect(panel).toHaveClass('world-character-sheet-panel')

    const body = within(panel as HTMLElement).getByRole('region', { name: 'Choose your world' }).closest('.world-character-sheet-body')
    expect(body).not.toBeNull()
    const footer = panel.querySelector('.world-character-sheet-footer')!
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Apply' })).toBeInTheDocument()
    expect(view.container.querySelector('img, canvas, video')).toBeNull()
  })
})
