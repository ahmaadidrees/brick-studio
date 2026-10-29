import {
  BRICK_STUDIO_FILE_EXTENSION,
  createBrickStudioDocument,
  parseBrickStudioDocument,
  serializeBrickStudioDocument,
  validateBrickStudioDocument,
  type BrickStudioDocument,
  type BrickStudioDocumentError,
  type CreateBrickStudioDocumentOptions,
} from './brickDocument'
import type { BrickInstance } from './types'
import {
  isBrickStudioAutosaveSuspended,
  subscribeBrickStudioAutosaveGuard,
} from './liveAutosaveGuard'

import { BRICK_STUDIO_LOCAL_STORAGE_KEY, BRICK_STUDIO_RECOVERY_STORAGE_KEY } from './localProjectKeys'
import { BRAND_NAME } from '../brand'
export { BRICK_STUDIO_LOCAL_STORAGE_KEY, BRICK_STUDIO_RECOVERY_STORAGE_KEY } from './localProjectKeys'
export const BRICK_STUDIO_AUTOSAVE_DELAY_MS = 400

export type BrickStudioStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type BrickStudioPersistenceError = {
  code: 'storage-read' | 'storage-write' | 'storage-remove' | 'download'
  message: string
}

export type BrickStudioPersistenceResult =
  | { ok: true }
  | { ok: false; error: BrickStudioPersistenceError }

export type BrickStudioLocalLoadResult =
  | { ok: true; document: BrickStudioDocument | null }
  | { ok: false; error: BrickStudioDocumentError | BrickStudioPersistenceError }

export type BrickStudioAutosaveStore = {
  getState: () => { bricks: BrickInstance[] }
  subscribe: (listener: (state: { bricks: BrickInstance[] }, previous: { bricks: BrickInstance[] }) => void) => () => void
}

export type BrickStudioAutosaveController = {
  /** Writes only when this tab changed the build since its last save; an untouched tab never writes. */
  flush: () => BrickStudioPersistenceResult
  /** True when this tab has a change that is not in storage yet. */
  hasUnsavedChanges: () => boolean
  /** Queues a save when document metadata changes without changing the brick array. */
  schedule: () => void
  cancel: () => void
  dispose: () => void
}

function storageFailure(code: BrickStudioPersistenceError['code'], message: string): BrickStudioPersistenceResult {
  return { ok: false, error: { code, message } }
}

export function saveLocalBrickStudioProject(
  storage: BrickStudioStorage,
  project: BrickStudioDocument | BrickInstance[],
  options: CreateBrickStudioDocumentOptions = {},
): BrickStudioPersistenceResult {
  try {
    const document = Array.isArray(project)
      ? createBrickStudioDocument(project, options)
      : project
    const validated = validateBrickStudioDocument(document)
    if (!validated.ok) return storageFailure('storage-write', `Your previous save is safe. ${validated.error.message}`)
    const previous = storage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)
    if (previous !== null && !parseBrickStudioDocument(previous).ok) {
      storage.setItem(BRICK_STUDIO_RECOVERY_STORAGE_KEY, previous)
    }
    storage.setItem(
      BRICK_STUDIO_LOCAL_STORAGE_KEY,
      serializeBrickStudioDocument(document),
    )
    return { ok: true }
  } catch {
    return storageFailure('storage-write', `${BRAND_NAME} could not save to local storage. Your current build is still open.`)
  }
}

export function loadLocalBrickStudioProject(storage: BrickStudioStorage): BrickStudioLocalLoadResult {
  let serialized: string | null
  try {
    serialized = storage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)
  } catch {
    return { ok: false, error: { code: 'storage-read', message: `${BRAND_NAME} could not read local storage. A blank build was left unchanged.` } }
  }
  if (serialized === null) return { ok: true, document: null }
  const result = parseBrickStudioDocument(serialized)
  return result.ok ? result : { ok: false, error: result.error }
}

export function clearLocalBrickStudioProject(storage: BrickStudioStorage): BrickStudioPersistenceResult {
  try {
    storage.removeItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)
    return { ok: true }
  } catch {
    return storageFailure('storage-remove', `${BRAND_NAME} could not clear its local project.`)
  }
}

/** A build with something worth keeping: bricks or custom parts. An empty plate has nothing to lose. */
export function hasBrickStudioWork(document: BrickStudioDocument): boolean {
  return document.bricks.length > 0 || document.customParts.length > 0
}

export type KeepOldBuildResult =
  | { ok: true; downloaded: boolean }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; error: BrickStudioPersistenceError }

export type KeepOldBuildOptions = {
  /** Asked only when the old build has work in it (tests pass a stub; the app passes window.confirm). */
  confirm: (question: string) => boolean
  download: (document: BrickStudioDocument) => BrickStudioPersistenceResult
  question: string
}

/**
 * This computer keeps one guest 3D build, so replacing it loses the old one for good (Undo ends
 * with the tab). Before anything replaces it: ask, then download the old build. A "no" or a failed
 * download replaces nothing. An empty or identical build needs no question.
 */
