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
  { id: 'cc0-hero', name: 'Robot Hero', description: 'A friendly robot.', previewKey: 'character:cc0-hero', customizable: false },
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
    outside.textContent = 'Scene & character trigger'
    document.body.append(outside)
    outside.focus()

    const { view } = renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Scene & character' })
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

    fireEvent.pointerDown(document.querySelector('.ui-sheet-backdrop')!)
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
    fireEvent.click(screen.getByRole('tab', { name: 'Character' }))
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
    expect(screen.getByText('No scenes are available yet.')).toBeInTheDocument()
    expect(screen.getByText('Pick a scene and a character')).toBeInTheDocument()
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
  it('previews color changes on the selected illustration and resets only the draft until Apply', () => {
    const selection = { ...baseSelection, palette: { primary: '#e7473c', secondary: '#3e83d7' } }
    const { onApply } = renderSheet({
      selection,
      paletteGroups: [{ ...paletteGroups[0], key: 'primary', label: 'Suit' }],
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Character' }))
    const preview = document.querySelector<HTMLElement>('[data-preview-key="character:toy-figure"]')!
    expect(preview.style.getPropertyValue('--preview-character-primary')).toBe('#e7473c')

    fireEvent.click(screen.getByRole('button', { name: 'Set Suit to Studio blue' }))
    expect(preview.style.getPropertyValue('--preview-character-primary')).toBe('#3e83d7')
    expect(onApply).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Reset colors' }))
    expect(preview.style.getPropertyValue('--preview-character-primary')).toBe('')
    expect(screen.getByRole('button', { name: 'Reset colors' })).toBeDisabled()
    expect(selection.palette).toEqual({ primary: '#e7473c', secondary: '#3e83d7' })
    expect(onApply).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith({ ...baseSelection, palette: {} })
  })

  it('shows palette controls only while the drafted character is customizable', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('tab', { name: 'Character' }))
    expect(screen.getByRole('group', { name: 'Shirt' })).toBeInTheDocument()
    expect(screen.getByText('Character colors')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Robot Hero/ }))
    expect(screen.queryByRole('group', { name: 'Shirt' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Toy Figure/ }))
    expect(screen.getByRole('group', { name: 'Shirt' })).toBeInTheDocument()
  })
})

