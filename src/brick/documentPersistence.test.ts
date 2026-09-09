import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrickStudioDocument, serializeBrickStudioDocument } from './brickDocument'
import {
  BRICK_STUDIO_LOCAL_STORAGE_KEY,
  clearLocalBrickStudioProject,
  connectBrickStudioAutosave,
  loadLocalBrickStudioProject,
  saveLocalBrickStudioProject,
  type BrickStudioAutosaveStore,
  type BrickStudioStorage,
} from './documentPersistence'
import { suspendBrickStudioAutosave } from './liveAutosaveGuard'
import type { BrickInstance } from './types'

const brick: BrickInstance = {
  id: 'saved',
  partId: 'window_1x4',
  x: 8,
  y: 0,
  z: 9,
  rotation: 1,
  color: '#3e83d7',
}

function memoryStorage(): BrickStudioStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value) },
    removeItem: (key) => { entries.delete(key) },
  }
}

describe('local Brick Studio persistence', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('saves and loads durable document state under the versioned local key', () => {
    const storage = memoryStorage()
    const document = createBrickStudioDocument([brick], { environmentId: 'sky-island' })

    expect(saveLocalBrickStudioProject(storage, document)).toEqual({ ok: true })
    expect(storage.entries.has(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toBe(true)
    expect(loadLocalBrickStudioProject(storage)).toEqual({
      ok: true,
      document,
    })
    expect(clearLocalBrickStudioProject(storage)).toEqual({ ok: true })
    expect(loadLocalBrickStudioProject(storage)).toEqual({ ok: true, document: null })
  })

  it('leaves corrupt local data isolated and reports read/write/remove exceptions', () => {
    const corrupt = memoryStorage()
    corrupt.entries.set(BRICK_STUDIO_LOCAL_STORAGE_KEY, '{bad')
    const corruptResult = loadLocalBrickStudioProject(corrupt)
    expect(corruptResult.ok).toBe(false)
    if (!corruptResult.ok) expect(corruptResult.error.code).toBe('invalid-json')

    const failing: BrickStudioStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('full') },
      removeItem: () => { throw new Error('blocked') },
    }
    expect(loadLocalBrickStudioProject(failing)).toMatchObject({ ok: false, error: { code: 'storage-read' } })
    expect(saveLocalBrickStudioProject(failing, [brick])).toMatchObject({ ok: false, error: { code: 'storage-write' } })
    expect(clearLocalBrickStudioProject(failing)).toMatchObject({ ok: false, error: { code: 'storage-remove' } })
  })

  it('debounces committed brick-array changes and ignores transient state notifications', () => {
    const storage = memoryStorage()
    let state = { bricks: [] as BrickInstance[] }
    const listeners = new Set<(next: typeof state, previous: typeof state) => void>()
    const store: BrickStudioAutosaveStore = {
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const controller = connectBrickStudioAutosave({ store, storage, delayMs: 400 })
    const notify = (next: typeof state) => {
      const previous = state
      state = next
      listeners.forEach((listener) => listener(state, previous))
    }

    notify(state)
    vi.advanceTimersByTime(500)
    expect(storage.entries.size).toBe(0)

    notify({ bricks: [brick] })
    vi.advanceTimersByTime(399)
    expect(storage.entries.size).toBe(0)
    vi.advanceTimersByTime(1)
    expect(storage.entries.get(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toBe(
      serializeBrickStudioDocument(createBrickStudioDocument([brick])),
    )

    notify({ bricks: [] })
    controller.dispose()
    expect(storage.entries.get(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toContain('"bricks": []')
    notify({ bricks: [brick] })
    vi.advanceTimersByTime(500)
    expect(storage.entries.get(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toContain('"bricks": []')
  })

  it('surfaces deferred autosave failures without changing the live store', () => {
    const onError = vi.fn()
    const state = { bricks: [brick] }
    let listener: ((next: typeof state, previous: typeof state) => void) | undefined
    const controller = connectBrickStudioAutosave({
      store: {
        getState: () => state,
        subscribe: (nextListener) => {
          listener = nextListener
          return () => { listener = undefined }
        },
      },
      storage: {
        getItem: () => null,
        setItem: () => { throw new Error('quota') },
        removeItem: () => undefined,
      },
      onError,
    })

    listener?.(state, { bricks: [] })
    vi.runAllTimers()

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'storage-write' }))
    expect(state.bricks).toEqual([brick])
    controller.dispose()
  })

  it('persists metadata-only changes through the complete-document factory', () => {
    const storage = memoryStorage()
    const state = { bricks: [brick] }
    let environmentId: 'toy-room' | 'brick-valley' = 'toy-room'
    const controller = connectBrickStudioAutosave({
      store: {
        getState: () => state,
        subscribe: () => () => undefined,
      },
      storage,
      delayMs: 50,
      createDocument: (bricks) => createBrickStudioDocument(bricks, { environmentId }),
    })

    controller.schedule()
    vi.advanceTimersByTime(50)
    expect(loadLocalBrickStudioProject(storage)).toEqual({
      ok: true,
      document: createBrickStudioDocument([brick], { environmentId: 'toy-room' }),
    })

    environmentId = 'brick-valley'
    controller.schedule()
    vi.advanceTimersByTime(50)
    expect(loadLocalBrickStudioProject(storage)).toEqual({
      ok: true,
      document: createBrickStudioDocument([brick], { environmentId: 'brick-valley' }),
    })
    controller.dispose()
  })

  it('cancels pending writes while a live room owns the store and resumes afterward', () => {
    const storage = memoryStorage()
    let state = { bricks: [] as BrickInstance[] }
    const listeners = new Set<(next: typeof state, previous: typeof state) => void>()
    const controller = connectBrickStudioAutosave({
      store: {
        getState: () => state,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      },
      storage,
      delayMs: 100,
    })
    const notify = (next: typeof state) => {
      const previous = state
      state = next
      listeners.forEach((listener) => listener(state, previous))
    }

    notify({ bricks: [brick] })
    const release = suspendBrickStudioAutosave()
    vi.advanceTimersByTime(100)
    expect(storage.entries.size).toBe(0)
    expect(controller.flush()).toEqual({ ok: true })
    expect(storage.entries.size).toBe(0)

    release()
    release()
    notify({ bricks: [] })
    vi.advanceTimersByTime(100)
    expect(storage.entries.get(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toContain('"bricks": []')
    controller.dispose()
  })
})

it('rejects invalid saves without replacing the last valid world', () => {
  const storage = memoryStorage()
  const valid = createBrickStudioDocument([brick])
  saveLocalBrickStudioProject(storage, valid)
  expect(saveLocalBrickStudioProject(storage, { ...valid, bricks: [{ ...brick, partId: 'missing' }] }).ok).toBe(false)
  expect(loadLocalBrickStudioProject(storage)).toEqual({ ok: true, document: valid })
})

it('quarantines an unreadable draft before saving and refuses replacement if quarantine fails', async () => {
  const { BRICK_STUDIO_RECOVERY_STORAGE_KEY } = await import('./documentPersistence')
  const storage = memoryStorage()
  storage.setItem(BRICK_STUDIO_LOCAL_STORAGE_KEY, '{broken draft')
  expect(saveLocalBrickStudioProject(storage, [])).toEqual({ ok: true })
  expect(storage.getItem(BRICK_STUDIO_RECOVERY_STORAGE_KEY)).toBe('{broken draft')
  storage.setItem(BRICK_STUDIO_LOCAL_STORAGE_KEY, '{second broken draft')
  const guarded = { ...storage, setItem: (key: string, value: string) => {
    if (key === BRICK_STUDIO_RECOVERY_STORAGE_KEY) throw new Error('quota')
    storage.setItem(key, value)
  } }
  expect(saveLocalBrickStudioProject(guarded, []).ok).toBe(false)
  expect(storage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toBe('{second broken draft')
})
