import { exploreKeyboardBlocked } from './explorePreferences'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { createBrickStudioDocument, serializeBrickStudioDocument } from './brickDocument'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from './documentPersistence'
import { createBrickGeometry } from './geometry'
import { useBrickStore } from './store'
import { ORBIT_DEFAULT_DISTANCE, ORBIT_DEFAULT_PITCH, ORBIT_DEFAULT_YAW } from './orbitCamera'
import { BRICK_COLORS, BRICK_PART_MAP, BRICK_PARTS } from './parts'
import { EXPLORE_MAX_PITCH } from './touchInput'
import type { BrickInstance } from './types'
import { browserClassroomClient, type ClassroomAuth } from '../classroom/client'

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
  it('applies a custom group color as one undoable edit and keeps Cancel local', () => {
    resetStore([brick, { ...brick, id: 'brick-b', x: 20 }])
    useBrickStore.getState().selectBricks(['brick-a', 'brick-b'])
    render(<BrickStudioApp />)
    // Scope role queries to the palette and the picker dialog. An unscoped
    // `getByRole('button', { name })` computes an accessible name for every
    // button in the studio, including the SVG part thumbnails, which made this
    // first-in-file test the slowest in the suite and a timeout under load.
    // The strip's Color popover owns selection recolor; the drawer palette only sets the brush.
    fireEvent.click(screen.getByRole('button', { name: 'Recolor 2 selected bricks' }))
    const palette = within(screen.getByRole('dialog', { name: 'Color all 2 bricks' }))
    const anyColor = () => palette.getByRole('button', { name: 'Choose any brick color' })
    const picker = () => within(screen.getByRole('dialog', { name: 'Choose any color' }))
    fireEvent.click(anyColor())
    fireEvent.change(picker().getByRole('textbox', { name: 'Hex color' }), { target: { value: '#123abc' } })
    expect(useBrickStore.getState().bricks.every((item) => item.color === '#fff')).toBe(true)
    expect(useBrickStore.getState().undoStack).toHaveLength(0)
    fireEvent.click(picker().getByRole('button', { name: 'Apply color' }))
    expect(useBrickStore.getState().bricks.every((item) => item.color === '#123abc')).toBe(true)
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
    expect(anyColor()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(anyColor())
    fireEvent.change(picker().getByRole('textbox', { name: 'Hex color' }), { target: { value: '#ffffff' } })
    fireEvent.click(picker().getByRole('button', { name: 'Cancel' }))
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
    act(() => useBrickStore.getState().undo())
    expect(useBrickStore.getState().bricks.every((item) => item.color === '#fff')).toBe(true)
  })

  it('places with Enter, reserves Space for camera, cancels with Escape, and never double-acts from a button', () => {
    render(<BrickStudioApp />)

    expect(screen.getByLabelText('0 of 1000 brick capacity')).toBeInTheDocument()
    expect(fireEvent.keyDown(document.body, { key: 'Enter' })).toBe(false)
    expect(useBrickStore.getState().bricks).toHaveLength(1)

    const partButton = screen.getByTitle('1 × 1 Brick')
    fireEvent.click(partButton)
    act(() => useBrickStore.getState().setDraftPosition(10, 0, 10))
    expect(fireEvent.keyDown(partButton, { key: ' ' })).toBe(true)
    expect(useBrickStore.getState().bricks).toHaveLength(1)

    expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(true)
    expect(useBrickStore.getState().bricks).toHaveLength(1)
    expect(fireEvent.keyDown(document.body, { key: 'Enter' })).toBe(false)
    expect(useBrickStore.getState().bricks).toHaveLength(2)

    fireEvent.click(partButton)
    expect(useBrickStore.getState().draft).not.toBeNull()
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(false)
    expect(useBrickStore.getState().draft).toBeNull()
  })

  it('offers a semantic Place action after keyboard part selection', () => {
    render(<BrickStudioApp />)

    fireEvent.click(screen.getByTitle('Door Frame'))
    expect(screen.getAllByRole('button', { name: 'Place positioned brick' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Place positioned brick' }))

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
    // The idle strip carries the placed-brick list; a select keeps arrow keys native.
    const selector = screen.getByLabelText('Jump to brick')
    const beforeArrow = useBrickStore.getState().bricks[1]
    expect(fireEvent.keyDown(selector, { key: 'ArrowRight' })).toBe(true)
    expect(useBrickStore.getState().bricks[1]).toEqual(beforeArrow)

    fireEvent.change(selector, { target: { value: 'two' } })
    expect(useBrickStore.getState().selectedId).toBe('two')
    expect(screen.getByTestId('builder-announcer')).toHaveTextContent('brick 2 of 2')
    expect(screen.getByText('1 × 2 Brick', { selector: '.command-strip-chip-text strong' })).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'r' })
    expect(useBrickStore.getState().bricks[1].rotation).toBe(1)
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(useBrickStore.getState().bricks).toHaveLength(1)
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
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
    expect(screen.getByText('1 × 1 Brick', { selector: '.command-strip-chip-text strong' })).toBeInTheDocument()
  })
})

describe('live move feedback', () => {
  it('shows Moving and the draft coordinates rather than stale selected-brick coordinates', () => {
    resetStore([
      { id: 'one', partId: 'brick_1x1', x: 4, y: 0, z: 4, rotation: 0, color: '#fff' },
    ])
    useBrickStore.setState({ selectedIds: ['one'], selectedId: 'one' })
    const { container } = render(<BrickStudioApp />)

    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    fireEvent.click(screen.getByLabelText('Move brick'))
    act(() => useBrickStore.getState().setDraftPosition(12, 3, 14))

    expect(screen.getByText('Moving', { selector: '.command-strip .brick-eyebrow' })).toBeInTheDocument()
    expect(container.querySelector('.command-strip [data-state="selected"]')).toBeNull()
    expect(useBrickStore.getState().draft).toMatchObject({ x: 12, y: 3, z: 14 })
  })
})