describe('private preview tabs', () => {
  it('moves between tabs with arrow keys and keeps the active panel labelled', () => {
    const { onApply } = renderSheet()
    const scene = screen.getByRole('tab', { name: 'Scene' })
    const character = screen.getByRole('tab', { name: 'Character' })
    scene.focus()
    fireEvent.keyDown(scene, { key: 'ArrowRight' })
    expect(character).toHaveFocus()
    expect(character).toHaveAttribute('tabindex', '0')
    expect(scene).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('tabpanel', { name: 'Character' })).toBeInTheDocument()

    fireEvent.keyDown(character, { key: 'ArrowRight' })
    expect(scene).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Scene' })).toBeInTheDocument()
    fireEvent.keyDown(scene, { key: 'End' })
    expect(character).toHaveFocus()
    fireEvent.keyDown(character, { key: 'Home' })
    expect(scene).toHaveFocus()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('separates Scene and Character while reporting a reversible draft preview', () => {
    const onDraftChange = vi.fn()
    renderSheet({ onDraftChange })

    expect(screen.getByRole('tab', { name: 'Scene' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('radio', { name: /Classic Studio/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Toy Figure/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Sky Island/ }))
    expect(onDraftChange).toHaveBeenLastCalledWith({
      environmentId: 'sky-island',
      characterId: 'toy-figure',
      palette: {},
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Character' }))
    expect(screen.getByRole('radio', { name: /Toy Figure/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Sky Island/ })).not.toBeInTheDocument()
  })
})

describe('responsive-safe structure', () => {
  it('keeps the scroll container, footer actions, and backdrop as separate layers of the shared sheet', () => {
    const { view } = renderSheet()
    // Portaled onto document.body so it stacks above the editor lanes.
    expect(view.container).toBeEmptyDOMElement()
    const root = document.querySelector('.ui-sheet-root.world-character-sheet')!
    const [backdrop, panel] = [...root.children]
    expect(backdrop).toHaveClass('ui-sheet-backdrop')
    expect(panel).toBe(screen.getByRole('dialog', { name: 'Scene & character' }))

    const body = within(panel as HTMLElement).getByRole('region', { name: 'Scene & character' }).closest('.ui-sheet-body')
    expect(body).not.toBeNull()
    expect(body!.querySelector('.world-character-sheet-body')).not.toBeNull()
    const footer = panel.querySelector('.ui-sheet-footer')!
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Apply' })).toBeInTheDocument()
    expect(document.querySelector('canvas, video')).toBeNull()
    for (const img of document.querySelectorAll('img')) expect(img).toHaveAttribute('loading', 'lazy')
  })
})

it('can switch to Scene after opening directly on Character', () => {
  renderSheet({ initialTab: 'character', plateSize: 64, canResizePlate: true })
  expect(screen.getByRole('tab', { name: 'Character' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('tab', { name: 'Scene' }))
  expect(screen.getByRole('tab', { name: 'Scene' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: '128 × 128' })).toBeVisible()
})

describe('build plate (board 08)', () => {
  it('offers 64/96/128 as a segmented choice with the centered-resize promise and the current size', () => {
    renderSheet({ plateSize: 96, canResizePlate: true })
    const group = screen.getByRole('group', { name: 'Build plate size' })
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['64 × 64', '96 × 96', '128 × 128'])
    expect(screen.getByRole('button', { name: '96 × 96' })).toHaveAttribute('aria-pressed', 'true')
    expect(group).toHaveAccessibleDescription('Your creation stays centered.')
    expect(screen.getByText('Now 96 × 96')).toBeInTheDocument()
    expect(screen.getByText('Choose the size for your building space.')).toBeInTheDocument()
  })

  it('applies the chosen plate size together with the selection and narrates the change', () => {
    const { onApply } = renderSheet({ plateSize: 64, canResizePlate: true })
    expect(screen.getByText('Make it yours')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '128 × 128' }))
    expect(screen.getByText('Preview — only you can see this')).toBeInTheDocument()
    expect(screen.getByText('Classic Studio · Toy Figure · 128 × 128 plate')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith(baseSelection, 128)
  })

  it('warns while shrinking and explains a locked plate instead of hiding it', () => {
    renderSheet({ plateSize: 128, canResizePlate: true })
    fireEvent.click(screen.getByRole('button', { name: '64 × 64' }))
    expect(screen.getByRole('group', { name: 'Build plate size' })).toHaveAccessibleDescription(/stays centered\. Bricks near the edge must fit/)

    cleanup()
    renderSheet({ plateSize: 128, canResizePlate: false })
    expect(screen.getByRole('button', { name: '64 × 64' })).toBeDisabled()
    expect(screen.getByText(/Only the world owner can resize it/)).toBeInTheDocument()
  })

  it('presents a rejected shrink with the real brick-core message, Keep current size and Back to building', () => {
    const message = 'Some bricks would fall outside the smaller plate. Move them toward the center before shrinking it.'
    const onApply = vi.fn(() => ({ ok: false as const, message }))
    const { onClose } = renderSheet({ plateSize: 128, canResizePlate: true, onApply })
    fireEvent.click(screen.getByRole('button', { name: '64 × 64' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    const alert = screen.getByRole('alert', { name: 'Can’t shrink the plate yet' })
    expect(alert).toHaveFocus()
    expect(alert).toHaveTextContent(message)
    expect(screen.getByRole('img', { name: 'A 64 by 64 plate drawn inside the current 128 by 128 plate.' })).toBeInTheDocument()
    expect(alert).toHaveTextContent('New 64 × 64 plate')
    expect(alert).toHaveTextContent('Current 128 × 128 plate')
    expect(screen.queryByRole('tab', { name: 'Scene' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Keep current size' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '128 × 128' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('tab', { name: 'Scene' })).toHaveAttribute('aria-selected', 'true')
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '64 × 64' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to building' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledTimes(2)
  })

  it('shows a non-plate rejection inline and keeps editing possible', () => {
    const onApply = vi.fn(() => ({ ok: false as const, message: 'The room is still syncing.' }))
    renderSheet({ plateSize: 64, canResizePlate: true, onApply })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The room is still syncing.')
    expect(screen.getByRole('tab', { name: 'Scene' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled()
  })

  it('ignores void and boolean apply results', () => {
    const { onClose } = renderSheet({ plateSize: 64, canResizePlate: true, onApply: vi.fn(() => true) })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('reads as a bottom sheet with the plate controls after the scene cards', () => {
    renderSheet({ plateSize: 64, canResizePlate: true })
    const body = screen.getByRole('tabpanel', { name: 'Scene' })
    const [picker, plate] = [...body.children]
    expect(picker).toHaveClass('content-picker')
    expect(plate).toHaveClass('plate-size-picker')
    expect(screen.getByRole('heading', { name: 'Choose your scene' })).toBeInTheDocument()
    expect(screen.getByText('Each scene gives your build a different backdrop and feeling.')).toBeInTheDocument()
  })
})
