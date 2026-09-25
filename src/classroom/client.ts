import { BRAND_NAME } from '../brand'
import type {
  ClassroomAuthResult as ClassroomAuth, ClassroomCheckpoint, ClassroomClass, ClassroomClassmate, ClassroomClassPatch, ClassroomClientSurface, ClassroomLoginInput, ClassroomMe,
  ClassroomRegisterInput, ClassroomRoster, ClassroomStudent, ClassroomStudentPatch, ClassroomWorld, ClassroomWorldCreateInput, ClassroomWorldSaveInput, ClassroomWorldSharing,
} from './contracts'
export type { ClassroomUser, ClassroomClass, ClassroomClassmate, ClassroomWorld, ClassroomRoster, ClassroomRosterStudent, ClassroomLoginInput, ClassroomClientSurface, ClassroomWorldSharing } from './contracts'
export type { ClassroomAuthResult as ClassroomAuth } from './contracts'
/** Invite link and QR target for a class code: account creation first, then the class (`/join?classCode=CODE`). */
export function classJoinHref(classCode: string, origin = window.location.origin) {
  const url = new URL('/join', origin)
  url.searchParams.set('classCode', classCode.trim().toUpperCase())
  return url.toString()
}
/** A rejected classroom request. `code` and `details` carry the server's machine-readable reason (e.g. `username_taken` with `suggestions`). */
export class ClassroomError extends Error {
  constructor(message: string, public status: number, public code = '', public details: Record<string, unknown> = {}, public retryAfterSeconds?: number) { super(message) }
}
const REQUEST_TIMEOUT_MS = 20_000
function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('Retry-After')
  if (!value) return undefined
  const seconds = Number(value)
  const delay = Number.isFinite(seconds) ? seconds : (Date.parse(value) - Date.now()) / 1000
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined
}
function waitForSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new ClassroomError('Request canceled.', 0, 'aborted'))
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ClassroomError('Request canceled.', 0, 'aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(value => { signal.removeEventListener('abort', onAbort); resolve(value) }, error => { signal.removeEventListener('abort', onAbort); reject(error) })
  })
}
const GOOGLE_FLOW_KEY = 'brick-studio.teacher-google.v1'
type GoogleFlow = { state: string; verifier: string; startedAt: number; returnTo: string; accountId: string | null }
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const SESSION_KEY = 'brick-studio.classroom-session.v1'
export class ClassroomClient implements ClassroomClientSurface {
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
  request<T>(path: string, method = 'GET', body?: unknown, retry = true, signal?: AbortSignal): Promise<T> {
    return this.perform<T>(path, method, body, retry, this.epoch, signal)
  }
  private async perform<T>(path: string, method: string, body: unknown, retry: boolean, epoch: number, signal?: AbortSignal): Promise<T> {
    this.assertContext(epoch)
    if (signal?.aborted) throw new ClassroomError('Request canceled.', 0, 'aborted')
    const token = this.auth?.session.accessToken
    let response: Response
    let payload: any
    const controller = new AbortController()
    let timedOut = false
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, REQUEST_TIMEOUT_MS)
    try {
      response = await this.fetcher.call(globalThis, `${this.base}/classroom${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal })
      payload = await response.json().catch(() => null)
    }
    catch { this.assertContext(epoch); throw new ClassroomError(timedOut ? 'The server took too long to respond. Try again.' : signal?.aborted ? 'Request canceled.' : 'Could not connect. Your current build is still here. Check your connection and try again.', 0, timedOut ? 'timeout' : signal?.aborted ? 'aborted' : 'unreachable') }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }
    this.assertContext(epoch)
    if (timedOut) throw new ClassroomError('The server took too long to respond. Try again.', 0, 'timeout')
    if (signal?.aborted) throw new ClassroomError('Request canceled.', 0, 'aborted')
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
          await waitForSignal(this.refreshing.promise, signal)
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
      return this.perform<T>(path, method, body, false, epoch, signal)
    }
    this.assertContext(epoch)
    if (!response.ok) {
      const { error, code, ...details } = payload && typeof payload === 'object' ? payload : {}
      throw new ClassroomError(typeof error === 'string' ? error : error?.message || payload?.message || `Request failed (${response.status}).`, response.status, typeof code === 'string' ? code : '', details, retryAfterSeconds(response))
    }
    return payload as T
  }
  async authenticate(path: 'register' | 'login' | 'teacher-login', values: Record<string, string>) {
    const epoch = this.epoch
    const auth = await this.request<ClassroomAuth>(`/auth/${path}`, 'POST', values)
    this.assertContext(epoch); this.setSession(auth); return auth
  }
  /** Student sign-in by username and password; the class code is sent only when given (usernames are global). */
  login({ username, password, classCode }: ClassroomLoginInput) {
    const code = classCode?.trim().toUpperCase()
    return this.authenticate('login', { username: username.trim(), password, ...(code ? { classCode: code } : {}) })
  }
  /** New student account: class code, username and password (server rules), optional roster name. 409 `username_taken` carries `details.suggestions`. */
  register({ classCode, username, password, rosterName }: ClassroomRegisterInput) {
    const name = rosterName?.trim()
    return this.authenticate('register', { classCode: classCode.trim().toUpperCase(), username: username.trim(), password, ...(name ? { rosterName: name } : {}) })
  }
  /** Public tap-your-name list for a class code: `{ name, canEnroll, showNames, students }` with display names only. */
  classRoster(classCode: string) {
    return this.request<ClassroomRoster>('/auth/roster', 'POST', { classCode: classCode.trim().toUpperCase() })
  }
  /** Public class name and whether new accounts may join with this code. */
  resolveClass(classCode: string) {
    return this.request<{ name: string; canEnroll: boolean }>('/auth/class', 'POST', { classCode: classCode.trim().toUpperCase() })
  }
  me() { return this.request<ClassroomMe>('/me') }
  /** Own worlds, then class/group worlds, then classmates' shared worlds; every entry carries `visibility`, `canEdit`, `ownerName`, `sharedAt`. */
  async listWorlds() { return (await this.request<{ worlds: ClassroomWorld[] }>('/worlds')).worlds }
  async listClasses() { return (await this.request<{ classes: ClassroomClass[] }>('/classes')).classes }
  async listStudents(classId: string) { return (await this.request<{ students: ClassroomStudent[] }>(`/classes/${classId}/students`)).students }
  /** Active classmates (id + display name) for the invite picker; a student may only ask about their own class. */
  async listClassmates(classId: string) { return (await this.request<{ classmates: ClassroomClassmate[] }>(`/classes/${classId}/classmates`)).classmates }
  /** The world with its document; viewers of a shared world get `canEdit: false`. */
  async getWorld(id: string) { return (await this.request<{ world: ClassroomWorld }>(`/worlds/${id}`)).world }
  async createWorld(input: ClassroomWorldCreateInput) { return (await this.request<{ world: ClassroomWorld }>('/worlds', 'POST', { kind: 'personal', ...input })).world }
  async saveWorld(id: string, input: ClassroomWorldSaveInput) { return (await this.request<{ world: ClassroomWorld }>(`/worlds/${id}`, 'PUT', input)).world }
  async renameWorld(id: string, title: string) { return (await this.request<{ world: ClassroomWorld }>(`/worlds/${id}`, 'PATCH', { title })).world }
  /** Own-world duplicate ("<title> copy"), the existing My Worlds action; the copy is a new private personal world. */
  async duplicateWorld(id: string) {
    const source = await this.getWorld(id)
    return this.createWorld({ title: `${source.title} copy`.slice(0, 80), document: source.document!, kind: 'personal' })
  }
  async listCheckpoints(id: string) { return (await this.request<{ checkpoints: ClassroomCheckpoint[] }>(`/worlds/${id}/checkpoints`)).checkpoints }
  /** Restores against the current server revision so a stale list never silently overwrites newer work. */
  async restoreWorld(id: string, checkpointId: string) {
    const current = await this.getWorld(id)
    return (await this.request<{ world: ClassroomWorld }>(`/worlds/${id}/restore`, 'POST', { checkpointId, expectedRevision: current.revision })).world
  }
  /**
   * Owner only: `{ visibility: 'class', canEdit }` shares with the whole class, `{ visibility: 'members', canEdit, members }`
   * with the listed classmates only, `{ visibility: 'private' }` unshares. 403 `sharing_disabled` when the teacher turned
   * sharing off; 400 `invalid_member` / `too_many_members` for a bad list.
   */
  async setWorldSharing(id: string, sharing: ClassroomWorldSharing) { return (await this.request<{ world: ClassroomWorld }>(`/worlds/${id}/sharing`, 'PATCH', sharing)).world }
  /** Teacher of the owner's class: hide or show a shared student world. */
  async setWorldHidden(id: string, hidden: boolean) { return (await this.request<{ world: ClassroomWorld }>(`/worlds/${id}/visibility`, 'PATCH', { hiddenByTeacher: hidden })).world }
  /** "Make my own copy" of any world the caller can see; 409 `world_limit` at the saved-world limit. */
  async copyWorld(id: string) { return (await this.request<{ world: ClassroomWorld }>(`/worlds/${id}/copy`, 'POST')).world }
  async createClass(name: string) { return (await this.request<{ class: ClassroomClass }>('/classes', 'POST', { name })).class }
  async updateClass(id: string, patch: ClassroomClassPatch) { return (await this.request<{ class: ClassroomClass }>(`/classes/${id}`, 'PATCH', patch)).class }
  async updateStudent(classId: string, studentId: string, patch: ClassroomStudentPatch) { return (await this.request<{ student: ClassroomStudent }>(`/classes/${classId}/students/${studentId}`, 'PATCH', patch)).student }
  async changePassword(password: string) {
    const epoch = this.epoch
    const auth = await this.request<ClassroomAuth>('/auth/change-password', 'POST', { password })
    this.assertContext(epoch); this.setSession(auth); return auth
  }
  async startGoogleTeacher(returnTo: string) {
    const epoch = this.epoch
    const target = new URL(returnTo, window.location.origin)
    if (target.origin !== window.location.origin) throw new ClassroomError(`Return location must stay in ${BRAND_NAME}.`, 400)
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
    if (auth.user.role !== 'teacher') throw new ClassroomError(`This Google account is not enabled as a ${BRAND_NAME} teacher.`, 403)
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
