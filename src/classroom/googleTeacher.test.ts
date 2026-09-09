// @ts-expect-error Node crypto is provided by Vitest; the application intentionally uses DOM timer types.
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassroomClient } from './client'
const FLOW = 'brick-studio.teacher-google.v1'
const auth = { user: { id: 'teacher1', username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false }, classes: [], session: { accessToken: 'private-access', refreshToken: 'private-refresh', expiresIn: 3600 } }
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('crypto', webcrypto) })
describe('Google teacher PKCE', () => {
  it('keeps verifier in tab storage and exchanges only a matched code', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ url: 'https://auth.example.test/auth/v1/authorize?provider=google' })).mockResolvedValueOnce(json(auth))
    const client = new ClassroomClient('', fetcher)
    await client.startGoogleTeacher('/?classroom=class')
    const pending = JSON.parse(sessionStorage.getItem(FLOW)!)
    const start = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(start.state).toBe(pending.state); expect(start.codeChallenge).not.toBe(pending.verifier)
    expect(start.codeVerifier).toBeUndefined()
    const result = await client.finishGoogleTeacher(`http://localhost/auth/teacher-callback?state=${pending.state}&code=one-time-code`)
    expect(result.returnTo).toBe('/?classroom=class'); expect(client.getSession()?.user.role).toBe('teacher')
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ code: 'one-time-code', codeVerifier: pending.verifier })
    expect(sessionStorage.getItem(FLOW)).toBeNull()
  })
  it('rejects mismatched state without sending the authorization code', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ url: 'https://auth.example.test/authorize' }))
    const client = new ClassroomClient('', fetcher); await client.startGoogleTeacher('/')
    await expect(client.finishGoogleTeacher('/auth/teacher-callback?state=wrong&code=attacker-code')).rejects.toThrow('another tab')
    expect(fetcher).toHaveBeenCalledTimes(1); expect(client.getSession()).toBeNull()
  })
  it('rejects expired flows and external return locations', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ url: 'https://auth.example.test/authorize' }))
    const client = new ClassroomClient('', fetcher)
    await expect(client.startGoogleTeacher('https://unrelated.test/')).rejects.toThrow('stay in Brick Studio')
    await client.startGoogleTeacher('/')
    const pending = JSON.parse(sessionStorage.getItem(FLOW)!); pending.startedAt = Date.now() - 11 * 60_000; sessionStorage.setItem(FLOW, JSON.stringify(pending))
    await expect(client.finishGoogleTeacher(`/auth/teacher-callback?state=${pending.state}&code=expired`)).rejects.toThrow('expired')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
