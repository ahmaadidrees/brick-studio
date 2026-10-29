import type { BrickStudioDocument } from '../brick/brickDocument'
import { ClassroomClient, ClassroomError } from './client'
import type { ClassroomWorld } from './contracts'
export type CloudSaveStatus = 'saved' | 'pending' | 'saving' | 'error'
export type CloudRecovery = { userId: string; world: Omit<ClassroomWorld, 'document'>; document: BrickStudioDocument; savedAt: string }
export const recoveryKey = (userId: string, worldId: string) => `brick-studio.cloud-recovery.v1:${userId}:${worldId}`
/**
 * Why a save failed. Only `transient` failures (no connection, a timeout, a rate limit, a server
 * error) are retried by themselves. A revision conflict, a refused document or a lost sign-in waits
 * for the student: retrying those blindly would either fail forever or overwrite someone's work.
 */
export type CloudSaveFailure = 'transient' | 'conflict' | 'auth' | 'rejected'
export function classifyCloudSaveError(error: unknown): CloudSaveFailure {
  if (!(error instanceof ClassroomError)) return error instanceof Error && /account changed|sign in/i.test(error.message) ? 'auth' : 'rejected'
  if (error.status === 0) return error.code === 'aborted' ? 'rejected' : 'transient'
  if (error.status === 408 || error.status === 429 || error.status >= 500) return 'transient'
  if (error.status === 409) return 'conflict'
  if (error.status === 401) return 'auth'
  return 'rejected'
}
export const CLOUD_SAVE_RETRY_MESSAGE = 'Can’t save right now. We’ll keep trying.'
function failureMessage(kind: CloudSaveFailure, error: unknown) {
  if (kind === 'conflict') return 'This project was saved somewhere else, like another tab. Download a copy to keep your changes.'
  if (kind === 'auth') return 'Sign in again to keep saving. Download a copy to keep your changes.'
  const reason = error instanceof Error && error.message ? error.message.trim() : 'Saving didn’t work.'
  return `${/[.!?]$/.test(reason) ? reason : `${reason}.`} Download a copy to keep your changes.`
}
/** Waits between automatic retries: quick at first, then every 30 seconds while the connection stays down. */
export const CLOUD_SAVE_RETRY_DELAYS_MS = [2000, 5000, 10_000, 20_000, 30_000] as const
type OnlineEvents = Pick<Window, 'addEventListener' | 'removeEventListener'>
export function createCloudAutosave({ client, userId, world: initialWorld, document: initialDocument, storage, onStatus, onWorld, pendingRecovery = false, events = typeof window === 'undefined' ? undefined : window }: {
  client: ClassroomClient; userId: string; world: ClassroomWorld; document: BrickStudioDocument; storage: Pick<Storage, 'setItem' | 'removeItem'>
  /** `retrying` is true while a transient failure is waiting for its automatic retry (the status is then `pending`). */
  onStatus: (status: CloudSaveStatus, error?: string, retrying?: boolean) => void; onWorld?: (world: ClassroomWorld) => void; pendingRecovery?: boolean
  /** Where the browser's `online` event is heard; a returning connection saves at once. */
  events?: OnlineEvents
}) {
  let world = initialWorld, latest = initialDocument, generation = pendingRecovery ? 1 : 0, savedGeneration = 0, stopped = false, failed = pendingRecovery
  let timer: ReturnType<typeof setTimeout> | undefined, running: Promise<boolean> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | undefined, retrying = false, retryAttempt = 0
  const preserve = () => {
    // Recovery needs the latest document and the acknowledged world metadata.
    // Keeping the older world.document too doubles synchronous storage work.
    const { document: _acknowledgedDocument, ...metadata } = world
    try { storage.setItem(recoveryKey(userId, world.id), JSON.stringify({ userId, world: metadata, document: latest, savedAt: new Date().toISOString() } satisfies CloudRecovery)) }
    catch { if (!stopped) onStatus('error', 'Device recovery storage is full. Export this build before leaving.') }
  }
  const stopRetrying = () => { clearTimeout(retryTimer); retryTimer = undefined; retrying = false }
  const armRetry = (error: unknown) => {
    clearTimeout(retryTimer)
    retrying = true
    const delay = CLOUD_SAVE_RETRY_DELAYS_MS[Math.min(retryAttempt, CLOUD_SAVE_RETRY_DELAYS_MS.length - 1)]
    retryAttempt++
    const asked = error instanceof ClassroomError && error.retryAfterSeconds !== undefined ? Math.min(error.retryAfterSeconds * 1000, 60_000) : 0
    retryTimer = setTimeout(() => { retryTimer = undefined; void flush() }, Math.max(delay, asked))
  }
  const flush = (): Promise<boolean> => {
    clearTimeout(timer)
    if (running) return running
    if (stopped || failed || generation === savedGeneration) return Promise.resolve(!failed)
    clearTimeout(retryTimer); retryTimer = undefined
    running = (async () => {
      while (!stopped && generation !== savedGeneration) {
        // Signed out: nothing is sent. The next edit or Retry checks again, so signing back in resumes saving.
        if (client.getSession()?.user.id !== userId || client.getSession()?.user.resetRequired) { stopRetrying(); preserve(); onStatus('error', 'Sign in to this account again to save.'); return false }
        const savingGeneration = generation, document = latest
        // An automatic retry keeps its message up, so the notice does not flicker on every attempt.
        if (retrying) onStatus('saving', CLOUD_SAVE_RETRY_MESSAGE, true)
        else onStatus('saving')
        try {
          const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`, 'PUT', { expectedRevision: world.revision, document })
          // A retired controller must not clear a replacement controller's recovery
          // record or report an old account's completion into the current editor.
          if (stopped) return false
          if (client.getSession()?.user.id !== userId || client.getSession()?.user.resetRequired) throw new Error('Your account changed. Sign in again to save.')
          world = result.world; savedGeneration = savingGeneration; retryAttempt = 0; stopRetrying()
          if (!stopped) onWorld?.(world)
          if (generation === savedGeneration) { try { storage.removeItem(recoveryKey(userId, world.id)) } catch { /* Stale recovery remains explicitly marked for review. */ } if (!stopped) onStatus('saved') }
        } catch (error) {
          if (stopped) return false
          preserve()
          const kind = classifyCloudSaveError(error)
          // Only a failure that can pass by itself is retried; the edits stay in this tab meanwhile.
          if (kind === 'transient') { armRetry(error); onStatus('pending', CLOUD_SAVE_RETRY_MESSAGE, true); return false }
          failed = true; stopRetrying()
          onStatus('error', failureMessage(kind, error))
          return false
        }
      }
      return true
    })().finally(() => { running = null })
    return running
  }
  const online = () => { if (retrying && !stopped && !failed) void flush() }
  events?.addEventListener('online', online)
  return {
    schedule(document: BrickStudioDocument) {
      if (stopped) return
      latest = document; generation++; preserve(); clearTimeout(timer)
      if (failed) return
      // While a retry is waiting, the next attempt carries these edits; the status keeps saying so.
      if (retrying) { onStatus('pending', CLOUD_SAVE_RETRY_MESSAGE, true); return }
      onStatus('pending'); timer = setTimeout(() => { void flush() }, 700)
    },
    flush,
    retry() { failed = false; return flush() },
    dispose() { stopped = true; clearTimeout(timer); stopRetrying(); events?.removeEventListener('online', online); if (generation !== savedGeneration) preserve() },
    hasPending: () => generation !== savedGeneration,
    getDocument: () => latest,
  }
}
