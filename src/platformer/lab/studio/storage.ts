/**
 * Storage and autosave for Code Lab Studio (docs/CODE-LAB-BRICK-MODEL.md, \u00a703 & decision 1).
 *
 * Provides:
 * - `loadProject()`: loads the saved project from localStorage, safely falling back to the starter project
 *   on missing data, corruption, or future schema versions. Preserves damaged saves into a backup key.
 * - `watchAndSave(store)`: debounced autosave watching `store.revision`, with immediate flush on `pagehide`
 *   and unmount, plus quota error defense.
 */

import { parse } from '../core/save'
import { upgradeLegacySaveText } from './legacySave'
import {
  clearStorageNotice,
  getStorageNotice,
  setStorageNotice,
  subscribeStorageNotice,
  useStorageNotice,
  type StorageNotice,
} from './persist/notice'
import {
  createProjectEnvelope,
  exportProjectFile,
  exportProjectJson,
  importProjectFile,
  importProjectJson,
  type ImportResult,
} from './persist/projectIo'
import { createStarterProject } from './starter'
import type { StudioProject, StudioStore } from './store'

export const CODE_LAB_STORAGE_KEY = 'code-lab.project.v1'
export const CODE_LAB_BACKUP_STORAGE_KEY = 'code-lab.project.backup.v1'
export const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 500

export {
  clearStorageNotice,
  createStarterProject,
  exportProjectFile,
  exportProjectJson,
  getStorageNotice,
  importProjectFile,
  importProjectJson,
  subscribeStorageNotice,
  useStorageNotice,
  type ImportResult,
  type StorageNotice,
}

/**
 * While an unreadable save is waiting for the kid to choose, nothing is autosaved: the next save would overwrite it.
 * A copy of the bad text is also kept under CODE_LAB_BACKUP_STORAGE_KEY.
 */
let savesHeld = false
const holdListeners = new Set<() => void>()

export function isSaveHeld(): boolean {
  return savesHeld
}

/** The kid chose (start with the new world, open a file, start over): autosave may replace the old save now. */
export function releaseSaveHold(): void {
  if (!savesHeld) return
  savesHeld = false
  for (const l of [...holdListeners]) l()
}

function onSaveHoldReleased(listener: () => void): () => void {
  holdListeners.add(listener)
  return () => holdListeners.delete(listener)
}

export function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage
    }
  } catch {
    // Storage access restricted or disabled
  }
  return null
}

export function isQuotaError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    )
  }
  if (typeof err === 'object' && err !== null) {
    const errorRecord = err as Record<string, unknown>
    if (errorRecord.name === 'QuotaExceededError' || errorRecord.code === 22) {
      return true
    }
  }
  return false
}

/**
 * Loads the active project from storage, falling back cleanly to the starter project.
 * If the saved project is corrupted or uses an unsupported future schema, a safe copy
 * is preserved in `CODE_LAB_BACKUP_STORAGE_KEY` and a kid-friendly notice is set.
 */
export function loadProject(storageOverride?: Storage): StudioProject {
  const storage = storageOverride ?? getLocalStorage()
  savesHeld = false
  if (!storage) {
    return createStarterProject()
  }

  let raw: string | null = null
  try {
    raw = storage.getItem(CODE_LAB_STORAGE_KEY)
  } catch (err) {
    console.warn('Code Lab: Failed to read from localStorage:', err)
    return createStarterProject()
  }

  if (raw === null || raw.trim() === '') {
    return createStarterProject()
  }

  // Step 6/6b saves paint tile characters with no brick behind them: add the standard grid bricks first (legacySave.ts).
  const result = parse(upgradeLegacySaveText(raw))
  if (result.ok) {
    return {
      design: result.save.design,
      workspaces: result.save.workspaces ?? {},
    }
  }

  // Handle invalid/corrupt save or newer schema version
  try {
    storage.setItem(CODE_LAB_BACKUP_STORAGE_KEY, raw)
  } catch (backupErr) {
    console.warn('Code Lab: Could not write backup of invalid project:', backupErr)
  }

  const isNewer = result.problems.some(
    (p) => p.path === 'schemaVersion' && p.message.includes('Unsupported future schema version'),
  )

  // Do not touch the unreadable save until the kid chooses.
  savesHeld = true
  const actions = [
    { label: 'Start with this new world', run: () => { releaseSaveHold(); clearStorageNotice() } },
    { label: 'Save my old world to a file', run: () => downloadText(raw, 'my-old-world.json') },
  ]

  if (isNewer) {
    setStorageNotice({
      id: 'newer-schema',
      type: 'newer-version',
      sticky: true,
      actions,
      message:
        'This world was saved with a newer version of Code Lab, so we could not open it. Your old world is safe. Nothing will be saved until you pick: start with this new world, or save the old one to a file.',
    })
  } else {
    setStorageNotice({
      id: 'corrupt-save',
      type: 'corrupt',
      sticky: true,
      actions,
      message:
        'We had trouble opening your previous save, so you are looking at a fresh world. Your old world is safe and was not changed. Nothing will be saved until you pick: start with this new world, or save the old one to a file.',
    })
  }

  return createStarterProject()
}

