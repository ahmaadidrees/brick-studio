import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHARACTER_APPEARANCE } from '@brick-studio/core'
import { AppearanceControls, HAIR_COLORS, SKIN_TONES } from './AppearanceControls'

afterEach(cleanup)

describe('figure appearance controls', () => {
  it('emits complete controlled choices for every real category', () => {
    const onChange = vi.fn()
    render(<AppearanceControls locked={new Set()} onToggleLock={vi.fn()} onChange={onChange} />)
    for (const label of ['Body', 'Face', 'Hair & hats', 'Outfit', 'Accessory', 'Skin tone', 'Hair color']) {
      expect(screen.getByRole('group', { name: label })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: /^Freckles$/ }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CHARACTER_APPEARANCE, face: 'freckles' })
    fireEvent.click(screen.getByRole('button', { name: 'Set skin tone to Cocoa' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CHARACTER_APPEARANCE, skinColor: '#8d5a3a' })
    fireEvent.change(screen.getByLabelText('Custom hair color'), { target: { value: '#112233' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CHARACTER_APPEARANCE, hairColor: '#112233' })
  })

  it('reflects the current choices, including a short-hex color, and reports lock toggles', () => {
    const onToggleLock = vi.fn()
    render(<AppearanceControls appearance={{ ...DEFAULT_CHARACTER_APPEARANCE, hair: 'curls', skinColor: '#abc' }} locked={new Set(['hair'])} onToggleLock={onToggleLock} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^Curls$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Cap$/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Custom skin tone')).toHaveValue('#aabbcc')
    expect(screen.getByRole('button', { name: 'Keep hair & hats when mixing' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Keep body when mixing' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Keep body when mixing' }))
    expect(onToggleLock).toHaveBeenCalledWith('body')
  })

  it('offers the default skin and hair colors as presets so a fresh figure shows a selected tone', () => {
    expect(SKIN_TONES.some(tone => tone.value === DEFAULT_CHARACTER_APPEARANCE.skinColor)).toBe(true)
    expect(HAIR_COLORS.some(color => color.value === DEFAULT_CHARACTER_APPEARANCE.hairColor)).toBe(true)
    render(<AppearanceControls locked={new Set()} onToggleLock={vi.fn()} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Set skin tone to Sand' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Set hair color to Chestnut' })).toHaveAttribute('aria-pressed', 'true')
  })
})
