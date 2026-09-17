import { validateBrickStudioDocument, type BrickStudioDocument } from './brickDocument'

/**
 * Where the world that was open at crash time actually lived. Live rooms and cloud
 * worlds suspend the private local autosave, so the store's document is the only
 * copy of those worlds in this tab and must never be confused with `localStorage`.
 */
export type RecoverySnapshotSource = 'local' | 'cloud' | 'live'

export type RecoverySnapshot = {
  /** Validated, normalized copy of the document that was open when the studio failed. */
  document: BrickStudioDocument
  source: RecoverySnapshotSource
  /** Cloud world id or live room id; null for the private local build. */
  worldId: string | null
  /** Human-readable world title when one is cheaply known; usually null. */
  title: string | null
  capturedAt: number
}

export type RecoverySnapshotProvider = () => RecoverySnapshot | null

/**
 * Providers are registered by whichever chunk owns the active world (the studio
 * app registers one that reads the brick store). This module deliberately imports
 * nothing from the store so the error boundary in the entry chunk stays decoupled.
 */
const providers: RecoverySnapshotProvider[] = []
const SOURCES: ReadonlySet<string> = new Set<RecoverySnapshotSource>(['local', 'cloud', 'live'])

export function registerRecoverySnapshotProvider(provider: RecoverySnapshotProvider): () => void {
  providers.push(provider)
  let registered = true
  return () => {
    if (!registered) return
    registered = false
    const index = providers.lastIndexOf(provider)
    if (index !== -1) providers.splice(index, 1)
  }
}

function normalizeSnapshot(candidate: unknown): RecoverySnapshot | null {
  if (!candidate || typeof candidate !== 'object') return null
  const { document, source, worldId, title, capturedAt } = candidate as Record<string, unknown>
  if (typeof source !== 'string' || !SOURCES.has(source)) return null
  // Only a document brick-core accepts is worth offering: a half-torn-down store
  // or a provider bug must not turn into a "recovery" file that cannot be imported.
  const validated = validateBrickStudioDocument(document)
  if (!validated.ok) return null
  return {
    document: validated.document,
    source: source as RecoverySnapshotSource,
    worldId: typeof worldId === 'string' && worldId.length > 0 ? worldId : null,
    title: typeof title === 'string' && title.length > 0 ? title : null,
    capturedAt: typeof capturedAt === 'number' && Number.isFinite(capturedAt) ? capturedAt : Date.now(),
  }
}

/**
 * Asks providers newest-first for the active world and returns the first snapshot
 * whose document validates. Never throws: it runs inside React's error handling.
 */
export function captureRecoverySnapshot(): RecoverySnapshot | null {
  for (let index = providers.length - 1; index >= 0; index -= 1) {
    try {
      const snapshot = normalizeSnapshot(providers[index]())
      if (snapshot) return snapshot
    } catch {
      // A broken provider must not stop the recovery screen from rendering.
    }
  }
  return null
}
