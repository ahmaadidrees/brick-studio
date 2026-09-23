import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from '../../brick/BrickStudioApp'
import { BRICK_COLORS } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { setRoboticsPrototypeOverride } from '../flag'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { installPaintMode } from './paint'

/**
 * Lane P in the studio shell (the Robot Workshop flag on; the studio's own tests keep the flag
 * off and prove nothing changed there): with a brick selected a drawer swatch paints it as one
 * Undo; the drawer remembers Robots across a reload; the command strip's Color popover slides
 * clear of the robot panel. The 3D scene is stubbed as in the studio's app tests.
 */
vi.mock('../../brick/BrickStudioScene', () => ({ default: () => <div data-testid="brick-scene" /> }))

const initialState = useBrickStore.getInitialState()
const red: BrickInstance = { id: 'red', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: BRICK_COLORS[0] }

beforeAll(() => {
  setRoboticsPrototypeOverride(true)
  installRoboticsParts(true)
  // The robot panel installs paint mode when it mounts (lazily); installed here so every test sees it.
  installPaintMode()
})
afterAll(() => setRoboticsPrototypeOverride(null))

let storage: Map<string, string>
beforeEach(() => {
  storage = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear() },
  })
  useBrickStore.setState({ ...initialState, bricks: [red], draft: null, undoStack: [], redoStack: [], selectedIds: [], selectedId: null, activeColor: BRICK_COLORS[5] }, true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the drawer in the Robot Workshop', () => {
  it('with a brick selected, a Brush color swatch paints it (one Undo) and sets the brush', () => {
    render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBrick(red.id))
    const drawer = within(screen.getByRole('complementary', { name: 'Brick drawer' }))
    fireEvent.click(drawer.getByRole('button', { name: `Use color ${BRICK_COLORS[3]}` }))
    expect(useBrickStore.getState().bricks[0].color).toBe(BRICK_COLORS[3])
    expect(useBrickStore.getState().activeColor).toBe(BRICK_COLORS[3])
    expect(useBrickStore.getState().undoStack.map((entry) => entry.label)).toEqual(['Paint brick green'])
    act(() => useBrickStore.getState().undo())
    expect(useBrickStore.getState().bricks[0].color).toBe(BRICK_COLORS[0])
    // Undo picks the brick again, as the studio's own recolour does.
    expect(useBrickStore.getState().selectedIds).toEqual([red.id])
  })

  it('several bricks picked (a whole kit just placed): the wheel keeps its colour, the rest is painted', () => {
    const wheel: BrickInstance = { id: 'wheel', partId: ROBOTICS_PART_IDS.wheel, x: 20, y: 0, z: 20, rotation: 0, color: '#1f2a33' }
    useBrickStore.setState({ bricks: [red, wheel] })
    render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBricks([red.id, wheel.id]))
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Brick drawer' })).getByRole('button', { name: `Use color ${BRICK_COLORS[6]}` }))
    expect(useBrickStore.getState().bricks.map((brick) => brick.color)).toEqual([BRICK_COLORS[6], '#1f2a33'])
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
  })

  it('with nothing selected a swatch only sets the brush', () => {
    render(<BrickStudioApp />)
    const drawer = within(screen.getByRole('complementary', { name: 'Brick drawer' }))
    fireEvent.click(drawer.getByRole('button', { name: `Use color ${BRICK_COLORS[3]}` }))
    expect(useBrickStore.getState().activeColor).toBe(BRICK_COLORS[3])
    expect(useBrickStore.getState().bricks[0].color).toBe(BRICK_COLORS[0])
    expect(useBrickStore.getState().undoStack).toHaveLength(0)
  })

  it('remembers Robots across a reload (this viewer’s browser only); storage that throws starts at All', async () => {
    const first = render(<BrickStudioApp />)
    // The Robots choice is a lazy chunk (the drawer mounts it behind the flag).
    fireEvent.click(await screen.findByRole('button', { name: /^Robots/ }, { timeout: 10_000 }))
    expect(screen.getByLabelText('Brick category')).toHaveValue('robotics')
    first.unmount()
    render(<BrickStudioApp />)
    expect(screen.getByLabelText('Brick category')).toHaveValue('robotics')
    cleanup()
    // Storage that refuses this key (blocked site data): the drawer starts at All and nothing breaks.
    const KEY = 'brickgineers.drawer-category'
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => { if (key === KEY) throw new Error('blocked'); return storage.get(key) ?? null },
        setItem: (key: string, value: string) => { if (key === KEY) throw new Error('blocked'); storage.set(key, value) },
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    })
    render(<BrickStudioApp />)
    expect(screen.getByLabelText('Brick category')).toHaveValue('all')
    fireEvent.change(screen.getByLabelText('Brick category'), { target: { value: 'plates' } })
    expect(screen.getByLabelText('Brick category')).toHaveValue('plates')
  })
})

describe('the Color popover beside the robot panel', () => {
  it('slides left until it clears a panel marked data-popover-avoid', () => {
    // Where things sit on a 1024 × 768 screen: the popover over the panel's lower left corner.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
      if (this.classList.contains('command-strip-popover')) {
        const shift = Number.parseFloat((this as HTMLElement).style.translate || '0')
        return box(560 + shift, 520, 236, 160)
      }
      if (this.hasAttribute('data-popover-avoid')) return box(640, 76, 300, 600)
      return box(0, 0, 0, 0)
    })
    render(<BrickStudioApp />)
    const panel = document.createElement('aside')
    panel.setAttribute('data-popover-avoid', '')
    document.body.append(panel)
    act(() => useBrickStore.getState().selectBrick(red.id))
    fireEvent.click(screen.getByRole('button', { name: 'Recolor brick' }))
    const popover = screen.getByRole('dialog', { name: 'Brick color' })
    // Its right edge (796) must end 8 px left of the panel (640): 164 px to the left.
    expect(popover.style.translate).toBe('-164px 0')
    expect(popover).not.toHaveAttribute('data-over-panel')
    panel.remove()
  })

  it('where it cannot slide clear (a panel across the screen), it says so, so the strip can rise over the panel', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
      if (this.classList.contains('command-strip-popover')) {
        const shift = Number.parseFloat((this as HTMLElement).style.translate || '0')
        return box(60 + shift, 520, 236, 160)
      }
      if (this.hasAttribute('data-popover-avoid')) return box(0, 76, 1024, 600)
      return box(0, 0, 0, 0)
    })
    render(<BrickStudioApp />)
    const panel = document.createElement('aside')
    panel.setAttribute('data-popover-avoid', '')
    document.body.append(panel)
    act(() => useBrickStore.getState().selectBrick(red.id))
    fireEvent.click(screen.getByRole('button', { name: 'Recolor brick' }))
    const popover = screen.getByRole('dialog', { name: 'Brick color' })
    expect(popover.style.translate).toBe('-52px 0')
    expect(popover).toHaveAttribute('data-over-panel')
    panel.remove()
  })

  it('with nothing marked it stays where the studio puts it', () => {
    render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBrick(red.id))
    fireEvent.click(screen.getByRole('button', { name: 'Recolor brick' }))
    expect(screen.getByRole('dialog', { name: 'Brick color' }).style.translate).toBe('')
  })
})
