import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassroomClient } from './client'
import type { ClassroomAuthResult } from './contracts'
import { SESSION_STORE_KEYS, browserSessionStore } from './sessionStore'

const auth = (id: string, token: string): ClassroomAuthResult => ({
  user: { id, username: id, rosterName: id, role: 'student', resetRequired: false },
  classes: [],
  session: { accessToken: token, refreshToken: `r-${token}`, expiresIn: 3600 },
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const closeBrowser = () => (document.cookie = `${SESSION_STORE_KEYS.cookie}=; Path=/; Max-Age=0`)
/** What another tab's write looks like to this one. */
const otherTabWrote = () => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORE_KEYS.store }))

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  closeBrowser()
})

describe('one sign-in for every tab', () => {
  it('a new tab opens signed in; closing the browser signs out', () => {
    const first = new ClassroomClient('https://c.test', vi.fn())
    first.setSession(auth('maya', 'a1'))
    expect(new ClassroomClient('https://c.test', vi.fn()).getSession()?.user.id).toBe('maya')
    closeBrowser()
    expect(new ClassroomClient('https://c.test', vi.fn()).getSession()).toBeNull()
    expect(localStorage.getItem(SESSION_STORE_KEYS.store)).toBeNull()
  })

  it('signing out in one tab signs out the others', () => {
    const a = new ClassroomClient('https://c.test', vi.fn())
    a.setSession(auth('maya', 'a1'))
    const b = new ClassroomClient('https://c.test', vi.fn())
    const seen = vi.fn()
    b.subscribe(seen)
    a.setSession(null)
    otherTabWrote()
    expect(b.getSession()).toBeNull()
    expect(seen).toHaveBeenCalled()
  })

  it('a guest tab picks up a sign-in from another tab; a tab signed in as someone else keeps its own account', () => {
    const guest = new ClassroomClient('https://c.test', vi.fn())
    const leo = new ClassroomClient('https://c.test', vi.fn())
    leo.setSession(auth('leo', 'l1'))
    const maya = new ClassroomClient('https://c.test', vi.fn())
    maya.setSession(auth('maya', 'm1'))
    otherTabWrote()
    expect(guest.getSession()?.user.id).toBe('maya')
    expect(leo.getSession()?.user.id).toBe('leo')
  })

  it('an older build’s tab-only sign-in moves to the shared place once', () => {
    sessionStorage.setItem(SESSION_STORE_KEYS.legacyTab, JSON.stringify(auth('sam', 's1')))
    expect(new ClassroomClient('https://c.test', vi.fn()).getSession()?.user.id).toBe('sam')
    expect(sessionStorage.getItem(SESSION_STORE_KEYS.legacyTab)).toBeNull()
    expect(browserSessionStore().read()).toMatchObject({ user: { id: 'sam' } })
  })

  it('when a sign-in expires, a tab uses a renewal another tab already made instead of renewing again', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const token = (init?.headers as Record<string, string> | undefined)?.Authorization
      if (url.endsWith('/auth/refresh')) return json(auth('maya', 'fresh-from-refresh'))
      return token === 'Bearer a2' ? json({ ok: true }) : json({ error: 'expired' }, 401)
    })
    const a = new ClassroomClient('https://c.test', fetcher as unknown as typeof fetch)
    a.setSession(auth('maya', 'a1'))
    // Another tab renewed meanwhile: the shared store now holds a2.
    browserSessionStore().write(auth('maya', 'a2'))
    await expect(a.request('/me')).resolves.toEqual({ ok: true })
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/auth/refresh'))).toBe(false)
    expect(a.getSession()?.session.accessToken).toBe('a2')
  })
})
