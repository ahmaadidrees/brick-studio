/**
 * A page part (a lazy chunk) that fails to download: flaky school Wi-Fi, or a tab left open over a
 * deploy whose old chunk names no longer exist. While the page is still starting, nothing can be
 * lost, so it reloads once (remembered for a minute in this tab, so it can never loop). Once a page
 * is open, it never reloads by itself: the error boundary says "Check your internet and try again"
 * and keeps its download buttons.
 */
export const CHUNK_RELOAD_KEY = 'brickgineers.chunk-reload.v1'
const RELOAD_WINDOW_MS = 60_000

const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Failed to load module script|Loading (?:CSS )?chunk [\w-]+ failed/i

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'ChunkLoadError' || CHUNK_ERROR_PATTERN.test(error.message)
}

type ReloadStorage = Pick<Storage, 'getItem' | 'setItem'>

export function createChunkLoadRecovery({
  storage = () => { try { return window.sessionStorage } catch { return null } },
  now = () => Date.now(),
  reload = () => window.location.reload(),
  target = typeof window === 'undefined' ? undefined : window,
}: {
  storage?: () => ReloadStorage | null
  now?: () => number
  reload?: () => void
  target?: EventTarget
} = {}) {
  let ready = false
  let reloading = false
  const never = <T,>() => new Promise<T>(() => {})

  /** Starts one reload unless this tab already reloaded for a chunk in the last minute. */
  const reloadOnce = () => {
    if (reloading) return true
    try {
      const store = storage()
      if (!store) return false
      const last = Number(store.getItem(CHUNK_RELOAD_KEY))
      if (Number.isFinite(last) && last > 0 && now() - last < RELOAD_WINDOW_MS) return false
      store.setItem(CHUNK_RELOAD_KEY, String(now()))
    } catch {
      // Without a record of the reload, a second failure could loop: show the message instead.
      return false
    }
    reloading = true
    reload()
    return true
  }

  // Vite fires this for any lazy chunk (or its CSS) that fails to load. Prevented, the import
  // resolves to nothing instead of throwing, so only prevent it when a reload is under way.
  const onPreloadError = (event: Event) => {
    if (!ready && reloadOnce()) event.preventDefault()
  }

  return {
    install() {
      target?.addEventListener('vite:preloadError', onPreloadError)
      return () => target?.removeEventListener('vite:preloadError', onPreloadError)
    },
    /** The first page has loaded: from now on unsaved work may be on screen, so never reload by itself. */
    markReady() { ready = true },
    reloadOnce,
    /** Wraps a route's `import()` for `lazy()`: a failed chunk reloads once while the page is starting. */
    route<T>(load: () => Promise<T>): () => Promise<T> {
      return () => load().then(
        (module) => {
          if (module === undefined || module === null) {
            // The preload handler above swallowed the failure because a reload is under way.
            if (reloading) return never<T>()
            throw new TypeError('Failed to fetch dynamically imported module')
          }
          ready = true
          return module
        },
        (error: unknown) => {
          if (!ready && isChunkLoadError(error) && reloadOnce()) return never<T>()
          throw error
        },
      )
    },
  }
}
