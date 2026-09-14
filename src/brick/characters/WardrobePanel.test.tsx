import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WardrobePanel } from './WardrobePanel'
import { loadWardrobe } from './wardrobe'
const appearance = { characterId: 'toy-figure' as const, palette: { primary: '#234567', accent: '#abcdef' } }
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

it('saves a named outfit, favorites it, and restores its appearance after reopening', () => {
  const onChoose = vi.fn()
  const view = render(<WardrobePanel appearance={appearance} onChoose={onChoose} />)
  fireEvent.change(screen.getByLabelText('Outfit name'), { target: { value: 'Moon explorer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save outfit' }))
  fireEvent.click(screen.getByRole('button', { name: 'Favorite Moon explorer' }))
  expect(loadWardrobe(localStorage)[0]).toMatchObject({ ...appearance, name: 'Moon explorer', favorite: true })
  view.unmount()
  render(<WardrobePanel appearance={{ characterId: 'classic', palette: {} }} onChoose={onChoose} />)
  expect(screen.getByRole('button', { name: 'Favorite Moon explorer' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: /^Moon explorer$/ }))
  expect(onChoose).toHaveBeenCalledWith(appearance)
})

it('reports failed saves without claiming that an outfit was saved', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota') })
  render(<WardrobePanel appearance={appearance} onChoose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Outfit name'), { target: { value: 'Explorer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save outfit' }))
  expect(screen.getByRole('status')).toHaveTextContent('Could not save')
  expect(screen.queryByRole('button', { name: 'Favorite Explorer' })).toBeNull()
})
