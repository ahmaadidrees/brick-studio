import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'

vi.mock('./BrickStudioScene', () => ({
  default: () => <div data-testid="brick-scene" />,
}))

const initialState = useBrickStore.getInitialState()
const brickA: BrickInstance = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }
const brickB: BrickInstance = { ...brickA, id: 'brick-b', x: 20 }

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

function resetStore(overrides: Partial<ReturnType<typeof useBrickStore.getState>> = {}) {
  useBrickStore.setState({
    ...initialState,
    bricks: [{ ...brickA }, { ...brickB }],
    draft: null,
    selectedIds: [],
    selectedId: null,
    undoStack: [],
    redoStack: [],
    ...overrides,
  }, true)
}

beforeEach(() => {
  // The studio autosaves into localStorage and reloads it on mount; start each test clean.
  localStorage.clear()
  sessionStorage.clear()
  stubMediaQueries([])
  resetStore()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('editing while the graphics are paused', () => {
  it('ignores selection and delete shortcuts until the context is restored', () => {
    render(<BrickStudioApp />)

    act(() => useBrickStore.getState().setGraphicsPaused(true))
    fireEvent.keyDown(window, { key: ']' })
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useBrickStore.getState().selectedIds).toEqual([])
    expect(useBrickStore.getState().bricks).toHaveLength(2)

    act(() => useBrickStore.getState().setGraphicsPaused(false))
    fireEvent.keyDown(window, { key: ']' })
    expect(useBrickStore.getState().selectedIds).toHaveLength(1)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useBrickStore.getState().bricks).toHaveLength(1)
  })

  it('parks the inspector delete button and undo while paused, even if the click still fires', () => {
    resetStore({ selectedIds: ['brick-a'], selectedId: 'brick-a' })
    render(<BrickStudioApp />)
    // The desktop inspector starts collapsed; expand it, then grab the controls before
    // pausing, because an inert subtree is excluded from role queries.
    fireEvent.click(screen.getByRole('button', { name: 'Show brick properties' }))
    const deleteButton = screen.getByRole('button', { name: 'Delete brick' })
    const inspector = deleteButton.closest('aside')
    expect(inspector).not.toBeNull()

    act(() => useBrickStore.getState().setGraphicsPaused(true))
    expect(inspector).toHaveAttribute('inert')
    // jsdom does not enforce inert, so a forced click exercises the store-level backstop.
    fireEvent.click(deleteButton)
    expect(useBrickStore.getState().bricks).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()

    act(() => useBrickStore.getState().setGraphicsPaused(false))
    expect(inspector).not.toHaveAttribute('inert')
    fireEvent.click(deleteButton)
    expect(useBrickStore.getState().bricks).toHaveLength(1)
  })

  it('hides the touch explore controls while paused and brings them back afterwards', () => {
    stubMediaQueries(['(pointer: coarse)'])
    render(<BrickStudioApp />)
    act(() => useBrickStore.setState({ mode: 'explore' }))
    expect(screen.getByRole('application', { name: 'Movement joystick' })).toBeInTheDocument()

    act(() => useBrickStore.getState().setGraphicsPaused(true))
    expect(screen.queryByRole('application', { name: 'Movement joystick' })).toBeNull()

    act(() => useBrickStore.getState().setGraphicsPaused(false))
    expect(screen.getByRole('application', { name: 'Movement joystick' })).toBeInTheDocument()
  })
})
