/**
 * An in-memory connection timeline a builder can choose to copy when reporting
 * a problem. It never records arbitrary messages, URLs, identifiers or world
 * content, and never writes to storage or sends telemetry over the network.
 */
export const LIVE_DIAGNOSTICS_CAPACITY = 48
const MAX_CAPACITY = 128
const MAX_COUNT = 1_000_000_000

const EVENT_NAMES = ['connection', 'socket_close', 'error', 'sync', 'welcome', 'reconnect'] as const
export type LiveDiagnosticEventName = typeof EVENT_NAMES[number]

const CONNECTION_STATES = ['connecting', 'online', 'reconnecting', 'offline'] as const
const ERROR_CODES = [
  'session_replaced', 'changes_need_review', 'connection_error', 'sync_timeout', 'connection_timeout',
  'access_changed', 'classroom_auth_required', 'reconnecting', 'invalid_json',
  'unsupported_message', 'too_many_pending_operations', 'commands_too_large',
  'document_too_large', 'message_too_large', 'text_messages_only', 'rate_limited',
  'unsupported_protocol', 'unknown_message', 'owner_only', 'invalid_mode',
  'invalid_lock', 'save_conflict', 'pose_too_large', 'invalid_pose', 'room_locked',
  'room_full', 'room_expired', 'room_not_found', 'invalid_document',
  'invalid_commands', 'revision_conflict', 'read_only', 'not_connected', 'other',
  'brick-limit', 'custom-part-limit', 'invalid-brick', 'invalid-custom-part',
  'invalid-document', 'invalid-environment', 'invalid-json', 'invalid-layout',
  'unsupported-library', 'unsupported-schema',
] as const

export type LiveDiagnosticDetails = {
  connection?: typeof CONNECTION_STATES[number]
  /** Runtime allowlisting maps unrecognized server codes to `other`. */
  code?: string
  closeCode?: number
  revision?: number
  pendingOperations?: number
  playerCount?: number
  attempt?: number
  awaitingSnapshot?: boolean
}

export type LiveDiagnosticEvent = Readonly<LiveDiagnosticDetails & {
  /** Time since this controller started, without a wall-clock timestamp. */
  elapsedMs: number
  event: LiveDiagnosticEventName
}>

export type LiveDiagnostics = {
  record: (event: LiveDiagnosticEventName, details?: LiveDiagnosticDetails) => void
  getSnapshot: () => readonly LiveDiagnosticEvent[]
  exportText: () => string
}

function finiteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT
}

/** Reconstruct every entry from known scalar fields; never spread caller data. */
function sanitizedDetails(input: unknown): LiveDiagnosticDetails {
  if (!input || typeof input !== 'object') return {}
  const source = input as Record<string, unknown>
  const details: LiveDiagnosticDetails = {}
  if (CONNECTION_STATES.some((state) => state === source.connection)) {
    details.connection = source.connection as LiveDiagnosticDetails['connection']
  }
  if (typeof source.code === 'string') {
    details.code = ERROR_CODES.some((code) => code === source.code) ? source.code : 'other'
  }
  if (typeof source.closeCode === 'number' && Number.isInteger(source.closeCode)
    && source.closeCode >= 1000 && source.closeCode <= 4999) {
    details.closeCode = source.closeCode
  }
  for (const key of ['revision', 'pendingOperations', 'playerCount', 'attempt'] as const) {
    if (finiteCount(source[key])) details[key] = source[key]
  }
  if (typeof source.awaitingSnapshot === 'boolean') details.awaitingSnapshot = source.awaitingSnapshot
  return details
}

export function createLiveDiagnostics(options: { now?: () => number; capacity?: number } = {}): LiveDiagnostics {
  const now = options.now ?? (() => globalThis.performance?.now() ?? Date.now())
  const startedAt = now()
  const capacity = typeof options.capacity === 'number' && Number.isFinite(options.capacity)
    ? Math.max(1, Math.min(MAX_CAPACITY, Math.floor(options.capacity)))
    : LIVE_DIAGNOSTICS_CAPACITY
  const events: LiveDiagnosticEvent[] = []
  let previousElapsed = 0

  const record: LiveDiagnostics['record'] = (event, details) => {
    // TypeScript cannot protect this boundary from an untyped server payload.
    if (!EVENT_NAMES.some((name) => name === event)) return
    const elapsed = now() - startedAt
    previousElapsed = Number.isFinite(elapsed)
      ? Math.max(previousElapsed, Math.min(MAX_COUNT, Math.round(elapsed)))
      : previousElapsed
    const entry = Object.freeze({ elapsedMs: previousElapsed, event, ...sanitizedDetails(details) })
    // Busy classrooms can receive many revisions per second. Keep the latest
    // sync counters without letting ordinary edits erase the connection cause.
    if (event === 'sync' && events.at(-1)?.event === 'sync') events[events.length - 1] = entry
    else events.push(entry)
    if (events.length > capacity) events.splice(0, events.length - capacity)
  }
  const getSnapshot = () => Object.freeze([...events])
  const exportText = () => JSON.stringify({
    schema: 'brick-studio.live-diagnostics.v1',
    events: getSnapshot(),
  }, null, 2)

  return { record, getSnapshot, exportText }
}
