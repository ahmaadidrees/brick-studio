import { useCallback, useEffect, useRef, useState } from 'react'
import { createBrickStudioDocument, validateBrickStudioDocument } from '../brick/brickDocument'
import { loadLocalBrickStudioProject, saveLocalBrickStudioProject, downloadBrickStudioDocument } from '../brick/documentPersistence'
import { suspendBrickStudioAutosave } from '../brick/liveAutosaveGuard'
import { useBrickStore } from '../brick/store'
import { goToJoin } from '../shell/navigation'
import { browserClassroomClient as client } from './client'
import { createCloudAutosave, recoveryKey, type CloudRecovery, type CloudSaveStatus } from './cloudAutosave'
import type { ClassroomWorld } from './contracts'
const ACTIVE_KEY = 'brick-studio.active-cloud-world.v1'
/** The account world's build can't be opened by this version of the app; the editor keeps what it had and saves nothing into it. */
export class CloudWorldUnreadableError extends Error {
  constructor() { super('We couldn’t open this project here, so nothing was changed. Reload the page and try again.'); this.name = 'CloudWorldUnreadableError' }
}
export const SIGNED_OUT_MESSAGE = 'You were signed out. Sign in to keep saving.'
export function useClassroomWorld(enabled: boolean) {
  const [world, setWorld] = useState<ClassroomWorld | null>(null)
  const [status, setStatus] = useState<CloudSaveStatus>('saved')
  const [error, setError] = useState('')
  const [recovery, setRecovery] = useState<CloudRecovery | null>(null)
  // A transient failure is waiting for its automatic retry (no connection, a timeout, a server error).
  const [retrying, setRetrying] = useState(false)
  // Signed out without choosing to (an expired or revoked sign-in, a teacher's password reset, another
  // tab signing out): the project stays on screen, read-only, instead of swapping in the guest build.
  const [signedOut, setSignedOutState] = useState(false)
  const signedOutRef = useRef(false)
  const setSignedOut = useCallback((value: boolean) => { signedOutRef.current = value; setSignedOutState(value) }, [])
  // Set while the student follows "Sign in" to /join, so the leave-page warning doesn't stop them.
  const leavingToSignIn = useRef(false)
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
    setWorld(null); setRecovery(null); setError(''); setStatus('saved'); setRetrying(false); setSignedOut(false)
    release.current?.(); release.current = null
  }, [stop, setSignedOut])
  const attach = useCallback(async (next: ClassroomWorld, document = useBrickStore.getState().getDocumentSnapshot(), restoreRecovery = true) => {
    const auth = client.getSession()
    if (!auth || auth.user.resetRequired || next.kind !== 'personal' || next.ownerId !== auth.user.id) throw new Error('Sign in to the owning account before opening this world.')
    const opening = ++operation.current
    // A world that fails to load must never be attached: the editor would keep the guest build on
    // screen and the next edit would save it into the account world.
    if (!validateBrickStudioDocument(document).ok) throw new CloudWorldUnreadableError()
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
    if (!useBrickStore.getState().restoreDocument(openedDocument).ok) {
      // Defensive: both documents were checked above, but never autosave a build that did not open.
      active.current = null; identity.current = null
      try { sessionStorage.removeItem(ACTIVE_KEY) } catch { /* optional session resume */ }
      release.current?.(); release.current = null
      throw new CloudWorldUnreadableError()
    }
    setWorld(next); setRecovery(savedRecovery); setSignedOut(false)
    setStatus(savedRecovery ? 'error' : 'saved'); setRetrying(false)
    setError(savedRecovery ? 'Your changes that weren’t saved yet are back. Press Retry save to save them, or download a copy.' : '')
    controller.current = createCloudAutosave({ client, userId: auth.user.id, world: savedRecovery ? { ...next, revision: savedRecovery.world.revision } : next, document: openedDocument, storage: sessionStorage, pendingRecovery: savedRecovery !== null, onStatus: (value, detail, willRetry) => { setStatus(value); setError(detail || ''); setRetrying(Boolean(willRetry)); if (value === 'saved') setRecovery(null) }, onWorld: value => { active.current = value; setWorld(value) } })
    unsubscribe.current = useBrickStore.subscribe((state, previous) => { if (state.bricks !== previous.bricks || state.documentMetadata !== previous.documentMetadata) controller.current?.schedule(state.getDocumentSnapshot()) })
  }, [stop, setSignedOut])
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
    const off = client.subscribe(() => {
      if (!identity.current) return
      const auth = client.getSession()
      if (auth?.user.id === identity.current && !auth.user.resetRequired) {
        // The same student is back (signed in here or in another tab): saving resumes where it stopped.
        if (!signedOutRef.current) return
        setSignedOut(false)
        const current = controller.current
        if (current?.hasPending()) void current.retry()
        else { setStatus('saved'); setError('') }
        return
      }
      // Someone else signed in on this device, or this student chose Sign out here: back to the guest build.
      if ((auth && auth.user.id !== identity.current) || (!auth && client.isSigningOut())) { leave(); return }
      // Not chosen: keep the project on screen. The autosave stays attached but sends nothing while
      // signed out (its edits stay in this tab's recovery), and the guest autosave stays suspended.
      if (signedOutRef.current) return
      setSignedOut(true); setStatus('error'); setError(SIGNED_OUT_MESSAGE); setRetrying(false)
    })
    // The header's Sign out waits for this: save the waiting edits, or ask before signing out without them.
    const unguard = client.guardSignOut(async () => {
      const current = controller.current
      if (!current?.hasPending() || await current.flush()) return true
      if (!window.confirm('Your newest changes aren’t saved to your account yet. Download a copy and sign out?')) return false
      return downloadBrickStudioDocument(current.getDocument()).ok
    })
    const unload = (event: BeforeUnloadEvent) => { if (!leavingToSignIn.current && controller.current?.hasPending()) { void controller.current.flush(); event.preventDefault(); event.returnValue = '' } }
    // Coming back to this page from the browser's history: warn again before leaving.
    const shown = () => { leavingToSignIn.current = false }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('pageshow', shown)
    return () => { cancelled = true; operation.current++; off(); unguard(); window.removeEventListener('beforeunload', unload); window.removeEventListener('pageshow', shown); stop(); release.current?.(); release.current = null }
  }, [enabled, attach, leave, stop, setSignedOut])
  /** "Sign in" from the signed-out notice: /join, then straight back to this project (this tab keeps its unsaved edits). */
  const signIn = useCallback(() => {
    const id = active.current?.id
    leavingToSignIn.current = true
    goToJoin({ mode: 'signin', next: id ? `/build?world=${encodeURIComponent(id)}` : '/build' })
  }, [])
  return { world, status, error, recovery, retrying, signedOut, signIn, attach, leave, flush: () => controller.current?.flush() ?? Promise.resolve(true), retry: () => controller.current?.retry(),
  // Edits made while a world was being created online are not yet in it; queue the editor's current document for autosave.
  scheduleCurrent: () => { controller.current?.schedule(useBrickStore.getState().getDocumentSnapshot()) }, downloadRecovery: () => downloadBrickStudioDocument(controller.current?.getDocument() ?? recovery?.document ?? useBrickStore.getState().getDocumentSnapshot()), reload: async () => {
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
