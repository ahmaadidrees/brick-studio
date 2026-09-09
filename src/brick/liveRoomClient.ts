import {
  LIVE_MAX_COMMAND_BYTES,
  LIVE_MAX_COMMANDS,
  LIVE_MAX_DOCUMENT_BYTES,
  LIVE_PROTOCOL_VERSION,
  type CreateLiveWorldRequest,
  type CreateLiveWorldResponse,
  type LiveBrickCommand,
  type LiveClientMessage,
  type LiveConnectionState,
  type LivePlayer,
  type LivePose,
  type LiveServerMessage,
  type LiveWorldMode,
} from './liveProtocol'
import {
  normalizeBrickStudioDocument,
  type BrickStudioDocument,
} from './brickDocument'
import { createEfficientPoseSender, type PoseVisibilitySource } from './efficientPoseSender'
import { suspendBrickStudioAutosave } from './liveAutosaveGuard'
import { useBrickStore, type BrickState } from './store'
import type { BrickInstance, PlayerProfile } from './types'

export const DEFAULT_LIVE_RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000]
export const DEFAULT_LIVE_POSE_INTERVAL_MS = 75
export const DEFAULT_LIVE_POSE_HEARTBEAT_MS = 1_500
export const DEFAULT_LIVE_SYNC_TIMEOUT_MS = 5_000
/** Stays below the Worker's retained outcome window so reconnect replay can never outrun dedupe history. */
export const LIVE_MAX_PENDING_OPERATIONS = 96
export const LIVE_ROOM_IDENTITY_STORAGE_PREFIX = 'brick-studio.live-room-identity.v1:'

const LIVE_PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{6,48}$/
const LIVE_RECONNECT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,512}$/

export type LiveWorldResource = {
  roomId: string
  title: string
  revision: number
  mode: LiveWorldMode
  locked: boolean
  document: BrickStudioDocument
  players: LivePlayer[]
}

export type LiveRoomHttpOptions = {
  headers?: Record<string, string>
  baseUrl?: string
  fetch?: typeof globalThis.fetch
}

export type LiveRoomError = {
  code: string
  message: string
}

export type LiveRemotePose = LivePose & {
  playerId: string
  at: number
}

export type LiveDocumentReason = 'welcome' | 'remote' | 'snapshot' | 'reject' | 'local'

export type LiveRoomSnapshot = {
  roomId: string
  clientId: string
  connection: LiveConnectionState
  revision: number
  mode: LiveWorldMode
  locked: boolean
  isOwner: boolean
  players: LivePlayer[]
  document: BrickStudioDocument | null
  pendingOperations: number
  awaitingSnapshot: boolean
  error?: LiveRoomError
}

export type LiveRoomSocketLike = {
  send: (data: string) => void
  close: () => void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event?: { code: number }) => void) | null
  onerror: (() => void) | null
}

type LiveRoomStore = {
  getState: () => BrickState
  setState: (patch: Partial<BrickState>) => void
  subscribe: (listener: (state: BrickState, previous: BrickState) => void) => () => void
}

export type LiveRoomIdentityStorage = Pick<Storage, 'getItem' | 'setItem'>

export type LiveRoomClientOptions = {
  /** Fetch a fresh short-lived classroom websocket ticket for each connection. */
  getTicket?: () => Promise<string>
  roomId: string
  profile: PlayerProfile
  ownerToken?: string
  baseUrl?: string
  clientId?: string
  /** Pass null to opt out. Guests otherwise persist their reconnect capability in localStorage. */
  identityStorage?: LiveRoomIdentityStorage | null
  store?: LiveRoomStore
  createSocket?: (url: string) => LiveRoomSocketLike
  reconnectDelaysMs?: number[]
  /** Maximum time an edit acknowledgement or resync response may remain silent before reconnecting. */
  syncTimeoutMs?: number
  poseIntervalMs?: number
  poseHeartbeatMs?: number
  visibility?: PoseVisibilitySource
  now?: () => number
  setTimeout?: typeof globalThis.setTimeout
  clearTimeout?: typeof globalThis.clearTimeout
  onStatus?: (snapshot: LiveRoomSnapshot) => void
  onDocument?: (document: BrickStudioDocument, reason: LiveDocumentReason) => void
  onPresence?: (players: LivePlayer[]) => void
  onMode?: (mode: LiveWorldMode) => void
  onLocked?: (locked: boolean) => void
  onPose?: (pose: LiveRemotePose) => void
  onError?: (error: LiveRoomError) => void
}

