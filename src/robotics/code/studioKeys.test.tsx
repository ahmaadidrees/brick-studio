import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from '../../brick/BrickStudioApp'
import { useBrickStore } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { studioShortcutsSuspended, suspendStudioShortcuts } from './studioKeys'

vi.mock('../../brick/BrickStudioScene', () => ({ default: () => <div data-testid="brick-scene" /> }))

/**
 * While the Code view is open the builder's shortcuts are off, whatever has focus: the
 * student is editing code, and Blockly owns copy, paste, undo and delete in its own
 * workspace. Driven through the real studio shell (the scene is stubbed).
 */
const initial = useBrickStore.getInitialState()
const bricks: BrickInstance[] = [
  { id: 'one', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' },
  { id: 'two', partId: 'brick_2x4', x: 20, y: 0, z: 20, rotation: 0, color: '#fff' },
]

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() },
  })
  useBrickStore.setState({ ...initial, bricks: bricks.map((brick) => ({ ...brick })), selectedIds: ['two'], selectedId: 'two', draft: null, undoStack: [], redoStack: [], viewRequest: { ...initial.viewRequest } }, true)
})
afterEach(cleanup)

describe('studio shortcuts while the Code view is open', () => {
  it('R, arrows, Delete, F, Home, Escape, the mode keys and ⌘Z do nothing; they come back on release', () => {
    render(<BrickStudioApp />)
    const snapshot = () => JSON.stringify({ bricks: useBrickStore.getState().bricks, selected: useBrickStore.getState().selectedId, mode: useBrickStore.getState().mode, view: useBrickStore.getState().viewRequest.nonce })
    const before = snapshot()
    const release = suspendStudioShortcuts()
    expect(studioShortcutsSuspended()).toBe(true)
    for (const key of ['r', 'ArrowLeft', 'ArrowUp', 'Delete', 'Backspace', 'f', 'Home', 'Escape', '2', 'PageUp', ']']) fireEvent.keyDown(document.body, { key })
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true })
    expect(snapshot()).toBe(before)
    expect(useBrickStore.getState().undoStack).toHaveLength(0)

    release()
    release()
    expect(studioShortcutsSuspended()).toBe(false)
    fireEvent.keyDown(document.body, { key: 'r' })
    expect(useBrickStore.getState().bricks[1].rotation).toBe(1)
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(useBrickStore.getState().bricks).toHaveLength(1)
  })

  it('holds nest: the keys stay off until every hold is released', () => {
    const first = suspendStudioShortcuts()
    const second = suspendStudioShortcuts()
    first()
    expect(studioShortcutsSuspended()).toBe(true)
    second()
    expect(studioShortcutsSuspended()).toBe(false)
  })
})
