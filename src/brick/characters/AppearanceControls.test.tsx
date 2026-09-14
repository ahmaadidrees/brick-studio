import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHARACTER_APPEARANCE } from '@brick-studio/core'
import { AppearanceControls, randomizeCharacterAppearance } from './AppearanceControls'

describe('figure appearance controls', () => {
  it('preserves kept categories and colors while changing unlocked choices', () => {
    const result = randomizeCharacterAppearance(DEFAULT_CHARACTER_APPEARANCE, new Set(['body', 'hair']), () => 0)
    expect(result.body).toBe('classic')
    expect(result.hair).toBe('cap')
    expect(result.face).not.toBe('friendly')
    expect(result.outfit).not.toBe('explorer')
    expect(result.accessory).not.toBe('none')
    expect(result.skinColor).toBe(DEFAULT_CHARACTER_APPEARANCE.skinColor)
  })
  it('emits controlled choices and honors a category lock when mixing', () => {
    const onChange = vi.fn()
    render(<AppearanceControls onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^Freckles$/ }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_CHARACTER_APPEARANCE, face: 'freckles' })
    fireEvent.click(screen.getByRole('button', { name: 'Keep hair & hats when mixing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mix it up' }))
    expect(onChange.mock.lastCall?.[0].hair).toBe('cap')
    expect(screen.getByRole('button', { name: /^Cap$/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