export type LiveRoomClient = {
  getSnapshot: () => LiveRoomSnapshot
  subscribe: (listener: () => void) => () => void
  setProfile: (profile: PlayerProfile) => boolean
  setMode: (mode: LiveWorldMode) => boolean
  setLocked: (locked: boolean) => boolean
  replaceDocument: (document: BrickStudioDocument) => string | null
  sendPose: (pose: LivePose) => void
  requestResync: () => boolean
  dispose: () => void
}

type PendingOperation = Extract<LiveClientMessage, { type: 'commands' | 'replaceDocument' }>

function runtimeBaseUrl() {
  const live = import.meta.env.VITE_LIVE_SERVER_URL as string | undefined
  const shared = import.meta.env.VITE_RACE_SERVER_URL as string | undefined
  return (live?.trim() || shared?.trim() || 'http://localhost:8787').replace(/\/$/, '')
}

function cloneBrick(brick: BrickInstance): BrickInstance {
  return { ...brick }
}

function cloneDocument(document: BrickStudioDocument): BrickStudioDocument {
  return {
    ...document,
    customParts: document.customParts.map((part) => ({ ...part })),
    bricks: document.bricks.map(cloneBrick),
  }
}

function clonePlayers(players: LivePlayer[]) {
  return players.map((player) => ({
    ...player,
    profile: {
      ...player.profile,
      ...(player.profile.palette ? { palette: { ...player.profile.palette } } : {}),
    },
  }))
}

function brickContentEquals(first: BrickInstance, second: BrickInstance) {
  return first.partId === second.partId
    && first.x === second.x
    && first.y === second.y
    && first.z === second.z
    && first.rotation === second.rotation
    && first.color === second.color
}

export function classifyLiveBrickChange(
  before: BrickInstance,
  after: BrickInstance,
): Extract<LiveBrickCommand, { brick: BrickInstance }>['op'] {
  const moved = before.x !== after.x || before.y !== after.y || before.z !== after.z
  const rotated = before.rotation !== after.rotation
  const recolored = before.color !== after.color
  const changedPart = before.partId !== after.partId
  const changeCount = [moved, rotated, recolored, changedPart].filter(Boolean).length
  if (changedPart || changeCount > 1) return 'update'
  if (moved) return 'move'
  if (rotated) return 'rotate'
  return 'recolor'
}

export function diffBricksToLiveCommands(before: BrickInstance[], after: BrickInstance[]): LiveBrickCommand[] {
  const beforeById = new Map(before.map((brick) => [brick.id, brick]))
  const afterIds = new Set(after.map((brick) => brick.id))
  const deletes: LiveBrickCommand[] = before
    .filter((brick) => !afterIds.has(brick.id))
    .map((brick) => ({ op: 'delete', id: brick.id }))
  const changes: LiveBrickCommand[] = []
  const places: LiveBrickCommand[] = []

  for (const brick of after) {
    const previous = beforeById.get(brick.id)
    if (!previous) places.push({ op: 'place', brick: cloneBrick(brick) })
    else if (!brickContentEquals(previous, brick)) {
      changes.push({ op: classifyLiveBrickChange(previous, brick), brick: cloneBrick(brick) })
    }
  }
  return [...deletes, ...changes, ...places]
}

export function applyLiveCommands(bricks: BrickInstance[], commands: LiveBrickCommand[]): BrickInstance[] {
  let next = bricks.map(cloneBrick)
  for (const command of commands) {
    if (command.op === 'delete') {
      next = next.filter((brick) => brick.id !== command.id)
      continue
    }
    const incoming = cloneBrick(command.brick)
    const index = next.findIndex((brick) => brick.id === incoming.id)
    if (index < 0 || command.op === 'place' || command.op === 'update') {
      next = index < 0
        ? [...next, incoming]
        : next.map((brick, position) => position === index ? incoming : brick)
      continue
    }
    next = next.map((brick, position) => {
      if (position !== index) return brick
      if (command.op === 'move') return { ...brick, x: incoming.x, y: incoming.y, z: incoming.z }
      if (command.op === 'rotate') return { ...brick, rotation: incoming.rotation }
      return { ...brick, color: incoming.color }
    })
  }
  return next
}

