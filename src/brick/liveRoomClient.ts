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
  onclose: (() => void) | null
  onerror: (() => void) | null
}

type LiveRoomStore = {
  getState: () => BrickState
  setState: (patch: Partial<BrickState>) => void
  subscribe: (listener: (state: BrickState, previous: BrickState) => void) => () => void
}

export type LiveRoomClientOptions = {
  roomId: string
  profile: PlayerProfile
  ownerToken?: string
  baseUrl?: string
  clientId?: string
  store?: LiveRoomStore
  createSocket?: (url: string) => LiveRoomSocketLike
  reconnectDelaysMs?: number[]
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

function liveWebSocketUrl(baseUrl: string, roomId: string, clientId: string, ownerToken?: string) {
  const url = new URL(`${baseUrl}/worlds/${encodeURIComponent(roomId)}/connect`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('playerId', clientId)
  if (ownerToken) url.searchParams.set('ownerToken', ownerToken)
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
  throw new Error(message)
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
    headers: { 'content-type': 'application/json' },
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
  const clientId = options.clientId ?? createLiveClientId()
  const store = options.store ?? useBrickStore
  const createSocket = options.createSocket ?? defaultCreateSocket
  const reconnectDelays = options.reconnectDelaysMs ?? DEFAULT_LIVE_RECONNECT_DELAYS_MS
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
  let operationSequence = 0
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
    socket.send(JSON.stringify(message))
    return true
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

  const replayPending = () => {
    if (snapshot.connection !== 'online') return
    for (const operation of pending.values()) send(operation)
  }

  const enqueue = (operation: PendingOperation) => {
    pending.set(operation.opId, operation)
    publish({ pendingOperations: pending.size })
    if (snapshot.connection === 'online') send(operation)
  }

  const requestResync = () => {
    if (snapshot.awaitingSnapshot || !socketOpen) return false
    publish({ awaitingSnapshot: true })
    return send({ v: LIVE_PROTOCOL_VERSION, type: 'resync' })
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
        return
      }
      case 'snapshot': {
        const acknowledged = message.opId ? pending.delete(message.opId) : false
        if (message.revision < snapshot.revision) {
          if (acknowledged) {
            publish({ pendingOperations: pending.size })
            refreshFromCanonical('remote')
          }
          return
        }
        adoptMode(message.mode)
        if (!acceptDocument(message.document, 'snapshot', message.revision, true)) return
        publish({ pendingOperations: pending.size, mode: message.mode })
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
          return
        }
        if (!message.opId) pending.clear()
        if (!acceptDocument(message.document, 'reject', message.revision, true)) return
        publish({ pendingOperations: pending.size })
        reportError(message.code, message.message)
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

  const connect = () => {
    if (disposed) return
    const nextSocket = createSocket(liveWebSocketUrl(baseUrl, roomId, clientId, options.ownerToken))
    socket = nextSocket
    socketOpen = false
    nextSocket.onopen = () => {
      if (disposed || socket !== nextSocket) return
      socketOpen = true
      send({ v: LIVE_PROTOCOL_VERSION, type: 'setProfile', profile: desiredProfile })
      poseSender.transportOpened()
    }
    nextSocket.onmessage = (event) => {
      if (disposed || socket !== nextSocket) return
      handleMessage(event.data)
    }
    nextSocket.onerror = () => {
      if (socket === nextSocket) reportError('connection_error', 'The live world connection encountered an error.')
    }
    nextSocket.onclose = () => {
      if (socket !== nextSocket) return
      socket = null
      socketOpen = false
      poseSender.transportClosed()
      if (disposed) return
      const delay = reconnectDelays[Math.min(reconnectAttempt, reconnectDelays.length - 1)] ?? 1_000
      reconnectAttempt += 1
      publish({ connection: 'reconnecting' })
      if (everOnline) options.onError?.({ code: 'reconnecting', message: 'Connection lost. Rejoining the live world…' })
      reconnectTimer = setTimer(() => {
        reconnectTimer = undefined
        connect()
      }, delay)
    }
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
        document: validated.document,
      }
      if (new TextEncoder().encode(JSON.stringify(operation)).byteLength > LIVE_MAX_DOCUMENT_BYTES) {
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
