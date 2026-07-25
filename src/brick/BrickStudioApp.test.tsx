import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { createBrickStudioDocument, serializeBrickStudioDocument } from './brickDocument'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from './documentPersistence'
import { createBrickGeometry } from './geometry'
import { useBrickStore } from './store'
import { ORBIT_DEFAULT_DISTANCE, ORBIT_DEFAULT_PITCH, ORBIT_DEFAULT_YAW } from './orbitCamera'
import { BRICK_COLORS, BRICK_PARTS } from './parts'
import { EXPLORE_MAX_PITCH } from './touchInput'
import type { BrickInstance } from './types'

vi.mock('./BrickStudioScene', () => ({
  default: () => <div data-testid="brick-scene" />,
}))

const initialState = useBrickStore.getInitialState()
const brick: BrickInstance = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')

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

function stubMediaQueries(matching: string[]) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  })))
}

function stubPointerModality(coarse: boolean) {
  stubMediaQueries(coarse ? ['(pointer: coarse)'] : [])
}

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  })
  resetStore()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl)
  else Reflect.deleteProperty(URL, 'createObjectURL')
  if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl)
  else Reflect.deleteProperty(URL, 'revokeObjectURL')
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
    expect(useBrickStore.getState().draft).toMatchObject({ partId: 'door_1x4' })
    expect(useBrickStore.getState().activePartId).toBe('door_1x4')
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
    expect(screen.getByTestId('builder-announcer')).toHaveTextContent('brick 2 of 2')

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
    expect(screen.getByTestId('builder-announcer')).toHaveTextContent('brick 1 of 2')
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

