import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'

vi.mock('./BrickStudioScene', () => ({
  default: () => <div data-testid="brick-scene" />,
}))

const initialState = useBrickStore.getInitialState()
const brick: BrickInstance = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }

function resetStore(bricks: BrickInstance[] = []) {
  useBrickStore.setState({
    ...initialState,
    bricks: bricks.map((brick) => ({ ...brick })),
    selectedId: null,
    draft: bricks.length ? null : initialState.draft ? { ...initialState.draft } : null,
    undoStack: [],
    redoStack: [],
    viewRequest: { ...initialState.viewRequest },
    touchMove: { ...initialState.touchMove },
  }, true)
}

beforeEach(() => resetStore())
afterEach(() => cleanup())

describe('keyboard construction loop', () => {
  it('places with Enter/Space, cancels with Escape, and never double-acts from a button', () => {
    render(<BrickStudioApp />)

    expect(screen.getByLabelText('0 of 250 brick budget for desktop')).toBeInTheDocument()
    expect(fireEvent.keyDown(document.body, { key: 'Enter' })).toBe(false)
    expect(useBrickStore.getState().bricks).toHaveLength(1)

    const partButton = screen.getByTitle('1 × 1 Brick')
    fireEvent.click(partButton)
    act(() => useBrickStore.getState().setDraftPosition(10, 0, 10))
    expect(fireEvent.keyDown(partButton, { key: ' ' })).toBe(true)
    expect(useBrickStore.getState().bricks).toHaveLength(1)

    expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(false)
    expect(useBrickStore.getState().bricks).toHaveLength(2)

    fireEvent.click(partButton)
    expect(useBrickStore.getState().draft).not.toBeNull()
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(false)
    expect(useBrickStore.getState().draft).toBeNull()
  })

  it('selects semantically, keeps arrows native in the selector, and still supports edit/delete/undo', () => {
    const bricks: BrickInstance[] = [
      { id: 'one', partId: 'brick_1x1', x: 4, y: 0, z: 4, rotation: 0, color: '#fff' },
      { id: 'two', partId: 'brick_1x2', x: 8, y: 0, z: 8, rotation: 0, color: '#fff' },
    ]
    resetStore(bricks)
    render(<BrickStudioApp />)
    const selector = screen.getByLabelText('Placed bricks')

    fireEvent.change(selector, { target: { value: 'two' } })
    expect(useBrickStore.getState().selectedId).toBe('two')
    expect(screen.getByRole('status')).toHaveTextContent('brick 2 of 2')

    const beforeArrow = useBrickStore.getState().bricks[1]
    expect(fireEvent.keyDown(selector, { key: 'ArrowRight' })).toBe(true)
    expect(useBrickStore.getState().bricks[1]).toEqual(beforeArrow)

    fireEvent.keyDown(selector, { key: 'r' })
    expect(useBrickStore.getState().bricks[1].rotation).toBe(1)
    fireEvent.keyDown(selector, { key: 'Delete' })
    expect(useBrickStore.getState().bricks).toHaveLength(1)
    fireEvent.keyDown(selector, { key: 'z', metaKey: true })
    expect(useBrickStore.getState().bricks).toHaveLength(2)
  })

  it('cycles selection with bracket keys and gives visible and live-region feedback', () => {
    resetStore([
      { id: 'one', partId: 'brick_1x1', x: 4, y: 0, z: 4, rotation: 0, color: '#fff' },
      { id: 'two', partId: 'brick_1x2', x: 8, y: 0, z: 8, rotation: 0, color: '#fff' },
    ])
    render(<BrickStudioApp />)

    expect(fireEvent.keyDown(document.body, { key: ']' })).toBe(false)
    expect(useBrickStore.getState().selectedId).toBe('one')
    expect(screen.getByRole('status')).toHaveTextContent('brick 1 of 2')
    expect(screen.getByText('1 × 1 Brick', { selector: '.brick-inspector h2' })).toBeInTheDocument()
  })
})

describe('live move feedback', () => {
  it('shows Moving and the draft coordinates rather than stale selected-brick coordinates', () => {
    resetStore([
      { id: 'one', partId: 'brick_1x1', x: 4, y: 0, z: 4, rotation: 0, color: '#fff' },
    ])
    useBrickStore.setState({ selectedId: 'one' })
    const { container } = render(<BrickStudioApp />)

    fireEvent.click(screen.getAllByLabelText('Move brick')[0])
    act(() => useBrickStore.getState().setDraftPosition(12, 3, 14))

    expect(screen.getByText('Moving')).toBeInTheDocument()
    expect(Array.from(container.querySelectorAll('.coordinates strong')).map((element) => element.textContent)).toEqual(['12', '3', '14'])
  })
})

describe('Brick Studio responsive controls', () => {
  it('keeps history, brick count, navigation, and the compact property control reachable', () => {
    render(<BrickStudioApp />)

    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
    expect(screen.getByLabelText('0 of 250 brick budget for desktop')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rover Lab' })).toBeInTheDocument()

    const properties = screen.getByRole('button', { name: 'Show brick properties' })
    expect(properties).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(properties)
    expect(screen.getByRole('button', { name: 'Hide brick properties' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('uses the same zero-brick Explore guard for the button and 2 shortcut', () => {
    render(<BrickStudioApp />)

    expect(screen.getByRole('button', { name: 'Explore mode' })).toBeDisabled()
    fireEvent.keyDown(document.body, { key: '2' })
    expect(useBrickStore.getState().mode).toBe('build')

    useBrickStore.setState({ bricks: [brick] })
    fireEvent.keyDown(document.body, { key: '2' })
    expect(useBrickStore.getState().mode).toBe('explore')
  })

  it('resets touch movement on pointer interruptions, blur, visibility loss, and return to Build', () => {
    useBrickStore.setState({ bricks: [brick], mode: 'explore' })
    render(<BrickStudioApp />)
    const joystick = screen.getByRole('application', { name: 'Movement joystick' })
    const expectResetAfter = (event: () => void) => {
      useBrickStore.setState({ touchMove: { x: 0.7, z: -0.4 } })
      event()
      expect(useBrickStore.getState().touchMove).toEqual({ x: 0, z: 0 })
    }

    expectResetAfter(() => fireEvent.pointerUp(joystick))
    expectResetAfter(() => fireEvent.pointerCancel(joystick))
    expectResetAfter(() => fireEvent.lostPointerCapture(joystick))
    expectResetAfter(() => fireEvent.blur(window))

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    expectResetAfter(() => fireEvent(document, new Event('visibilitychange')))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    useBrickStore.setState({ touchMove: { x: 0.7, z: -0.4 } })
    fireEvent.click(screen.getByRole('button', { name: 'Return to Build' }))
    expect(useBrickStore.getState().touchMove).toEqual({ x: 0, z: 0 })
    expect(useBrickStore.getState().mode).toBe('build')
  })

  it('resets touch movement when Explore controls unmount', () => {
    useBrickStore.setState({ bricks: [brick], mode: 'explore' })
    const { unmount } = render(<BrickStudioApp />)
    useBrickStore.setState({ touchMove: { x: 0.6, z: 0.2 } })

    unmount()

    expect(useBrickStore.getState().touchMove).toEqual({ x: 0, z: 0 })
  })
})
