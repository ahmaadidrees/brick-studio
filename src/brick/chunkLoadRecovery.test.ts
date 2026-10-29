import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHUNK_RELOAD_KEY, createChunkLoadRecovery, isChunkLoadError } from './chunkLoadRecovery'

function memoryStorage() {
  const items = new Map<string, string>()
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value) } }
}
const chunkError = () => new TypeError('Failed to fetch dynamically imported module: https://brickgineers.com/assets/BrickStudioApp-4f2a.js')
function preloadError(target: EventTarget, payload: unknown = chunkError()) {
  const event = Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload })
  target.dispatchEvent(event)
  return event
}

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x/assets/a.js',
    'error loading dynamically imported module: https://x/assets/a.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/a.css',
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\".",
  ])('knows %s', (message) => { expect(isChunkLoadError(new TypeError(message))).toBe(true) })
  it('leaves other errors alone', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('reload once when a page part fails to load', () => {
  let now = 1_000_000
  const reload = vi.fn()
  beforeEach(() => { now = 1_000_000; reload.mockReset() })
  afterEach(() => vi.restoreAllMocks())
  const setup = (storage: ReturnType<typeof memoryStorage> | null = memoryStorage()) => {
    const target = new EventTarget()
    const recovery = createChunkLoadRecovery({ storage: () => storage, now: () => now, reload, target })
    recovery.install()
    return { recovery, target, storage }
  }

  // Each "page" is a fresh recovery sharing this tab's session storage, as after a real reload.
  const page = (storage: ReturnType<typeof memoryStorage>) => {
    const target = new EventTarget()
    createChunkLoadRecovery({ storage: () => storage, now: () => now, reload, target }).install()
    return target
  }

  it('reloads once while the page is starting, then lets the error show', () => {
    const { target, storage } = setup()
    expect(preloadError(target).defaultPrevented).toBe(true)
    // A second part failing while that reload is under way waits for it too.
    expect(preloadError(target).defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    expect(storage!.getItem(CHUNK_RELOAD_KEY)).toBe(String(now))
    now += 5_000
    expect(preloadError(page(storage!)).defaultPrevented).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
    now += 60_000
    expect(preloadError(page(storage!)).defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('never reloads once the page is open: unsaved work could be on screen', () => {
    const { recovery, target } = setup()
    recovery.markReady()
    expect(preloadError(target).defaultPrevented).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('never reloads without a place to remember it did (no reload loops)', () => {
    const { target } = setup(null)
    expect(preloadError(target).defaultPrevented).toBe(false)
    const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    const other = createChunkLoadRecovery({ storage: () => throwing, now: () => now, reload, target: new EventTarget() })
    expect(other.reloadOnce()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('a route that fails to load reloads once, then shows the error', async () => {
    const { recovery, storage } = setup()
    const route = recovery.route(() => Promise.reject(chunkError()))
    let settled = false
    void route().then(() => { settled = true }, () => { settled = true })
    await Promise.resolve(); await Promise.resolve()
    expect(reload).toHaveBeenCalledOnce()
    expect(settled).toBe(false)
    now += 1_000
    const reloaded = createChunkLoadRecovery({ storage: () => storage, now: () => now, reload, target: new EventTarget() })
    await expect(reloaded.route(() => Promise.reject(chunkError()))()).rejects.toThrow('Failed to fetch dynamically imported module')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('a route that loads marks the page ready, and other route errors are not retried', async () => {
    const { recovery, target } = setup()
    await expect(recovery.route(() => Promise.reject(new Error('boom')))()).rejects.toThrow('boom')
    expect(reload).not.toHaveBeenCalled()
    await expect(recovery.route(async () => ({ default: 'page' }))()).resolves.toEqual({ default: 'page' })
    expect(preloadError(target).defaultPrevented).toBe(false)
  })

  it('a route whose import was swallowed by a reload waits for that reload', async () => {
    const { recovery, target } = setup()
    // Vite resolves the import to undefined once the preload error was handled.
    const route = recovery.route(async () => { preloadError(target); return undefined as unknown as { default: string } })
    let settled = false
    void route().then(() => { settled = true }, () => { settled = true })
    await Promise.resolve(); await Promise.resolve()
    expect(reload).toHaveBeenCalledOnce(); expect(settled).toBe(false)
  })
})