/**
 * Saves a StudioProject synchronously to storage.
 */
export function saveProject(project: StudioProject, storageOverride?: Storage): boolean {
  const storage = storageOverride ?? getLocalStorage()
  if (!storage) return false

  try {
    const serialized = exportProjectJson(project)
    // Never replace a good save with text we could not open again.
    const check = parse(serialized)
    if (!check.ok) {
      console.warn('Code Lab: refused to save an invalid project:', check.problems)
      setStorageNotice({
        id: 'save-invalid',
        type: 'error',
        message:
          'We could not save your last change because something in this world is not right. Your earlier save is safe. Try undoing your last change.',
      })
      return false
    }
    storage.setItem(CODE_LAB_STORAGE_KEY, serialized)
    const last = getStorageNotice()
    if (last && (last.type === 'quota-error' || last.type === 'error') && last.id !== 'import-error') clearStorageNotice()
    return true
  } catch (err) {
    if (isQuotaError(err)) {
      setStorageNotice({
        id: 'quota-error',
        type: 'quota-error',
        message:
          'This computer is full, so your world could not be saved. Press This world, then Save File, so you do not lose it.',
      })
    } else {
      setStorageNotice({
        id: 'save-error',
        type: 'error',
        message: 'Your world could not be saved on this computer. Press This world, then Save File, so you do not lose it.',
      })
    }
    console.warn('Code Lab: Save failed:', err)
    return false
  }
}

/**
 * Clears the saved project in localStorage.
 */
export function clearSavedProject(storageOverride?: Storage): void {
  const storage = storageOverride ?? getLocalStorage()
  if (!storage) return
  try {
    storage.removeItem(CODE_LAB_STORAGE_KEY)
  } catch (err) {
    console.warn('Code Lab: Failed to clear project:', err)
  }
}

/**
 * Retrieves the raw corrupted backup project if one exists.
 */
export function getBackupProject(storageOverride?: Storage): string | null {
  const storage = storageOverride ?? getLocalStorage()
  if (!storage) return null
  try {
    return storage.getItem(CODE_LAB_BACKUP_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Clears the backup project in localStorage.
 */
export function clearBackupProject(storageOverride?: Storage): void {
  const storage = storageOverride ?? getLocalStorage()
  if (!storage) return
  try {
    storage.removeItem(CODE_LAB_BACKUP_STORAGE_KEY)
  } catch (err) {
    console.warn('Code Lab: Failed to clear backup project:', err)
  }
}

export interface WatchAndSaveOptions {
  debounceMs?: number
  storage?: Storage
}

/**
 * Subscribes to the store and saves on revision change (debounced).
 * Also attaches a `pagehide` listener to flush any dirty revision immediately.
 * Returns an unsubscribe callback that flushes pending saves.
 */
export function watchAndSave(
  store: StudioStore,
  options?: WatchAndSaveOptions,
): () => void {
  const debounceMs = options?.debounceMs ?? DEFAULT_AUTOSAVE_DEBOUNCE_MS
  const storage = options?.storage

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastSavedRevision = store.getState().revision

  const flushSave = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (isSaveHeld()) return
    const currentRev = store.getState().revision
    if (currentRev !== lastSavedRevision) {
      saveProject(store.getState().project, storage)
      lastSavedRevision = currentRev
    }
  }

  const unsubscribeStore = store.subscribe(() => {
    const currentRev = store.getState().revision
    if (currentRev !== lastSavedRevision) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      timeoutId = setTimeout(() => {
        timeoutId = null
        if (isSaveHeld()) return
        saveProject(store.getState().project, storage)
        lastSavedRevision = currentRev
      }, debounceMs)
    }
  })

  const onPageHide = () => {
    flushSave()
  }

  // The kid chose: save what is on screen now (it was held back until then).
  const unsubscribeHold = onSaveHoldReleased(() => {
    lastSavedRevision = -1
    flushSave()
  })

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onPageHide)
  }

  return () => {
    unsubscribeStore()
    unsubscribeHold()
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onPageHide)
    }
    flushSave()
  }
}

/** Hand the kid a text file (their old world). Only ever called from a button press. */
function downloadText(text: string, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
