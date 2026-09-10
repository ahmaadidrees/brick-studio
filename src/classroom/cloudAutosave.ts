import type { BrickStudioDocument } from '../brick/brickDocument'
import { ClassroomClient } from './client'
import type { ClassroomWorld } from './contracts'
export type CloudSaveStatus = 'saved' | 'pending' | 'saving' | 'error'
export type CloudRecovery = { userId: string; world: Omit<ClassroomWorld, 'document'>; document: BrickStudioDocument; savedAt: string }
export const recoveryKey = (userId: string, worldId: string) => `brick-studio.cloud-recovery.v1:${userId}:${worldId}`
export function createCloudAutosave({ client, userId, world: initialWorld, document: initialDocument, storage, onStatus, onWorld }: {
  client: ClassroomClient; userId: string; world: ClassroomWorld; document: BrickStudioDocument; storage: Pick<Storage, 'setItem' | 'removeItem'>;
  onStatus: (status: CloudSaveStatus, error?: string) => void; onWorld?: (world: ClassroomWorld) => void
}) {
  let world = initialWorld, latest = initialDocument, generation = 0, savedGeneration = 0, stopped = false, failed = false
  let timer: ReturnType<typeof setTimeout> | undefined, running: Promise<boolean> | null = null
  const preserve = () => {
    // Recovery needs the latest document and the acknowledged world metadata.
    // Keeping the older world.document too doubles synchronous storage work.
    const { document: _acknowledgedDocument, ...metadata } = world
    try { storage.setItem(recoveryKey(userId, world.id), JSON.stringify({ userId, world: metadata, document: latest, savedAt: new Date().toISOString() } satisfies CloudRecovery)) }
    catch { if (!stopped) onStatus('error', 'Device recovery storage is full. Export this build before leaving.') }
  }
  const flush = (): Promise<boolean> => {
    clearTimeout(timer)
    if (running) return running
    if (stopped || failed || generation === savedGeneration) return Promise.resolve(!failed)
    running = (async () => {
      while (!stopped && generation !== savedGeneration) {
        if (client.getSession()?.user.id !== userId || client.getSession()?.user.resetRequired) { preserve(); onStatus('error', 'Sign in to this account again to save.'); return false }
        const savingGeneration = generation, document = latest
        onStatus('saving')
        try {
          const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`, 'PUT', { expectedRevision: world.revision, document })
          // A retired controller must not clear a replacement controller's recovery
          // record or report an old account's completion into the current editor.
          if (stopped) return false
          if (client.getSession()?.user.id !== userId || client.getSession()?.user.resetRequired) throw new Error('Your account changed. Sign in again to save.')
          world = result.world; savedGeneration = savingGeneration
          if (!stopped) onWorld?.(world)
          if (generation === savedGeneration) { try { storage.removeItem(recoveryKey(userId, world.id)) } catch { /* Stale recovery remains explicitly marked for review. */ } if (!stopped) onStatus('saved') }
        } catch (error) { failed = true; if (!stopped) preserve(); if (!stopped) onStatus('error', `${error instanceof Error ? error.message : 'Save failed.'} Your edits are kept in this tab for recovery. Download a copy before reloading.`); return false }
      }
      return true
    })().finally(() => { running = null })
    return running
  }
  return {
    schedule(document: BrickStudioDocument) { if (stopped) return; latest = document; generation++; preserve(); clearTimeout(timer); if (!failed) { onStatus('pending'); timer = setTimeout(() => { void flush() }, 700) } },
    flush,
    retry() { failed = false; return flush() },
    dispose() { stopped = true; clearTimeout(timer); if (generation !== savedGeneration) preserve() },
    hasPending: () => generation !== savedGeneration,
    getDocument: () => latest,
  }
}
