import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBrickStudioDocument } from '../brick/brickDocument'
import { ClassroomClient } from './client'
import { createCloudAutosave, recoveryKey } from './cloudAutosave'
import type { ClassroomAuthResult, ClassroomWorld } from './contracts'
const auth: ClassroomAuthResult = { user: { id: 'a', username: 'builder', rosterName: 'Alex', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600 } }
const doc = createBrickStudioDocument([])
const world: ClassroomWorld = { id: 'world-a', title: 'A world', ownerId: 'a', classId: null, kind: 'personal', revision: 1, updatedAt: '2026-09-09', document: doc }
const changed = { ...doc, environmentId: 'toy-room' as const }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function setup(fetcher: typeof fetch) {
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  const onStatus = vi.fn(), onWorld = vi.fn()
  const save = createCloudAutosave({ client, userId: 'a', world, document: doc, storage: sessionStorage, onStatus, onWorld })
  return { client, save, onStatus, onWorld }
}
beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())
it('serializes in-flight changes using the acknowledged revision', async () => {
  let finish!: (r: Response) => void
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve })).mockResolvedValueOnce(json({ world: { ...world, revision: 3 } }))
  const { save, onStatus } = setup(fetcher)
  save.schedule(changed); const pending = save.flush()
  save.schedule({ ...changed, environmentId: 'brick-valley' }); expect(save.flush()).toBe(pending)
  finish(json({ world: { ...world, revision: 2 } })); await expect(pending).resolves.toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ expectedRevision: 2, document: { environmentId: 'brick-valley' } })
  expect(save.hasPending()).toBe(false); expect(onStatus).toHaveBeenLastCalledWith('saved')
  expect(sessionStorage.getItem(recoveryKey('a', world.id))).toBeNull(); save.dispose()
})
it('preserves conflict recovery and never silently retries or adopts a newer server revision', async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ error: 'Conflict', currentRevision: 7 }, 409))
  const { save } = setup(fetcher); save.schedule(changed)
  await expect(save.flush()).resolves.toBe(false)
  save.schedule({ ...changed, environmentId: 'sky-island' }); await vi.advanceTimersByTimeAsync(1500)
  expect(fetcher).toHaveBeenCalledTimes(1); expect(save.hasPending()).toBe(true)
  expect(JSON.parse(sessionStorage.getItem(recoveryKey('a', world.id))!)).toMatchObject({ userId: 'a', document: { environmentId: 'sky-island' } })
  await save.retry(); expect(JSON.parse(fetcher.mock.calls[1][1].body).expectedRevision).toBe(1); save.dispose()
})
it('does not clear replacement recovery or fire callbacks after disposal', async () => {
  let finish!: (r: Response) => void
  const { save, onWorld, onStatus } = setup(vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve })))
  save.schedule(changed); const pending = save.flush(); save.dispose()
  sessionStorage.setItem(recoveryKey('a', world.id), 'replacement controller recovery')
  onStatus.mockClear(); finish(json({ world: { ...world, revision: 2 } }))
  await expect(pending).resolves.toBe(false)
  expect(onWorld).not.toHaveBeenCalled(); expect(onStatus).not.toHaveBeenCalled()
  expect(sessionStorage.getItem(recoveryKey('a', world.id))).toBe('replacement controller recovery')
})
it('rejects pending save after account switch and retains A recovery without writing as B', async () => {
  let finish!: (r: Response) => void
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve }))
  const { save, client, onWorld } = setup(fetcher); save.schedule(changed); const pending = save.flush()
  client.setSession({ ...auth, user: { ...auth.user, id: 'b' } }); finish(json({}, 401))
  await expect(pending).resolves.toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(1); expect(onWorld).not.toHaveBeenCalled()
  expect(JSON.parse(sessionStorage.getItem(recoveryKey('a', world.id))!).document).toEqual(changed); save.dispose()
})
