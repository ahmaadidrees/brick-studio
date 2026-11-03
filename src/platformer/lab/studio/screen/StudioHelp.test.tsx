import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { StudioShell } from './StudioShell'
import { TIPS_SEEN_KEY, markTipsSeen, tipsSeen } from './firstRunTips'
import { helpFor } from './StudioHelp'
import { createRaceStarterProject } from '../race/raceProject'
import { RACE_COPY, RACE_HELP } from '../race/raceCopy'
import { KIT_SCREENS } from '../kitScreens'

vi.mock('../gridBricks', async (orig) => ({ ...(await orig<typeof import('../gridBricks')>()), gridBrickTemplate: (await import('../builder/testGridBricks')).fakeGridTemplate }))
vi.mock('../CodeEditor', () => ({ CodeEditor: () => <div aria-label="Docked code editor">Code editor</div> }))

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })

const tips = () => screen.queryByRole('region', { name: 'Three steps to start' })
const studio = (firstRunTips = true) => render(<StudioShell store={new StudioStore(createStarterProject())} firstRunTips={firstRunTips} />)
/** A browser whose storage refuses every read and write (private modes, blocked site data). */
function blockStorage() {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
}

describe('first-run tips: remembered once per browser', () => {
  it('starts unseen, and is seen once marked', () => {
    expect(tipsSeen()).toBe(false)
    markTipsSeen()
    expect(tipsSeen()).toBe(true)
    expect(localStorage.getItem(TIPS_SEEN_KEY)).toBe('seen')
  })

  it('never throws when storage is blocked: the tips just count as unseen', () => {
    blockStorage()
    expect(() => markTipsSeen()).not.toThrow()
    expect(tipsSeen()).toBe(false)
  })
})

describe('first-run tips in the studio', () => {
  it('show Build, Code and Play the first time, and close with Got it', () => {
    studio()
    const card = tips()!
    expect(card).toBeTruthy()
    expect(within(card).getByText('Build.')).toBeTruthy()
    expect(within(card).getByText(/Switch a script off to see what it does/)).toBeTruthy()
    expect(within(card).getByText('Play.')).toBeTruthy()
    // Never modal: the level and the drawer stay usable around it.
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Got it' }))
    expect(tips()).toBeNull()
  })

  it('show only once: the next visit in this browser starts without them', () => {
    const first = studio()
    expect(tips()).toBeTruthy()
    expect(tipsSeen()).toBe(true)
    first.unmount()
    studio()
    expect(tips()).toBeNull()
  })

  it('the close button closes them too', () => {
    studio()
    fireEvent.click(screen.getByRole('button', { name: 'Close the tips' }))
    expect(tips()).toBeNull()
  })

  it('still show, and still close, when storage throws', () => {
    blockStorage()
    studio()
    expect(tips()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(tips()).toBeNull()
  })

  it('stay off unless the page asks for them (tests and embeds)', () => {
    studio(false)
    expect(tips()).toBeNull()
  })

  it('wait while Code or Play is open, and come back in Build until closed', () => {
    studio()
    fireEvent.click(screen.getByRole('radio', { name: 'Code' }))
    expect(tips()).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Build' }))
    expect(tips()).toBeTruthy()
  })
})

describe('Help in the studio header', () => {
  it('opens how-tos for Build, Code, Play and saving, with a link to the site help', () => {
    studio(false)
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    const help = screen.getByRole('dialog', { name: 'Help' })
    for (const heading of ['Build', 'Code', 'Play', 'Saving and sharing']) expect(within(help).getByRole('heading', { name: heading })).toBeTruthy()
    expect(within(help).getByText(/every script has an On\/Off switch/)).toBeTruthy()
    expect(within(help).getByText('+ Power:')).toBeTruthy()
    expect(within(help).getByText('My Blocks:')).toBeTruthy()
    const more = within(help).getByRole('link', { name: 'More help' })
    expect(more.getAttribute('href')).toBe('/help#how')
    expect(more.getAttribute('target')).toBe('_blank')
  })

  it('"Show the first-run tips again" closes Help and shows them, even after they were seen', () => {
    markTipsSeen()
    studio()
    expect(tips()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show the first-run tips again' }))
    expect(screen.queryByRole('dialog', { name: 'Help' })).toBeNull()
    expect(tips()).toBeTruthy()
  })

  it('brings the kid back to Build for the tips', () => {
    studio(false)
    fireEvent.click(screen.getByRole('radio', { name: 'Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show the first-run tips again' }))
    expect(screen.getByRole('radio', { name: 'Build' }).getAttribute('aria-checked')).toBe('true')
    expect(tips()).toBeTruthy()
  })
})

describe('in a race project (Hackable Racing)', () => {
  const race = () => render(<StudioShell store={new StudioStore(createRaceStarterProject())} firstRunTips />)

  it('the tips have their own key: a kid who saw the Platformer’s still sees the race ones, once', () => {
    expect(RACE_COPY.tipsKey).not.toBe(TIPS_SEEN_KEY)
    markTipsSeen()
    const first = race()
    const card = tips()!
    expect(card).toBeTruthy()
    expect(within(card).getByText(/paint the track/)).toBeTruthy()
    expect(within(card).getByText(/see how it drives/)).toBeTruthy()
    expect(within(card).getByText('Press Play to race your track.')).toBeTruthy()
    expect(tipsSeen(undefined, RACE_COPY.tipsKey)).toBe(true)
    first.unmount()
    race()
    expect(tips()).toBeNull()
  })

  it('seeing the race tips does not count as seeing the Platformer’s', () => {
    markTipsSeen(undefined, RACE_COPY.tipsKey)
    expect(tipsSeen()).toBe(false)
    studio()
    expect(tips()).toBeTruthy()
  })

  it('Help talks about the track, the Car and racing, and leaves out + Power', () => {
    render(<StudioShell store={new StudioStore(createRaceStarterProject())} firstRunTips={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    const help = screen.getByRole('dialog', { name: 'Help' })
    expect(within(help).getByText('How to build, code and race your track.')).toBeTruthy()
    expect(within(help).getByText(/paint the track/)).toBeTruthy()
    expect(within(help).getByText(/Tap your Car to change its sliders/)).toBeTruthy()
    expect(within(help).getByText(/left and right steer, up is gas and down is brake/)).toBeTruthy()
    expect(within(help).queryByText('+ Power:')).toBeNull()
    expect(within(help).getByText('My Blocks:')).toBeTruthy()
  })
})

describe('the words a kid reads in a race project', () => {
  it('say track, Car and race, never the studio’s own words', () => {
    const words = JSON.stringify(RACE_COPY).toLowerCase()
    for (const engine of ['tick', 'sprite', 'kit', 'platformer', 'hero', 'level']) expect(words).not.toContain(engine)
    expect(helpFor(KIT_SCREENS.race.copy)).toBe(RACE_HELP)
    expect(helpFor(KIT_SCREENS.platformer.copy).power).toBe(true)
  })
})
