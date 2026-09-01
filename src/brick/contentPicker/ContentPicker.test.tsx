import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CC0_HERO_DESCRIPTOR, TOY_FIGURE_DESCRIPTOR } from '../characters'
import { BRICK_VALLEY_DESCRIPTOR, SKY_ISLAND_DESCRIPTOR, TOY_ROOM_DESCRIPTOR } from '../environments'
import type { CharacterDescriptor } from '../registries'
import ContentPicker from './ContentPicker'

const environments = [TOY_ROOM_DESCRIPTOR, BRICK_VALLEY_DESCRIPTOR, SKY_ISLAND_DESCRIPTOR]
const characters = [TOY_FIGURE_DESCRIPTOR, CC0_HERO_DESCRIPTOR]

const baseProps = {
  environmentDescriptors: environments,
  characterDescriptors: characters,
  selectedEnvironmentId: 'toy-room' as const,
  selectedCharacterId: 'toy-figure' as const,
  onSelectEnvironment: vi.fn(),
  onSelectCharacter: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ContentPicker', () => {
  it('renders controlled, semantic selection groups without eager media or render modules', () => {
    const { container } = render(<ContentPicker {...baseProps} />)

    expect(screen.getByRole('region', { name: 'Choose your world' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Choose an environment' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Toy Room/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /Brick Valley/ })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('radio', { name: /Toy Figure/ })).toHaveAttribute('aria-checked', 'true')
    expect(container.querySelector('img, canvas, video')).toBeNull()
  })

  it('gives every available world and character a distinct lightweight illustration', () => {
    const { container } = render(<ContentPicker {...baseProps} />)

    expect([...container.querySelectorAll('[data-artwork]')].map((node) => node.getAttribute('data-artwork'))).toEqual([
      'toy-room',
      'brick-valley',
      'sky-island',
      'toy-figure',
      'robot-hero',
    ])
    expect(container.querySelectorAll('svg')).toHaveLength(5)
    expect(container.querySelector('img, canvas, video')).toBeNull()
  })

  it('announces loading and unavailable previews and skips unavailable cards during selection', () => {
    const onSelectCharacter = vi.fn()
    const onRequestPreview = vi.fn()
    render(
      <ContentPicker
        {...baseProps}
        onSelectCharacter={onSelectCharacter}
        onRequestPreview={onRequestPreview}
        previewStatuses={{
          environment: { 'brick-valley': 'loading' },
          character: { 'cc0-hero': 'unavailable' },
        }}
      />,
    )

    const valley = screen.getByRole('radio', { name: /Brick Valley.*Loading preview/ })
    const toyFigure = screen.getByRole('radio', { name: /Toy Figure/ })
    const robot = screen.getByRole('radio', { name: /Robot Hero.*Unavailable/ })
    expect(valley).toHaveAttribute('aria-busy', 'true')
    expect(robot).toHaveAttribute('aria-disabled', 'true')
    expect(robot).toHaveAttribute('tabindex', '-1')

    fireEvent.pointerEnter(robot)
    fireEvent.click(robot)
    toyFigure.focus()
    fireEvent.keyDown(toyFigure, { key: 'ArrowRight' })

    expect(onSelectCharacter).toHaveBeenLastCalledWith('toy-figure')
    expect(robot).not.toHaveFocus()
    expect(onRequestPreview).toHaveBeenLastCalledWith('character', 'toy-figure', 'selection')
  })

  it('requests lazy previews only after hover, focus, or selection intent', () => {
    const onRequestPreview = vi.fn()
    const onSelectEnvironment = vi.fn()
    render(
      <ContentPicker
        {...baseProps}
        onRequestPreview={onRequestPreview}
        onSelectEnvironment={onSelectEnvironment}
      />,
    )

    expect(onRequestPreview).not.toHaveBeenCalled()
    const valley = screen.getByRole('radio', { name: /Brick Valley/ })
    fireEvent.pointerEnter(valley)
    valley.focus()
    fireEvent.click(valley)

    expect(onRequestPreview.mock.calls).toEqual([
      ['environment', 'brick-valley', 'hover'],
      ['environment', 'brick-valley', 'focus'],
      ['environment', 'brick-valley', 'selection'],
    ])
    expect(onSelectEnvironment).toHaveBeenCalledWith('brick-valley')
  })

  it('supports roving focus and radio selection with arrows, Home, and End', () => {
    const onSelectEnvironment = vi.fn()
    const onRequestPreview = vi.fn()
    render(
      <ContentPicker
        {...baseProps}
        onSelectEnvironment={onSelectEnvironment}
        onRequestPreview={onRequestPreview}
      />,
    )

    const room = screen.getByRole('radio', { name: /Toy Room/ })
    const valley = screen.getByRole('radio', { name: /Brick Valley/ })
    const island = screen.getByRole('radio', { name: /Sky Island/ })
    room.focus()
    onRequestPreview.mockClear()

    fireEvent.keyDown(room, { key: 'ArrowRight' })
    expect(valley).toHaveFocus()
    expect(onSelectEnvironment).toHaveBeenLastCalledWith('brick-valley')
    expect(onRequestPreview).toHaveBeenCalledWith('environment', 'brick-valley', 'selection')

    fireEvent.keyDown(valley, { key: 'End' })
    expect(island).toHaveFocus()
    expect(onSelectEnvironment).toHaveBeenLastCalledWith('sky-island')

    fireEvent.keyDown(island, { key: 'Home' })
    expect(room).toHaveFocus()
    expect(onSelectEnvironment).toHaveBeenLastCalledWith('toy-room')
  })

  it('returns a fresh optional character palette for customizable profiles', () => {
    const palette = { primary: '#e7473c', accent: '#ffd34e' }
    const onPaletteChange = vi.fn()
    render(
      <ContentPicker
        {...baseProps}
        palette={palette}
        paletteGroups={[{
          key: 'primary',
          label: 'Suit',
          swatches: [
            { value: '#e7473c', label: 'Rocket red' },
            { value: '#3e83d7', label: 'Studio blue' },
          ],
        }]}
        onPaletteChange={onPaletteChange}
      />,
    )

    expect(screen.getByRole('button', { name: 'Set Suit to Rocket red' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Set Suit to Studio blue' }))

    expect(onPaletteChange).toHaveBeenCalledWith({ primary: '#3e83d7', accent: '#ffd34e' })
    expect(palette).toEqual({ primary: '#e7473c', accent: '#ffd34e' })
  })

  it('hides palette controls when the selected descriptor is not customizable', () => {
    const classic = {
      id: 'classic',
      name: 'Classic Guide',
      description: 'The original guide.',
      previewKey: 'character:classic',
      customizable: false,
    } satisfies CharacterDescriptor

    render(
      <ContentPicker
        {...baseProps}
        characterDescriptors={[classic, ...characters]}
        selectedCharacterId="classic"
        paletteGroups={[{
          key: 'primary',
          label: 'Suit',
          swatches: [{ value: '#e7473c', label: 'Rocket red' }],
        }]}
        onPaletteChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Set Suit to Rocket red' })).not.toBeInTheDocument()
  })

  it('keeps empty catalogs explicit and keyboard-safe', () => {
    render(
      <ContentPicker
        {...baseProps}
        environmentDescriptors={[]}
        characterDescriptors={[]}
        selectedEnvironmentId={null}
        selectedCharacterId={null}
      />,
    )

    expect(screen.getByText('No environments are available yet.')).toBeInTheDocument()
    expect(screen.getByText('No characters are available yet.')).toBeInTheDocument()
  })
})
