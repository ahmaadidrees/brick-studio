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

    expect(saveLocalBrickStudioProject(storage, [brick])).toEqual({ ok: true })
    expect(storage.entries.has(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toBe(true)
    expect(loadLocalBrickStudioProject(storage)).toEqual({
      ok: true,
      document: createBrickStudioDocument([brick]),
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
})
