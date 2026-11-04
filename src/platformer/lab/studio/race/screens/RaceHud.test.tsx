import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LevelDesign } from '../../../core/contracts'
import { StudioStore } from '../../store'
import { roomGame, TestRoom } from '../../testRoom'
import { CAR_BRICK_ID, createRacerBrick } from '../carBrick'
import { createRaceStarterProject } from '../raceProject'
import { RACE_HUD_MS, RaceHud } from './RaceHud'

/** The starter race with a Car that drives itself (the Computer racers' blocks), so it finishes with nobody pressing keys. */
function selfDrivingStore(): StudioStore {
  const project = createRaceStarterProject()
  const racer = createRacerBrick().brick
  const design: LevelDesign = { ...project.design, bricks: project.design.bricks.map((b) => (b.id === CAR_BRICK_ID ? { ...b, program: racer.program } : b)) }
  return new StudioStore({ ...project, design })
}

/** Step the running race, then let the HUD read it. */
function race(store: StudioStore, ticks: number) {
  const runtime = store.getState().runtime!
  for (let i = 0; i < ticks; i++) runtime.step()
  act(() => { vi.advanceTimersByTime(RACE_HUD_MS) })
}

describe('RaceHud', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('shows the countdown big, then the lap and place, then the results card with Race again and Keep building', { timeout: 30_000 }, () => {
    const store = selfDrivingStore()
    store.play()
    render(<RaceHud store={store} />)
    race(store, 1)
    expect(document.querySelector('.race-countdown')?.textContent).toBe('3')
    expect(screen.getByText('Lap 1/3')).toBeTruthy()
    expect(document.querySelector('.race-hud-place')?.textContent).toMatch(/^(1st|2nd|3rd)$/)
    // The keys, while the race starts.
    expect(document.querySelector('.race-hint')?.textContent).toContain('gas')

    race(store, 3 * 30)
    expect(document.querySelector('.race-countdown')?.textContent).toBe('Go!')
    race(store, 30)
    expect(document.querySelector('.race-countdown')).toBeNull()

    let ticks = 0
    while (!screen.queryByRole('dialog', { name: 'Race results' }) && ticks < 4000) {
      race(store, 30)
      ticks += 30
    }
    const card = screen.getByRole('dialog', { name: 'Race results' })
    expect(card.textContent).toMatch(/You won!|2nd place|3rd place/)
    expect(card.querySelectorAll('li')).toHaveLength(3)
    expect(card.querySelector('li.is-you')?.textContent).toContain('You')
    expect(screen.getByText('Finished')).toBeTruthy()

    // Race again: a fresh race, from the countdown.
    const before = store.getState().runtime
    fireEvent.click(screen.getByRole('button', { name: 'Race again' }))
    expect(store.getState().runtime).not.toBe(before)
    expect(store.getState().mode).toBe('play')
    race(store, 1)
    expect(screen.queryByRole('dialog', { name: 'Race results' })).toBeNull()
    expect(screen.getByText('Lap 1/3')).toBeTruthy()
  })

  it('Keep building goes back to Build', { timeout: 30_000 }, () => {
    const store = selfDrivingStore()
    store.play()
    render(<RaceHud store={store} />)
    let ticks = 0
    while (!screen.queryByRole('dialog', { name: 'Race results' }) && ticks < 4000) {
      race(store, 30)
      ticks += 30
    }
    fireEvent.click(screen.getByRole('button', { name: 'Keep building' }))
    expect(store.getState().mode).toBe('build')
    expect(store.getState().runtime).toBeNull()
    expect(document.querySelector('.race-hud')).toBeNull()
  })

  it('in a room, the host\'s Play again starts the race clock again from the new "go"', { timeout: 30_000 }, () => {
    const project = createRaceStarterProject()
    const store = new StudioStore(project)
    const room = new TestRoom(roomGame(project.design, ['Maya', 'Sam']))
    store.enterRoom(room)
    store.play()
    render(<RaceHud store={store} />)
    race(store, 3 * 30 + 1)
    expect(document.querySelector('.race-countdown')?.textContent).toBe('Go!')
    race(store, 60)
    expect(screen.getByRole('timer').textContent).toMatch(/^⏱ 2\.\ds$/)

    // A new game under the same screen, the room's clock carrying on: no clock until its own "go".
    room.rebuild(roomGame(project.design, ['Maya', 'Sam'], room.game.world.tick))
    race(store, 1)
    expect(screen.queryByRole('timer')).toBeNull()
    expect(document.querySelector('.race-countdown')?.textContent).toBe('3')
    race(store, 3 * 30)
    race(store, 30)
    expect(screen.getByRole('timer').textContent).toMatch(/^⏱ [01]\.\ds$/)
  })

  it('hides the keys after a few seconds', () => {
    const store = selfDrivingStore()
    store.play()
    render(<RaceHud store={store} />)
    race(store, 1)
    expect(document.querySelector('.race-hint')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(8000) })
    expect(document.querySelector('.race-hint')).toBeNull()
  })
})
