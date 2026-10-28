import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, parse } from '../core/save'
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
  isSaveHeld,
  loadProject,
  releaseSaveHold,
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
    releaseSaveHold()
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
    // Hero, Walker, Coin, Spring, Goal + the 8 standard grid bricks (step 7)
    expect(project.design.bricks).toHaveLength(13)
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
    expect(notice?.message).toContain('computer is full')
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
    store.addCopy('brick_coin', 100, 100)

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

    store.addCopy('brick_coin', 250, 250)
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

    store.addCopy('brick_coin', 300, 300)
    expect(memoryStorage.getItem(CODE_LAB_STORAGE_KEY)).toBeNull()

    // Dispatch pagehide
    window.dispatchEvent(new Event('pagehide'))

    const saved = memoryStorage.getItem(CODE_LAB_STORAGE_KEY)
    expect(saved).not.toBeNull()
    expect(saved).toContain('copy1')

    stopWatching()
  })
})

describe('unreadable saves are held, not overwritten (s8 blockers)', () => {
  let mem: MemoryStorage
  beforeEach(() => {
    mem = new MemoryStorage()
    clearStorageNotice()
    vi.useFakeTimers()
  })
  afterEach(() => {
    releaseSaveHold()
    vi.useRealTimers()
  })

  it('does not autosave over a save it could not read until the kid chooses, and keeps a backup', () => {
    const bad = '{"broken": [json...'
    mem.setItem(CODE_LAB_STORAGE_KEY, bad)
    const store = new StudioStore(loadProject(mem))
    expect(isSaveHeld()).toBe(true)
    const notice = getStorageNotice()
    expect(notice?.sticky).toBe(true)
    expect(notice?.actions?.map((a) => a.label)).toContain('Start with this new world')
    expect(getBackupProject(mem)).toBe(bad)

    const stop = watchAndSave(store, { storage: mem, debounceMs: 10 })
    store.addCopy('brick_coin', 10, 10)
    vi.advanceTimersByTime(100)
    expect(mem.getItem(CODE_LAB_STORAGE_KEY)).toBe(bad)
    stop() // the unmount flush must not write either
    expect(mem.getItem(CODE_LAB_STORAGE_KEY)).toBe(bad)
    expect(getBackupProject(mem)).toBe(bad)
  })

  it('saves the new world as soon as the kid chooses to start with it', () => {
    mem.setItem(CODE_LAB_STORAGE_KEY, 'nope')
    const store = new StudioStore(loadProject(mem))
    watchAndSave(store, { storage: mem, debounceMs: 10 })
    store.addCopy('brick_coin', 10, 10)
    vi.advanceTimersByTime(100)
    expect(mem.getItem(CODE_LAB_STORAGE_KEY)).toBe('nope')
    getStorageNotice()!.actions!.find((a) => a.label === 'Start with this new world')!.run()
    expect(isSaveHeld()).toBe(false)
    expect(getStorageNotice()).toBeNull()
    expect(mem.getItem(CODE_LAB_STORAGE_KEY)).not.toBe('nope')
    expect(parse(mem.getItem(CODE_LAB_STORAGE_KEY)!).ok).toBe(true)
    expect(getBackupProject(mem)).toBe('nope') // the old text stays in the backup key
  })

  it('refuses to write a project that would not load again, keeps the last good save, and says so', () => {
    const project = createStarterProject()
    expect(saveProject(project, mem)).toBe(true)
    const good = mem.getItem(CODE_LAB_STORAGE_KEY)
    project.design.bricks[1].name = '' // an invalid design
    expect(saveProject(project, mem)).toBe(false)
    expect(mem.getItem(CODE_LAB_STORAGE_KEY)).toBe(good)
    expect(getStorageNotice()?.type).toBe('error')
    expect(getStorageNotice()?.message).toMatch(/earlier save is safe/)
  })
})
