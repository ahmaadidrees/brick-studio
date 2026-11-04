import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'

/* "Open in Hackable 3D" in the classic 3D builder's This project menu (docs/qa/hackable-3d/SPIKE.md). */

const keep = vi.hoisted(() => ({ fn: vi.fn<(document: unknown, name: string) => Promise<string>>() }))
vi.mock('./BrickStudioScene', () => ({ default: () => <div data-testid="brick-scene" /> }))
vi.mock('../platformer/lab/studio/persist/openInHackable3d', () => ({ keepClassicAsHackable3d: keep.fn }))

const initialState = useBrickStore.getInitialState()
const bricks: BrickInstance[] = [
  { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' },
  { id: 'brick-b', partId: 'brick_2x4', x: 20, y: 0, z: 10, rotation: 1, color: '#e7473c' },
]

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() },
  })
  useBrickStore.setState({ ...initialState, bricks: bricks.map((b) => ({ ...b })), selectedIds: [], selectedId: null, draft: null, undoStack: [], redoStack: [] }, true)
  keep.fn.mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const openInHackable3d = () => {
  fireEvent.click(screen.getByRole('button', { name: 'This project' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Open in Hackable 3D/ }))
}

it('copies the build into a new Hackable 3D project and goes to it, leaving the build as it was', async () => {
  const assign = vi.fn()
  keep.fn.mockResolvedValue('/3d/hackable?draft=h1')
  render(<BrickStudioApp />)
  const before = useBrickStore.getState().getDocumentSnapshot()
  vi.stubGlobal('location', { ...window.location, assign })
  openInHackable3d()

  await waitFor(() => expect(assign).toHaveBeenCalledWith('/3d/hackable?draft=h1'))
  expect(keep.fn).toHaveBeenCalledOnce()
  const [document, name] = keep.fn.mock.calls[0]
  expect(document).toEqual(before)
  // A guest's build has no title: the Hackable copy gets the new-project name.
  expect(name).toBe('')
  // The classic build is unchanged, and was saved in this browser before leaving.
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(before)
  expect(useBrickStore.getState().bricks).toEqual(bricks)
})

it('says plainly when the copy could not be made, and stays in the builder', async () => {
  const assign = vi.fn()
  keep.fn.mockRejectedValue(new Error('This computer is full.'))
  render(<BrickStudioApp />)
  vi.stubGlobal('location', { ...window.location, assign })
  openInHackable3d()

  await waitFor(() => expect(useBrickStore.getState().toast).toBe('This build could not be opened in Hackable 3D. This computer is full.'))
  expect(assign).not.toHaveBeenCalled()
  expect(useBrickStore.getState().bricks).toEqual(bricks)
})
