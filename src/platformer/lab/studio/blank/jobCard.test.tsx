import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { costumeFromImage, imageFromRows } from '../pixels'
import { StudioStore } from '../store'
import { StudioShell } from '../screen/StudioShell'
import { createBlankProject } from './blankProject'
import { giveJob } from './jobs'

vi.mock('../CodeEditor', () => ({ CodeEditor: () => <div aria-label="Docked code editor">Code editor</div> }))
afterEach(() => { cleanup(); localStorage.clear() })

const art = () => costumeFromImage('c', imageFromRows(Array.from({ length: 16 }, () => '#'.repeat(16)), { '#': '#34c77b' }))

function studioWithZip() {
  const store = new StudioStore(createBlankProject())
  const zip = store.addBrick('Zip', art())
  store.setBrush(null)
  const copy = store.addCopy(zip, 40, 40)
  render(<StudioShell store={store} />)
  return { store, zip, copy }
}

describe('Start from nothing: Give it a job (board 3a)', () => {
  it('picture to moving in three taps: the brick, Player, Walks around', () => {
    const { store, zip, copy } = studioWithZip()
    // Tap 1: the brick. Its card asks for a job instead of showing empty sliders.
    act(() => store.selectCopy(copy))
    const card = screen.getByRole('group', { name: 'Give Zip a job' })
    expect(within(card).getByRole('heading', { name: 'Give Zip a job' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Sliders' })).toBeNull()
    // Tap 2: Player. Tap 3: Walks around.
    fireEvent.click(within(card).getByRole('button', { name: /Player/ }))
    fireEvent.click(within(card).getByRole('button', { name: /Walks around/ }))
    const s = store.getState()
    expect(s.mode).toBe('play')
    expect(s.project.design.player).toBe(zip)
    const runtime = s.runtime!
    const me = runtime.world.targets.find((t) => t.brickId === zip)!
    runtime.pressKey('right arrow')
    for (let i = 0; i < 10; i++) runtime.step()
    expect(me.x).toBeGreaterThan(40)
  })

  it('a brick with a job shows it, its sliders, and Change; Make this the player is in the menu', () => {
    const { store, zip, copy } = studioWithZip()
    const star = store.addBrick('Star', art())
    store.setBrush(null)
    const starCopy = store.addCopy(star, 100, 40)
    act(() => { giveJob(store, star, 'collect') })
    act(() => store.selectCopy(starCopy))
    expect(screen.getByText('Job: Collect')).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'points' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make this the player' }))
    expect(store.getState().project.design.player).toBe(star)
    // Change takes the job off and asks again.
    fireEvent.click(screen.getByRole('button', { name: 'Change Star’s Collect job' }))
    fireEvent.click(screen.getByRole('button', { name: /Goal/ }))
    expect(store.brick(star)!.powers?.map((p) => p.job)).toEqual(['goal'])
    act(() => store.selectCopy(copy))
    expect(screen.getByRole('group', { name: 'Give Zip a job' })).toBeTruthy()
    void zip
  })

  it('tiles can’t be the player, and new Tiles start solid (the Wall job)', () => {
    const store = new StudioStore(createBlankProject())
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'or pick a picture' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Brick' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make my brick' }))
    const brick = store.getState().project.design.bricks[0]
    expect(brick.grid).toBeTruthy()
    expect(brick.powers?.map((p) => p.job)).toEqual(['wall'])
  })
})
