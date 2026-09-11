import { useCallback, useEffect, useRef, useState } from 'react'
import { createBrickStudioDocument, validateBrickStudioDocument } from '../brick/brickDocument'
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
  const operation = useRef(0)
  const stop = useCallback(() => { unsubscribe.current?.(); unsubscribe.current = null; controller.current?.dispose(); controller.current = null }, [])
  const leave = useCallback(() => {
    operation.current++
    stop(); active.current = null; identity.current = null
    try { sessionStorage.removeItem(ACTIVE_KEY) } catch { /* optional session resume */ }
    // Restore guest state while the account-save guard is still held.
    let guest = createBrickStudioDocument([])
    try { const loaded = loadLocalBrickStudioProject(localStorage); if (loaded.ok && loaded.document) guest = loaded.document } catch { /* empty guest */ }
    useBrickStore.getState().restoreDocument(guest)
    setWorld(null); setRecovery(null); setError(''); setStatus('saved')
    release.current?.(); release.current = null
  }, [stop])
  const attach = useCallback(async (next: ClassroomWorld, document = useBrickStore.getState().getDocumentSnapshot(), restoreRecovery = true) => {
    const auth = client.getSession()
    if (!auth || auth.user.resetRequired || next.kind !== 'personal' || next.ownerId !== auth.user.id) throw new Error('Sign in to the owning account before opening this world.')
    const opening = ++operation.current
    if (active.current && await controller.current?.flush() === false) throw new Error('Your current world has unsaved changes. Download a recovery copy and reload the saved world before switching.')
    if (opening !== operation.current) return
    if (client.getSession()?.user.id !== auth.user.id) throw new Error('Your account changed. Please reopen the world.')
    if (!active.current) {
      const preserved = saveLocalBrickStudioProject(localStorage, useBrickStore.getState().getDocumentSnapshot())
      if (!preserved.ok) throw new Error(`${preserved.error.message} Export your guest build before opening another world.`)
    }
    if (!release.current) release.current = suspendBrickStudioAutosave()
    stop(); identity.current = auth.user.id; active.current = next
    let savedRecovery: CloudRecovery | null = null
    try { sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ userId: auth.user.id, worldId: next.id })) } catch { /* A full store must not prevent reading an existing recovery. */ }
    try {
      const raw = restoreRecovery ? sessionStorage.getItem(recoveryKey(auth.user.id, next.id)) : null
      if (raw) {
        const saved = JSON.parse(raw) as CloudRecovery
        const validated = validateBrickStudioDocument(saved.document)
        if (saved.userId === auth.user.id && saved.world?.id === next.id && Number.isSafeInteger(saved.world.revision) && saved.world.revision >= 0 && validated.ok) savedRecovery = { ...saved, document: validated.document }
      }
    } catch { /* session recovery is best effort; save failures remain visible */ }
    // Resume the actual unsaved draft, rather than putting an older copy behind
    // an export button while editing and autosaving the server version over it.
    // Keep its original revision so Retry cannot overwrite another tab's save.
    const openedDocument = savedRecovery?.document ?? document
    useBrickStore.getState().restoreDocument(openedDocument)
    setWorld(next); setRecovery(savedRecovery)
    setStatus(savedRecovery ? 'error' : 'saved')
    setError(savedRecovery ? 'Recovered unsaved changes from this tab. Review them, then retry saving or download a copy.' : '')
    controller.current = createCloudAutosave({ client, userId: auth.user.id, world: savedRecovery ? { ...next, revision: savedRecovery.world.revision } : next, document: openedDocument, storage: sessionStorage, pendingRecovery: savedRecovery !== null, onStatus: (value, detail) => { setStatus(value); setError(detail || ''); if (value === 'saved') setRecovery(null) }, onWorld: value => { active.current = value; setWorld(value) } })
    unsubscribe.current = useBrickStore.subscribe((state, previous) => { if (state.bricks !== previous.bricks || state.documentMetadata !== previous.documentMetadata) controller.current?.schedule(state.getDocumentSnapshot()) })
  }, [stop])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let resuming = operation.current
    try {
      const raw = sessionStorage.getItem(ACTIVE_KEY), auth = client.getSession()
      if (raw && auth && !auth.user.resetRequired) {
        const stored = JSON.parse(raw)
        if (stored.userId === auth.user.id) {
          client.request<{ world: ClassroomWorld }>(`/worlds/${stored.worldId}`).then(result => {
            if (!cancelled && operation.current === resuming && result.world.document && client.getSession()?.user.id === stored.userId) {
              resuming++ // attach claims this operation; its own errors still belong to this resume.
              return attach(result.world, result.world.document)
            }
          }).catch(reason => { if (!cancelled && operation.current === resuming) setError(reason instanceof Error ? reason.message : 'Could not reopen your cloud world.') })
        }
      }
    } catch { /* Invalid resume metadata does not affect guest builds. */ }
    const off = client.subscribe(() => { const auth = client.getSession(); if (identity.current && (auth?.user.id !== identity.current || auth.user.resetRequired)) leave() })
    const unload = (event: BeforeUnloadEvent) => { if (controller.current?.hasPending()) { void controller.current.flush(); event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', unload)
    return () => { cancelled = true; operation.current++; off(); window.removeEventListener('beforeunload', unload); stop(); release.current?.(); release.current = null }
  }, [enabled, attach, leave, stop])
  return { world, status, error, recovery, attach, leave, flush: () => controller.current?.flush() ?? Promise.resolve(true), retry: () => controller.current?.retry(), downloadRecovery: () => downloadBrickStudioDocument(controller.current?.getDocument() ?? recovery?.document ?? useBrickStore.getState().getDocumentSnapshot()), reload: async () => {
    if (!active.current) return
    const reloading = operation.current, source = controller.current, document = source?.getDocument()
    const result = await client.request<{ world: ClassroomWorld }>(`/worlds/${active.current.id}`)
    if (reloading !== operation.current || source !== controller.current) return
    if (source?.getDocument() !== document) throw new Error('Your build changed while the saved version was loading. Download your latest changes or try reloading again.')
    if (result.world.document) {
      stop()
      try { sessionStorage.removeItem(recoveryKey(identity.current!, result.world.id)) } catch { /* The user explicitly chose the saved version; skip stale recovery below. */ }
      await attach(result.world, result.world.document, false)
    }
  } }
}
