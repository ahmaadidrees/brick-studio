import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CharacterPreview, PREVIEW_DPR, PREVIEW_UNAVAILABLE_MESSAGE } from './CharacterPreview'

const media = vi.hoisted(() => ({ matches: false, listeners: new Set<() => void>() }))
const canvas = vi.hoisted(() => ({ props: [] as Record<string, unknown>[], mode: 'stub' as 'stub' | 'throw' }))

// jsdom has no WebGL: stand in for the R3F Canvas, recording the props the
// preview hands it (frameloop, dpr) and optionally failing like a lost context.
vi.mock('@react-three/fiber', async (importActual) => ({
  ...(await importActual<typeof import('@react-three/fiber')>()),
  Canvas: (props: Record<string, unknown>) => {
    if (canvas.mode === 'throw') throw new Error('Error creating WebGL context.')
    canvas.props.push(props)
    return <canvas data-frameloop={String(props.frameloop)} />
  },
}))

beforeEach(() => {
  media.matches = false
  media.listeners.clear()
  canvas.props = []
  canvas.mode = 'stub'
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: media.matches,
    addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
  })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const lastCanvas = () => canvas.props[canvas.props.length - 1]

describe('character preview controls', () => {
  it('offers Idle, Walk, Run, Jump and Pause as toggle buttons; choosing a motion resumes playback', () => {
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

  it('runs one Canvas at the capped DPR, continuously only while playing, and on demand once paused', () => {
    const view = render(<CharacterPreview characterId="classic" />)
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    expect(lastCanvas().dpr).toEqual(PREVIEW_DPR)
    expect(lastCanvas().frameloop).toBe('always')
    fireEvent.click(screen.getByRole('button', { name: 'Pause character animation' }))
    expect(lastCanvas().frameloop).toBe('demand')
    fireEvent.click(screen.getByRole('button', { name: 'Jump' }))
    expect(lastCanvas().frameloop).toBe('always')
  })

  it('keeps the selected animation paused when customization reframes the same preview', () => {
    const view = render(<CharacterPreview characterId="toy-figure" focus="body" />)
    fireEvent.click(screen.getByRole('button', { name: 'Walk' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pause character animation' }))
    view.rerender(<CharacterPreview characterId="toy-figure" focus="head" />)
    expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Play character animation' })).toBeInTheDocument()
    expect(lastCanvas().frameloop).toBe('demand')
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    expect(view.container.querySelector('.character-preview')).toHaveAttribute('data-focus', 'head')
  })

  it('renders on demand while the tab is hidden and resumes when it is shown again', () => {
    render(<CharacterPreview characterId="classic" />)
    const hidden = vi.spyOn(document, 'hidden', 'get')
    hidden.mockReturnValue(true)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(lastCanvas().frameloop).toBe('demand')
    hidden.mockReturnValue(false)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(lastCanvas().frameloop).toBe('always')
  })

  it('holds still on demand, hides Pause and explains itself under reduced motion from the system setting', () => {
    media.matches = true
    render(<CharacterPreview characterId="classic" />)
    expect(screen.queryByRole('button', { name: /character animation/ })).toBeNull()
    expect(screen.getByText(/Motion is reduced/)).toBeInTheDocument()
    expect(lastCanvas().frameloop).toBe('demand')
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

  it('keeps the controls usable and says so when the 3D context cannot be created', () => {
    canvas.mode = 'throw'
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<CharacterPreview characterId="pip" />)
      expect(screen.getByRole('status')).toHaveTextContent(PREVIEW_UNAVAILABLE_MESSAGE)
      expect(screen.getByRole('button', { name: 'Walk' })).toBeEnabled()
    } finally { error.mockRestore() }
  })
})
