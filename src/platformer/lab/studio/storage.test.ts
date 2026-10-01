import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../core/save'
import { createStarterProject } from './starter'
import {
  CODE_LAB_BACKUP_STORAGE_KEY,
  CODE_LAB_STORAGE_KEY,
  clearBackupProject,
  clearSavedProject,
  clearStorageNotice,
  getBackupProject,
  getStorageNotice,
  isQuotaError,
  loadProject,
  saveProject,
  watchAndSave,
} from './storage'
import { StudioStore } from './store'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

class QuotaStorage extends MemoryStorage {
  override setItem(): void {
    const error = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    throw error
  }
}

describe('Storage & Autosave (storage.ts)', () => {
  let memoryStorage: MemoryStorage

  beforeEach(() => {
    memoryStorage = new MemoryStorage()
    clearStorageNotice()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---------------------------------------------------------------------------
  // 1. Loading
  // ---------------------------------------------------------------------------
  it('returns starter project when storage is empty', () => {
    const project = loadProject(memoryStorage)
    expect(project.design.id).toBe('starter_level')
    expect(project.design.bricks).toHaveLength(3)
    expect(getStorageNotice()).toBeNull()
  })

  it('saves and reloads a project with workspaces intact (round trip)', () => {
    const original = createStarterProject()
    // Add custom workspace metadata to verify roundtrip
    original.workspaces.custom_brick = {
      blocks: {
        blocks: [{ type: 'motion_movesteps', id: 'm1' }],
      },
    }

    const saved = saveProject(original, memoryStorage)
    expect(saved).toBe(true)

    const loaded = loadProject(memoryStorage)
    expect(loaded.design.id).toBe(original.design.id)
    expect(loaded.design.bricks.map((b) => b.id)).toEqual(original.design.bricks.map((b) => b.id))
    expect(loaded.workspaces.custom_brick).toEqual(original.workspaces.custom_brick)
    expect(getStorageNotice()).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // 2. Corrupt save recovery
  // ---------------------------------------------------------------------------
  it('handles corrupt JSON save: backs up corrupt copy, notifies kid, starts fresh', () => {
    const corruptData = '{"broken": [json...'
    memoryStorage.setItem(CODE_LAB_STORAGE_KEY, corruptData)

    const project = loadProject(memoryStorage)

    // Falls back cleanly to starter project
    expect(project.design.id).toBe('starter_level')

    // Preserves corrupt copy in backup key
    expect(getBackupProject(memoryStorage)).toBe(corruptData)

    // Notifies kid
    const notice = getStorageNotice()
    expect(notice).not.toBeNull()
    expect(notice?.type).toBe('corrupt')
    expect(notice?.message).toContain('trouble opening your previous save')
  })

  it('handles invalid design content: backs up copy, notifies kid, starts fresh', () => {
    // Valid envelope JSON but invalid design (missing stage)
    const invalidEnvelope = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      engineSemanticsVersion: 1,
      editorVersion: '13.3.0',
      pluginVersions: {},
      design: {
        id: 'bad-level',
        name: 'Bad Level',
        seed: 1,
        bounds: { left: 0, right: 100, bottom: 0, top: 100 },
        // stage is missing!
        bricks: [],
        copies: [],
      },
    })
    memoryStorage.setItem(CODE_LAB_STORAGE_KEY, invalidEnvelope)

    const project = loadProject(memoryStorage)
    expect(project.design.id).toBe('starter_level')
    expect(getBackupProject(memoryStorage)).toBe(invalidEnvelope)

    const notice = getStorageNotice()
    expect(notice).not.toBeNull()
    expect(notice?.type).toBe('corrupt')
  })

  it('handles newer schema version: backs up copy, alerts kid, starts fresh', () => {
    const futureEnvelope = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION + 99,
      engineSemanticsVersion: 1,
      editorVersion: '99.0.0',
      pluginVersions: {},
      design: createStarterProject().design,
    })
    memoryStorage.setItem(CODE_LAB_STORAGE_KEY, futureEnvelope)

    const project = loadProject(memoryStorage)
    expect(project.design.id).toBe('starter_level')
    expect(getBackupProject(memoryStorage)).toBe(futureEnvelope)

    const notice = getStorageNotice()
    expect(notice).not.toBeNull()
    expect(notice?.type).toBe('newer-version')
    expect(notice?.message).toContain('newer version of Code Lab')
  })

  // ---------------------------------------------------------------------------
  // 3. Quota error handling
  // ---------------------------------------------------------------------------
  it('handles quota exceeded error gracefully when saving', () => {
    const quotaStorage = new QuotaStorage()

    const project = createStarterProject()
    const result = saveProject(project, quotaStorage)
    expect(result).toBe(false)

    const notice = getStorageNotice()
    expect(notice).not.toBeNull()
    expect(notice?.type).toBe('quota-error')
    expect(notice?.message).toContain('storage is full')
  })

  it('detects isQuotaError correctly', () => {
    expect(isQuotaError(new DOMException('Quota', 'QuotaExceededError'))).toBe(true)
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true)
    expect(isQuotaError(new Error('Other error'))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // 4. Cleanup helpers
  // ---------------------------------------------------------------------------
  it('clears saved project and backup project cleanly', () => {
    memoryStorage.setItem(CODE_LAB_STORAGE_KEY, 'some-save')
    memoryStorage.setItem(CODE_LAB_BACKUP_STORAGE_KEY, 'some-backup')

    clearSavedProject(memoryStorage)
    expect(memoryStorage.getItem(CODE_LAB_STORAGE_KEY)).toBeNull()

    clearBackupProject(memoryStorage)
    expect(memoryStorage.getItem(CODE_LAB_BACKUP_STORAGE_KEY)).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // 5. watchAndSave debounced autosave & pagehide
  // ---------------------------------------------------------------------------
  it('debounces autosave when store revision changes', () => {
    vi.useFakeTimers()
    const project = createStarterProject()
    const store = new StudioStore(project)

    const stopWatching = watchAndSave(store, { debounceMs: 300, storage: memoryStorage })

    // Initially nothing saved yet
    expect(memoryStorage.getItem(CODE_LAB_STORAGE_KEY)).toBeNull()

    // Trigger state change (revision bumps)
    store.addCopy('brick_spinner', 100, 100)

    // Before debounce delay: not saved
    vi.advanceTimersByTime(200)
    expect(memoryStorage.getItem(CODE_LAB_STORAGE_KEY)).toBeNull()

    // After debounce delay: saved
    vi.advanceTimersByTime(150)
    const saved = memoryStorage.getItem(CODE_LAB_STORAGE_KEY)
    expect(saved).not.toBeNull()
    expect(saved).toContain('copy1')

    stopWatching()
  })

  it('flushes pending changes on unmount/unsubscribe', () => {
    vi.useFakeTimers()
    const project = createStarterProject()
    const store = new StudioStore(project)

    const stopWatching = watchAndSave(store, { debounceMs: 500, storage: memoryStorage })

    store.addCopy('brick_spinner', 250, 250)
    expect(memoryStorage.getItem(CODE_LAB_STORAGE_KEY)).toBeNull()

    // Unsubscribe triggers immediate flush
    stopWatching()
    const saved = memoryStorage.getItem(CODE_LAB_STORAGE_KEY)
    expect(saved).not.toBeNull()
    expect(saved).toContain('copy1')
  })

  it('flushes pending changes on pagehide event', () => {
    vi.useFakeTimers()
    const project = createStarterProject()
    const store = new StudioStore(project)

    const stopWatching = watchAndSave(store, { debounceMs: 500, storage: memoryStorage })

    store.addCopy('brick_spinner', 300, 300)
    expect(memoryStorage.getItem(CODE_LAB_STORAGE_KEY)).toBeNull()

    // Dispatch pagehide
    window.dispatchEvent(new Event('pagehide'))

    const saved = memoryStorage.getItem(CODE_LAB_STORAGE_KEY)
    expect(saved).not.toBeNull()
    expect(saved).toContain('copy1')

    stopWatching()
  })
})
