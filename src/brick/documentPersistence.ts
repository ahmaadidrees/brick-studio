import {
  BRICK_STUDIO_FILE_EXTENSION,
  createBrickStudioDocument,
  parseBrickStudioDocument,
  serializeBrickStudioDocument,
  type BrickStudioDocument,
  type BrickStudioDocumentError,
} from './brickDocument'
import type { BrickInstance } from './types'

export const BRICK_STUDIO_LOCAL_STORAGE_KEY = 'brick-studio.current-project.v1'
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
  flush: () => BrickStudioPersistenceResult
  cancel: () => void
  dispose: () => void
}

function storageFailure(code: BrickStudioPersistenceError['code'], message: string): BrickStudioPersistenceResult {
  return { ok: false, error: { code, message } }
}

export function saveLocalBrickStudioProject(
  storage: BrickStudioStorage,
  bricks: BrickInstance[],
): BrickStudioPersistenceResult {
  try {
    storage.setItem(
      BRICK_STUDIO_LOCAL_STORAGE_KEY,
      serializeBrickStudioDocument(createBrickStudioDocument(bricks)),
    )
    return { ok: true }
  } catch {
    return storageFailure('storage-write', 'Brick Studio could not save to local storage. Your current build is still open.')
  }
}

export function loadLocalBrickStudioProject(storage: BrickStudioStorage): BrickStudioLocalLoadResult {
  let serialized: string | null
  try {
    serialized = storage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)
  } catch {
    return { ok: false, error: { code: 'storage-read', message: 'Brick Studio could not read local storage. A blank build was left unchanged.' } }
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
    return storageFailure('storage-remove', 'Brick Studio could not clear its local project.')
  }
}

export function connectBrickStudioAutosave({
  store,
  storage,
  delayMs = BRICK_STUDIO_AUTOSAVE_DELAY_MS,
  onError,
}: {
  store: BrickStudioAutosaveStore
  storage: BrickStudioStorage
  delayMs?: number
  onError?: (error: BrickStudioPersistenceError) => void
}): BrickStudioAutosaveController {
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const flush = () => {
    cancel()
    const result = saveLocalBrickStudioProject(storage, store.getState().bricks)
    if (!result.ok) onError?.(result.error)
    return result
  }
  const schedule = () => {
    cancel()
    timer = setTimeout(flush, Math.max(0, delayMs))
  }
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.bricks !== previous.bricks) schedule()
  })

  return {
    flush,
    cancel,
    dispose: () => {
      unsubscribe()
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
  filename = `brick-studio-build${BRICK_STUDIO_FILE_EXTENSION}`,
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
    return storageFailure('download', 'Brick Studio could not prepare the project download.')
  }
}