describe('single-brick inspector', () => {
  it('derives palette selection from the selected or restored brick and preserves recolor history', () => {
    const redBrick: BrickInstance = { ...brick, id: 'red-brick', color: BRICK_COLORS[0] }
    resetStore([redBrick])
    useBrickStore.setState({ activeColor: BRICK_COLORS[5], selectedIds: [redBrick.id], selectedId: redBrick.id })
    render(<BrickStudioApp />)

    const red = screen.getByRole('button', { name: `Use color ${BRICK_COLORS[0]}` })
    const blue = screen.getByRole('button', { name: `Use color ${BRICK_COLORS[5]}` })
    expect(red).toHaveAttribute('aria-pressed', 'true')
    expect(blue).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(blue)
    expect(useBrickStore.getState().bricks[0].color).toBe(BRICK_COLORS[5])
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
    act(() => useBrickStore.getState().undo())
    expect(useBrickStore.getState().bricks[0].color).toBe(BRICK_COLORS[0])
    expect(red).toHaveAttribute('aria-pressed', 'true')

    const restored = { ...redBrick, id: 'restored-red' }
    act(() => {
      expect(useBrickStore.getState().restoreDocument(createBrickStudioDocument([restored]))).toEqual({ ok: true })
      useBrickStore.getState().selectBrick(restored.id)
    })
    expect(screen.getByRole('button', { name: `Use color ${BRICK_COLORS[0]}` })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: `Use color ${BRICK_COLORS[5]}` })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('multi-selection feedback and controls', () => {
  const pair: BrickInstance[] = [
    { id: 'one', partId: 'brick_1x1', x: 4, y: 0, z: 4, rotation: 0, color: '#fff' },
    { id: 'two', partId: 'door_1x4', x: 12, y: 0, z: 12, rotation: 3, color: '#3e83d7' },
  ]

  it('shows a selection count, bulk actions, and group recolor without single-brick editing', () => {
    resetStore(pair)
    useBrickStore.setState({ selectedIds: ['one', 'two'], selectedId: 'two' })
    render(<BrickStudioApp />)

    expect(screen.getByRole('complementary', { name: '2 bricks selected' })).toBeInTheDocument()
    expect(screen.getByText('2 bricks selected', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy 2 selected bricks' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rotate brick' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use color #e7473c' }))
    expect(useBrickStore.getState().bricks.every((brick) => brick.color === '#e7473c')).toBe(true)
    expect(useBrickStore.getState().undoStack.at(-1)?.label).toBe('Recolor 2 bricks')
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
    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }))
    expect(screen.getByRole('menuitem', { name: 'Rover Lab' })).toHaveAttribute('href', '/rover')

    const properties = screen.getByRole('button', { name: 'Show brick properties' })
    expect(properties).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(properties)
    expect(screen.getByRole('button', { name: 'Hide brick properties' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps the complete editing action set discoverable when phone properties and either drawer state are open', () => {
    resetStore([brick])
    useBrickStore.setState({ selectedIds: [brick.id], selectedId: brick.id })
    render(<BrickStudioApp />)

    fireEvent.click(screen.getByRole('button', { name: 'Show brick properties' }))
    const properties = screen.getByRole('region', { name: 'Brick properties and editing actions' })
    expect(properties).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('Editing actions are first. Scroll for color and position.')).toBeInTheDocument()

    const actions = screen.getByRole('group', { name: 'Brick editing actions' })
    const firstPaletteControl = screen.getByRole('button', { name: `Use color ${BRICK_COLORS[0]}` })
    expect(actions.compareDocumentPosition(firstPaletteControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const name of ['Duplicate brick', 'Focus selected brick', 'Copy brick', 'Delete brick']) {
      expect(actions).toContainElement(screen.getByRole('button', { name }))
    }
    expect(screen.getAllByRole('button', { name: 'Rotate brick' })).not.toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Move brick' })).not.toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse brick drawer' }))
    expect(screen.getByRole('group', { name: 'Brick editing actions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete brick' })).toBeInTheDocument()
  })

  it('resets the phone properties scroll position whenever the disclosure reopens', () => {
    resetStore([brick])
    useBrickStore.setState({ selectedIds: [brick.id], selectedId: brick.id })
    render(<BrickStudioApp />)

    fireEvent.click(screen.getByRole('button', { name: 'Show brick properties' }))
    const properties = screen.getByRole('region', { name: 'Brick properties and editing actions' })
    properties.scrollTop = 143
    expect(properties.scrollTop).toBe(143)

    fireEvent.click(screen.getByRole('button', { name: 'Hide brick properties' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show brick properties' }))

    expect(properties.scrollTop).toBe(0)
    const actions = screen.getByRole('group', { name: 'Brick editing actions' })
    const firstPaletteControl = screen.getByRole('button', { name: `Use color ${BRICK_COLORS[0]}` })
    expect(actions.compareDocumentPosition(firstPaletteControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('hides mouse and Command guidance on a wide coarse-pointer layout', () => {
    vi.stubGlobal('innerWidth', 1194)
    stubPointerModality(true)
    render(<BrickStudioApp />)

    expect(screen.queryByRole('note', { name: 'Keyboard and mouse shortcuts' })).not.toBeInTheDocument()
  })

  it('keeps keyboard guidance on a fine-pointer desktop and uses pointer-neutral initial status', () => {
    vi.stubGlobal('innerWidth', 1440)
    stubPointerModality(false)
    render(<BrickStudioApp />)

    expect(screen.getByRole('note', { name: 'Keyboard and mouse shortcuts' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Pick a brick, position it over the plate, then place it.')
    expect(screen.getByRole('status')).not.toHaveTextContent('tap')
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

describe('compact touch layout', () => {
  const COMPACT_LAYOUT = '(max-width: 900px)'

  it('collapses the drawer while a brick is selected, restores it, and yields to a manual toggle', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    resetStore([brick])
    const { container } = render(<BrickStudioApp />)
    const shell = () => container.querySelector('.build-shell')
    const selector = screen.getByLabelText('Placed bricks')
    expect(shell()).toHaveClass('drawer-expanded')

    fireEvent.change(selector, { target: { value: brick.id } })
    expect(shell()).toHaveClass('drawer-collapsed')
    fireEvent.change(selector, { target: { value: '' } })
    expect(shell()).toHaveClass('drawer-expanded')

    fireEvent.change(selector, { target: { value: brick.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Expand brick drawer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse brick drawer' }))
    fireEvent.change(selector, { target: { value: '' } })
    expect(shell()).toHaveClass('drawer-collapsed')
  })

  it('leaves the drawer open on a wide layout where it is not in the way', () => {
    stubMediaQueries([])
    resetStore([brick])
    const { container } = render(<BrickStudioApp />)

    fireEvent.change(screen.getByLabelText('Placed bricks'), { target: { value: brick.id } })
    expect(useBrickStore.getState().selectedId).toBe(brick.id)
    expect(container.querySelector('.build-shell')).toHaveClass('drawer-expanded')
  })

  it('gives touch a layer step for the ghost between Rotate and Place', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    render(<BrickStudioApp />)

    fireEvent.click(screen.getByTitle('1 × 1 Brick'))
    const bar = screen.getByRole('group', { name: 'Positioned brick actions' })
    expect(Array.from(bar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim()))
      .toEqual(['Cancel', 'Rotate', 'Raise brick one layer', 'Lower brick one layer', 'Place positioned brick'])
    expect(useBrickStore.getState().draft?.y).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Raise brick one layer' }))
    expect(useBrickStore.getState().draft?.y).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'Lower brick one layer' }))
    expect(useBrickStore.getState().draft?.y).toBe(0)
  })
})

describe('Builder Experience Alpha shell', () => {
  it('renders every part from the runtime geometry without per-card canvases', () => {
    const { container } = render(<BrickStudioApp />)
    const thumbnails = Array.from(container.querySelectorAll<SVGElement>('.part-thumbnail'))

    expect(thumbnails).toHaveLength(BRICK_PARTS.length)
    expect(container.querySelectorAll('.library-part canvas')).toHaveLength(0)
    BRICK_PARTS.forEach((part) => {
      const thumbnail = container.querySelector<SVGElement>(`.part-thumbnail[data-part-id="${part.id}"]`)
      expect(thumbnail).not.toBeNull()
      expect(Number(thumbnail?.dataset.vertexCount)).toBe(createBrickGeometry(part).getAttribute('position').count)
      expect(thumbnail?.querySelectorAll('polygon').length).toBeGreaterThan(0)
    })
  })

  it('dismisses first-run onboarding once and reopens it from Help', () => {
    const firstRender = render(<BrickStudioApp />)
    expect(screen.getByRole('dialog', { name: 'Build something you can explore' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start building' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    firstRender.unmount()

    render(<BrickStudioApp />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Help/ }))
    expect(screen.getByRole('dialog', { name: 'Build something you can explore' })).toBeInTheDocument()
  })

  it('exposes callback-only document actions and forwards the chosen import file', () => {
    const onNewBuild = vi.fn()
    const onExportProject = vi.fn()
    const onImportProject = vi.fn()
    render(
      <BrickStudioApp
        onNewBuild={onNewBuild}
        onImportProject={onImportProject}
        onExportProject={onExportProject}
      />,
    )

    const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }))
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /New Build/ }))
    expect(onNewBuild).toHaveBeenCalledOnce()

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Export/ }))
    expect(onExportProject).toHaveBeenCalledOnce()

    openMenu()
    const file = new File(['{"schemaVersion":1}'], 'world.brickstudio.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Choose Brick Studio project file'), { target: { files: [file] } })
    expect(onImportProject).toHaveBeenCalledWith(file)
  })

  it('coordinates the collapsed dock state and provides an explicit touch Place action', () => {
    const { container } = render(<BrickStudioApp />)
    expect(container.querySelector('.build-shell')).toHaveClass('drawer-expanded')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse brick drawer' }))
    expect(container.querySelector('.build-shell')).toHaveClass('drawer-collapsed')
    expect(screen.getByRole('button', { name: 'Expand brick drawer' })).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Place positioned brick' }))
    expect(useBrickStore.getState().bricks).toHaveLength(1)
    expect(screen.getByRole('group', { name: 'Positioned brick actions' })).toBeInTheDocument()

    act(() => useBrickStore.getState().cancelInteraction())
    expect(screen.queryByRole('group', { name: 'Positioned brick actions' })).not.toBeInTheDocument()
  })

  it('restores the exact committed local build before autosave begins', async () => {
    const restored: BrickInstance[] = [
      { ...brick, id: 'saved-brick', partId: 'door_1x4', rotation: 3, color: '#6857d9' },
    ]
    window.localStorage.setItem(
      BRICK_STUDIO_LOCAL_STORAGE_KEY,
      serializeBrickStudioDocument(createBrickStudioDocument(restored)),
    )

    render(<BrickStudioApp />)

    await waitFor(() => expect(useBrickStore.getState().bricks).toEqual(restored))
    expect(useBrickStore.getState()).toMatchObject({
      selectedIds: [],
      selectedId: null,
      undoStack: [],
      redoStack: [],
    })
  })

  it('requires confirmation for New Build and keeps the clear recoverable', () => {
    resetStore([brick])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BrickStudioApp />)

    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /New Build/ }))
    expect(useBrickStore.getState().bricks).toEqual([brick])
    expect(screen.getByRole('status')).toHaveTextContent('unchanged')

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /New Build/ }))
    expect(useBrickStore.getState().bricks).toEqual([])
    act(() => useBrickStore.getState().undo())
    expect(useBrickStore.getState().bricks).toEqual([brick])
  })

  it('rejects a malformed confirmed import without replacing the current build', async () => {
    resetStore([brick])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BrickStudioApp />)
    const file = new File(['{bad'], 'broken.brickstudio.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue('{bad') })

    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }))
    fireEvent.change(screen.getByLabelText('Choose Brick Studio project file'), { target: { files: [file] } })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('not valid JSON'))
    expect(useBrickStore.getState().bricks).toEqual([brick])
  })

  it('downloads the current durable document through the default Export command', () => {
    resetStore([brick])
    const createObjectURL = vi.fn(() => 'blob:brick-studio')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<BrickStudioApp />)

    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Export/ }))

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:brick-studio')
    expect(screen.getByRole('status')).toHaveTextContent('Project exported')
  })
})
