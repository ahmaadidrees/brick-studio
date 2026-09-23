import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from '../../brick/BrickStudioApp'
import { useBrickStore } from '../../brick/store'
import { setRoboticsPrototypeOverride } from '../flag'
import { readRoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { useKitStore } from './kitPlacement'

/**
 * The drawer mount, end to end in the studio shell: the Robots choice, the kit shelf, choosing a
 * kit and placing it with the command strip's Place button, on the desktop drawer and in the touch
 * sheet. The 3D scene is stubbed as in the studio's own app tests; the ghost starts where the
 * camera looks, so Place alone puts the kit down.
 */
vi.mock('../../brick/BrickStudioScene', () => ({ default: () => <div data-testid="brick-scene" /> }))

const initialState = useBrickStore.getInitialState()

function stubMediaQueries(matching: string[]) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: matching.includes(query), media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(() => true),
  })))
}

beforeAll(() => {
  setRoboticsPrototypeOverride(true)
  installRoboticsParts(true)
})
afterAll(() => setRoboticsPrototypeOverride(null))

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() },
  })
  useBrickStore.setState({ ...initialState, bricks: [], draft: null, undoStack: [], redoStack: [], selectedIds: [], selectedId: null }, true)
  useKitStore.setState({ armed: null })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const robotNames = () => readRoboticsSection(useBrickStore.getState().documentMetadata.robotics).creations.map((creation) => creation.name)

describe('the drawer on a desktop', () => {
  it('a visible Robots choice opens Start with a kit; a kit card arms the kit and Place makes a robot', async () => {
    render(<BrickStudioApp />)
    const robots = await screen.findByRole('button', { name: /^Robots/ })
    expect(robots).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('Start with a kit')).not.toBeInTheDocument()
    fireEvent.click(robots)
    expect(robots).toHaveAttribute('aria-pressed', 'true')
    const shelf = within(await screen.findByTestId('kit-shelf'))
    expect(shelf.getByRole('heading', { name: 'Start with a kit' })).toBeInTheDocument()
    // The category list says Robots too, and the robot parts follow the kits.
    const category = screen.getByRole('combobox', { name: 'Brick category' }) as HTMLSelectElement
    expect(category.value).toBe('robotics')
    expect(category.selectedOptions[0].textContent).toBe('Robots')
    expect(screen.getByTitle('Hub')).toBeInTheDocument()
    // Four cards: a picture (drawn without WebGL here), a name and three words.
    const cards = shelf.getAllByRole('button')
    expect(cards.map((card) => card.textContent)).toEqual(['BuggyDrive it around', 'GateSwing it open', 'Signal lightLight it up', 'Robot baseBuild your own'])
    expect(document.querySelectorAll('[data-kit-illustration]')).toHaveLength(4)

    fireEvent.click(shelf.getByRole('button', { name: /Buggy/ }))
    expect(shelf.getByRole('button', { name: /Buggy/ })).toHaveAttribute('aria-pressed', 'true')
    expect(useBrickStore.getState().movingSelection?.name).toBe('Buggy')
    const strip = within(screen.getByRole('group', { name: 'Positioned brick actions' }))
    expect(strip.getByText('Placing')).toBeInTheDocument()
    expect(strip.getByText('Buggy')).toBeInTheDocument()
    // A kit stands on the ground and turns once placed: no raise, lower or turn while it is in hand.
    for (const name of ['Rotate', 'Raise brick one plate', 'Lower brick one plate']) expect(strip.getByRole('button', { name })).toBeDisabled()
    fireEvent.click(strip.getByRole('button', { name: 'Place Buggy' }))
    expect(useBrickStore.getState().bricks).toHaveLength(9)
    expect(robotNames()).toEqual(['Buggy'])
    expect(useBrickStore.getState().undoStack.map((entry) => entry.label)).toEqual(['Add Buggy'])
  })

  it('the Robots choice goes back to all bricks, and kits make way for a search', async () => {
    render(<BrickStudioApp />)
    const robots = await screen.findByRole('button', { name: /^Robots/ })
    fireEvent.click(robots)
    await screen.findByTestId('kit-shelf')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search bricks' }), { target: { value: 'wheel' } })
    expect(screen.queryByTestId('kit-shelf')).not.toBeInTheDocument()
    expect(screen.getByTitle('Wheel')).toBeInTheDocument()
    fireEvent.click(robots)
    expect(robots).toHaveAttribute('aria-pressed', 'false')
    expect((screen.getByRole('combobox', { name: 'Brick category' }) as HTMLSelectElement).value).toBe('all')
    expect((screen.getByRole('searchbox', { name: 'Search bricks' }) as HTMLInputElement).value).toBe('')
    expect(screen.queryByTestId('kit-shelf')).not.toBeInTheDocument()
  })
})

describe('the touch sheet', () => {
  it('has the Robots choice too; choosing a kit closes the sheet and Place puts it down', async () => {
    // A portrait tablet: the studio swaps the docked drawer for the (+) sheet.
    stubMediaQueries(['(pointer: coarse)', '(max-width: 900px)', '(any-pointer: coarse)'])
    vi.stubGlobal('innerWidth', 768)
    vi.stubGlobal('innerHeight', 1024)
    render(<BrickStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Open brick drawer' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Bricks' }))
    fireEvent.click(await sheet.findByRole('button', { name: /^Robots/ }))
    expect(sheet.getByRole('tab', { name: 'Robots' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(await sheet.findByTestId('kit-shelf')).getByRole('button', { name: /Gate/ }))
    expect(screen.queryByRole('dialog', { name: 'Bricks' })).not.toBeInTheDocument()
    expect(useBrickStore.getState().toast).toBe('Tap where your Gate goes, then press Place.')
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Place Gate' })) })
    expect(robotNames()).toEqual(['Gate'])
  })
})
