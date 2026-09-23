import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from '../../brick/BrickStudioApp'
import { OnboardingGuide } from '../../brick/OnboardingGuide'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from '../../brick/documentPersistence'
import { initialBrush, useBrickStore } from '../../brick/store'
import { setRoboticsPrototypeOverride } from '../flag'
import { installRoboticsParts } from '../parts/install'
import { answerRobotsDrawer, robotsDrawerPending } from './drawerRequest'

/**
 * The first screen with and without the Robot Workshop prototype, and a placement written to the
 * guest project at once in the prototype. The 3D scene is stubbed as in the studio's own app tests.
 */
vi.mock('../../brick/BrickStudioScene', () => ({ default: () => <div data-testid="brick-scene" /> }))

const initialState = useBrickStore.getInitialState()
let stored: Map<string, string>

beforeAll(() => installRoboticsParts(true))
beforeEach(() => {
  stored = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key), clear: () => stored.clear() },
  })
  answerRobotsDrawer()
})
afterEach(() => {
  cleanup()
  setRoboticsPrototypeOverride(null)
  vi.useRealTimers()
})
afterAll(() => setRoboticsPrototypeOverride(null))

describe('the quick start', () => {
  it('without the prototype it is the studio guide, unchanged', () => {
    setRoboticsPrototypeOverride(false)
    render(<OnboardingGuide onDismiss={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Build something you can explore' })).toBeInTheDocument()
    expect(screen.queryByText("Let's build!")).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Build a robot/ })).not.toBeInTheDocument()
  })

  it('with the prototype: three pictures, a few words each, Start building and Build a robot', async () => {
    setRoboticsPrototypeOverride(true)
    const dismiss = vi.fn()
    render(<OnboardingGuide onDismiss={dismiss} />)
    const guide = within(await screen.findByTestId('kid-quick-start'))
    expect(guide.getByRole('heading', { name: "Let's build!" })).toBeInTheDocument()
    const tips = guide.getAllByRole('listitem')
    expect(tips).toHaveLength(3)
    for (const tip of tips) expect(tip.querySelector('svg')).not.toBeNull()
    // Both pointer vocabularies are in the page; CSS shows the one for the device in hand.
    expect(tips.map((tip) => tip.textContent)).toEqual(['Pick a part', 'Click to place itTap, then Place', 'Right-drag to look aroundDrag to look around'])
    // Every tip is a handful of words.
    for (const words of ['Pick a part', 'Click to place it', 'Tap, then Place', 'Right-drag to look around', 'Drag to look around']) expect(words.split(' ').length).toBeLessThanOrEqual(4)
    fireEvent.click(guide.getByRole('button', { name: 'Start building' }))
    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(robotsDrawerPending()).toBe(false)
    fireEvent.click(guide.getByRole('button', { name: /Build a robot/ }))
    expect(dismiss).toHaveBeenCalledTimes(2)
    expect(robotsDrawerPending()).toBe(true)
    // The close button keeps the studio's name, so every script still dismisses it the same way.
    expect(guide.getByRole('button', { name: 'Dismiss quick start' })).toBeInTheDocument()
  })

  it('in the studio: nothing in hand, and Build a robot opens the drawer on Start with a kit', async () => {
    setRoboticsPrototypeOverride(true)
    useBrickStore.setState({ ...initialState, ...initialBrush(true), bricks: [], undoStack: [], redoStack: [], selectedIds: [], selectedId: null }, true)
    render(<BrickStudioApp />)
    // The robotics chunks load lazily; under a full parallel run that can take more than a second.
    const guide = await screen.findByTestId('kid-quick-start', {}, { timeout: 8000 })
    expect(useBrickStore.getState().draft).toBeNull()
    expect(screen.queryByTestId('kit-shelf')).not.toBeInTheDocument()
    fireEvent.click(within(guide).getByRole('button', { name: /Build a robot/ }))
    expect(await screen.findByTestId('kit-shelf', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.queryByTestId('kid-quick-start')).not.toBeInTheDocument()
    expect((screen.getByRole('combobox', { name: 'Brick category' }) as HTMLSelectElement).value).toBe('robotics')
    expect(stored.get('brick-studio:onboarding:v1')).toBe('dismissed')
  })
})

describe('the guest project', () => {
  it('with the prototype, a placed brick is written at once, not after the quiet period', async () => {
    setRoboticsPrototypeOverride(true)
    stored.set('brick-studio:onboarding:v1', 'dismissed')
    useBrickStore.setState({ ...initialState, ...initialBrush(true), bricks: [], undoStack: [], redoStack: [], selectedIds: [], selectedId: null }, true)
    render(<BrickStudioApp />)
    await screen.findByTestId('brick-scene', {}, { timeout: 8000 })
    vi.useFakeTimers()
    await act(async () => {
      useBrickStore.getState().choosePart('brick_2x2')
      useBrickStore.getState().setDraftPosition(10, 0, 10)
      useBrickStore.getState().placeDraft()
      await Promise.resolve()
    })
    // No timer has run: the write happened with the placement.
    const saved = JSON.parse(stored.get(BRICK_STUDIO_LOCAL_STORAGE_KEY) ?? '{"bricks":[]}')
    expect(saved.bricks.map((brick: { partId: string }) => brick.partId)).toEqual(['brick_2x2'])
  })

  it('without the prototype the studio waits for its quiet period as before', async () => {
    setRoboticsPrototypeOverride(false)
    stored.set('brick-studio:onboarding:v1', 'dismissed')
    useBrickStore.setState({ ...initialState, ...initialBrush(false), bricks: [], undoStack: [], redoStack: [], selectedIds: [], selectedId: null }, true)
    render(<BrickStudioApp />)
    await screen.findByTestId('brick-scene', {}, { timeout: 8000 })
    vi.useFakeTimers()
    await act(async () => {
      useBrickStore.getState().choosePart('brick_2x2')
      useBrickStore.getState().setDraftPosition(10, 0, 10)
      useBrickStore.getState().placeDraft()
      await Promise.resolve()
    })
    expect(JSON.parse(stored.get(BRICK_STUDIO_LOCAL_STORAGE_KEY) ?? '{"bricks":[]}').bricks).toHaveLength(0)
    await act(async () => { vi.advanceTimersByTime(450) })
    expect(JSON.parse(stored.get(BRICK_STUDIO_LOCAL_STORAGE_KEY) ?? '{"bricks":[]}').bricks).toHaveLength(1)
  })
})
