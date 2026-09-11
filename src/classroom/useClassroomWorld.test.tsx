import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBrickStudioDocument } from '../brick/brickDocument'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from '../brick/documentPersistence'
import * as persistence from '../brick/documentPersistence'
import { isBrickStudioAutosaveSuspended } from '../brick/liveAutosaveGuard'
import { useBrickStore } from '../brick/store'
import { useBrickStudioDocuments } from '../brick/useBrickStudioDocuments'
import { browserClassroomClient as client } from './client'
import { useClassroomWorld } from './useClassroomWorld'
import { recoveryKey } from './cloudAutosave'
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
it('reopens a pending draft without overwriting a newer server revision and exports its latest edits', async () => {
  const pending = createBrickStudioDocument([], { environmentId: 'brick-valley' })
  sessionStorage.setItem(recoveryKey('a', world.id), JSON.stringify({ userId: 'a', world, document: pending, savedAt: '2026-09-10' }))
  const request = vi.spyOn(client, 'request').mockRejectedValue(new Error('Another tab saved this world.'))
  const download = vi.spyOn(persistence, 'downloadBrickStudioDocument').mockReturnValue({ ok: true })
  const { result } = renderHook(() => useClassroomWorld(true))
  await act(async () => { await result.current.attach({ ...world, revision: 7 }, cloud); await vi.advanceTimersByTimeAsync(1000) })
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(pending)
  expect(request).not.toHaveBeenCalled()
  expect(result.current.status).toBe('error')
  act(() => useBrickStore.getState().setDocumentMetadata({ environmentId: 'toy-room' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); expect(await result.current.flush()).toBe(false) })
  expect(request).not.toHaveBeenCalled()
  act(() => { result.current.downloadRecovery() })
  expect(download).toHaveBeenLastCalledWith(expect.objectContaining({ environmentId: 'toy-room' }))
  await act(async () => { await result.current.retry() })
  expect(request).toHaveBeenCalledWith(`/worlds/${world.id}`, 'PUT', expect.objectContaining({ expectedRevision: 1, document: expect.objectContaining({ environmentId: 'toy-room' }) }))
  expect(JSON.parse(sessionStorage.getItem(recoveryKey('a', world.id))!).document.environmentId).toBe('toy-room')
})
it('does not replace an explicitly opened world with a delayed same-account resume', async () => {
  sessionStorage.setItem('brick-studio.active-cloud-world.v1', JSON.stringify({ userId: 'a', worldId: world.id }))
  let finish!: (value: unknown) => void
  vi.spyOn(client, 'request').mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
  const { result } = renderHook(() => useClassroomWorld(true))
  const other = { ...world, id: 'world-b', document: guest }
  await act(async () => { await result.current.attach(other, guest) })
  await act(async () => { finish({ world }); await Promise.resolve() })
  expect(result.current.world?.id).toBe(other.id)
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(guest)
})
it('ignores a delayed saved-world reload after opening another world', async () => {
  let finish!: (value: unknown) => void
  vi.spyOn(client, 'request').mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
  const { result } = renderHook(() => useClassroomWorld(true))
  await act(async () => { await result.current.attach(world, cloud) })
  let pending!: Promise<void>
  act(() => { pending = result.current.reload() })
  const other = { ...world, id: 'world-b', document: guest }
  await act(async () => { await result.current.attach(other, guest) })
  await act(async () => { finish({ world }); await pending })
  expect(result.current.world?.id).toBe(other.id)
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(guest)
})
it('keeps edits made while a saved-world reload is in flight', async () => {
  let finish!: (value: unknown) => void
  vi.spyOn(client, 'request').mockImplementation(() => new Promise(resolve => { finish = resolve }) as never)
  const { result } = renderHook(() => useClassroomWorld(true))
  await act(async () => { await result.current.attach(world, cloud) })
  let pending!: Promise<void>
  act(() => { pending = result.current.reload(); useBrickStore.getState().setDocumentMetadata({ environmentId: 'toy-room' }) })
  await act(async () => { finish({ world }); await expect(pending).rejects.toThrow('changed while') })
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(guest)
  expect(JSON.parse(sessionStorage.getItem(recoveryKey('a', world.id))!).document).toEqual(guest)
})
it('explicitly reloading the saved world replaces the pending draft and clears its recovery', async () => {
  sessionStorage.setItem(recoveryKey('a', world.id), JSON.stringify({ userId: 'a', world, document: guest, savedAt: '2026-09-10' }))
  vi.spyOn(client, 'request').mockResolvedValue({ world: { ...world, revision: 3 } })
  const { result } = renderHook(() => useClassroomWorld(true))
  await act(async () => { await result.current.attach(world, cloud); await result.current.reload() })
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(cloud)
  expect(result.current.status).toBe('saved')
  expect(result.current.recovery).toBeNull()
  expect(sessionStorage.getItem(recoveryKey('a', world.id))).toBeNull()
})
it('keeps a revoked account draft isolated and recovers it when its owner signs in again', async () => {
  const { result } = renderHook(() => { useBrickStudioDocuments({}, true); return useClassroomWorld(true) })
  await act(async () => { await result.current.attach(world, cloud) })
  act(() => { useBrickStore.getState().setDocumentMetadata({ environmentId: 'brick-valley' }); client.setSession(null) })
  expect(result.current.world).toBeNull()
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(guest)
  expect(JSON.parse(sessionStorage.getItem(recoveryKey('a', world.id))!).document.environmentId).toBe('brick-valley')
  act(() => client.setSession({ ...auth, user: { ...auth.user, id: 'b' } }))
  await act(async () => { await expect(result.current.attach(world, cloud)).rejects.toThrow('owning account') })
  act(() => client.setSession(auth))
  await act(async () => { await result.current.attach(world, cloud) })
  expect(useBrickStore.getState().getDocumentSnapshot().environmentId).toBe('brick-valley')
  expect(result.current.status).toBe('error')
})
it('clears a recovered draft only after its current content is acknowledged online', async () => {
  sessionStorage.setItem(recoveryKey('a', world.id), JSON.stringify({ userId: 'a', world, document: guest, savedAt: '2026-09-10' }))
  const request = vi.spyOn(client, 'request').mockResolvedValue({ world: { ...world, document: guest, revision: 2 } })
  const { result } = renderHook(() => useClassroomWorld(true))
  await act(async () => { await result.current.attach(world, cloud); expect(await result.current.retry()).toBe(true) })
  expect(request).toHaveBeenCalledWith(`/worlds/${world.id}`, 'PUT', { expectedRevision: 1, document: guest })
  expect(result.current.status).toBe('saved')
  expect(result.current.recovery).toBeNull()
  expect(sessionStorage.getItem(recoveryKey('a', world.id))).toBeNull()
})
it('does not restore a recovery document from a different account', async () => {
  sessionStorage.setItem(recoveryKey('a', world.id), JSON.stringify({ userId: 'b', world, document: guest, savedAt: '2026-09-10' }))
  const { result } = renderHook(() => useClassroomWorld(true))
  await act(async () => { await result.current.attach(world, cloud) })
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(cloud)
  expect(result.current.recovery).toBeNull()
  expect(result.current.status).toBe('saved')
})
it('still reads an existing recovery when storage is full', async () => {
  sessionStorage.setItem(recoveryKey('a', world.id), JSON.stringify({ userId: 'a', world, document: guest, savedAt: '2026-09-10' }))
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
  const { result } = renderHook(() => useClassroomWorld(true))
  await act(async () => { await result.current.attach(world, cloud) })
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(guest)
  expect(result.current.status).toBe('error')
  expect(result.current.recovery?.document).toEqual(guest)
})
