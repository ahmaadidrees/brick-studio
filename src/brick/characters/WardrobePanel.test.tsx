import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { WARDROBE_BLOCKED_MESSAGE, WardrobePanel } from './WardrobePanel'
import { loadWardrobe, WARDROBE_STORAGE_KEY } from './wardrobe'

const appearance = { characterId: 'toy-figure' as const, palette: { primary: '#234567', accent: '#abcdef' } }
const descriptors = [{ id: 'toy-figure' as const, name: 'Toy Figure', description: '', previewKey: 'character:toy-figure', customizable: true }]
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

describe('wardrobe panel', () => {
  it('saves a named outfit, favorites it, and restores its appearance after reopening', () => {
    const onChoose = vi.fn()
    const view = render(<WardrobePanel appearance={appearance} onChoose={onChoose} characterDescriptors={descriptors} />)
    expect(screen.getByText(/No saved outfits yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save outfit' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Outfit name'), { target: { value: 'Moon explorer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save outfit' }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved “Moon explorer” on this device.')
    expect(screen.getByLabelText('Outfit name')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Favorite Moon explorer' }))
    expect(loadWardrobe(localStorage)[0]).toMatchObject({ ...appearance, name: 'Moon explorer', favorite: true })
    view.unmount()
    render(<WardrobePanel appearance={{ characterId: 'classic', palette: {} }} onChoose={onChoose} characterDescriptors={descriptors} />)
    expect(screen.getByRole('button', { name: 'Favorite Moon explorer' })).toHaveAttribute('aria-pressed', 'true')
    const look = screen.getByRole('button', { name: 'Moon explorer' })
    expect(within(look).getByText('Toy Figure')).toBeInTheDocument()
    fireEvent.click(look)
    expect(onChoose).toHaveBeenCalledWith(appearance)
    expect(screen.getByText(/Saved on this device\./)).toBeInTheDocument()
  })

  it('asks before removing and keeps the outfit when the removal is declined', () => {
    localStorage.setItem(WARDROBE_STORAGE_KEY, JSON.stringify({ version: 1, outfits: [{ id: 'a', name: 'Keeper', characterId: 'pip', palette: {}, favorite: false }] }))
    render(<WardrobePanel appearance={appearance} onChoose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Keeper' }))
    expect(screen.getByRole('group', { name: 'Remove Keeper?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep Keeper' }))
    expect(screen.queryByRole('group', { name: 'Remove Keeper?' })).toBeNull()
    expect(loadWardrobe(localStorage)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Keeper' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove Keeper' }))
    expect(loadWardrobe(localStorage)).toEqual([])
    expect(screen.getByRole('status')).toHaveTextContent('Removed “Keeper”.')
    expect(screen.queryByRole('button', { name: /Keeper/ })).toBeNull()
  })

  it('reports failed saves without claiming that an outfit was saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') })
    render(<WardrobePanel appearance={appearance} onChoose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Outfit name'), { target: { value: 'Explorer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save outfit' }))
    expect(screen.getByRole('status')).toHaveTextContent('Could not save')
    expect(screen.queryByRole('button', { name: 'Favorite Explorer' })).toBeNull()
    expect(screen.getByLabelText('Outfit name')).toHaveValue('Explorer')
  })

  it('says so, disables saving, and never throws when browser storage is blocked', () => {
    const blocked = { getItem: () => { throw new DOMException('blocked', 'SecurityError') }, setItem: () => { throw new DOMException('blocked', 'SecurityError') } }
    render(<WardrobePanel appearance={appearance} onChoose={vi.fn()} storage={blocked} />)
    expect(screen.getByRole('status')).toHaveTextContent(WARDROBE_BLOCKED_MESSAGE)
    expect(screen.getByLabelText('Outfit name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save outfit' })).toBeDisabled()
    expect(screen.queryByText(/No saved outfits yet/)).toBeNull()
  })

  it('survives a window.localStorage accessor that throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new DOMException('blocked', 'SecurityError') } })
    try {
      render(<WardrobePanel appearance={appearance} onChoose={vi.fn()} />)
      expect(screen.getByRole('status')).toHaveTextContent(WARDROBE_BLOCKED_MESSAGE)
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })
})