export function buildLiveRemotePatch(
  state: Pick<BrickState, 'selectedIds' | 'selectedId' | 'movingId'>,
  document: BrickStudioDocument,
  mode?: LiveWorldMode,
  resetHistory = false,
): Partial<BrickState> {
  const ids = new Set(document.bricks.map((brick) => brick.id))
  const selectedIds = state.selectedIds.filter((id) => ids.has(id))
  const patch: Partial<BrickState> = {
    bricks: document.bricks.map(cloneBrick),
    selectedIds,
    selectedId: state.selectedId && ids.has(state.selectedId) ? state.selectedId : selectedIds.at(-1) ?? null,
    ...(mode ? { mode } : {}),
    ...(resetHistory ? { undoStack: [], redoStack: [] } : {}),
  }
  if (state.movingId && !ids.has(state.movingId)) {
    patch.movingId = null
    patch.draft = null
    patch.activePartId = null
    patch.toast = 'The shared world changed the brick you were moving, so the move was canceled.'
  }
  return patch
}

function createLiveClientId() {
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
  return `live_${random}`.slice(0, 48)
}

type LiveGuestIdentity = {
  playerId: string
  reconnectToken: string
}

function identityStorageKey(roomId: string) {
  return `${LIVE_ROOM_IDENTITY_STORAGE_PREFIX}${encodeURIComponent(roomId)}`
}

function defaultIdentityStorage(): LiveRoomIdentityStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function validReconnectToken(value: unknown): value is string {
  return typeof value === 'string' && LIVE_RECONNECT_TOKEN_PATTERN.test(value)
}

function readGuestIdentity(storage: LiveRoomIdentityStorage | undefined, roomId: string): LiveGuestIdentity | undefined {
  if (!storage) return undefined
  try {
    const raw = storage.getItem(identityStorageKey(roomId))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<LiveGuestIdentity> | null
    if (
      !parsed
      || typeof parsed.playerId !== 'string'
      || !LIVE_PLAYER_ID_PATTERN.test(parsed.playerId)
      || !validReconnectToken(parsed.reconnectToken)
    ) return undefined
    return { playerId: parsed.playerId, reconnectToken: parsed.reconnectToken }
  } catch {
    return undefined
  }
}

/** True when this browser has the private capability required to rejoin a locked room. */
export function hasSavedLiveRoomIdentity(
  roomId: string,
  storage: LiveRoomIdentityStorage | undefined = defaultIdentityStorage(),
) {
  return Boolean(readGuestIdentity(storage, roomId))
}

function saveGuestIdentity(
  storage: LiveRoomIdentityStorage | undefined,
  roomId: string,
  identity: LiveGuestIdentity,
) {
  if (!storage) return
  try {
    storage.setItem(identityStorageKey(roomId), JSON.stringify(identity))
  } catch { /* live collaboration must still work when storage is unavailable */ }
}

function liveWebSocketUrl(
  baseUrl: string,
  roomId: string,
  clientId: string,
  ownerToken?: string,
  reconnectToken?: string,
) {
  const url = new URL(`${baseUrl}/worlds/${encodeURIComponent(roomId)}/connect`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('playerId', clientId)
  if (ownerToken) url.searchParams.set('ownerToken', ownerToken)
  else if (reconnectToken) url.searchParams.set('reconnectToken', reconnectToken)
  return url.toString()
}

async function jsonRequest<T>(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, init)
  if (response.ok) return response.json() as Promise<T>
  let message = `Live world server request failed (${response.status})`
  try {
    const body = await response.json() as { message?: unknown; error?: unknown }
    if (typeof body.message === 'string') message = body.message
    else if (typeof body.error === 'string') message = body.error
  } catch { /* keep status-based message */ }
  throw Object.assign(new Error(message), { status: response.status })
}

