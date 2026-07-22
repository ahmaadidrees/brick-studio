import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { useBrickStore } from './store'
import { ORBIT_DEFAULT_DISTANCE, ORBIT_DEFAULT_PITCH, ORBIT_DEFAULT_YAW } from './orbitCamera'
import { EXPLORE_MAX_PITCH } from './touchInput'
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
    selectedIds: [],
    selectedId: null,
    draft: bricks.length ? null : initialState.draft ? { ...initialState.draft } : null,
    undoStack: [],
    redoStack: [],
    viewRequest: { ...initialState.viewRequest },
    touchMove: { ...initialState.touchMove },
  }, true)
}

beforeEach(() => resetStore())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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

  it('offers a semantic Place action after keyboard part selection', () => {
    render(<BrickStudioApp />)

    fireEvent.click(screen.getByTitle('Door Frame'))
    expect(screen.getAllByRole('button', { name: 'Place brick' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Place brick' })[0])

    expect(useBrickStore.getState().bricks[0]?.partId).toBe('door_1x4')
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
    useBrickStore.setState({ selectedIds: ['one'], selectedId: 'one' })
    const { container } = render(<BrickStudioApp />)

    fireEvent.click(screen.getAllByLabelText('Move brick')[0])
    act(() => useBrickStore.getState().setDraftPosition(12, 3, 14))

    expect(screen.getByText('Moving')).toBeInTheDocument()
    expect(Array.from(container.querySelectorAll('.coordinates strong')).map((element) => element.textContent)).toEqual(['12', '3', '14'])
  })
})

describe('multi-selection feedback and controls', () => {
  const pair: BrickInstance[] = [
    { id: 'one', partId: 'brick_1x1', x: 4, y: 0, z: 4, rotation: 0, color: '#fff' },
    { id: 'two', partId: 'door_1x4', x: 12, y: 0, z: 12, rotation: 3, color: '#3e83d7' },
  ]

  it('shows a selection count and bulk actions without arbitrary single-brick editing', () => {
    resetStore(pair)
    useBrickStore.setState({ selectedIds: ['one', 'two'], selectedId: 'two' })
    render(<BrickStudioApp />)

    expect(screen.getByRole('complementary', { name: '2 bricks selected' })).toBeInTheDocument()
    expect(screen.getByText('2 bricks selected', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy 2 selected bricks' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rotate brick' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Brick color')).not.toBeInTheDocument()
  })

  it('exposes a touch-sized Select/Done mode and Escape clears the selection', () => {
    resetStore(pair)
    render(<BrickStudioApp />)
    const selectMode = screen.getByRole('button', { name: 'Select multiple bricks' })

    expect(selectMode).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(selectMode)
    expect(screen.getByRole('button', { name: 'Finish selecting bricks' })).toHaveAttribute('aria-pressed', 'true')
    act(() => useBrickStore.getState().selectBricks(['one', 'two']))
    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(useBrickStore.getState()).toMatchObject({ selectedIds: [], selectedId: null, selectionMode: false, marquee: null })
    expect(screen.getByRole('button', { name: 'Select multiple bricks' })).toBeInTheDocument()
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
      useBrickStore.setState({ touchMove: { x: 0.7, z: -0.4 }, touchMoveMagnitude: 0.8, touchRunning: true })
      event()
      expect(useBrickStore.getState().touchMove).toEqual({ x: 0, z: 0 })
      expect(useBrickStore.getState().touchMoveMagnitude).toBe(0)
      expect(useBrickStore.getState().touchRunning).toBe(false)
    }

    expectResetAfter(() => fireEvent.pointerUp(joystick))
    expectResetAfter(() => fireEvent.pointerCancel(joystick))
    expectResetAfter(() => fireEvent.lostPointerCapture(joystick))
    expectResetAfter(() => fireEvent.blur(window))

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    expectResetAfter(() => fireEvent(document, new Event('visibilitychange')))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    useBrickStore.setState({ touchMove: { x: 0.7, z: -0.4 }, touchMoveMagnitude: 0.8, touchRunning: true })
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

  it('publishes normalized forward movement and high-stick auto-run without a render-driven knob', () => {
    useBrickStore.setState({ bricks: [brick], mode: 'explore' })
    const { container } = render(<BrickStudioApp />)
    const joystick = screen.getByRole('application', { name: 'Movement joystick' })

    fireEvent.pointerDown(joystick, { pointerId: 7, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(joystick, { pointerId: 7, clientX: 100, clientY: 58 })

    expect(useBrickStore.getState().touchMove.x).toBeCloseTo(0)
    expect(useBrickStore.getState().touchMove.z).toBeCloseTo(1)
    expect(useBrickStore.getState().touchMoveMagnitude).toBeCloseTo(1)
    expect(useBrickStore.getState().touchRunning).toBe(true)
    expect(container.querySelector<HTMLElement>('.virtual-stick span')?.style.transform).toBe('translate3d(0px, -42px, 0)')

    fireEvent.pointerUp(joystick, { pointerId: 7 })
    expect(useBrickStore.getState().touchMove).toEqual({ x: 0, z: 0 })
  })

  it('updates yaw and clamped pitch from two-axis look drag', () => {
    useBrickStore.setState({ bricks: [brick], mode: 'explore', touchYaw: 0, touchPitch: 1 })
    const { container } = render(<BrickStudioApp />)
    const lookZone = container.querySelector<HTMLElement>('.look-zone')!

    fireEvent.pointerDown(lookZone, { pointerId: 8, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(lookZone, { pointerId: 8, clientX: 180, clientY: 100 })

    expect(useBrickStore.getState().touchYaw).toBeCloseTo(0.24)
    expect(useBrickStore.getState().touchPitch).toBe(EXPLORE_MAX_PITCH)
  })

  it('makes camera drag/zoom discoverable and supports wheel, pinch, and recenter', () => {
    useBrickStore.setState({ bricks: [brick], mode: 'explore', touchYaw: 0, touchPitch: 0.8, touchCameraDistance: 6.1 })
    const { container } = render(<BrickStudioApp />)
    const lookZone = container.querySelector<HTMLElement>('.look-zone')!

    expect(screen.getByText('Drag: Camera')).toBeInTheDocument()
    expect(screen.getByText('Scroll: Zoom')).toBeInTheDocument()
    expect(screen.getByText(/Drag to look · Pinch to zoom/)).toBeInTheDocument()
    fireEvent.wheel(lookZone, { deltaY: 120, deltaMode: 0 })
    expect(useBrickStore.getState().touchCameraDistance).toBeCloseTo(7.06)

    fireEvent.pointerDown(lookZone, { pointerId: 21, pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerDown(lookZone, { pointerId: 22, pointerType: 'touch', clientX: 200, clientY: 100 })
    fireEvent.pointerMove(lookZone, { pointerId: 22, pointerType: 'touch', clientX: 250, clientY: 100 })
    expect(useBrickStore.getState().touchCameraDistance).toBeCloseTo(7.06 * 100 / 150)

    fireEvent.click(screen.getByRole('button', { name: 'Recenter camera' }))
    expect(useBrickStore.getState()).toMatchObject({
      touchYaw: ORBIT_DEFAULT_YAW,
      touchPitch: ORBIT_DEFAULT_PITCH,
      touchCameraDistance: ORBIT_DEFAULT_DISTANCE,
    })
  })

  it('cancels look on interruption and keeps Jump/Return outside the look gesture', () => {
    useBrickStore.setState({ bricks: [brick], mode: 'explore', touchYaw: 0, touchPitch: 0.6 })
    const { container } = render(<BrickStudioApp />)
    const lookZone = container.querySelector<HTMLElement>('.look-zone')!

    fireEvent.pointerDown(lookZone, { pointerId: 31, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(lookZone, { pointerId: 31, clientX: 180, clientY: 180 })
    const yawAfterDrag = useBrickStore.getState().touchYaw
    fireEvent.pointerCancel(lookZone, { pointerId: 31 })
    fireEvent.pointerMove(lookZone, { pointerId: 31, clientX: 100, clientY: 100 })
    expect(useBrickStore.getState().touchYaw).toBe(yawAfterDrag)

    const jumpBefore = useBrickStore.getState().jumpNonce
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Jump; tap again in the air to double jump' }), { pointerId: 32 })
    fireEvent.click(screen.getByRole('button', { name: 'Jump; tap again in the air to double jump' }))
    expect(useBrickStore.getState().jumpNonce).toBe(jumpBefore + 1)
    expect(screen.getByRole('button', { name: 'Return to Build' })).toBeEnabled()
  })

  it('resets an active look gesture on viewport and orientation changes', () => {
    useBrickStore.setState({ bricks: [brick], mode: 'explore', touchYaw: 0, touchPitch: 0.6 })
    const { container } = render(<BrickStudioApp />)
    const lookZone = container.querySelector<HTMLElement>('.look-zone')!

    fireEvent.pointerDown(lookZone, { pointerId: 41, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(lookZone, { pointerId: 41, clientX: 180, clientY: 180 })
    fireEvent(window, new Event('resize'))
    const yawAfterResize = useBrickStore.getState().touchYaw
    fireEvent.pointerMove(lookZone, { pointerId: 41, clientX: 100, clientY: 100 })
    expect(useBrickStore.getState().touchYaw).toBe(yawAfterResize)

    fireEvent.pointerDown(lookZone, { pointerId: 42, clientX: 200, clientY: 200 })
    fireEvent(window, new Event('orientationchange'))
    fireEvent.pointerMove(lookZone, { pointerId: 42, clientX: 100, clientY: 100 })
    expect(useBrickStore.getState().touchYaw).toBe(yawAfterResize)
  })

  it('reacts to reduced-motion preference without disabling touch controls', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener,
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))
    useBrickStore.setState({ bricks: [brick], mode: 'explore' })

    const { container } = render(<BrickStudioApp />)

    expect(useBrickStore.getState().reducedMotion).toBe(true)
    expect(container.querySelector('.brick-studio')).toHaveClass('brick-reduced-motion')
    expect(screen.getByRole('application', { name: 'Movement joystick' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jump; tap again in the air to double jump' })).toBeEnabled()
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
