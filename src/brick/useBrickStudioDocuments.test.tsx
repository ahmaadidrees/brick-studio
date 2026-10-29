import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useState } from 'react'
import { createBrickStudioDocument } from './brickDocument'
import { useBrickStore } from './store'
import { useBrickStudioDocuments } from './useBrickStudioDocuments'
import type { CustomPartDefinition, EnvironmentId } from './types'

beforeEach(() => {
  const entries = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  } })
  useBrickStore.setState(useBrickStore.getInitialState(), true)
})
afterEach(cleanup)

it('propagates full-document restoration and undo to parent metadata without a feedback loop', () => {
  const { result } = renderHook(() => {
    const [environmentId, setEnvironment] = useState<EnvironmentId>('classic')
    const [customParts, setCustomParts] = useState<CustomPartDefinition[]>([])
    useBrickStudioDocuments({}, true, { environmentId, customParts, onDocumentLoaded(document) {
      setEnvironment(document.environmentId)
      setCustomParts(document.customParts)
    } })
    return { environmentId, customParts }
  })
  const custom = { id: 'custom_cloud', name: 'Cloud', template: 'solid', width: 2, depth: 2, height: 3, studs: 'auto' } as const
  const cloud = createBrickStudioDocument([], { environmentId: 'sky-island', customParts: [custom] })
  act(() => { useBrickStore.getState().restoreDocument(cloud) })
  expect(result.current).toEqual({ environmentId: 'sky-island', customParts: [custom] })
  act(() => { useBrickStore.getState().newBuild() })
  expect(result.current).toEqual({ environmentId: 'classic', customParts: [] })
  act(() => { useBrickStore.getState().undo() })
  expect(result.current).toEqual({ environmentId: 'sky-island', customParts: [custom] })
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(cloud)
})

it('flushes a pending guest edit on pagehide before the debounce runs', () => {
  renderHook(() => useBrickStudioDocuments())
  act(() => { useBrickStore.getState().placeDraft() })
  expect(useBrickStore.getState().bricks).toHaveLength(1)
  expect(localStorage.getItem('brick-studio.current-project.v1')).toBeNull()
  act(() => { window.dispatchEvent(new Event('pagehide')) })
  const saved = JSON.parse(localStorage.getItem('brick-studio.current-project.v1')!)
  expect(saved.bricks).toEqual(useBrickStore.getState().bricks)
})

it('never writes an account or live document through the disabled guest lifecycle', () => {
  renderHook(() => useBrickStudioDocuments({}, false))
  act(() => { useBrickStore.getState().placeDraft(); window.dispatchEvent(new Event('pagehide')) })
  expect(localStorage.getItem('brick-studio.current-project.v1')).toBeNull()
})

// A stale tab (left open since yesterday, or blank) must never overwrite the build another tab saved.
it('a tab that changed nothing never writes on pagehide or when hidden', () => {
  const older = createBrickStudioDocument([{ id: 'old', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }])
  localStorage.setItem('brick-studio.current-project.v1', JSON.stringify(older))
  renderHook(() => useBrickStudioDocuments())
  expect(useBrickStore.getState().bricks.map(brick => brick.id)).toEqual(['old'])
  const newer = JSON.stringify(createBrickStudioDocument([{ id: 'new', partId: 'brick_2x4', x: 12, y: 0, z: 10, rotation: 0, color: '#f00' }]))
  localStorage.setItem('brick-studio.current-project.v1', newer)
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  act(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')) })
  Reflect.deleteProperty(document, 'visibilityState')
  expect(localStorage.getItem('brick-studio.current-project.v1')).toBe(newer)
})

it('a blank tab never saves an empty plate over another tab’s build', () => {
  renderHook(() => useBrickStudioDocuments())
  const other = JSON.stringify(createBrickStudioDocument([{ id: 'other', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }]))
  localStorage.setItem('brick-studio.current-project.v1', other)
  act(() => { window.dispatchEvent(new Event('pagehide')) })
  expect(localStorage.getItem('brick-studio.current-project.v1')).toBe(other)
})

it('saves on pagehide again after a new edit, then goes quiet once saved', () => {
  renderHook(() => useBrickStudioDocuments())
  act(() => { useBrickStore.getState().placeDraft(); window.dispatchEvent(new Event('pagehide')) })
  const saved = localStorage.getItem('brick-studio.current-project.v1')!
  expect(JSON.parse(saved).bricks).toHaveLength(1)
  localStorage.setItem('brick-studio.current-project.v1', 'another tab')
  act(() => { window.dispatchEvent(new Event('pagehide')) })
  expect(localStorage.getItem('brick-studio.current-project.v1')).toBe('another tab')
})
