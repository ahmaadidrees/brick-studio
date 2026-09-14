import { isBrickStudioAutosaveSuspended } from './liveAutosaveGuard'
import {
  registerRecoverySnapshotProvider,
  type RecoverySnapshot,
  type RecoverySnapshotSource,
} from './recoverySnapshot'
import { useBrickStore } from './store'

/** Session pointer written by the classroom hooks while a cloud world is open. */
export const ACTIVE_CLOUD_WORLD_SESSION_KEY = 'brick-studio.active-cloud-world.v1'

function readActiveCloudWorldId(): string | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_CLOUD_WORLD_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { userId?: unknown; worldId?: unknown } | null
    if (!parsed || typeof parsed !== 'object') return null
    const { userId, worldId } = parsed
    return typeof userId === 'string' && userId.length > 0 && typeof worldId === 'string' && worldId.length > 0
      ? worldId
      : null
  } catch {
    // Missing or blocked sessionStorage simply means no cloud world is open.
    return null
  }
}

export function describeActiveWorld(pathname = window.location.pathname): { source: RecoverySnapshotSource; worldId: string | null } {
  if (pathname.startsWith('/live/')) {
    const roomId = pathname.slice('/live/'.length).split('/')[0]
    return { source: 'live', worldId: roomId.length > 0 ? roomId : null }
  }
  // The session pointer alone is not proof: it survives a failed or still-pending
  // resume, during which the store holds the private local build. A cloud world
  // only owns the store while the classroom hook holds the autosave guard.
  const worldId = readActiveCloudWorldId()
  if (worldId !== null && isBrickStudioAutosaveSuspended()) return { source: 'cloud', worldId }
  return { source: 'local', worldId: null }
}

/**
 * Reads the world currently held by the brick store. Returns null for an empty
 * store so a crash before anything loaded never offers a blank "world I was in".
 */
export function captureActiveWorldSnapshot(): RecoverySnapshot | null {
  const document = useBrickStore.getState().getDocumentSnapshot()
  if (document.bricks.length === 0 && document.customParts.length === 0) return null
  const { source, worldId } = describeActiveWorld()
  return { document, source, worldId, title: null, capturedAt: Date.now() }
}

let installed: (() => void) | null = null

/**
 * Registers the store-backed provider once per page. Idempotent: repeat calls
 * return the same uninstall function without registering a second provider.
 */
export function installActiveWorldRecovery(): () => void {
  if (installed) return installed
  const unregister = registerRecoverySnapshotProvider(captureActiveWorldSnapshot)
  const uninstall = () => {
    if (installed !== uninstall) return
    installed = null
    unregister()
  }
  installed = uninstall
  return uninstall
}
