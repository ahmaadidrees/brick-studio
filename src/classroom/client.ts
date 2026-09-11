import type { ClassroomAuthResult as ClassroomAuth } from './contracts'
export type { ClassroomUser, ClassroomClass, ClassroomWorld } from './contracts'
export type { ClassroomAuthResult as ClassroomAuth } from './contracts'
export class ClassroomError extends Error { constructor(message: string, public status: number) { super(message) } }
const GOOGLE_FLOW_KEY = 'brick-studio.teacher-google.v1'
type GoogleFlow = { state: string; verifier: string; startedAt: number; returnTo: string; accountId: string | null }
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const SESSION_KEY = 'brick-studio.classroom-session.v1'
export class ClassroomClient {
  private auth: ClassroomAuth | null = null
  private refreshing: { epoch: number; promise: Promise<ClassroomAuth> } | null = null
  private epoch = 0
  private listeners = new Set<() => void>()
  constructor(private base = (import.meta.env.VITE_CLASSROOM_SERVER_URL || import.meta.env.VITE_LIVE_SERVER_URL || '').replace(/\/$/, ''), private fetcher: typeof fetch = fetch) {
    try { const stored = sessionStorage.getItem(SESSION_KEY); if (stored) this.auth = JSON.parse(stored) } catch { /* Storage unavailable: keep session in memory. */ }
  }
  getSession = () => this.auth
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  setSession(auth: ClassroomAuth | null) {
    this.epoch++
    this.publishSession(auth)
  }
  private publishSession(auth: ClassroomAuth | null) {
    this.auth = auth
    try { if (auth) sessionStorage.setItem(SESSION_KEY, JSON.stringify(auth)); else sessionStorage.removeItem(SESSION_KEY) } catch { /* In-memory login still works. */ }
    this.listeners.forEach(listener => listener())
  }
  private assertContext(epoch: number) {
    if (this.epoch !== epoch) throw new ClassroomError('Your account changed. Please try again.', 401)
  }
  request<T>(path: string, method = 'GET', body?: unknown, retry = true): Promise<T> {
    return this.perform<T>(path, method, body, retry, this.epoch)
  }
  private async perform<T>(path: string, method: string, body: unknown, retry: boolean, epoch: number): Promise<T> {
    this.assertContext(epoch)
    const token = this.auth?.session.accessToken
    let response: Response
    try { response = await this.fetcher.call(globalThis, `${this.base}/classroom${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }
    catch { this.assertContext(epoch); throw new ClassroomError('Could not connect. Your current build is still here. Check your connection and try again.', 0) }
    this.assertContext(epoch)
    if (response.status === 401 && retry && this.auth && !path.startsWith('/auth/')) {
      try {
        // Another request may already have renewed this same login context.
        if (this.auth.session.accessToken === token) {
          if (!this.refreshing || this.refreshing.epoch !== epoch) {
            const refreshToken = this.auth.session.refreshToken
            const entry = { epoch, promise: Promise.resolve(null as unknown as ClassroomAuth) }
            entry.promise = this.perform<ClassroomAuth>('/auth/refresh', 'POST', { refreshToken }, false, epoch)
              .then(refreshed => { this.assertContext(epoch); this.publishSession(refreshed); return refreshed })
              .finally(() => { if (this.refreshing === entry) this.refreshing = null })
            this.refreshing = entry
          }
          await this.refreshing.promise
        }
        this.assertContext(epoch)
      } catch (error) {
        // A lost connection, a rate limit, or an unavailable account service does
        // not revoke this login. Keep the editor and its pending save attached so
        // the student can retry when the service returns.
        if (this.epoch === epoch && error instanceof ClassroomError && (error.status === 401 || error.status === 403)) this.setSession(null)
        throw error
      }
      // A world may become inaccessible without invalidating the account.
      return this.perform<T>(path, method, body, false, epoch)
    }
    const payload = await response.json().catch(() => null)
    this.assertContext(epoch)
    if (!response.ok) throw new ClassroomError(typeof payload?.error === 'string' ? payload.error : payload?.error?.message || payload?.message || `Request failed (${response.status}).`, response.status)
    return payload as T
  }
  async authenticate(path: 'register' | 'login' | 'teacher-login', values: Record<string, string>) {
    const epoch = this.epoch
    const auth = await this.request<ClassroomAuth>(`/auth/${path}`, 'POST', values)
    this.assertContext(epoch); this.setSession(auth); return auth
  }
  async changePassword(password: string) {
    const epoch = this.epoch
    const auth = await this.request<ClassroomAuth>('/auth/change-password', 'POST', { password })
    this.assertContext(epoch); this.setSession(auth); return auth
  }
  async startGoogleTeacher(returnTo: string) {
    const epoch = this.epoch
    const target = new URL(returnTo, window.location.origin)
    if (target.origin !== window.location.origin) throw new ClassroomError('Return location must stay in Brick Studio.', 400)
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)))
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    this.assertContext(epoch)
    const flow: GoogleFlow = { state, verifier, startedAt: Date.now(), returnTo: `${target.pathname}${target.search}${target.hash}`, accountId: this.auth?.user.id ?? null }
    try { sessionStorage.setItem(GOOGLE_FLOW_KEY, JSON.stringify(flow)) } catch { throw new ClassroomError('Allow storage in this tab to use Google sign-in.', 0) }
    try {
      const result = await this.request<{ url: string }>('/auth/teacher-google-start', 'POST', { codeChallenge: base64url(new Uint8Array(digest)), state })
      this.assertContext(epoch)
      const url = new URL(result.url)
      if (url.protocol !== 'https:') throw new ClassroomError('Google sign-in returned an invalid destination.', 502)
      return url.toString()
    } catch (error) { sessionStorage.removeItem(GOOGLE_FLOW_KEY); throw error }
  }
  async finishGoogleTeacher(callback: string) {
    const epoch = this.epoch
    const url = new URL(callback, window.location.origin)
    const raw = sessionStorage.getItem(GOOGLE_FLOW_KEY)
    sessionStorage.removeItem(GOOGLE_FLOW_KEY)
    let flow: GoogleFlow | null = null
    try { flow = raw ? JSON.parse(raw) : null } catch { /* Invalid or missing tab state is rejected. */ }
    if (!flow || flow.state !== url.searchParams.get('state') || Date.now() - flow.startedAt > 10 * 60_000 || flow.startedAt > Date.now() || flow.accountId !== (this.auth?.user.id ?? null)) throw new ClassroomError('This Google sign-in expired or belongs to another tab. Start sign-in again.', 400)
    if (url.searchParams.has('error')) throw new ClassroomError('Google sign-in was canceled or could not finish. You can try again.', 400)
    const code = url.searchParams.get('code')
    if (!code) throw new ClassroomError('Google did not return a sign-in code. Please try again.', 400)
    const auth = await this.request<ClassroomAuth>('/auth/teacher-google', 'POST', { code, codeVerifier: flow.verifier })
    this.assertContext(epoch)
    if (auth.user.role !== 'teacher') throw new ClassroomError('This Google account is not enabled as a Brick Studio teacher.', 403)
    const target = new URL(flow.returnTo, window.location.origin)
    if (target.origin !== window.location.origin) throw new ClassroomError('Invalid return location.', 400)
    this.setSession(auth)
    return { auth, returnTo: `${target.pathname}${target.search}${target.hash}` }
  }
  async signOut() {
    const epoch = this.epoch
    try { await this.request('/auth/logout', 'POST') } finally { if (this.epoch === epoch) this.setSession(null) }
  }
}
export const browserClassroomClient = new ClassroomClient()
