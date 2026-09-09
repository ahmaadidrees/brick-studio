import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBrickStudioDocument } from '../brick/brickDocument'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from '../brick/documentPersistence'
import { isBrickStudioAutosaveSuspended } from '../brick/liveAutosaveGuard'
import { useBrickStore } from '../brick/store'
import { useBrickStudioDocuments } from '../brick/useBrickStudioDocuments'
import { browserClassroomClient as client } from './client'
import { useClassroomWorld } from './useClassroomWorld'
import type { ClassroomAuthResult, ClassroomWorld } from './contracts'
const auth: ClassroomAuthResult = { user: { id: 'a', username: 'builder', rosterName: 'Alex', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600 } }
const guest = createBrickStudioDocument([], { environmentId: 'toy-room' })
const cloud = createBrickStudioDocument([], { environmentId: 'sky-island' })
const world: ClassroomWorld = { id: 'world-a', title: 'A world', ownerId: 'a', classId: null, kind: 'personal', revision: 1, updatedAt: '2026-09-09', document: cloud }
beforeEach(() => {
  vi.useFakeTimers(); sessionStorage.clear()
  const entries = new Map<string,string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (k:string) => entries.get(k) ?? null, setItem: (k:string,v:string) => entries.set(k,v), removeItem: (k:string) => entries.delete(k) } })
  localStorage.setItem(BRICK_STUDIO_LOCAL_STORAGE_KEY, JSON.stringify(guest))
  useBrickStore.setState(useBrickStore.getInitialState(), true); client.setSession(auth)
})
afterEach(() => { cleanup(); client.setSession(null); vi.restoreAllMocks(); vi.useRealTimers() })
it('keeps cloud content out of guest autosave and restores the guest on signout', async () => {
  const { result } = renderHook(() => { useBrickStudioDocuments({}, true); return useClassroomWorld(true) })
  await act(async () => { await result.current.attach(world, cloud); await vi.advanceTimersByTimeAsync(1200) })
  expect(isBrickStudioAutosaveSuspended()).toBe(true)
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(cloud)
  expect(JSON.parse(localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)!)).toEqual(guest)
  act(() => client.setSession(null))
  await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
  expect(result.current.world).toBeNull(); expect(isBrickStudioAutosaveSuspended()).toBe(false)
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(guest)
  expect(JSON.parse(localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)!)).toEqual(guest)
})
it('does not attach a pending resume after switching accounts', async () => {
  sessionStorage.setItem('brick-studio.active-cloud-world.v1', JSON.stringify({ userId: 'a', worldId: world.id }))
  let finish!: (value: unknown) => void
  vi.spyOn(client, 'request').mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
  const { result } = renderHook(() => useClassroomWorld(true))
  act(() => client.setSession({ ...auth, user: { ...auth.user, id: 'b' } }))
  await act(async () => { finish({ world }); await Promise.resolve() })
  expect(result.current.world).toBeNull(); expect(isBrickStudioAutosaveSuspended()).toBe(false)
  expect(JSON.parse(localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)!)).toEqual(guest)
})
