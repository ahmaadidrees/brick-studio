import type { ClassroomAuthResult as ClassroomAuth } from './contracts'
export type { ClassroomUser, ClassroomClass, ClassroomWorld } from './contracts'
export type { ClassroomAuthResult as ClassroomAuth } from './contracts'
export class ClassroomError extends Error { constructor(message: string, public status: number) { super(message) } }
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
        return this.perform<T>(path, method, body, false, epoch)
      } catch (error) { if (this.epoch === epoch) this.setSession(null); throw error }
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
  async signOut() {
    const epoch = this.epoch
    try { await this.request('/auth/logout', 'POST') } finally { if (this.epoch === epoch) this.setSession(null) }
  }
}
export const browserClassroomClient = new ClassroomClient()
