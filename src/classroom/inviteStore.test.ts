import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ClassroomInvite } from './contracts'
import { InviteStore, INVITE_POLL_MS, type InviteClient } from './inviteStore'
import { markInvitesSeen, seenInviteIds } from './inviteSeen'

const invite = (id: string, worldId = id): ClassroomInvite => ({ id, worldId, title: 'Tree house', ownerName: 'Finn O.', format: 'brick', canEdit: true, invitedAt: '2026-10-01T17:00:00Z', seenAt: null, joinedAt: null })
const cleanup: (() => void)[] = []
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }) })
afterEach(() => { cleanup.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); vi.restoreAllMocks() })
const turn = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

it('deduplicates the library/header stream, polls visibly, and treats the first response as a quiet baseline', async () => {
  let invites = [invite('old')]
  const request = vi.fn(async (_path: string) => ({ invites }))
  const store = new InviteStore({ request: request as InviteClient['request'] })
  cleanup.push(store.retain('ava'), store.retain('ava'))
  await turn()
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0][0]).toBe('/invites')
  expect(store.getSnapshot().arrivalIds).toEqual([])
  invites = [invite('new'), invite('old')]
  await vi.advanceTimersByTimeAsync(INVITE_POLL_MS)
  expect(store.getSnapshot().arrivalIds).toEqual(['new'])
  store.dismissArrival()
  expect(store.getSnapshot().invites).toHaveLength(2)
  expect(store.getSnapshot().invites.every(item => item.seenAt === null)).toBe(true)
  expect(seenInviteIds('ava').has('new')).toBe(true)
})

it('pauses while hidden, refreshes on return, backs off failures, and stops after the final consumer leaves', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ invites: [] })
  const store = new InviteStore({ request })
  const dispose = store.retain('ava'); cleanup.push(dispose)
  await turn()
  await vi.advanceTimersByTimeAsync(INVITE_POLL_MS)
  expect(request).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(INVITE_POLL_MS)
  expect(request).toHaveBeenCalledTimes(2)
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(INVITE_POLL_MS * 3)
  expect(request).toHaveBeenCalledTimes(2)
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online'))
  await turn()
  expect(request).toHaveBeenCalledTimes(3)
  dispose()
  await vi.advanceTimersByTimeAsync(INVITE_POLL_MS * 3)
  expect(request).toHaveBeenCalledTimes(3)
})

it('keeps panel inspection separate from room arrival and accepts normalized room ids', async () => {
  let record = invite('record', '00000000-0000-4000-8000-000000000001')
  const request = vi.fn(async (_path: string, method?: string, body?: unknown) => {
    if (method === 'PATCH') {
      record = { ...record, seenAt: 'now', ...((body as { joined?: true }).joined ? { joinedAt: 'now' } : {}) }
      return { invite: record }
    }
    return { invites: [record] }
  })
  const store = new InviteStore({ request: request as InviteClient['request'] })
  cleanup.push(store.retain('ava')); await turn()
  store.openPanel(); await turn()
  expect(record.seenAt).toBe('now')
  expect(record.joinedAt).toBe(null)
  store.closePanel()
  await store.joinedWorld('00000000000040008000000000000001')
  expect(record.joinedAt).toBe('now')
})

it('does not publish an old account response after an account switch', async () => {
  let resolveOld!: (result: { invites: ClassroomInvite[] }) => void
  const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValue({ invites: [invite('ben-world')] })
  const store = new InviteStore({ request })
  cleanup.push(store.retain('ava'), store.retain('ben'))
  await turn(); resolveOld({ invites: [invite('ava-world')] }); await turn()
  expect(store.getSnapshot().userId).toBe('ben')
  expect(store.getSnapshot().invites.map(item => item.id)).toEqual(['ben-world'])
  markInvitesSeen(['shared-id'], 'ava')
  expect(seenInviteIds('ben').has('shared-id')).toBe(false)
})