export async function createLiveWorld(
  request: CreateLiveWorldRequest,
  options: LiveRoomHttpOptions = {},
): Promise<CreateLiveWorldResponse> {
  const validated = normalizeBrickStudioDocument(request.document)
  if (!validated.ok) throw new Error(validated.error.message)
  const baseUrl = (options.baseUrl ?? runtimeBaseUrl()).replace(/\/$/, '')
  return jsonRequest<CreateLiveWorldResponse>(options.fetch ?? globalThis.fetch, `${baseUrl}/worlds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...options.headers },
    body: JSON.stringify({ ...request, document: validated.document }),
  })
}

export async function getLiveWorld(
  roomId: string,
  options: LiveRoomHttpOptions = {},
): Promise<LiveWorldResource> {
  const baseUrl = (options.baseUrl ?? runtimeBaseUrl()).replace(/\/$/, '')
  const resource = await jsonRequest<LiveWorldResource>(
    options.fetch ?? globalThis.fetch,
    `${baseUrl}/worlds/${encodeURIComponent(roomId)}`,
    options.headers ? { headers: options.headers } : undefined,
  )
  const validated = normalizeBrickStudioDocument(resource.document)
  if (!validated.ok) throw new Error(validated.error.message)
  return { ...resource, document: validated.document, players: clonePlayers(resource.players ?? []) }
}

const defaultCreateSocket = (url: string) => new WebSocket(url) as unknown as LiveRoomSocketLike

function livePoseEquals(first: LivePose, second: LivePose) {
  return Math.abs(first.x - second.x) < 0.01
    && Math.abs(first.y - second.y) < 0.01
    && Math.abs(first.z - second.z) < 0.01
    && Math.abs(first.yaw - second.yaw) < 0.01
    && first.moving === second.moving
    && first.jumping === second.jumping
}

export function createLiveRoomClient(options: LiveRoomClientOptions): LiveRoomClient {
  const roomId = options.roomId
  const identityStorage = options.identityStorage === null
    ? undefined
    : options.identityStorage ?? defaultIdentityStorage()
  const savedGuestIdentity = options.ownerToken ? undefined : readGuestIdentity(identityStorage, roomId)
  const reusableGuestIdentity = !options.clientId || options.clientId === savedGuestIdentity?.playerId
    ? savedGuestIdentity
    : undefined
  const clientId = options.clientId ?? reusableGuestIdentity?.playerId ?? createLiveClientId()
  const store = options.store ?? useBrickStore
  const createSocket = options.createSocket ?? defaultCreateSocket
  const reconnectDelays = options.reconnectDelaysMs ?? DEFAULT_LIVE_RECONNECT_DELAYS_MS
  const syncTimeoutMs = options.syncTimeoutMs ?? DEFAULT_LIVE_SYNC_TIMEOUT_MS
  const now = options.now ?? (() => Date.now())
  const setTimer = options.setTimeout ?? ((handler, timeout) => globalThis.setTimeout(handler, timeout))
  const clearTimer = options.clearTimeout ?? ((timer) => globalThis.clearTimeout(timer))
  const baseUrl = (options.baseUrl ?? runtimeBaseUrl()).replace(/\/$/, '')
  const releaseAutosave = suspendBrickStudioAutosave()

  let desiredProfile = { ...options.profile, ...(options.profile.palette ? { palette: { ...options.profile.palette } } : {}) }
  let socket: LiveRoomSocketLike | null = null
  let socketOpen = false
  let disposed = false
  let applyingRemote = false
  let reconnectAttempt = 0
  let everOnline = false
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let syncTimer: ReturnType<typeof setTimeout> | undefined
  let operationSequence = 0n
  let reconnectToken = reusableGuestIdentity?.reconnectToken
  let canonicalDocument: BrickStudioDocument | null = null
  const pending = new Map<string, PendingOperation>()
  const listeners = new Set<() => void>()

  let snapshot: LiveRoomSnapshot = {
    roomId,
    clientId,
    connection: 'connecting',
    revision: 0,
    mode: 'build',
    locked: false,
    isOwner: false,
    players: [],
    document: null,
    pendingOperations: 0,
    awaitingSnapshot: false,
  }

  const publish = (patch: Partial<LiveRoomSnapshot> = {}) => {
    snapshot = { ...snapshot, ...patch }
    for (const listener of [...listeners]) listener()
    options.onStatus?.(snapshot)
  }

  const reportError = (code: string, message: string) => {
    const error = { code, message }
    publish({ error })
    options.onError?.(error)
  }

  const send = (message: LiveClientMessage) => {
    if (!socket || !socketOpen) return false
    try {
      socket.send(JSON.stringify(message))
      return true
    } catch {
      return false
    }
  }

  const nextOpId = () => `${clientId}#${++operationSequence}`

  const rebasePending = (base: BrickStudioDocument) => {
    let next = cloneDocument(base)
    for (const operation of pending.values()) {
      next = operation.type === 'replaceDocument'
        ? cloneDocument(operation.document)
        : { ...next, bricks: applyLiveCommands(next.bricks, operation.commands) }
    }
    return next
  }

  const applyDisplayedDocument = (document: BrickStudioDocument, reason: LiveDocumentReason, resetHistory = false) => {
    const next = cloneDocument(document)
    applyingRemote = true
    try {
      store.setState(buildLiveRemotePatch(store.getState(), next, snapshot.mode, resetHistory))
    } finally {
      applyingRemote = false
    }
    publish({ document: next, pendingOperations: pending.size })
    options.onDocument?.(cloneDocument(next), reason)
  }

  const refreshFromCanonical = (reason: LiveDocumentReason, resetHistory = false) => {
    if (!canonicalDocument) return
    applyDisplayedDocument(rebasePending(canonicalDocument), reason, resetHistory)
  }

  const adoptMode = (mode: LiveWorldMode) => {
    const changed = snapshot.mode !== mode
    snapshot = { ...snapshot, mode }
    applyingRemote = true
    try { store.setState({ mode }) } finally { applyingRemote = false }
    if (changed) options.onMode?.(mode)
  }

  const adoptLocked = (locked: boolean) => {
    const changed = snapshot.locked !== locked
    snapshot = { ...snapshot, locked }
    if (changed) options.onLocked?.(locked)
  }

  const adoptPlayers = (players: LivePlayer[]) => {
    const next = clonePlayers(players)
    snapshot = { ...snapshot, players: next }
    options.onPresence?.(clonePlayers(next))
  }

  const clearSyncWatchdog = () => {
    if (syncTimer === undefined) return
    clearTimer(syncTimer)
    syncTimer = undefined
  }

  const hasOutstandingSync = () => pending.size > 0 || snapshot.awaitingSnapshot

  const armSyncWatchdog = (reset = false) => {
    if (reset) clearSyncWatchdog()
    if (!hasOutstandingSync()) {
      clearSyncWatchdog()
      return
    }
    if (
      syncTimer !== undefined
      || disposed
      || !socketOpen
      || snapshot.connection !== 'online'
    ) return
    syncTimer = setTimer(() => {
      syncTimer = undefined
      if (!hasOutstandingSync() || disposed) return
      restartConnection(
        'sync_timeout',
        'Live sync stopped responding. Rejoining the world to safely retry your change…',
      )
    }, syncTimeoutMs)
  }

  const replayPending = () => {
    if (snapshot.connection !== 'online') return
    for (const operation of pending.values()) {
      if (!send(operation)) {
        restartConnection(
          'connection_error',
          'The live world connection closed while retrying your change.',
        )
        return
      }
    }
    armSyncWatchdog(true)
  }

  const enqueue = (operation: PendingOperation) => {
    pending.set(operation.opId, operation)
    publish({ pendingOperations: pending.size })
    if (snapshot.connection !== 'online') return
    if (!send(operation)) {
      restartConnection(
        'connection_error',
        'The live world connection closed before your change could be confirmed.',
      )
      return
    }
    armSyncWatchdog()
  }

  const requestResync = () => {
    if (snapshot.awaitingSnapshot || !socketOpen) return false
    publish({ awaitingSnapshot: true })
    if (!send({ v: LIVE_PROTOCOL_VERSION, type: 'resync' })) {
      restartConnection(
        'connection_error',
        'The live world connection closed while requesting the latest world.',
      )
      return false
    }
    armSyncWatchdog()
    return true
  }

  const acceptDocument = (
    rawDocument: unknown,
    reason: LiveDocumentReason,
    revision: number,
    resetHistory: boolean,
  ) => {
    const validated = normalizeBrickStudioDocument(rawDocument)
    if (!validated.ok) {
      reportError(validated.error.code, validated.error.message)
      return false
    }
    canonicalDocument = validated.document
    publish({ revision, awaitingSnapshot: false })
    refreshFromCanonical(reason, resetHistory)
    return true
  }

  const handleMessage = (raw: unknown) => {
    let message: LiveServerMessage
    try { message = JSON.parse(String(raw)) as LiveServerMessage }
    catch { return reportError('invalid_json', 'The live world sent an invalid message.') }
    if (!message || typeof message !== 'object' || message.v !== LIVE_PROTOCOL_VERSION || typeof message.type !== 'string') {
      return reportError('unsupported_message', 'The live world sent an unsupported message.')
    }

    switch (message.type) {
      case 'welcome': {
        if (!acceptDocument(message.document, 'welcome', message.revision, true)) return
        const reconnectWelcome = message as typeof message & {
          reconnectToken?: unknown
          operationHighWater?: unknown
        }
        const issuedReconnectToken = reconnectWelcome.reconnectToken
        if (
          !options.ownerToken
          && message.playerId === clientId
          && validReconnectToken(issuedReconnectToken)
        ) {
          reconnectToken = issuedReconnectToken
          saveGuestIdentity(identityStorage, roomId, { playerId: clientId, reconnectToken })
        }
        if (
          typeof reconnectWelcome.operationHighWater === 'string'
          && /^(?:0|[1-9]\d{0,15})$/.test(reconnectWelcome.operationHighWater)
        ) {
          const operationHighWater = BigInt(reconnectWelcome.operationHighWater)
          if (operationHighWater > operationSequence) operationSequence = operationHighWater
        }
        reconnectAttempt = 0
        everOnline = true
        adoptMode(message.mode)
        adoptLocked(message.locked)
        adoptPlayers(message.players)
        publish({
          connection: 'online',
          isOwner: message.isOwner,
          error: undefined,
          mode: message.mode,
          locked: message.locked,
          players: clonePlayers(message.players),
        })
        replayPending()
        return
      }
      case 'apply': {
        const own = message.from === clientId
        if (own) pending.delete(message.opId)
        if (message.revision <= snapshot.revision) {
          if (own) {
            publish({ pendingOperations: pending.size })
            refreshFromCanonical('remote')
            armSyncWatchdog(true)
          }
          return
        }
        if (snapshot.awaitingSnapshot) return
        if (message.revision !== snapshot.revision + 1 || !canonicalDocument) {
          requestResync()
          return
        }
        canonicalDocument = {
          ...canonicalDocument,
          bricks: applyLiveCommands(canonicalDocument.bricks, message.commands),
        }
        publish({ revision: message.revision, pendingOperations: pending.size })
        refreshFromCanonical(own ? 'local' : 'remote', !own)
        if (own) armSyncWatchdog(true)
        return
      }
      case 'snapshot': {
        const acknowledged = message.opId ? pending.delete(message.opId) : false
        if (message.revision < snapshot.revision) {
          if (acknowledged) {
            publish({ pendingOperations: pending.size })
            refreshFromCanonical('remote')
            armSyncWatchdog(true)
          }
          return
        }
        adoptMode(message.mode)
        if (!acceptDocument(message.document, 'snapshot', message.revision, true)) return
        publish({ pendingOperations: pending.size, mode: message.mode })
        armSyncWatchdog(true)
        return
      }
      case 'reject': {
        const rejected = message.opId ? pending.delete(message.opId) : false
        if (message.revision < snapshot.revision) {
          if (rejected) {
            publish({ pendingOperations: pending.size })
            refreshFromCanonical('reject', true)
          }
          reportError(message.code, message.message)
          armSyncWatchdog(true)
          return
        }
        if (!message.opId) pending.clear()
        if (!acceptDocument(message.document, 'reject', message.revision, true)) return
        publish({ pendingOperations: pending.size })
        reportError(message.code, message.message)
        armSyncWatchdog(true)
        return
      }
      case 'modeChanged': {
        if (message.revision <= snapshot.revision) return
        if (snapshot.awaitingSnapshot) return
        if (message.revision !== snapshot.revision + 1) return void requestResync()
        adoptMode(message.mode)
        publish({ revision: message.revision, mode: message.mode })
        return
      }
      case 'players':
        adoptPlayers(message.players)
        publish({ players: clonePlayers(message.players) })
        return
      case 'pose':
        options.onPose?.({
          playerId: message.playerId,
          at: message.at,
          x: message.x,
          y: message.y,
          z: message.z,
          yaw: message.yaw,
          moving: message.moving,
          jumping: message.jumping,
        })
        return
      case 'locked':
        adoptLocked(message.locked)
        publish({ locked: message.locked })
        return
      case 'error':
        reportError(message.code, message.message)
        return
    }
  }

  const poseSender = createEfficientPoseSender<LivePose>({
    send: (pose) => send({ v: LIVE_PROTOCOL_VERSION, type: 'pose', ...pose }),
    clone: (pose) => ({ ...pose }),
    equals: livePoseEquals,
    isMoving: (pose) => pose.moving || pose.jumping,
    stop: (pose) => ({ ...pose, moving: false, jumping: false }),
    intervalMs: options.poseIntervalMs ?? DEFAULT_LIVE_POSE_INTERVAL_MS,
    heartbeatMs: options.poseHeartbeatMs ?? DEFAULT_LIVE_POSE_HEARTBEAT_MS,
    now,
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    visibility: options.visibility,
  })
  poseSender.activate()

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer !== undefined) return
    const delay = reconnectDelays[Math.min(reconnectAttempt, reconnectDelays.length - 1)] ?? 1_000
    reconnectAttempt += 1
    publish({ connection: 'reconnecting' })
    if (everOnline) options.onError?.({ code: 'reconnecting', message: 'Connection lost. Rejoining the live world…' })
    reconnectTimer = setTimer(() => {
      reconnectTimer = undefined
      connect()
    }, delay)
  }

  const restartConnection = (code: string, message: string) => {
    if (disposed) return
    const staleSocket = socket
    socket = null
    socketOpen = false
    clearSyncWatchdog()
    poseSender.transportClosed()
    if (staleSocket) {
      try { staleSocket.close() }
      catch { /* reconnect below even if the browser rejects close() */ }
    }
    reportError(code, message)
    scheduleReconnect()
  }

  const openConnection = (ticket?: string) => {
    if (disposed) return
    let nextSocket: LiveRoomSocketLike
    try {
      const connectionUrl = new URL(liveWebSocketUrl(
        baseUrl,
        roomId,
        clientId,
        options.ownerToken,
        reconnectToken,
      ))
      if (ticket) connectionUrl.searchParams.set('ticket', ticket)
      nextSocket = createSocket(connectionUrl.toString())
    } catch {
      reportError('connection_error', 'The live world connection could not be opened.')
      scheduleReconnect()
      return
    }
    socket = nextSocket
    socketOpen = false
    nextSocket.onopen = () => {
      if (disposed || socket !== nextSocket) return
      socketOpen = true
      if (!send({ v: LIVE_PROTOCOL_VERSION, type: 'setProfile', profile: desiredProfile })) {
        restartConnection('connection_error', 'The live world connection closed while joining.')
        return
      }
      poseSender.transportOpened()
    }
    nextSocket.onmessage = (event) => {
      if (disposed || socket !== nextSocket) return
      handleMessage(event.data)
    }
    nextSocket.onerror = () => {
      if (socket === nextSocket) {
        restartConnection('connection_error', 'The live world connection encountered an error.')
      }
    }
    nextSocket.onclose = (event) => {
      if (socket !== nextSocket) return
      socket = null
      socketOpen = false
      clearSyncWatchdog()
      poseSender.transportClosed()
      if (disposed) return
      if (event?.code === 4003) {
        publish({ connection: 'offline' })
        reportError('access_changed', 'Classroom access changed. Rejoin from My Class.')
        return
      }
      scheduleReconnect()
    }
  }

  const connect = () => {
    if (disposed) return
    if (!options.getTicket) return openConnection()
    void options.getTicket().then(ticket => {
      if (!disposed) openConnection(ticket)
    }).catch(() => {
      if (disposed) return
      publish({ connection: 'offline' })
      reportError('classroom_auth_required', 'Could not authorize this world. Return to My Class and try joining again.')
    })
  }

  const unsubscribeStore = store.subscribe((state, previous) => {
    if (disposed || applyingRemote) return

    const rejectedModeChange = state.mode !== previous.mode && state.mode !== snapshot.mode
    if (rejectedModeChange) {
      applyingRemote = true
      try { store.setState({ mode: snapshot.mode }) } finally { applyingRemote = false }
    }

    if (state.bricks === previous.bricks) return
    if (
      !canonicalDocument
      || rejectedModeChange
      || snapshot.mode !== 'build'
      || snapshot.connection !== 'online'
    ) {
      if (canonicalDocument) refreshFromCanonical('remote')
      return
    }
    const commands = diffBricksToLiveCommands(previous.bricks, state.bricks)
    if (commands.length === 0) return
    if (pending.size >= LIVE_MAX_PENDING_OPERATIONS) {
      reportError('too_many_pending_operations', 'Live sync is catching up. Wait a moment before making more changes.')
      refreshFromCanonical('reject', true)
      return
    }
    const opId = nextOpId()
    const operation: PendingOperation = { v: LIVE_PROTOCOL_VERSION, type: 'commands', opId, commands }
    if (commands.length > LIVE_MAX_COMMANDS || new TextEncoder().encode(JSON.stringify(operation)).byteLength > LIVE_MAX_COMMAND_BYTES) {
      reportError('commands_too_large', 'That edit is too large to send as one live-world change.')
      refreshFromCanonical('reject', true)
      return
    }
    const localDocument = { ...snapshot.document!, bricks: state.bricks.map(cloneBrick) }
    publish({ document: localDocument })
    options.onDocument?.(cloneDocument(localDocument), 'local')
    enqueue(operation)
  })

  connect()

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setProfile: (profile) => {
      desiredProfile = { ...profile, ...(profile.palette ? { palette: { ...profile.palette } } : {}) }
      return send({ v: LIVE_PROTOCOL_VERSION, type: 'setProfile', profile: desiredProfile })
    },
    setMode: (mode) => snapshot.isOwner
      && snapshot.connection === 'online'
      && send({ v: LIVE_PROTOCOL_VERSION, type: 'setMode', mode }),
    setLocked: (locked) => snapshot.isOwner
      && snapshot.connection === 'online'
      && send({ v: LIVE_PROTOCOL_VERSION, type: 'setLocked', locked }),
    replaceDocument: (document) => {
      if (!snapshot.isOwner || snapshot.connection !== 'online') return null
      if (pending.size >= LIVE_MAX_PENDING_OPERATIONS) {
        reportError('too_many_pending_operations', 'Live sync is catching up. Wait a moment before replacing the world.')
        return null
      }
      const validated = normalizeBrickStudioDocument(document)
      if (!validated.ok) {
        reportError(validated.error.code, validated.error.message)
        return null
      }
      const opId = nextOpId()
      const operation: PendingOperation = {
        v: LIVE_PROTOCOL_VERSION,
        type: 'replaceDocument',
        opId,
        expectedRevision: snapshot.revision,
        document: validated.document,
      }
      if (new TextEncoder().encode(JSON.stringify(validated.document)).byteLength > LIVE_MAX_DOCUMENT_BYTES) {
        reportError('document_too_large', 'That document is too large to replace the live world.')
        return null
      }
      enqueue(operation)
      refreshFromCanonical('local', true)
      return opId
    },
    sendPose: (pose) => poseSender.update(pose),
    requestResync,
    dispose: () => {
      if (disposed) return
      disposed = true
      unsubscribeStore()
      if (reconnectTimer !== undefined) clearTimer(reconnectTimer)
      clearSyncWatchdog()
      poseSender.deactivate()
      socket?.close()
      socket = null
      socketOpen = false
      releaseAutosave()
      publish({ connection: 'offline' })
      listeners.clear()
    },
  }
}
