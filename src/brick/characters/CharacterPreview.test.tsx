import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterPreview } from './CharacterPreview'

const media = vi.hoisted(() => ({ matches: false, listeners: new Set<() => void>() }))

beforeEach(() => {
  media.matches = false
  media.listeners.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: media.matches,
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

describe('character preview controls', () => {
  it('offers Idle, Walk, Run, Jump and Pause; choosing a motion resumes playback', () => {
    render(<CharacterPreview characterId="classic" />)
    const group = screen.getByRole('group', { name: 'Preview animation' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Idle' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Walk' }))
    expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Idle' })).toHaveAttribute('aria-pressed', 'false')
    const pause = screen.getByRole('button', { name: 'Pause character animation' })
    fireEvent.click(pause)
    expect(screen.getByRole('button', { name: 'Play character animation' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(screen.getByRole('button', { name: 'Pause character animation' })).toBeInTheDocument()
    expect(screen.getByText('Drag to turn')).toBeInTheDocument()
  })

  it('holds still, hides Pause and explains itself under reduced motion from the system setting', () => {
    media.matches = true
    render(<CharacterPreview characterId="classic" />)
    expect(screen.queryByRole('button', { name: /character animation/ })).toBeNull()
    expect(screen.getByText(/Motion is reduced/)).toBeInTheDocument()
  })

  it('follows the studio motion preference and its change event', () => {
    localStorage.setItem('brick-studio-motion-preference-v1', 'reduced')
    render(<CharacterPreview characterId="classic" />)
    expect(screen.getByText(/Motion is reduced/)).toBeInTheDocument()
    localStorage.setItem('brick-studio-motion-preference-v1', 'full')
    act(() => { window.dispatchEvent(new Event('brick-studio-motion-preference-change')) })
    expect(screen.queryByText(/Motion is reduced/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Pause character animation' })).toBeInTheDocument()
  })

  it('renders exactly one stage and one animation group per preview', () => {
    const view = render(<CharacterPreview characterId="pip" />)
    expect(view.container.querySelectorAll('.character-preview__stage')).toHaveLength(1)
    expect(view.container.querySelectorAll('.character-preview__controls')).toHaveLength(1)
  })
})
