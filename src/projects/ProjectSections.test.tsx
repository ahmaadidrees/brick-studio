import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level'
import { saveDraft, listDrafts } from '../platformer/ui/drafts'
import { LocalProjectsSection, StartersSection } from './ProjectSections'

const state = vi.hoisted(() => ({ create: vi.fn(), guest: vi.fn() }))
vi.mock('../platformer/ui/cloudLevel', () => ({ createCloudLevel: state.create }))
vi.mock('../platformer/ui/rooms', () => ({ playWithFriends: state.guest }))
vi.mock('../platformer/ui/thumbs', () => ({ levelThumb: () => '' }))
vi.mock('../platformer/race/raceThumb', () => ({ raceThumb: () => '' }))

const feedback = () => ({ onNotice: vi.fn(), onError: vi.fn(), navigate: vi.fn() })
beforeEach(() => {
  state.create.mockReset()
  state.guest.mockReset()
  localStorage.clear()
})
afterEach(cleanup)

it('starters with friends: signed in, a copy is saved to the account and opens ready to invite the class', async () => {
  state.create.mockResolvedValue({ id: 'saved-world' })
  const f = feedback()
  render(<StartersSection signedIn {...f} />)
  await act(async () => {
    fireEvent.click(within(screen.getByRole('article', { name: 'Snowy Oval' })).getByRole('button', { name: 'With friends' }))
    await Promise.resolve()
  })
  expect(state.create).toHaveBeenCalledOnce()
  expect(state.guest).not.toHaveBeenCalled()
  expect(f.navigate).toHaveBeenCalledWith('/2d/build?world=saved-world&share=1')
})

it('starters with friends: a failed account save stays on the page instead of quietly opening a guest room', async () => {
  state.create.mockRejectedValue(new Error('Account save unavailable'))
  const f = feedback()
  render(<StartersSection signedIn {...f} />)
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'With friends' })[0])
    await Promise.resolve()
  })
  expect(f.onError).toHaveBeenCalledWith('Account save unavailable')
  expect(state.guest).not.toHaveBeenCalled()
  expect(screen.getAllByRole('button', { name: 'With friends' })[0]).toBeEnabled()
})

it('a guest’s starter with friends opens a room', () => {
  state.guest.mockResolvedValue(undefined)
  render(<StartersSection signedIn={false} {...feedback()} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'With friends' })[0])
  expect(state.guest).toHaveBeenCalledOnce()
})

it('moving a project to the account removes it from this computer and says so', async () => {
  state.create.mockResolvedValue({ id: 'acct', format: '2d', title: 'Jumps' })
  saveDraft(null, createBlankLevel(40, 20, 'Jumps'))
  const f = feedback()
  const onChanged = vi.fn()
  render(<LocalProjectsSection signedIn version={0} onChanged={onChanged} {...f} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Move to my account' }))
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(listDrafts()).toEqual([])
  expect(f.onNotice).toHaveBeenCalledWith(expect.stringContaining('is in your account now'))
  expect(onChanged).toHaveBeenCalled()
})

it('removing a project from this computer asks first, offering a download', () => {
  saveDraft(null, createBlankLevel(40, 20, 'Jumps'))
  render(<LocalProjectsSection signedIn={false} version={0} onChanged={vi.fn()} {...feedback()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove Jumps from this computer' }))
  const dialog = screen.getByRole('dialog', { name: /Remove “Jumps”/ })
  expect(within(dialog).getByRole('button', { name: 'Download a copy' })).toBeInTheDocument()
  expect(listDrafts()).toHaveLength(1)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
  expect(listDrafts()).toEqual([])
})