export function keepOldBuildBeforeReplacing(
  old: BrickStudioDocument | null,
  next: BrickStudioDocument | null,
  { confirm, download, question }: KeepOldBuildOptions,
): KeepOldBuildResult {
  if (!old || !hasBrickStudioWork(old)) return { ok: true, downloaded: false }
  try {
    if (next && serializeBrickStudioDocument(old) === serializeBrickStudioDocument(next)) return { ok: true, downloaded: false }
  } catch { /* An unserializable pair is treated as different. */ }
  if (!confirm(question)) return { ok: false, canceled: true }
  const downloaded = download(old)
  if (!downloaded.ok) return { ok: false, canceled: false, error: { code: 'download', message: 'We couldn’t download your old build, so nothing was replaced.' } }
  return { ok: true, downloaded: true }
}

/** Replaces the build saved on this computer, keeping the old one first (see keepOldBuildBeforeReplacing). */
export function replaceLocalBrickStudioProject(
  storage: BrickStudioStorage,
  next: BrickStudioDocument,
  options: KeepOldBuildOptions,
): KeepOldBuildResult {
  const loaded = loadLocalBrickStudioProject(storage)
  // An unreadable draft is quarantined by the save below, never silently dropped.
  const kept = keepOldBuildBeforeReplacing(loaded.ok ? loaded.document : null, next, options)
  if (!kept.ok) return kept
  const saved = saveLocalBrickStudioProject(storage, next)
  return saved.ok ? kept : { ok: false, canceled: false, error: saved.error }
}

/** File name (no extension) for the old build downloaded before a replacement. */
export const OLD_BUILD_FILENAME = 'my-old-3d-build'

export function connectBrickStudioAutosave({
  store,
  storage,
  delayMs = BRICK_STUDIO_AUTOSAVE_DELAY_MS,
  createDocument = (bricks) => createBrickStudioDocument(bricks),
  onError,
  onSaved,
}: {
  store: BrickStudioAutosaveStore
  storage: BrickStudioStorage
  delayMs?: number
  /** Builds the complete project at flush time, including current document metadata. */
  createDocument?: (bricks: BrickInstance[]) => BrickStudioDocument
  onError?: (error: BrickStudioPersistenceError) => void
  /** A save went through (after a failure, the header can say "saved" again). */
  onSaved?: () => void
}): BrickStudioAutosaveController {
  let timer: ReturnType<typeof setTimeout> | null = null
  // Only this tab's own edits are saved. A tab that loaded the build and changed nothing (a stale
  // tab left open, or a blank one) must never write on pagehide or when hidden: another tab may
  // have saved a newer build since.
  let dirty = false

  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const flush = () => {
    cancel()
    if (isBrickStudioAutosaveSuspended() || !dirty) return { ok: true } as const
    const result = saveLocalBrickStudioProject(storage, createDocument(store.getState().bricks))
    if (!result.ok) onError?.(result.error)
    else { dirty = false; onSaved?.() }
    return result
  }
  const schedule = () => {
    cancel()
    // Changes while a live room or account world holds the store belong to that owner, not this draft.
    if (isBrickStudioAutosaveSuspended()) return
    dirty = true
    timer = setTimeout(flush, Math.max(0, delayMs))
  }
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.bricks !== previous.bricks) schedule()
  })
  const unsubscribeGuard = subscribeBrickStudioAutosaveGuard(() => {
    if (isBrickStudioAutosaveSuspended()) cancel()
  })

  return {
    flush,
    hasUnsavedChanges: () => dirty,
    schedule,
    cancel,
    dispose: () => {
      unsubscribe()
      unsubscribeGuard()
      if (timer !== null) flush()
      else cancel()
    },
  }
}

type DownloadEnvironment = {
  Blob: typeof Blob
  URL: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
  document: Pick<Document, 'createElement' | 'body'>
}

export function downloadBrickStudioDocument(
  document: BrickStudioDocument,
  environment: DownloadEnvironment = globalThis,
  filename = `brickgineers-build${BRICK_STUDIO_FILE_EXTENSION}`,
): BrickStudioPersistenceResult {
  try {
    const blob = new environment.Blob([serializeBrickStudioDocument(document)], { type: 'application/json' })
    const url = environment.URL.createObjectURL(blob)
    const anchor = environment.document.createElement('a')
    anchor.href = url
    anchor.download = filename.endsWith(BRICK_STUDIO_FILE_EXTENSION)
      ? filename
      : `${filename}${BRICK_STUDIO_FILE_EXTENSION}`
    anchor.hidden = true
    environment.document.body.append(anchor)
    anchor.click()
    anchor.remove()
    environment.URL.revokeObjectURL(url)
    return { ok: true }
  } catch {
    return storageFailure('download', `${BRAND_NAME} could not prepare the project download.`)
  }
}
