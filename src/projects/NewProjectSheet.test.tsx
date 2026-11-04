import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KITS } from '../platformer/lab/kits'
import { NEW_PROJECT_HREF, NewProjectSheet } from './NewProjectSheet'
import { DEFAULT_BUILDER, FROM_NOTHING_HREF, GAME_START_HREF } from './gameStarts'

vi.mock('../platformer/ui/thumbs', () => ({ levelThumb: () => '' }))
vi.mock('../platformer/race/raceThumb', () => ({ raceThumb: () => '' }))
afterEach(cleanup)

const card = (name: string) => screen.getByRole('heading', { level: 3, name }).closest('article') as HTMLElement

describe('Make a game', () => {
  it('asks what to make, with one card per game, then 3D, then a starter for each game', () => {
    render(<NewProjectSheet open onClose={vi.fn()} onPick={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'What do you want to make?' })
    expect(within(dialog).getByText('Pick a start. Every brick can be changed later, and you can always make your own.')).toBeInTheDocument()
    const cards = [...dialog.querySelectorAll('article')].map((a) => a.querySelector('h3')?.textContent)
    expect(cards).toEqual(['Platformer', 'Racing'])
    expect(within(dialog).getByRole('button', { name: 'Or build in 3D' })).toBeInTheDocument()
    const starters = within(screen.getByRole('region', { name: 'Or play one first, then make it yours' })).getAllByRole('button')
    expect(starters.map((b) => b.querySelector('.projects-starter-title')?.textContent)).toEqual(['Workshop Run', 'Brick Speedway', 'Snowy Oval'])
    // The old five-card picker's kinds are gone.
    expect(within(dialog).queryByText(/Hackable Platformer|Hackable Racing|Empty field|Race track/)).toBeNull()
  })

  it('opens the classic builders by default, with the Hackable version one link away (owner decision, 2026-11-03)', () => {
    expect(DEFAULT_BUILDER).toEqual({ platformer: 'classic', race: 'classic' })
    const onPick = vi.fn()
    render(<NewProjectSheet open onClose={vi.fn()} onPick={onPick} />)

    fireEvent.click(within(card('Platformer')).getByRole('button', { name: 'Start a platformer' }))
    expect(onPick).toHaveBeenLastCalledWith('/2d/build?new=1')
    fireEvent.click(within(card('Platformer')).getByRole('button', { name: 'Start with code inside' }))
    expect(onPick).toHaveBeenLastCalledWith('/2d/hackable?new=1')

    fireEvent.click(within(card('Racing')).getByRole('button', { name: 'Start a race' }))
    expect(onPick).toHaveBeenLastCalledWith('/2d/build?new=1&kit=race-starter')
    fireEvent.click(within(card('Racing')).getByRole('button', { name: 'Start with code inside' }))
    expect(onPick).toHaveBeenLastCalledWith('/2d/hackable-race?new=1')

    expect(NEW_PROJECT_HREF.hackable).toBe(`${KITS.platformer.route}?new=1`)
    expect(NEW_PROJECT_HREF.hackableRace).toBe(`${KITS.race.route}?new=1`)
  })

  it('shows the picture of what Start opens: Speedway for the race kit, the beginner oval for Hackable Racing', () => {
    render(<NewProjectSheet open onClose={vi.fn()} onPick={vi.fn()} />)
    // The race kit's starter is Brick Speedway (src/platformer/PlatformerApp.tsx, kit=race-starter).
    expect(GAME_START_HREF.race.classic).toContain('kit=race-starter')
    expect(card('Racing').querySelector('img')).toHaveAttribute('src', '/brand/media/race-track-1200.webp')
    cleanup()

    // Flip the one switch: Start, its picture and the second link all follow.
    const onPick = vi.fn()
    render(<NewProjectSheet open onClose={vi.fn()} onPick={onPick} defaults={{ platformer: 'hackable', race: 'hackable' }} />)
    const racing = card('Racing')
    expect(racing.querySelector('img')).toHaveAttribute('src', '/brand/media/hackable-race-oval-800.webp')
    fireEvent.click(within(racing).getByRole('button', { name: 'Start a race' }))
    expect(onPick).toHaveBeenLastCalledWith('/2d/hackable-race?new=1')
    fireEvent.click(within(racing).getByRole('button', { name: 'Start without code' }))
    expect(onPick).toHaveBeenLastCalledWith('/2d/build?new=1&kit=race-starter')
    fireEvent.click(within(card('Platformer')).getByRole('button', { name: 'Start a platformer' }))
    expect(onPick).toHaveBeenLastCalledWith('/2d/hackable?new=1')
  })

  it('keeps "From nothing" off until Blank 2D has an address', () => {
    expect(FROM_NOTHING_HREF).toBeNull()
    render(<NewProjectSheet open onClose={vi.fn()} onPick={vi.fn()} />)
    expect(screen.queryByRole('heading', { name: 'From nothing' })).toBeNull()
    cleanup()

    const onPick = vi.fn()
    render(<NewProjectSheet open onClose={vi.fn()} onPick={onPick} fromNothingHref="/2d/blank?new=1" />)
    fireEvent.click(within(card('From nothing')).getByRole('button', { name: 'Start from nothing' }))
    expect(onPick).toHaveBeenLastCalledWith('/2d/blank?new=1')
  })

  it('starts a 3D build, and copies a starter into the builder as the kid’s own', () => {
    const onPick = vi.fn()
    render(<NewProjectSheet open onClose={vi.fn()} onPick={onPick} />)
    const build3d = screen.getByRole('button', { name: 'Or build in 3D' })
    expect(build3d).toHaveAccessibleDescription('Stack bricks on a plate, pick a scene, then walk around inside.')
    fireEvent.click(build3d)
    expect(onPick).toHaveBeenLastCalledWith('/build?new=1')
    fireEvent.click(screen.getByRole('button', { name: /Snowy Oval/ }))
    expect(onPick).toHaveBeenLastCalledWith('/2d/build?new=1&template=oval')
    fireEvent.click(screen.getByRole('button', { name: /Workshop Run/ }))
    expect(onPick).toHaveBeenLastCalledWith('/2d/build?new=1&template=workshop')
  })

  it('keeps the classic 3D builder first in the 3D row, with Hackable 3D one link away', () => {
    const onPick = vi.fn()
    render(<NewProjectSheet open onClose={vi.fn()} onPick={onPick} />)
    const build3d = screen.getByRole('button', { name: 'Or build in 3D' })
    const row = build3d.closest('.projects-3d') as HTMLElement
    const buttons = within(row).getAllByRole('button')
    // Start (the classic builder) comes first; the Hackable link is second.
    expect(buttons[0]).toBe(build3d)
    const hackable = within(row).getByRole('button', { name: 'Start with code inside' })
    expect(buttons.indexOf(hackable)).toBe(1)
    expect(hackable).toHaveAccessibleDescription('Or build in 3D')
    fireEvent.click(hackable)
    expect(onPick).toHaveBeenLastCalledWith('/3d/hackable?new=1')
    fireEvent.click(build3d)
    expect(onPick).toHaveBeenLastCalledWith('/build?new=1')
    expect(NEW_PROJECT_HREF.hackable3d).toBe(`${KITS['3d'].route}?new=1`)
    expect(NEW_PROJECT_HREF.build3d).toBe('/build?new=1')
  })

  it('tells a guest where the game saves, and signs in through onPick so an open game saves first', () => {
    const onPick = vi.fn()
    render(<NewProjectSheet open onClose={vi.fn()} onPick={onPick} />)
    expect(screen.getByText(/Your game saves on this computer\./)).toBeInTheDocument()
    const signIn = within(screen.getByText(/Your game saves on this computer\./)).getByRole('link', { name: 'Sign in' })
    expect(signIn).toHaveAttribute('href', '/join?mode=signin')
    fireEvent.click(signIn)
    expect(onPick).toHaveBeenLastCalledWith('/join?mode=signin')
  })

  it('puts the keyboard on the chosen game’s Start', () => {
    render(<NewProjectSheet open onClose={vi.fn()} onPick={vi.fn()} focusGame="race" />)
    expect(document.activeElement).toBe(within(card('Racing')).getByRole('button', { name: 'Start a race' }))
  })
})
