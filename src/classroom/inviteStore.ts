import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { browserClassroomClient } from './client'
import type { ClassroomInvite } from './contracts'
import { markInvitesSeen, seenInviteIds } from './inviteSeen'

export type InviteClient = {
  request: <T>(path: string, method?: string, body?: unknown, retry?: boolean, signal?: AbortSignal) => Promise<T>
  getSession?: () => { user: { id: string; role: string } } | null
  subscribe?: (listener: () => void) => () => void
}
export type InviteSnapshot = {
  userId: string | null; invites: ClassroomInvite[]; arrivalIds: string[]; panelOpen: boolean; loading: boolean; error: string
}
const EMPTY: InviteSnapshot = { userId: null, invites: [], arrivalIds: [], panelOpen: false, loading: false, error: '' }
export const INVITE_POLL_MS = 15_000

/** One account-scoped stream shared by the toolbar and the Worlds library. No presence or world documents. */
export class InviteStore {
  private state = EMPTY
  private listeners = new Set<() => void>()
  private leases = new Set<symbol>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private controller: AbortController | null = null
  private pending: Promise<void> | null = null
  private epoch = 0
  private initialized = false
  private failures = 0
  private lastFetchAt = 0
  private marking = new Set<string>()
  private removeAuthListener?: () => void
  constructor(private client: InviteClient) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<InviteSnapshot>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
  }
  private setAccount(userId: string | null) {
    if (this.state.userId === userId) return
    this.epoch++; this.controller?.abort(); this.controller = null; this.pending = null
    this.clearTimer(); this.initialized = false; this.failures = 0; this.lastFetchAt = 0; this.marking.clear()
    this.state = { ...EMPTY, userId }; this.listeners.forEach(listener => listener())
  }
  private clearTimer() { if (this.timer !== null) clearTimeout(this.timer); this.timer = null }
  private visible() { return typeof document === 'undefined' || document.visibilityState !== 'hidden' }
  private schedule() {
    this.clearTimer()
    if (!this.leases.size || !this.state.userId || !this.visible()) return
    this.timer = setTimeout(() => { this.timer = null; void this.refresh() }, Math.min(120_000, INVITE_POLL_MS * 2 ** this.failures))
  }
  private resume = () => {
    if (!this.visible()) { this.clearTimer(); return }
    // Focus, visibility and online can arrive together; keep them one request.
    if (Date.now() - this.lastFetchAt < 1_000) { this.schedule(); return }
    void this.refresh()
  }
  retain(userId: string) {
    this.setAccount(userId)
    const lease = Symbol(); const first = this.leases.size === 0; this.leases.add(lease)
    if (first) {
      document.addEventListener('visibilitychange', this.resume)
      window.addEventListener('focus', this.resume); window.addEventListener('online', this.resume)
      this.removeAuthListener = this.client.subscribe?.(() => {
        const account = this.client.getSession?.()?.user
        this.setAccount(account?.role === 'student' ? account.id : null)
        if (this.state.userId) void this.refresh()
      })
    }
    if (this.visible() && (first || this.lastFetchAt === 0)) void this.refresh()
    return () => {
      this.leases.delete(lease)
      if (this.leases.size) return
      this.clearTimer(); this.removeAuthListener?.(); this.removeAuthListener = undefined
      document.removeEventListener('visibilitychange', this.resume)
      window.removeEventListener('focus', this.resume); window.removeEventListener('online', this.resume)
      // Account state survives route changes; requests/timers never survive disposal.
      this.epoch++; this.controller?.abort(); this.controller = null; this.pending = null; this.marking.clear()
    }
  }
  refresh = (): Promise<void> => {
    if (this.pending) return this.pending
    if (!this.state.userId || !this.visible()) return Promise.resolve()
    const epoch = this.epoch; const userId = this.state.userId
    this.lastFetchAt = Date.now(); this.clearTimer()
    const controller = new AbortController(); this.controller = controller
    if (!this.initialized) this.publish({ loading: true })
    this.pending = this.client.request<{ invites: ClassroomInvite[] }>('/invites', 'GET', undefined, true, controller.signal).then(({ invites }) => {
      if (epoch !== this.epoch) return
      // A poll may have read just before a concurrent acknowledgement. Seen/joined are monotonic per invite ID.
      const current = new Map(this.state.invites.map(invite => [invite.id, invite]))
      invites = invites.map(invite => ({ ...invite, seenAt: current.get(invite.id)?.seenAt ?? invite.seenAt, joinedAt: current.get(invite.id)?.joinedAt ?? invite.joinedAt }))
      const previous = new Set(this.state.invites.map(invite => invite.id))
      const dismissed = seenInviteIds(userId)
      const arrivalIds = this.initialized
        ? [...new Set([...this.state.arrivalIds, ...invites.filter(invite => !previous.has(invite.id) && !invite.seenAt && !dismissed.has(invite.id)).map(invite => invite.id)])]
        : []
      this.initialized = true; this.failures = 0
      this.publish({ invites: [...invites].sort((a, b) => b.invitedAt.localeCompare(a.invitedAt)), arrivalIds: arrivalIds.filter(id => invites.some(invite => invite.id === id && !invite.seenAt)), loading: false, error: '' })
      if (this.state.panelOpen) void this.markSeen(invites.filter(invite => !invite.seenAt).map(invite => invite.id))
    }).catch(() => {
      if (epoch !== this.epoch) return
      this.failures = Math.min(3, this.failures + 1)
      this.publish({ loading: false, error: 'Invites could not refresh. We’ll try again when you’re connected.' })
    }).finally(() => {
      if (epoch !== this.epoch) return
      this.pending = null; this.controller = null; this.schedule()
    })
    return this.pending
  }
  dismissArrival = () => {
    if (this.state.userId) markInvitesSeen(this.state.arrivalIds, this.state.userId)
    this.publish({ arrivalIds: [] })
  }
  openPanel = () => {
    this.dismissArrival(); this.publish({ panelOpen: true })
    void this.markSeen(this.state.invites.filter(invite => !invite.seenAt).map(invite => invite.id))
  }
  closePanel = () => this.publish({ panelOpen: false })
  async markSeen(ids: string[]) {
    await Promise.all(ids.map(id => this.mark(id, { seen: true })))
  }
  private async mark(id: string, body: { seen: true } | { joined: true }) {
    const key = `${id}:${'joined' in body ? 'joined' : 'seen'}`
    if (this.marking.has(key)) return
    const epoch = this.epoch; this.marking.add(key)
    try {
      const { invite } = await this.client.request<{ invite: ClassroomInvite }>(`/invites/${encodeURIComponent(id)}`, 'PATCH', body)
      if (epoch === this.epoch) this.publish({ invites: this.state.invites.map(item => item.id === id ? { ...item, ...invite, seenAt: item.seenAt ?? invite.seenAt, joinedAt: item.joinedAt ?? invite.joinedAt } : item), arrivalIds: this.state.arrivalIds.filter(item => item !== id) })
    } catch { /* Keep it unread and retry on the next panel inspection. Navigation never depends on acknowledgement. */ }
    finally { if (epoch === this.epoch) this.marking.delete(key) }
  }
  async joinedWorld(worldId: string) {
    const account = this.client.getSession?.()?.user
    if (account && account.role !== 'student') return
    if (account) this.setAccount(account.id)
    if (!this.state.userId) return
    if (!this.initialized) await this.refresh()
    const normalized = worldId.replaceAll('-', '')
    await Promise.all(this.state.invites.filter(invite => invite.worldId.replaceAll('-', '') === normalized && !invite.joinedAt).map(invite => this.mark(invite.id, { joined: true })))
  }
}
const stores = new WeakMap<object, InviteStore>()
export function inviteStoreFor(client: InviteClient = browserClassroomClient) {
  let store = stores.get(client)
  if (!store) { store = new InviteStore(client); stores.set(client, store) }
  return store
}
export function useStudentInvites(userId: string | null | undefined, client: InviteClient = browserClassroomClient) {
  const store = useMemo(() => inviteStoreFor(client), [client])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => { if (userId) return store.retain(userId) }, [store, userId])
  return { state: userId && state.userId === userId ? state : EMPTY, store }
}
/** Call after the room confirms arrival, never when its link is clicked. */
export const markInviteJoinedForWorld = (worldId: string): Promise<void> => inviteStoreFor().joinedWorld(worldId)
