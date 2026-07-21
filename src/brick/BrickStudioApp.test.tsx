import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'

vi.mock('./BrickStudioScene', () => ({
  default: () => <div data-testid="brick-scene" />,
}))

const initialState = useBrickStore.getInitialState()

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

    fireEvent.click(screen.getByLabelText('Move brick'))
    act(() => useBrickStore.getState().setDraftPosition(12, 3, 14))

    expect(screen.getByText('Moving')).toBeInTheDocument()
    expect(Array.from(container.querySelectorAll('.coordinates strong')).map((element) => element.textContent)).toEqual(['12', '3', '14'])
  })
})