describe('single-brick color', () => {
  it('follows the selected or restored brick in the strip popover and preserves recolor history', () => {
    const redBrick: BrickInstance = { ...brick, id: 'red-brick', color: BRICK_COLORS[0] }
    resetStore([redBrick])
    useBrickStore.setState({ activeColor: BRICK_COLORS[5], selectedIds: [redBrick.id], selectedId: redBrick.id })
    render(<BrickStudioApp />)

    // The drawer palette is the brush only: it shows the brush color, not the selection's.
    const drawer = within(screen.getByRole('complementary', { name: 'Brick drawer' }))
    expect(drawer.getByRole('group', { name: 'Brush color' })).toBeInTheDocument()
    expect(drawer.getByRole('button', { name: `Use color ${BRICK_COLORS[5]}` })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(drawer.getByRole('button', { name: `Use color ${BRICK_COLORS[2]}` }))
    expect(useBrickStore.getState().activeColor).toBe(BRICK_COLORS[2])
    expect(useBrickStore.getState().bricks[0].color).toBe(BRICK_COLORS[0])
    expect(useBrickStore.getState().undoStack).toHaveLength(0)

    // The strip's Color popover follows the selection and recolors it as one undoable edit.
    fireEvent.click(screen.getByRole('button', { name: 'Recolor brick' }))
    const popover = () => within(screen.getByRole('dialog', { name: 'Brick color' }))
    expect(popover().getByRole('button', { name: `Use color ${BRICK_COLORS[0]}` })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(popover().getByRole('button', { name: `Use color ${BRICK_COLORS[5]}` }))
    expect(useBrickStore.getState().bricks[0].color).toBe(BRICK_COLORS[5])
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
    act(() => useBrickStore.getState().undo())
    expect(useBrickStore.getState().bricks[0].color).toBe(BRICK_COLORS[0])
    expect(popover().getByRole('button', { name: `Use color ${BRICK_COLORS[0]}` })).toHaveAttribute('aria-pressed', 'true')

    const restored = { ...redBrick, id: 'restored-red' }
    act(() => {
      expect(useBrickStore.getState().restoreDocument(createBrickStudioDocument([restored]))).toEqual({ ok: true })
      useBrickStore.getState().selectBrick(restored.id)
    })
    expect(popover().getByRole('button', { name: `Use color ${BRICK_COLORS[0]}` })).toHaveAttribute('aria-pressed', 'true')
    expect(popover().getByRole('button', { name: `Use color ${BRICK_COLORS[5]}` })).toHaveAttribute('aria-pressed', 'false')
    // Escape closes the popover and keeps the selection.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Brick color' })).not.toBeInTheDocument()
    expect(useBrickStore.getState().selectedIds).toEqual(['restored-red'])
  })
})

describe('shortcut pause inside the Color popover', () => {
  it('keeps Delete, R and Command+D away from the build while a swatch has focus, then resumes', () => {
    resetStore([brick])
    useBrickStore.setState({ selectedIds: [brick.id], selectedId: brick.id })
    render(<BrickStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Recolor brick' }))
    const popover = screen.getByRole('dialog', { name: 'Brick color' })
    expect(popover).toHaveAttribute('data-shortcut-pause')
    const swatch = within(popover).getByRole('button', { name: `Use color ${BRICK_COLORS[3]}` })
    swatch.focus()
    expect(swatch).toHaveFocus()
    const before = useBrickStore.getState().getDocumentSnapshot()
    for (const key of ['Delete', 'Backspace', 'r', 'ArrowLeft', '[']) fireEvent.keyDown(swatch, { key })
    fireEvent.keyDown(swatch, { key: 'd', ctrlKey: true })
    fireEvent.keyDown(swatch, { key: 'd', metaKey: true })
    expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(before)
    expect(useBrickStore.getState().bricks).toHaveLength(1)
    expect(useBrickStore.getState().selectedIds).toEqual([brick.id])
    expect(screen.getByRole('dialog', { name: 'Brick color' })).toBeInTheDocument()
    // Escape still closes the popover first and keeps the selection.
    fireEvent.keyDown(swatch, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Brick color' })).not.toBeInTheDocument()
    expect(useBrickStore.getState().selectedIds).toEqual([brick.id])
    // With the popover gone the shortcuts reach the build again.
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(useBrickStore.getState().bricks).toHaveLength(0)
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

    const strip = within(screen.getByRole('group', { name: '2 bricks selected' }))
    expect(strip.getByText('2 bricks', { selector: '.command-strip-chip-text strong' })).toBeInTheDocument()
    fireEvent.click(strip.getByRole('button', { name: 'Adjust' }))
    expect(strip.getByRole('button', { name: 'Copy 2 selected bricks' })).toBeInTheDocument()
    expect(strip.queryByRole('button', { name: 'Rotate brick' })).not.toBeInTheDocument()
    expect(strip.getByRole('button', { name: 'Rotate 2 bricks' })).toBeInTheDocument()

    fireEvent.click(strip.getByRole('button', { name: 'Recolor 2 selected bricks' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Color all 2 bricks' })).getByRole('button', { name: 'Use color #e7473c' }))
    expect(useBrickStore.getState().bricks.every((brick) => brick.color === '#e7473c')).toBe(true)
    expect(useBrickStore.getState().undoStack.at(-1)?.label).toBe('Recolor 2 bricks')
  })

  it('exposes a touch-sized one-shot Box select tool and Escape clears the selection', () => {
    resetStore(pair)
    render(<BrickStudioApp />)
    const selectMode = screen.getByRole('button', { name: 'Box select bricks' })

    expect(selectMode).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(selectMode)
    expect(screen.getByRole('button', { name: 'Cancel box selection' })).toHaveAttribute('aria-pressed', 'true')
    act(() => useBrickStore.getState().selectBricks(['one', 'two']))
    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(useBrickStore.getState()).toMatchObject({ selectedIds: [], selectedId: null, selectionMode: false, marquee: null })
    expect(screen.getByRole('button', { name: 'Box select bricks' })).toBeInTheDocument()
  })
})

describe('Brick Studio responsive controls', () => {
  it('lets desktop builders collapse and reopen the brick drawer without losing the canvas', () => {
    stubPointerModality(false)
    render(<BrickStudioApp />)

    expect(screen.getByRole('complementary', { name: 'Brick drawer' })).toHaveAttribute('id', 'brick-part-library')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse brick drawer' }))
    expect(screen.queryByRole('complementary', { name: 'Brick drawer' })).not.toBeInTheDocument()
    const reopen = screen.getByRole('button', { name: 'Open brick drawer' })
    expect(reopen).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(reopen)
    expect(screen.getByRole('complementary', { name: 'Brick drawer' })).toHaveAttribute('id', 'brick-part-library')
  })

  it('keeps history, brick count, navigation, and the compact property control reachable', () => {
    render(<BrickStudioApp />)

    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
    expect(screen.getByLabelText('0 of 1000 brick capacity')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    const menu = within(screen.getByRole('menu', { name: 'This build' }))
    expect(menu.queryByRole('menuitem', { name: 'Rover Lab' })).not.toBeInTheDocument()
    expect(menu.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
    expect(menu.queryByRole('menuitem', { name: /Publish/ })).not.toBeInTheDocument()
    expect(menu.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument()
    // Things about me sit in the corner: signed out shows the quiet Sign in link; Settings left the header.
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toMatch(/^\/join\?mode=signin/)
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('keeps precise selection edits behind Adjust and removes the duplicate palette', () => {
    resetStore([brick])
    useBrickStore.setState({ selectedIds: [brick.id], selectedId: brick.id })
    render(<BrickStudioApp />)
    const inspector = within(screen.getByRole('group', { name: 'Selected brick actions' }))
    expect(inspector.queryByRole('button', { name: 'Move brick' })).not.toBeInTheDocument()
    expect(inspector.queryByRole('dialog', { name: 'Brick color' })).not.toBeInTheDocument()
    for (const name of ['Recolor brick', 'Rotate brick', 'Duplicate brick', 'Delete brick']) {
      expect(inspector.getByRole('button', { name })).toBeInTheDocument()
    }
    fireEvent.click(inspector.getByRole('button', { name: 'Adjust' }))
    const properties = inspector.getByRole('region', { name: 'Brick properties and editing actions' })
    fireEvent.click(within(properties).getByRole('button', { name: 'Raise brick one plate' }))
    expect(useBrickStore.getState().bricks[0].y).toBe(1)
    expect(within(properties).getByText('Height')).toHaveTextContent('Height 1')
    fireEvent.click(inspector.getByRole('button', { name: 'Adjust' }))
    expect(inspector.queryByRole('region')).not.toBeInTheDocument()
  })

  it('filters the docked catalog without losing the search and sets the camera from the view cluster', () => {
    render(<BrickStudioApp />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Brick category' }), { target: { value: 'plates' } })
    expect(screen.queryByTitle('2 × 4 Brick')).not.toBeInTheDocument()
    expect(screen.getByTitle('2 × 4 Plate')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search bricks' }), { target: { value: '1 × 1' } })
    expect(screen.queryByTitle('2 × 4 Plate')).not.toBeInTheDocument()
    const camera = within(screen.getByRole('group', { name: 'Camera view' }))
    fireEvent.click(camera.getByRole('button', { name: 'Top view' }))
    expect(useBrickStore.getState().viewRequest.preset).toBe('top')
    expect(camera.getByRole('button', { name: 'Top view' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(camera.getByRole('button', { name: 'Frame build' }))
    expect(useBrickStore.getState().viewRequest.preset).toBe('home')
    expect(camera.getByRole('button', { name: 'Front view' })).toBeInTheDocument()
    expect(camera.getByRole('button', { name: '3D view' })).toBeInTheDocument()
  })

  it('hides mouse and Command guidance on a wide coarse-pointer layout', () => {
    vi.stubGlobal('innerWidth', 1194)
    stubPointerModality(true)
    render(<BrickStudioApp />)

    expect(screen.getByTestId('command-strip')).not.toHaveTextContent('Esc')
    act(() => useBrickStore.getState().cancelInteraction())
    expect(screen.getByRole('note', { name: 'Build hint' })).toHaveTextContent('Pick a brick from the drawer')
    expect(screen.getByRole('note', { name: 'Build hint' })).not.toHaveTextContent('Click')
  })

  it('tells desktop builders what Esc does for an armed brush and for a selection', () => {
    vi.stubGlobal('innerWidth', 1440)
    stubPointerModality(false)
    render(<BrickStudioApp />)
    const strip = () => screen.getByTestId('command-strip')
    expect(useBrickStore.getState().draft).not.toBeNull()
    expect(strip()).toHaveTextContent('Esc puts the brick down')

    act(() => { useBrickStore.setState({ bricks: [{ ...brick }], draft: null }); useBrickStore.getState().selectBrick('brick-a') })
    expect(strip()).toHaveTextContent('Drag to move · R rotate · Esc clears the selection')
    expect(strip()).not.toHaveTextContent('puts the brick down')

    act(() => useBrickStore.getState().clearSelection())
    expect(strip()).not.toHaveTextContent('Esc')
    expect(screen.getByRole('note', { name: 'Build hint' })).toHaveTextContent('Pick a brick from the drawer')
  })

  it('keeps keyboard guidance on a fine-pointer desktop and uses pointer-neutral initial status', () => {
    vi.stubGlobal('innerWidth', 1440)
    stubPointerModality(false)
    render(<BrickStudioApp />)

    expect(screen.getByTestId('command-strip')).toHaveTextContent('Click the plate to place your first brick · Esc puts the brick down')
    expect(screen.getByRole('status', { name: 'Studio message' })).toHaveTextContent('Pick a brick, position it over the plate, then place it.')
    expect(screen.getByRole('status', { name: 'Studio message' })).not.toHaveTextContent('tap')
  })

  it('uses the same zero-brick Explore guard for the button and 2 shortcut', () => {
    render(<BrickStudioApp />)

    expect(screen.getByRole('radio', { name: 'Explore' })).toBeDisabled()
    fireEvent.keyDown(document.body, { key: '2' })
    expect(useBrickStore.getState().mode).toBe('build')

    useBrickStore.setState({ bricks: [brick] })
    fireEvent.keyDown(document.body, { key: '2' })
    expect(useBrickStore.getState().mode).toBe('explore')
    expect(screen.queryByRole('radio', { name: 'Explore' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to building' }))
    expect(useBrickStore.getState().mode).toBe('build')
  })

  it('lets only an online live-world owner request a shared mode change', () => {
    resetStore([brick])
    const onRequestMode = vi.fn()
    const { rerender } = render(<BrickStudioApp livePolicy={{ connection: 'online', isOwner: false, onRequestMode }} />)

    expect(screen.getByRole('radio', { name: 'Explore' })).toBeDisabled()
    fireEvent.keyDown(document.body, { key: '2' })
    expect(onRequestMode).not.toHaveBeenCalled()

    rerender(<BrickStudioApp livePolicy={{ connection: 'reconnecting', isOwner: true, onRequestMode }} />)
    expect(screen.getByRole('radio', { name: 'Explore' })).toBeDisabled()

    rerender(<BrickStudioApp livePolicy={{ connection: 'online', isOwner: true, onRequestMode }} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Explore' }))
    expect(onRequestMode).toHaveBeenCalledWith('explore')
    expect(useBrickStore.getState().mode).toBe('build')
  })

  it('does not expose a local mode-switch bypass to a live-world member', () => {
    resetStore([brick])
    useBrickStore.setState({ mode: 'explore' })
    const onRequestMode = vi.fn()
    render(<BrickStudioApp livePolicy={{ connection: 'online', isOwner: false, onRequestMode }} />)
    expect(screen.getByRole('button', { name: 'Back to building' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Return to Build' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to building' }))
    expect(onRequestMode).not.toHaveBeenCalled()
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
    fireEvent.click(screen.getByRole('button', { name: 'Back to building' }))
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

  it('isolates Build shortcuts while Settings is open', () => {
    useBrickStore.setState({ bricks: [brick], mode: 'build', selectedId: brick.id, selectedIds: [brick.id] })
    render(<BrickStudioApp />)
    const before = useBrickStore.getState().getDocumentSnapshot()
    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
    const control = screen.getByLabelText('Explore keyboard controls')
    control.focus()
    for (const key of ['Delete', '2', 'r']) fireEvent.keyDown(control, { key })
    fireEvent.keyDown(control, { key: 'z', ctrlKey: true })
    expect(useBrickStore.getState().mode).toBe('build')
    expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(before)
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })

  it('returns keyboard control to the Explore surface after closing Settings', () => {
    useBrickStore.setState({ bricks: [brick], mode: 'explore' })
    render(<BrickStudioApp />)
    const settings = screen.getByRole('button', { name: 'Settings' })
    settings.focus()
    fireEvent.click(settings)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(settings).toHaveFocus()
    expect(exploreKeyboardBlocked(document.activeElement)).toBe(true)
    const surface = screen.getByRole('region', { name: 'Explore camera controls' })
    fireEvent.pointerDown(surface, { pointerId: 81, clientX: 400, clientY: 400 })
    expect(surface).toHaveFocus()
    expect(exploreKeyboardBlocked(document.activeElement)).toBe(false)
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

  it('offers a separate safe Respawn action with finding and unavailable recovery states', () => {
    useBrickStore.setState({ bricks: [brick], mode: 'explore', exploreSpawnStatus: 'ready' })
    render(<BrickStudioApp />)
    const before = useBrickStore.getState().exploreRespawnNonce

    fireEvent.click(screen.getByRole('button', { name: 'Respawn at a safe spot' }))

    expect(useBrickStore.getState().exploreRespawnNonce).toBe(before + 1)
    expect(screen.getByText('Finding a safe spot…', { selector: '.explore-spawn-status strong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Respawn at a safe spot' })).toBeDisabled()

    act(() => useBrickStore.getState().markExploreSpawnUnavailable())
    expect(screen.getByRole('alert')).toHaveTextContent('No safe spot is open')
    expect(screen.getByRole('alert')).toHaveTextContent('Back to building')
    expect(screen.getByRole('button', { name: 'Respawn at a safe spot' })).toBeEnabled()
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

    const jumpButton = screen.getByRole('button', { name: 'Jump; tap again in the air to double jump' })
    const jumpBefore = useBrickStore.getState().jumpNonce
    // A second concurrent touch never synthesizes a click on iOS, so the tap
    // itself must jump on pointer-down; the trailing click (detail >= 1) is
    // ignored and keyboard activation (detail 0) still works.
    fireEvent.pointerDown(jumpButton, { pointerId: 32, pointerType: 'touch' })
    fireEvent.click(jumpButton, { detail: 1 })
    expect(useBrickStore.getState().jumpNonce).toBe(jumpBefore + 1)
    fireEvent.click(jumpButton, { detail: 0 })
    expect(useBrickStore.getState().jumpNonce).toBe(jumpBefore + 2)
    expect(screen.getByRole('button', { name: 'Back to building' })).toBeEnabled()
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

  it('keeps an explicit motion preference across remounts and responds to settings changes', () => {
    stubMediaQueries(['(prefers-reduced-motion: reduce)'])
    localStorage.setItem('brick-studio-motion-preference-v1', 'full')
    const view = render(<BrickStudioApp />)
    expect(useBrickStore.getState().reducedMotion).toBe(false)
    localStorage.setItem('brick-studio-motion-preference-v1', 'reduced')
    act(() => window.dispatchEvent(new Event('brick-studio-motion-preference-change')))
    expect(useBrickStore.getState().reducedMotion).toBe(true)
    view.unmount()
    render(<BrickStudioApp />)
    expect(useBrickStore.getState().reducedMotion).toBe(true)
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

  const openSheet = () => {
    const fab = screen.getByRole('button', { name: 'Open brick drawer' })
    fab.focus()
    fireEvent.click(fab)
    return fab
  }

  it('keeps a landscape tablet palette and preserves selection when rotating to portrait', () => {
    stubPointerModality(true)
    vi.stubGlobal('innerWidth', 1024)
    vi.stubGlobal('innerHeight', 768)
    resetStore([brick])
    const { container } = render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBrick(brick.id))
    expect(container.querySelector('.part-library')).not.toBeNull()
    expect(container.querySelector('.brick-inspector')).toBeNull()
    expect(screen.getByRole('group', { name: 'Selected brick actions' })).toBeInTheDocument()
    act(() => {
      vi.stubGlobal('innerWidth', 768)
      vi.stubGlobal('innerHeight', 1024)
      window.dispatchEvent(new Event('resize'))
    })
    expect(container.querySelector('.part-library')).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Creative tools' })).toBeInTheDocument()
    expect(useBrickStore.getState().selectedIds).toEqual([brick.id])
    expect(useBrickStore.getState().bricks).toEqual([brick])
  })

  it('swaps the docked drawer for a (+) button that opens a modal part-and-color sheet', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    const { container } = render(<BrickStudioApp />)

    expect(container.querySelector('.part-library')).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Bricks' })).not.toBeInTheDocument()
    const fab = openSheet()

    const sheet = screen.getByRole('dialog', { name: 'Bricks' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(fab).toHaveAttribute('aria-expanded', 'true')
    expect(document.activeElement).toBe(sheet)
    expect(within(sheet).getAllByRole('button', { name: /Use color/ })).toHaveLength(BRICK_COLORS.length)

    fireEvent.click(within(sheet).getByTitle('Door Frame'))
    expect(useBrickStore.getState().draft).toMatchObject({ partId: 'door_1x4' })
    expect(screen.queryByRole('dialog', { name: 'Bricks' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(fab)
  })

  it('closes the sheet on Escape and on a backdrop tap without cancelling the armed brush', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    render(<BrickStudioApp />)
    const fab = openSheet()
    const armed = useBrickStore.getState().draft

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Bricks' })).not.toBeInTheDocument()
    expect(useBrickStore.getState().draft).toEqual(armed)
    expect(document.activeElement).toBe(fab)

    fireEvent.click(fab)
    fireEvent.pointerDown(screen.getByTestId('brick-sheet-backdrop'))
    expect(screen.queryByRole('dialog', { name: 'Bricks' })).not.toBeInTheDocument()
  })

  it('sets only the brush from the sheet palette and leaves the selection alone', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    resetStore([brick])
    render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBrick(brick.id))
    openSheet()

    const sheet = screen.getByRole('dialog', { name: 'Bricks' })
    expect(within(sheet).getByText('Brush color')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: `Use color ${BRICK_COLORS[3]}` }))
    expect(useBrickStore.getState().activeColor).toBe(BRICK_COLORS[3])
    expect(useBrickStore.getState().bricks[0].color).toBe('#fff')
    expect(useBrickStore.getState().selectedIds).toEqual([brick.id])
  })

  it('hands an armed draft to the placement pill alone and restores the selection pill on cancel', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    resetStore([brick])
    const { container } = render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBrick(brick.id))
    expect(screen.getByRole('group', { name: 'Selected brick actions' })).toBeInTheDocument()

    act(() => useBrickStore.getState().startMove())
    expect(container.querySelector('.command-strip [data-state="selected"]')).toBeNull()
    const bar = screen.getByRole('group', { name: 'Positioned brick actions' })
    expect(within(bar).getByText('Moving')).toBeInTheDocument()
    expect(within(bar).getByText('2 × 4 Brick')).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Place moved brick' })).toBeInTheDocument()

    act(() => useBrickStore.getState().cancelInteraction())
    expect(screen.getByRole('group', { name: 'Selected brick actions' })).toBeInTheDocument()
  })

  it('replaces the compact inspector card with an icon-only selection pill', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    const colored = { ...brick, color: BRICK_COLORS[2] }
    resetStore([colored])
    const { container } = render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBrick(colored.id))

    expect(container.querySelector('.brick-inspector')).toBeNull()
    expect(container.querySelector('.coordinates')).toBeNull()
    const pill = screen.getByRole('group', { name: 'Selected brick actions' })
    expect(within(pill).getByText('2 × 4 Brick')).toBeInTheDocument()
    const probe = document.createElement('span')
    probe.style.background = BRICK_COLORS[2]
    expect(pill.querySelector<HTMLElement>('.command-strip-swatch')?.style.background).toBe(probe.style.background)
    expect(within(pill).queryByRole('button', { name: /left one stud/ })).not.toBeInTheDocument()
    fireEvent.click(within(pill).getByRole('button', { name: 'Adjust' }))
    expect(Array.from(pill.querySelectorAll('button')).filter(button => button.getAttribute('aria-label')).map((button) => button.getAttribute('aria-label')))
      .toEqual([
        'Rotate brick', 'Duplicate brick', 'Recolor brick', 'Delete brick',
        'Move brick left one stud', 'Move brick forward one stud', 'Move brick back one stud', 'Move brick right one stud',
        'Raise brick one plate', 'Lower brick one plate', 'Resize brick',
        'Move brick', 'Copy brick', 'Paste copied bricks', 'Focus selected brick',
      ])

    fireEvent.click(within(pill).getByRole('button', { name: 'Rotate brick' }))
    expect(useBrickStore.getState().bricks[0].rotation).toBe(1)
    fireEvent.click(within(pill).getByRole('button', { name: 'Duplicate brick' }))
    expect(useBrickStore.getState().bricks).toHaveLength(1)
    expect(useBrickStore.getState().movingSelection?.duplicate).toBe(true)
    act(() => useBrickStore.getState().setDraftPosition(20, 0, 20))
    fireEvent.click(screen.getByRole('button', { name: 'Place duplicate' }))
    expect(useBrickStore.getState().bricks).toHaveLength(2)
    const framing = useBrickStore.getState().viewRequest.nonce
    // Placing swaps the strip back to its selected state, so Adjust starts closed again.
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    fireEvent.click(screen.getByRole('button', { name: 'Focus selected brick' }))
    expect(useBrickStore.getState().viewRequest).toMatchObject({ preset: 'selection', nonce: framing + 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Delete brick' }))
    expect(useBrickStore.getState().bricks).toHaveLength(1)
  })

  it('opens the Color popover from the pill and recolors the live selection', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    resetStore([brick])
    render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBrick(brick.id))

    const trigger = screen.getByRole('button', { name: 'Recolor brick' })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('dialog', { name: 'Bricks' })).not.toBeInTheDocument()
    const popover = screen.getByRole('dialog', { name: 'Brick color' })
    expect(within(popover).getAllByRole('button', { name: /Use color/ })).toHaveLength(BRICK_COLORS.length)
    expect(within(popover).getByRole('button', { name: 'Choose any brick color' })).toBeInTheDocument()
    fireEvent.click(within(popover).getByRole('button', { name: `Use color ${BRICK_COLORS[3]}` }))

    expect(useBrickStore.getState().bricks[0].color).toBe(BRICK_COLORS[3])
    expect(useBrickStore.getState().undoStack.at(-1)?.label).toBe('Change brick color')
  })

  it('gives multi-selection the same pill with bulk actions and a group recolor path', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    resetStore([
      { id: 'one', partId: 'brick_1x1', x: 4, y: 0, z: 4, rotation: 0, color: '#fff' },
      { id: 'two', partId: 'door_1x4', x: 12, y: 0, z: 12, rotation: 3, color: '#3e83d7' },
    ])
    render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBricks(['one', 'two']))

    const pill = screen.getByRole('group', { name: '2 bricks selected' })
    expect(within(pill).getByText('2 bricks')).toBeInTheDocument()
    expect(within(pill).queryByRole('button', { name: /left one stud/ })).not.toBeInTheDocument()
    fireEvent.click(within(pill).getByRole('button', { name: 'Adjust' }))
    expect(Array.from(pill.querySelectorAll('button')).filter(button => button.getAttribute('aria-label')).map((button) => button.getAttribute('aria-label')))
      .toEqual([
        'Rotate 2 bricks', 'Duplicate 2 selected bricks', 'Recolor 2 selected bricks', 'Delete 2 selected bricks',
        'Move 2 bricks left one stud', 'Move 2 bricks forward one stud', 'Move 2 bricks back one stud', 'Move 2 bricks right one stud',
        'Raise 2 bricks one plate', 'Lower 2 bricks one plate', 'Resize 2 bricks',
        'Move selected bricks', 'Copy 2 selected bricks', 'Paste copied bricks', 'Focus selected bricks',
      ])

    fireEvent.click(within(pill).getByRole('button', { name: 'Recolor 2 selected bricks' }))
    const popover = screen.getByRole('dialog', { name: 'Color all 2 bricks' })
    fireEvent.click(within(popover).getByRole('button', { name: `Use color ${BRICK_COLORS[0]}` }))

    expect(useBrickStore.getState().bricks.every((item) => item.color === BRICK_COLORS[0])).toBe(true)
    expect(useBrickStore.getState().undoStack.at(-1)?.label).toBe('Recolor 2 bricks')
  })

  it('freezes both pills while a grab is captured and slides the placement pill back on release', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    resetStore([brick])
    render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBrick(brick.id))
    expect(screen.getByRole('group', { name: 'Selected brick actions' })).toBeInTheDocument()

    // The grab sibling raises the flag before startMove, so neither pill ever flashes mid-drag.
    act(() => useBrickStore.getState().setGrabInProgress(true))
    expect(screen.queryByRole('group', { name: 'Selected brick actions' })).not.toBeInTheDocument()
    act(() => useBrickStore.getState().startMove())
    expect(screen.queryByRole('group', { name: 'Positioned brick actions' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open brick drawer' })).toBeInTheDocument()

    act(() => useBrickStore.getState().setGrabInProgress(false))
    const bar = screen.getByRole('group', { name: 'Positioned brick actions' })
    expect(within(bar).getByText('Moving')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Selected brick actions' })).not.toBeInTheDocument()
  })

  it('collapses the camera cluster to one Camera button with a popover on short touch screens', () => {
    stubMediaQueries([COMPACT_LAYOUT, '(pointer: coarse)', '(max-height: 600px) and (pointer: coarse)'])
    resetStore([brick])
    render(<BrickStudioApp />)

    const cluster = screen.getByRole('group', { name: 'Camera view' })
    const toggle = within(cluster).getByRole('button', { name: 'Camera' })
    expect(within(cluster).getAllByRole('button')).toHaveLength(1)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(cluster).queryByRole('button', { name: 'Frame build' })).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(cluster).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Camera', 'Frame build', 'Top view', 'Front view', '3D view'])

    fireEvent.click(within(cluster).getByRole('button', { name: 'Top view' }))
    expect(useBrickStore.getState().viewRequest.preset).toBe('top')
    // Choosing a view closes the popover and hands focus back to the trigger.
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(toggle)
  })

  it('keeps the four camera buttons inline on tall touch screens', () => {
    stubMediaQueries([COMPACT_LAYOUT, '(pointer: coarse)'])
    resetStore([brick])
    render(<BrickStudioApp />)

    const cluster = screen.getByRole('group', { name: 'Camera view' })
    expect(within(cluster).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Frame build', 'Top view', 'Front view', '3D view'])
    expect(within(cluster).queryByRole('button', { name: 'Camera' })).not.toBeInTheDocument()
  })

  it('shows the desktop strip with coordinates only when requested', () => {
    stubMediaQueries([])
    resetStore([brick])
    const { container } = render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBrick(brick.id))
    expect(container.querySelector('.command-strip [data-state="selected"]')).not.toBeNull()
    expect(container.querySelector('.coordinates')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(Array.from(container.querySelectorAll('.coordinates strong')).map(element => element.textContent)).toEqual(['10', '0', '10'])
    act(() => useBrickStore.getState().startMove())
    expect(container.querySelector('.command-strip [data-state="selected"]')).toBeNull()
    expect(screen.getByText('Moving', { selector: '.command-strip .brick-eyebrow' })).toBeInTheDocument()
  })

  it('keeps the docked drawer and no (+) button on a wide fine-pointer layout', () => {
    stubMediaQueries([])
    resetStore([brick])
    const { container } = render(<BrickStudioApp />)

    expect(container.querySelector('.part-library')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Open brick drawer' })).not.toBeInTheDocument()
  })

  it('gives touch a layer step for the ghost between Rotate and Place', () => {
    stubMediaQueries([COMPACT_LAYOUT])
    render(<BrickStudioApp />)

    openSheet()
    fireEvent.click(screen.getByTitle('1 × 1 Brick'))
    const bar = screen.getByRole('group', { name: 'Positioned brick actions' })
    expect(within(bar).getByText('Placing')).toBeInTheDocument()
    expect(within(bar).getByText('1 × 1 Brick')).toBeInTheDocument()
    expect(Array.from(bar.querySelectorAll('button')).map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim()))
      .toEqual(['Rotate', 'Raise brick one plate', 'Lower brick one plate', 'Cancel', 'Place positioned brick'])
    expect(useBrickStore.getState().draft?.y).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Raise brick one plate' }))
    expect(useBrickStore.getState().draft?.y).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Lower brick one plate' }))
    expect(useBrickStore.getState().draft?.y).toBe(0)
  })
})

describe('Builder Experience Alpha shell', () => {
  it('makes Create a brick a first-class drawer action and immediately loads the result', () => {
    stubMediaQueries([])
    render(<BrickStudioApp />)

    fireEvent.click(screen.getByRole('button', { name: 'Create a brick' }))
    const dialog = screen.getByRole('dialog', { name: 'Create a brick' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Wide ramp' } })
    fireEvent.change(within(dialog).getByLabelText('Shape'), { target: { value: 'slope' } })
    fireEvent.change(within(dialog).getByLabelText(/Width/), { target: { value: '3' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create and place' }))

    const activePartId = useBrickStore.getState().activePartId
    expect(activePartId).toMatch(/^custom_wide-ramp_/)
    expect(BRICK_PART_MAP[activePartId!]).toMatchObject({ name: 'Wide ramp', width: 3, kind: 'slope' })
    expect(screen.getByTitle('Wide ramp')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Create a brick' })).not.toBeInTheDocument()
  })

  it('opens resize from the desktop selection and applies one bounded undoable change', () => {
    stubMediaQueries([])
    resetStore([{ ...brick, partId: 'brick_1x1' }])
    render(<BrickStudioApp />)
    act(() => useBrickStore.getState().selectBrick(brick.id))

    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    fireEvent.click(screen.getByRole('button', { name: 'Resize brick' }))
    const dialog = screen.getByRole('dialog', { name: 'Resize brick' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Increase width' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply resize' }))

    const resized = useBrickStore.getState().bricks[0]
    expect(BRICK_PART_MAP[resized.partId]).toMatchObject({ width: 2, depth: 1, height: 3 })
    expect(useBrickStore.getState().undoStack.at(-1)?.label).toBe('Resize brick')
  })

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
    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Help' }))
    expect(screen.getByRole('dialog', { name: 'Build something you can explore' })).toBeInTheDocument()
  })

  it('exposes callback-only document actions and forwards the chosen import file', () => {
    const onNewBuild = vi.fn()
    const onExportProject = vi.fn()
    const onImportProject = vi.fn()
    const onStartLiveWorld = vi.fn()
    render(
      <BrickStudioApp
        onNewBuild={onNewBuild}
        onImportProject={onImportProject}
        onExportProject={onExportProject}
        onStartLiveWorld={onStartLiveWorld}
      />,
    )

    const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New build' }))
    expect(onNewBuild).toHaveBeenCalledOnce()

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download build' }))
    expect(onExportProject).toHaveBeenCalledOnce()

    // People = Build together outside a room; it lives with the world tools, not in the menu.
    fireEvent.click(screen.getByRole('button', { name: 'Build together' }))
    expect(onStartLiveWorld).toHaveBeenCalledOnce()

    openMenu()
    const file = new File(['{"schemaVersion":1}'], 'world.brickstudio.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Choose Brickgineers project file'), { target: { files: [file] } })
    expect(onImportProject).toHaveBeenCalledWith(file)
  })

  it('keeps the placed-brick list and its shortcut wiring in the idle command strip', () => {
    const second: BrickInstance = { ...brick, id: 'brick-b', x: 20 }
    resetStore([brick, second])
    render(<BrickStudioApp />)
    const selector = screen.getByLabelText('Jump to brick')
    expect(selector).toHaveAttribute('aria-keyshortcuts', 'BracketLeft BracketRight')
    expect(selector).toHaveDisplayValue('Choose 1 of 2')

    fireEvent.change(selector, { target: { value: second.id } })
    expect(useBrickStore.getState().selectedId).toBe(second.id)
    // The selection takes the strip over; the list is not shown while a brick is selected.
    expect(screen.queryByLabelText('Jump to brick')).not.toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: '[' })
    expect(useBrickStore.getState().selectedId).toBe(brick.id)
    act(() => useBrickStore.getState().clearSelection())
    expect(screen.getByLabelText('Jump to brick')).toBeInTheDocument()
  })

  it('provides an explicit touch Place action that keeps the brush loaded', () => {
    render(<BrickStudioApp />)

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

    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New build' }))
    expect(useBrickStore.getState().bricks).toEqual([brick])
    expect(screen.getByRole('status', { name: 'Studio message' })).toHaveTextContent('unchanged')

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New build' }))
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

    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    fireEvent.change(screen.getByLabelText('Choose Brickgineers project file'), { target: { files: [file] } })

    await waitFor(() => expect(screen.getByRole('status', { name: 'Studio message' })).toHaveTextContent('not valid JSON'))
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

    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download build' }))

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:brick-studio')
    expect(screen.getByRole('status', { name: 'Studio message' })).toHaveTextContent('Project exported')
  })
})

describe('refined world navigation', () => {
  it('closes the world menu with Escape without cancelling the brick being placed', () => {
    render(<BrickStudioApp />)
    const draft = useBrickStore.getState().draft
    const trigger = screen.getByRole('button', { name: 'This build' })
    fireEvent.click(trigger)
    const first = screen.getByRole('menuitem', { name: 'Download build' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(useBrickStore.getState().draft).toEqual(draft)
  })

  it('opens the visible Character entry on its tab and preserves Cancel semantics', async () => {
    render(<BrickStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Character' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Character' })).toHaveAttribute('aria-selected', 'true'))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Character Studio' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Character Studio' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Scene' })).toHaveAttribute('aria-selected', 'true'))
  })
})

describe('header account button', () => {
  const auth: ClassroomAuth = { user: { id: '00000000-0000-4000-8000-000000000002', username: 'ava.r', rosterName: 'Ava R.', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 } }
  afterEach(() => { browserClassroomClient.setSession(null) })

  it('offers Sign in while signed out', () => {
    render(<BrickStudioApp />)
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toMatch(/^\/join\?mode=signin/)
    expect(screen.queryByRole('button', { name: /Account:/ })).not.toBeInTheDocument()
  })

  it('shows the signed-in first name and last initial and opens the student account menu', () => {
    browserClassroomClient.setSession({ ...auth, user: { ...auth.user, rosterName: 'Ava Rodriguez' }, classes: [{ id: 'c1', name: 'Room 12', loginCode: 'ABC', enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true, buildingNow: 0, teacherName: 'Ms. Idrees' }] })
    render(<BrickStudioApp />)
    const account = screen.getByRole('button', { name: 'Account: Ava R., Room 12' })
    expect(account).toHaveTextContent('Ava R.')
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    fireEvent.click(account)
    const menu = within(screen.getByRole('menu', { name: 'Account' }))
    expect(menu.getByRole('menuitem', { name: 'My worlds' })).toHaveAttribute('href', '/worlds')
    expect(menu.getByRole('menuitem', { name: 'My class' })).toHaveAttribute('href', '/worlds?view=class')
    expect(menu.getByRole('menuitem', { name: 'Save this build to my account' })).toBeInTheDocument()
    expect(menu.getByRole('menuitem', { name: 'Switch account' })).toBeInTheDocument()
    expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('falls back to the username when the roster name is blank and gives teachers their menu', () => {
    browserClassroomClient.setSession({ ...auth, user: { ...auth.user, rosterName: '', username: 'ms.idrees', role: 'teacher' } })
    render(<BrickStudioApp />)
    const account = screen.getByRole('button', { name: 'Account: ms.idrees, Teacher' })
    expect(account).toHaveTextContent('ms.idrees')
    fireEvent.click(account)
    const menu = within(screen.getByRole('menu', { name: 'Account' }))
    expect(menu.getByRole('menuitem', { name: 'Show class code on projector' })).toHaveAttribute('href', '/class/projector')
    expect(menu.queryByRole('menuitem', { name: /Save this build/ })).not.toBeInTheDocument()
  })
})
