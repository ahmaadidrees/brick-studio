import type { CreateLiveWorldRequest, CreateLiveWorldResponse, LiveWorldMode } from '../liveProtocol'

/**
 * Thin HTTP adapter for the live-world room service:
 *
 * - `POST /worlds` creates a room and returns `{ roomId, ownerToken }`.
 * - `GET /worlds/:roomId` describes a room before joining.
 *
 * The realtime WebSocket session on the same route is deliberately NOT opened
 * here — that transport (URL shape, owner-capability handshake, reconnect
 * policy) belongs to the `liveRoomClient` lane and reaches the UI through the
 * `ConnectLiveRoom` seam in `liveRoomModel.ts`.
 */

export type LiveWorldGatewayErrorCode = 'unreachable' | 'not-found' | 'rejected' | 'invalid-response'

export class LiveWorldGatewayError extends Error {
  readonly code: LiveWorldGatewayErrorCode
  readonly status?: number
  readonly retryAfterSeconds?: number

  constructor(code: LiveWorldGatewayErrorCode, message: string, status?: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'LiveWorldGatewayError'
    this.code = code
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export type LiveWorldGatewayOptions = {
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}

type EnvRecord = Record<string, unknown>

/** `VITE_LIVE_SERVER_URL` wins; falls back to the race worker origin so a shared multiplayer deployment needs one variable. */
export function resolveLiveServerBaseUrl(env: EnvRecord = import.meta.env as EnvRecord): string {
  const configured = [env.VITE_LIVE_SERVER_URL, env.VITE_RACE_SERVER_URL]
    .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
  return (configured?.trim() ?? 'http://localhost:8787').replace(/\/+$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function requestJson(
  options: LiveWorldGatewayOptions,
  path: string,
  init: RequestInit | undefined,
  notFoundMessage: string,
): Promise<unknown> {
  const baseUrl = (options.baseUrl ?? resolveLiveServerBaseUrl()).replace(/\/+$/, '')
  const fetcher = options.fetch ?? globalThis.fetch
  let response: Response
  let body: unknown = null
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  const deadline = setTimeout(() => { timedOut = true; abort() }, 20_000)
  try {
    response = await fetcher(`${baseUrl}${path}`, { ...init, signal: controller.signal })
    try { body = await response.json() } catch { body = null }
  } catch {
    if (options.signal?.aborted) throw new LiveWorldGatewayError('unreachable', 'Request canceled.')
    throw new LiveWorldGatewayError('unreachable', 'The live room service is unreachable. Check your connection and try again.')
  } finally {
    clearTimeout(deadline)
    options.signal?.removeEventListener('abort', abort)
  }
  if (timedOut) throw new LiveWorldGatewayError('unreachable', 'The live room service took too long to respond. Try again.', 0)
  if (options.signal?.aborted) throw new LiveWorldGatewayError('unreachable', 'Request canceled.', 0)
  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      throw new LiveWorldGatewayError('not-found', notFoundMessage, response.status)
    }
    const serverMessage = isRecord(body)
      ? [body.message, body.error].find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : undefined
    throw new LiveWorldGatewayError(
      'rejected',
      serverMessage ?? `The live room service said no (status ${response.status}). Please try again.`,
      response.status,
      parseRetryAfter(response),
    )
  }
  return body
}

function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers?.get('Retry-After')
  if (!value) return undefined
  const seconds = Number(value)
  const delay = Number.isFinite(seconds) ? seconds : (Date.parse(value) - Date.now()) / 1000
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined
}

export type CreateLiveWorld = (request: CreateLiveWorldRequest) => Promise<CreateLiveWorldResponse>

export async function createLiveWorldRoom(
  request: CreateLiveWorldRequest,
  options: LiveWorldGatewayOptions = {},
): Promise<CreateLiveWorldResponse> {
  const body = await requestJson(
    options,
    '/worlds',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
    'The live room service is not available yet on this server.',
  )
  if (
    !isRecord(body)
    || typeof body.roomId !== 'string' || !body.roomId.trim()
    || typeof body.ownerToken !== 'string' || !body.ownerToken.trim()
  ) {
    throw new LiveWorldGatewayError('invalid-response', 'The live room service sent an unexpected reply while creating the room.')
  }
  return { roomId: body.roomId, ownerToken: body.ownerToken }
}

export type LiveWorldSummary = {
  roomId: string
  title: string | null
  playerCount: number | null
  mode: LiveWorldMode | null
  locked: boolean | null
}

export type FetchLiveWorldSummary = (roomId: string) => Promise<LiveWorldSummary>

/**
 * Join preflight. Only existence (via status code) is load-bearing; every
 * field is extracted tolerantly because the summary payload is served by the
 * backend lane and may grow without notice.
 */
export async function fetchLiveWorldSummary(
  roomId: string,
  options: LiveWorldGatewayOptions = {},
): Promise<LiveWorldSummary> {
  const body = await requestJson(
    options,
    `/worlds/${encodeURIComponent(roomId)}`,
    { headers: { accept: 'application/json' } },
    'This live room has ended or the link is not quite right.',
  )
  const record = isRecord(body) ? body : {}
  const players = Array.isArray(record.players) ? record.players.length : null
  return {
    roomId,
    title: typeof record.title === 'string' && record.title.trim() ? record.title : null,
    playerCount: typeof record.playerCount === 'number' && Number.isFinite(record.playerCount)
      ? record.playerCount
      : players,
    mode: record.mode === 'build' || record.mode === 'explore' ? record.mode : null,
    locked: typeof record.locked === 'boolean' ? record.locked : null,
  }
}
