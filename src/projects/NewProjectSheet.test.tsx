import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { KITS } from '../platformer/lab/kits'
import { NEW_PROJECT_HREF, NewProjectSheet } from './NewProjectSheet'

vi.mock('../platformer/ui/thumbs', () => ({ levelThumb: () => '' }))
vi.mock('../platformer/race/raceThumb', () => ({ raceThumb: () => '' }))
afterEach(cleanup)

const card = (name: RegExp) => screen.getByRole('heading', { name }).closest('article') as HTMLElement

it('offers Hackable Racing next to the Hackable Platformer, each opening a new project at its own address', () => {
  const onPick = vi.fn()
  render(<NewProjectSheet open onClose={vi.fn()} onPick={onPick} />)
  const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.replace('New', '').trim())
  expect(titles.indexOf('Hackable Racing')).toBe(titles.indexOf('Hackable Platformer') + 1)

  fireEvent.click(within(card(/Hackable Platformer/)).getByRole('button', { name: 'Start a Hackable Platformer' }))
  expect(onPick).toHaveBeenLastCalledWith('/2d/hackable?new=1')
  const racing = card(/Hackable Racing/)
  expect(within(racing).getByText(/change how everything drives/)).toBeInTheDocument()
  fireEvent.click(within(racing).getByRole('button', { name: 'Start Hackable Racing' }))
  expect(onPick).toHaveBeenLastCalledWith('/2d/hackable-race?new=1')
  expect(NEW_PROJECT_HREF.hackableRace).toBe(`${KITS.race.route}?new=1`)
  // The older race track builder keeps its own card.
  expect(within(card(/^Race track$/)).getByRole('button', { name: 'Starter track' })).toBeInTheDocument()
})
