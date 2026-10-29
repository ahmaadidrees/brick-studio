import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { createBrickStudioDocument } from './brickDocument'
import { getBuildPlateSize } from './buildPlate'
import * as persistence from './documentPersistence'
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
afterEach(() => { cleanup(); vi.restoreAllMocks() })

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

it('opening a build does not write it back, so a tab closed right after loading never overwrites a newer build', () => {
  vi.useFakeTimers()
  try {
    const custom = { id: 'custom_cloud', name: 'Cloud', template: 'solid', width: 2, depth: 2, height: 3, studs: 'auto' } as const
    const stored = JSON.stringify(createBrickStudioDocument([{ id: 'old', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }], { environmentId: 'sky-island', customParts: [custom] }))
    localStorage.setItem('brick-studio.current-project.v1', stored)
    // The studio mirrors the loaded document's metadata into props, as BrickStudioApp does.
    const { result } = renderHook(() => {
      const [plateSize, setPlateSize] = useState(() => getBuildPlateSize({}))
      const [environmentId, setEnvironment] = useState<EnvironmentId>('classic')
      const [customParts, setCustomParts] = useState<CustomPartDefinition[]>([])
      useBrickStudioDocuments({}, true, { plateSize, environmentId, customParts, onDocumentLoaded(document) { setPlateSize(getBuildPlateSize(document)); setEnvironment(document.environmentId); setCustomParts(document.customParts) } })
      return setEnvironment
    })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(localStorage.getItem('brick-studio.current-project.v1')).toBe(stored)
    localStorage.setItem('brick-studio.current-project.v1', 'newer build from another tab')
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(localStorage.getItem('brick-studio.current-project.v1')).toBe('newer build from another tab')
    // A real scene change in this tab is still saved.
    act(() => { result.current('toy-room') })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(JSON.parse(localStorage.getItem('brick-studio.current-project.v1')!).environmentId).toBe('toy-room')
  } finally { vi.useRealTimers() }
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

// "New build" replaces the one build on this computer; Undo does not survive a reload, so say so and download first.
it('New build asks honestly, downloads the old build, then starts fresh', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const download = vi.spyOn(persistence, 'downloadBrickStudioDocument').mockReturnValue({ ok: true })
  const { result } = renderHook(() => useBrickStudioDocuments())
  act(() => { useBrickStore.getState().placeDraft() })
  const before = useBrickStore.getState().getDocumentSnapshot()
  act(() => { result.current.onNewBuild() })
  expect(confirm.mock.calls[0][0]).not.toMatch(/Undo/)
  expect(confirm.mock.calls[0][0]).toMatch(/replaced/)
  expect(confirm.mock.calls[0][0]).toMatch(/download/i)
  expect(download).toHaveBeenCalledWith(before, globalThis, expect.any(String))
  expect(useBrickStore.getState().bricks).toEqual([])
  expect(useBrickStore.getState().toast).toMatch(/downloaded/)
})

it('New build keeps the build when the kid says no or the download fails', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const download = vi.spyOn(persistence, 'downloadBrickStudioDocument').mockReturnValue({ ok: false, error: { code: 'download', message: 'blocked' } })
  const { result } = renderHook(() => useBrickStudioDocuments())
  act(() => { useBrickStore.getState().placeDraft() })
  act(() => { result.current.onNewBuild() })
  expect(download).not.toHaveBeenCalled()
  expect(useBrickStore.getState().bricks).toHaveLength(1)
  confirm.mockReturnValue(true)
  act(() => { result.current.onNewBuild() })
  expect(download).toHaveBeenCalledOnce()
  expect(useBrickStore.getState().bricks).toHaveLength(1)
  expect(useBrickStore.getState().toast).toMatch(/nothing was replaced/)
})

it('New build on an empty plate asks nothing and downloads nothing', () => {
  const confirm = vi.spyOn(window, 'confirm')
  const download = vi.spyOn(persistence, 'downloadBrickStudioDocument')
  const { result } = renderHook(() => useBrickStudioDocuments())
  act(() => { result.current.onNewBuild() })
  expect(confirm).not.toHaveBeenCalled(); expect(download).not.toHaveBeenCalled()
})
