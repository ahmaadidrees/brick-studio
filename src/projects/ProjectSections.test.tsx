import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level'
import { brickSpeedway } from '@brick-studio/platformer-core/levels/raceCourses'
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

it('moving everything asks first, listing each project’s kind and age, and moves only the ticked ones', async () => {
  state.create.mockImplementation(async (level: { title: string }) => ({ id: `acct-${level.title}`, format: '2d', title: level.title }))
  saveDraft(null, createBlankLevel(40, 20, 'Jumps'))
  saveDraft(null, { ...brickSpeedway(), title: 'Speedy' })
  const f = feedback()
  const onChanged = vi.fn()
  render(<LocalProjectsSection signedIn version={0} onChanged={onChanged} {...f} />)
  fireEvent.click(screen.getByRole('button', { name: 'Move all to my account' }))
  const dialog = screen.getByRole('dialog', { name: 'Move these to your account?' })
  expect(state.create).not.toHaveBeenCalled()
  expect(within(dialog).getByText(/Only move projects you made/)).toBeInTheDocument()
  const jumps = within(dialog).getByRole('checkbox', { name: /Jumps/ })
  const speedy = within(dialog).getByRole('checkbox', { name: /Speedy/ })
  expect(jumps).toBeChecked()
  expect(speedy).toBeChecked()
  expect(jumps.closest('label')).toHaveTextContent('Platformer · saved today')
  expect(speedy.closest('label')).toHaveTextContent('Race track · saved today')

  fireEvent.click(speedy)
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move 1 project' }))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
  expect(state.create).toHaveBeenCalledOnce()
  expect(state.create.mock.calls[0][0]).toMatchObject({ title: 'Jumps' })
  expect(listDrafts().map(d => d.title)).toEqual(['Speedy'])
  expect(f.onNotice).toHaveBeenCalledWith(expect.stringContaining('is in your account now'))
  expect(onChanged).toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('moving everything can be called off, and nothing ticked moves nothing', () => {
  saveDraft(null, createBlankLevel(40, 20, 'Jumps'))
  saveDraft(null, createBlankLevel(40, 20, 'Hops'))
  render(<LocalProjectsSection signedIn version={0} onChanged={vi.fn()} {...feedback()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Move all to my account' }))
  const dialog = screen.getByRole('dialog', { name: 'Move these to your account?' })
  expect(within(dialog).getByRole('button', { name: 'Move 2 projects' })).toBeEnabled()
  for (const box of within(dialog).getAllByRole('checkbox')) fireEvent.click(box)
  expect(within(dialog).getByRole('button', { name: 'Move 0 projects' })).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(state.create).not.toHaveBeenCalled()
  expect(listDrafts()).toHaveLength(2)
})

it('moving everything stops at the first failure and keeps the rest on this computer', async () => {
  state.create.mockRejectedValue(Object.assign(new Error('full'), { code: 'world_limit' }))
  saveDraft(null, createBlankLevel(40, 20, 'Jumps'))
  saveDraft(null, createBlankLevel(40, 20, 'Hops'))
  const f = feedback()
  render(<LocalProjectsSection signedIn version={0} onChanged={vi.fn()} {...f} />)
  fireEvent.click(screen.getByRole('button', { name: 'Move all to my account' }))
  await act(async () => {
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move 2 projects' }))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
  expect(state.create).toHaveBeenCalledOnce()
  expect(f.onError).toHaveBeenCalledWith('Your account is full. Remove a project you no longer need, then try again.')
  expect(listDrafts()).toHaveLength(2)
})
