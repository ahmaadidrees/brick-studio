import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassroomClient } from './client'
import type { ClassroomAuthResult } from './contracts'
const auth: ClassroomAuthResult = { user: { id: 'student1', username: 'builder', rosterName: 'Alex', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'access1', refreshToken: 'refresh1', expiresIn: 3600 } }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => sessionStorage.clear())
describe('classroom account boundaries', () => {
  it('does not claim a login succeeded when the service rejects it', async () => {
    const client = new ClassroomClient('https://classroom.test', vi.fn().mockResolvedValue(json({ error: 'Class enrollment is closed.' }, 403)))
    await expect(client.authenticate('register', {})).rejects.toThrow('Class enrollment is closed')
    expect(client.getSession()).toBeNull()
  })
  it('refreshes an expired access token and retries the requested world operation', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ ...auth, session: { ...auth.session, accessToken: 'access2' } })).mockResolvedValueOnce(json({ worlds: [] }))
    const client = new ClassroomClient('https://classroom.test', fetcher); client.setSession(auth)
    expect(await client.request('/worlds')).toEqual({ worlds: [] })
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer access2')
  })
  it('clears local account access even when logout cannot reach the server', async () => {
    const client = new ClassroomClient('', vi.fn().mockRejectedValue(new Error('offline'))); client.setSession(auth)
    await expect(client.signOut()).rejects.toThrow('Could not connect')
    expect(client.getSession()).toBeNull(); expect(sessionStorage.length).toBe(0)
  })
  it('does not replace a switched account with a delayed refresh', async () => {
    let resolveRefresh!: (response: Response) => void
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401)).mockImplementationOnce(() => new Promise<Response>(resolve => { resolveRefresh = resolve }))
    const client = new ClassroomClient('', fetcher); client.setSession(auth)
    const pending = client.request('/worlds'); await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    client.setSession(null); resolveRefresh(json(auth))
    await expect(pending).rejects.toThrow('account changed'); expect(client.getSession()).toBeNull()
  })
})

it.each([200, 401])('rejects a delayed account A response (%s) after switching to B without retrying as B', async status => {
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve }))
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  const pending = client.request('/worlds/private-a', 'PUT', { document: 'private A data' })
  const other = { ...auth, user: { ...auth.user, id: 'student2' }, session: { ...auth.session, accessToken: 'accessB' } }
  client.setSession(other); finish(json({ world: 'A' }, status))
  await expect(pending).rejects.toThrow('account changed')
  expect(fetcher).toHaveBeenCalledTimes(1); expect(client.getSession()).toEqual(other)
})
it('does not clear B when delayed A logout finishes', async () => {
  let finish!: (response: Response) => void
  const client = new ClassroomClient('', vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve })))
  client.setSession(auth); const pending = client.signOut()
  const other = { ...auth, user: { ...auth.user, id: 'student2' } }; client.setSession(other)
  finish(json({ ok: true })); await expect(pending).rejects.toThrow('account changed')
  expect(client.getSession()).toEqual(other)
})
it('coalesces concurrent expired-token refreshes in the same login context', async () => {
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith('/auth/refresh')) return new Promise<Response>(resolve => { finish = resolve })
    return Promise.resolve(json({ worlds: [] }, (init.headers as Record<string,string>).Authorization === 'Bearer access1' ? 401 : 200))
  })
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  const first = client.request('/worlds'), second = client.request('/worlds')
  await vi.waitFor(() => expect(finish).toBeDefined())
  finish(json({ ...auth, session: { ...auth.session, accessToken: 'access2' } }))
  await expect(Promise.all([first, second])).resolves.toEqual([{ worlds: [] }, { worlds: [] }])
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1)
})
it('invokes native-style fetch with the global receiver', async () => {
  const fetcher = function(this: unknown) { if (this !== globalThis) throw new TypeError('Illegal invocation'); return Promise.resolve(json({ worlds: [] })) } as typeof fetch
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  await expect(client.request('/worlds')).resolves.toEqual({ worlds: [] })
})
it.each([0, 429, 502])('keeps the account available for retry when token renewal temporarily fails (%s)', async status => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401))
  if (status === 0) fetcher.mockRejectedValueOnce(new Error('offline'))
  else fetcher.mockResolvedValueOnce(json({ error: 'Please retry.' }, status))
  fetcher.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ ...auth, session: { ...auth.session, accessToken: 'access2' } })).mockResolvedValueOnce(json({ worlds: [] }))
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  await expect(client.request('/worlds')).rejects.toThrow()
  expect(client.getSession()).toEqual(auth)
  await expect(client.request('/worlds')).resolves.toEqual({ worlds: [] })
  expect(client.getSession()?.session.accessToken).toBe('access2')
})
it.each([401, 403])('still clears an invalid or revoked refresh session (%s)', async status => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ error: 'Your session ended.' }, status))
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  await expect(client.request('/worlds')).rejects.toThrow('Your session ended')
  expect(client.getSession()).toBeNull()
})
it('keeps the refreshed login when access to one world has been removed', async () => {
  const refreshed = { ...auth, session: { ...auth.session, accessToken: 'access2' } }
  const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(refreshed)).mockResolvedValueOnce(json({ error: 'Access to this world ended.' }, 403))
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  await expect(client.request('/worlds/removed-world')).rejects.toThrow('Access to this world ended')
  expect(client.getSession()).toEqual(refreshed)
})
