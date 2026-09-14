export type BrickStudioErrorSource = 'window' | 'unhandledrejection' | 'boundary'

export type BrickStudioErrorEntry = {
  source: BrickStudioErrorSource
  message: string
  stack: string | null
  /** Epoch milliseconds. */
  at: number
}

export const BRICK_STUDIO_ERROR_LOG_SIZE = 8
export const BRICK_STUDIO_LOG_PREFIX = '[brick-studio]'

const entries: BrickStudioErrorEntry[] = []

/** Human-readable summary for anything that can be thrown or rejected with. */
export function describeBrickStudioError(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error) return error.message || error.name || fallback
  if (typeof error === 'string') return error || fallback
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message: unknown }
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

function stackOf(error: unknown): string | null {
  return error instanceof Error && typeof error.stack === 'string' ? error.stack : null
}

/** Small in-memory ring buffer: no network reporting yet, only what the recovery screen shows. */
export function recordBrickStudioError(
  source: BrickStudioErrorSource,
  error: unknown,
  fallbackMessage?: string,
): BrickStudioErrorEntry {
  const entry: BrickStudioErrorEntry = {
    source,
    message: describeBrickStudioError(error, fallbackMessage),
    stack: stackOf(error),
    at: Date.now(),
  }
  entries.push(entry)
  if (entries.length > BRICK_STUDIO_ERROR_LOG_SIZE) {
    entries.splice(0, entries.length - BRICK_STUDIO_ERROR_LOG_SIZE)
  }
  return entry
}

/** Oldest first. */
export function getRecentBrickStudioErrors(): BrickStudioErrorEntry[] {
  return entries.slice()
}

export function clearBrickStudioErrorLog() {
  entries.length = 0
}

type ErrorEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>
type ErrorLogger = Pick<Console, 'error'>

/**
 * Logs uncaught errors and unhandled rejections under one stable prefix and keeps the
 * last few in memory so the recovery screen can show what led up to a crash.
 */
export function installBrickStudioErrorListeners(
  target: ErrorEventTarget = window,
  logger: ErrorLogger = console,
): () => void {
  const onError = (event: ErrorEvent) => {
    const error: unknown = event.error ?? event.message
    recordBrickStudioError('window', error, 'Uncaught error')
    logger.error(`${BRICK_STUDIO_LOG_PREFIX} Uncaught error:`, error)
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    recordBrickStudioError('unhandledrejection', event.reason, 'Unhandled promise rejection')
    logger.error(`${BRICK_STUDIO_LOG_PREFIX} Unhandled promise rejection:`, event.reason)
  }
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
