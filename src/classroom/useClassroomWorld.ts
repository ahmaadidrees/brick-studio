import { useCallback, useEffect, useRef, useState } from 'react'
import { createBrickStudioDocument, type BrickStudioDocument } from '../brick/brickDocument'
import { loadLocalBrickStudioProject, saveLocalBrickStudioProject, downloadBrickStudioDocument } from '../brick/documentPersistence'
import { suspendBrickStudioAutosave } from '../brick/liveAutosaveGuard'
import { useBrickStore } from '../brick/store'
import { browserClassroomClient as client } from './client'
import { createCloudAutosave, recoveryKey, type CloudRecovery, type CloudSaveStatus } from './cloudAutosave'
import type { ClassroomWorld } from './contracts'
const ACTIVE_KEY = 'brick-studio.active-cloud-world.v1'
export function useClassroomWorld(enabled: boolean) {
  const [world, setWorld] = useState<ClassroomWorld | null>(null)
  const [status, setStatus] = useState<CloudSaveStatus>('saved')
  const [error, setError] = useState('')
  const [recovery, setRecovery] = useState<CloudRecovery | null>(null)
  const controller = useRef<ReturnType<typeof createCloudAutosave> | null>(null)
  const release = useRef<(() => void) | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)
  const identity = useRef<string | null>(null)
  const active = useRef<ClassroomWorld | null>(null)
  const stop = useCallback(() => { unsubscribe.current?.(); unsubscribe.current = null; controller.current?.dispose(); controller.current = null }, [])
  const leave = useCallback(() => {
    stop(); active.current = null; identity.current = null
    try { sessionStorage.removeItem(ACTIVE_KEY) } catch { /* optional session resume */ }
    // Restore guest state while the account-save guard is still held.
    let guest = createBrickStudioDocument([])
    try { const loaded = loadLocalBrickStudioProject(localStorage); if (loaded.ok && loaded.document) guest = loaded.document } catch { /* empty guest */ }
    useBrickStore.getState().restoreDocument(guest)
    setWorld(null); setRecovery(null); setError(''); setStatus('saved')
    release.current?.(); release.current = null
  }, [stop])
  const attach = useCallback(async (next: ClassroomWorld, document = useBrickStore.getState().getDocumentSnapshot()) => {
    const auth = client.getSession()
    if (!auth || auth.user.resetRequired || next.kind !== 'personal' || next.ownerId !== auth.user.id) throw new Error('Sign in to the owning account before opening this world.')
    if (active.current && await controller.current?.flush() === false) throw new Error('Your current world has unsaved changes. Download a recovery copy and reload the saved world before switching.')
    if (client.getSession()?.user.id !== auth.user.id) throw new Error('Your account changed. Please reopen the world.')
    if (!active.current) {
      const preserved = saveLocalBrickStudioProject(localStorage, useBrickStore.getState().getDocumentSnapshot())
      if (!preserved.ok) throw new Error(`${preserved.error.message} Export your guest build before opening another world.`)
    }
    if (!release.current) release.current = suspendBrickStudioAutosave()
    stop(); identity.current = auth.user.id; active.current = next
    useBrickStore.getState().restoreDocument(document)
    setWorld(next); setStatus('saved'); setError(''); setRecovery(null)
    try {
      sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ userId: auth.user.id, worldId: next.id }))
      const raw = sessionStorage.getItem(recoveryKey(auth.user.id, next.id))
      if (raw) { const saved = JSON.parse(raw) as CloudRecovery; if (saved.userId === auth.user.id && saved.world.id === next.id) setRecovery(saved) }
    } catch { /* session recovery is best effort; save failures remain visible */ }
    controller.current = createCloudAutosave({ client, userId: auth.user.id, world: next, document, storage: sessionStorage, onStatus: (value, detail) => { setStatus(value); setError(detail || '') }, onWorld: value => { active.current = value; setWorld(value) } })
    unsubscribe.current = useBrickStore.subscribe((state, previous) => { if (state.bricks !== previous.bricks || state.documentMetadata !== previous.documentMetadata) controller.current?.schedule(state.getDocumentSnapshot()) })
  }, [stop])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    try {
      const raw = sessionStorage.getItem(ACTIVE_KEY), auth = client.getSession()
      if (raw && auth && !auth.user.resetRequired) {
        const stored = JSON.parse(raw)
        if (stored.userId === auth.user.id) {
          client.request<{ world: ClassroomWorld }>(`/worlds/${stored.worldId}`).then(result => { if (!cancelled && result.world.document && client.getSession()?.user.id === stored.userId) return attach(result.world, result.world.document) }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not reopen your cloud world.') })
        }
      }
    } catch { /* Invalid resume metadata does not affect guest builds. */ }
    const off = client.subscribe(() => { const auth = client.getSession(); if (identity.current && (auth?.user.id !== identity.current || auth.user.resetRequired)) leave() })
    const unload = (event: BeforeUnloadEvent) => { if (controller.current?.hasPending()) { void controller.current.flush(); event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', unload)
    return () => { cancelled = true; off(); window.removeEventListener('beforeunload', unload); stop(); release.current?.(); release.current = null }
  }, [enabled, attach, leave, stop])
  return { world, status, error, recovery, attach, leave, flush: () => controller.current?.flush() ?? Promise.resolve(true), retry: () => controller.current?.retry(), downloadRecovery: () => downloadBrickStudioDocument(recovery?.document ?? controller.current?.getDocument() ?? useBrickStore.getState().getDocumentSnapshot()), reload: async () => { if (!active.current) return; const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${active.current.id}`); if (result.world.document) { stop(); await attach(result.world, result.world.document) } } }
}
