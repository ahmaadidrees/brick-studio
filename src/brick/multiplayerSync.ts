/**
 * Opt-in local multiplayer sync for Brick Studio (EXPERIMENT).
 *
 * Activated only by a `?room=CODE` URL parameter; without it this module is
 * completely inert (no socket, no subscriptions, no state changes). With it,
 * the client connects to the local relay (experiments/multiplayer/server) and
 * co-builds one shared plate. Full protocol + design notes: MULTIPLAYER_SPIKE.md.
 *
 * COMMAND DERIVATION TRADEOFF — we subscribe to useBrickStore and diff the
 * immutable `bricks` array (previous vs next) instead of wrapping every store
 * action. One diff path covers every mutation source uniformly — place, move,
 * nudge, rotate, recolor, delete, paste, undo/redo, import, New Build — so a
 * future store action can never silently bypass sync. The cost: original
 * intent is inferred, not recorded (a diff cannot distinguish "move" from
 * "undo of a move", and a multi-field change collapses into `update`), and a
 * bulk operation becomes one batch of per-brick commands rather than a single
 * semantic command. For a wire protocol whose unit is the brick, that
 * trade is worth it; the inferred op kinds exist purely for debuggability.
 *
 * ECHO-LOOP PREVENTION — two layers: every client tags outgoing batches with
 * an ephemeral random clientId and ignores rebroadcasts of its own batches,
 * and remote changes are applied under an `applyingRemote` guard so the store
 * subscription never re-diffs them into fresh outgoing commands.
 *
 * PRIVACY — no accounts and no PII on the wire: an ephemeral random client id,
 * a room code, and brick geometry. Nothing else.
 */

import { useEffect, useState } from 'react'
import { useBrickStore, type BrickState } from './store'
import type { BrickInstance } from './types'

export const MULTIPLAYER_RELAY_URL = 'ws://localhost:8787'
export const MULTIPLAYER_PROTOCOL_VERSION = 1
export const MULTIPLAYER_ROOM_PATTERN = /^[A-Z0-9]{1,12}$/
export const DEFAULT_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 10_000]

export type WireCommandOp = 'place' | 'move' | 'rotate' | 'recolor' | 'update'

export type WireCommand =
  | { op: WireCommandOp; brick: BrickInstance }
  | { op: 'delete'; id: string }

export type ClientMessage =
  | { v: typeof MULTIPLAYER_PROTOCOL_VERSION; type: 'hello'; room: string; clientId: string }
  | { v: typeof MULTIPLAYER_PROTOCOL_VERSION; type: 'commands'; commands: WireCommand[] }
  | { v: typeof MULTIPLAYER_PROTOCOL_VERSION; type: 'resync' }

export type ServerMessage =
  | { v: number; type: 'welcome'; room: string; revision: number; snapshot: BrickInstance[]; peers: number }
  | { v: number; type: 'apply'; from: string; revision: number; commands: WireCommand[] }
  | { v: number; type: 'reject'; code: string; message: string; revision: number; snapshot: BrickInstance[] }
  | { v: number; type: 'snapshot'; revision: number; snapshot: BrickInstance[] }
  | { v: number; type: 'peers'; peers: number }
  | { v: number; type: 'error'; code: string; message: string }

export type MultiplayerConnection = 'connecting' | 'online' | 'reconnecting' | 'offline'

export type MultiplayerStatus = {
  room: string
  clientId: string
  connection: MultiplayerConnection
  peers: number
  revision: number
}

/**
 * The minimal socket surface the client uses. The native browser WebSocket is
 * behaviorally compatible (we only assign handlers and send/close strings) but
 * its handler property types are wider, hence the cast in the default factory.
 */
export type MultiplayerSocketLike = {
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
}

type MultiplayerStore = {
  getState: () => BrickState
  setState: (patch: Partial<BrickState>) => void
  subscribe: (listener: (state: BrickState, previous: BrickState) => void) => () => void
}

export type MultiplayerClientOptions = {
  room: string
  store: MultiplayerStore
  url?: string
  clientId?: string
  createSocket?: (url: string) => MultiplayerSocketLike
  reconnectDelaysMs?: number[]
}

export type MultiplayerClient = {
  status: () => MultiplayerStatus
  subscribeStatus: (listener: () => void) => () => void
  dispose: () => void
}

/** Parses and normalizes the ?room= parameter; null means multiplayer stays inert. */
export function getMultiplayerRoomCode(search: string): string | null {
  const value = new URLSearchParams(search).get('room')
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  return MULTIPLAYER_ROOM_PATTERN.test(normalized) ? normalized : null
}

export function createMultiplayerClientId(): string {
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `builder-${random}`
}

function brickContentEquals(first: BrickInstance, second: BrickInstance) {
  return first.partId === second.partId
    && first.x === second.x
    && first.y === second.y
    && first.z === second.z
    && first.rotation === second.rotation
    && first.color === second.color
}

/** Names the change for wire readability; the relay treats all four as a replace. */
export function classifyBrickChange(before: BrickInstance, after: BrickInstance): WireCommandOp {
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

/**
 * Turns one store transition (previous bricks -> next bricks) into a wire
 * batch: deletes first, then in-place changes, then placements. Reordering
 * without content changes produces an empty batch.
 */
export function diffBricksToCommands(before: BrickInstance[], after: BrickInstance[]): WireCommand[] {
  const beforeById = new Map(before.map((brick) => [brick.id, brick]))
  const afterIds = new Set(after.map((brick) => brick.id))

  const deletes: WireCommand[] = before
    .filter((brick) => !afterIds.has(brick.id))
    .map((brick) => ({ op: 'delete', id: brick.id }))
  const changes: WireCommand[] = []
  const places: WireCommand[] = []
  for (const brick of after) {
    const previous = beforeById.get(brick.id)
    if (!previous) {
      places.push({ op: 'place', brick: { ...brick } })
    } else if (!brickContentEquals(previous, brick)) {
      changes.push({ op: classifyBrickChange(previous, brick), brick: { ...brick } })
    }
  }
  return [...deletes, ...changes, ...places]
}

/**
 * Applies relay-validated commands to a brick list. Deletes are idempotent and
 * non-delete ops upsert, so replaying against a slightly stale list converges.
 */
export function applyWireCommands(bricks: BrickInstance[], commands: WireCommand[]): BrickInstance[] {
  let next = bricks
  for (const command of commands) {
    if (command.op === 'delete') {
      next = next.filter((brick) => brick.id !== command.id)
      continue
    }
    const incoming = { ...command.brick }
    const index = next.findIndex((brick) => brick.id === incoming.id)
    next = index >= 0
      ? next.map((brick, position) => (position === index ? incoming : brick))
      : [...next, incoming]
  }
  return next
}

/**
 * Store patch for adopting remote bricks: prunes selection down to bricks that
 * still exist and cancels an in-flight move whose brick a friend removed.
 * Local undo/redo history is intentionally left untouched (see the spike doc).
 */
export function buildRemotePatch(
  state: Pick<BrickState, 'selectedIds' | 'selectedId' | 'movingId'>,
  nextBricks: BrickInstance[],
): Partial<BrickState> {
  const ids = new Set(nextBricks.map((brick) => brick.id))
  const selectedIds = state.selectedIds.filter((id) => ids.has(id))
  const patch: Partial<BrickState> = {
    bricks: nextBricks,
    selectedIds,
    selectedId: state.selectedId && ids.has(state.selectedId) ? state.selectedId : selectedIds.at(-1) ?? null,
  }
  if (state.movingId && !ids.has(state.movingId)) {
    patch.movingId = null
    patch.draft = null
    patch.activePartId = null
    patch.toast = 'A friend changed the brick you were moving, so the move was canceled.'
  }
  return patch
}

const defaultCreateSocket = (url: string) => new WebSocket(url) as unknown as MultiplayerSocketLike

export function createMultiplayerClient(options: MultiplayerClientOptions): MultiplayerClient {
  const {
    room,
    store,
    url = MULTIPLAYER_RELAY_URL,
    clientId = createMultiplayerClientId(),
    createSocket = defaultCreateSocket,
    reconnectDelaysMs = DEFAULT_RECONNECT_DELAYS_MS,
  } = options

  let socket: MultiplayerSocketLike | null = null
  let socketOpen = false
  let disposed = false
  let applyingRemote = false
  let awaitingSnapshot = false
  let revision = 0
  let reconnectAttempt = 0
  let everConnected = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  let status: MultiplayerStatus = { room, clientId, connection: 'connecting', peers: 0, revision: 0 }
  const statusListeners = new Set<() => void>()
  const setStatus = (patch: Partial<MultiplayerStatus>) => {
    status = { ...status, ...patch }
    for (const listener of [...statusListeners]) listener()
  }

  const toast = (message: string) => store.setState({ toast: message })

  const send = (message: ClientMessage) => {
    if (socket && socketOpen) socket.send(JSON.stringify(message))
  }

  const applyRemoteBricks = (nextBricks: BrickInstance[]) => {
    applyingRemote = true
    try {
      store.setState(buildRemotePatch(store.getState(), nextBricks))
    } finally {
      applyingRemote = false
    }
  }

  const requestResync = () => {
    if (awaitingSnapshot) return
    awaitingSnapshot = true
    send({ v: MULTIPLAYER_PROTOCOL_VERSION, type: 'resync' })
  }

  const handleMessage = (raw: unknown) => {
    let message: ServerMessage
    try {
      message = JSON.parse(String(raw)) as ServerMessage
    } catch {
      return
    }
    if (typeof message !== 'object' || message === null || typeof message.type !== 'string') return

    switch (message.type) {
      case 'welcome': {
        everConnected = true
        reconnectAttempt = 0
        revision = message.revision
        awaitingSnapshot = false
        const localBricks = store.getState().bricks
        if (message.revision === 0 && message.snapshot.length === 0 && localBricks.length > 0) {
          // First builder in an empty room: seed it with the local build so
          // sharing a link shares the build. Everyone after this replaces
          // local state with the room's authoritative document.
          send({ v: MULTIPLAYER_PROTOCOL_VERSION, type: 'commands', commands: diffBricksToCommands([], localBricks) })
          toast(`Your build is now shared in room ${room}. Friends with this link build with you.`)
        } else {
          applyRemoteBricks(message.snapshot.map((brick) => ({ ...brick })))
          toast(`You're building together in room ${room}.`)
        }
        setStatus({ connection: 'online', peers: message.peers, revision })
        return
      }
      case 'apply': {
        if (awaitingSnapshot) return
        if (message.revision !== revision + 1) {
          requestResync()
          return
        }
        revision = message.revision
        if (message.from !== clientId) {
          applyRemoteBricks(applyWireCommands(store.getState().bricks, message.commands))
        }
        setStatus({ revision })
        return
      }
      case 'reject': {
        revision = message.revision
        awaitingSnapshot = false
        applyRemoteBricks(message.snapshot.map((brick) => ({ ...brick })))
        toast('A friend built there first, so the shared version was kept.')
        setStatus({ revision })
        return
      }
      case 'snapshot': {
        revision = message.revision
        awaitingSnapshot = false
        applyRemoteBricks(message.snapshot.map((brick) => ({ ...brick })))
        setStatus({ revision })
        return
      }
      case 'peers': {
        const previous = status.peers
        setStatus({ peers: message.peers })
        if (status.connection !== 'online' || previous === 0) return
        if (message.peers > previous) toast(`A friend joined! ${message.peers} builders in the room.`)
        else if (message.peers < previous) toast('A builder left the room.')
        return
      }
      case 'error': {
        toast(`Room trouble: ${message.message}`)
        return
      }
    }
  }

  const connect = () => {
    if (disposed) return
    const nextSocket = createSocket(url)
    socket = nextSocket
    socketOpen = false
    nextSocket.onopen = () => {
      if (disposed || socket !== nextSocket) return
      socketOpen = true
      nextSocket.send(JSON.stringify({ v: MULTIPLAYER_PROTOCOL_VERSION, type: 'hello', room, clientId }))
    }
    nextSocket.onmessage = (event) => {
      if (disposed || socket !== nextSocket) return
      handleMessage(event.data)
    }
    nextSocket.onerror = () => {
      // Browsers always follow error with close; reconnection lives there.
    }
    nextSocket.onclose = () => {
      if (socket !== nextSocket) return
      socketOpen = false
      if (disposed) {
        setStatus({ connection: 'offline' })
        return
      }
      if (reconnectAttempt === 0 && everConnected) toast('Connection lost — reconnecting to the room…')
      const delay = reconnectDelaysMs[Math.min(reconnectAttempt, reconnectDelaysMs.length - 1)]
      reconnectAttempt += 1
      setStatus({ connection: 'reconnecting' })
      reconnectTimer = setTimeout(connect, delay)
    }
  }

  // Outgoing path: diff every bricks transition into a command batch. Gated on
  // being online so pre-welcome edits reconcile via the snapshot instead of
  // racing it; changes applied under the remote guard never re-emit.
  const unsubscribeStore = store.subscribe((state, previous) => {
    if (applyingRemote || disposed || state.bricks === previous.bricks) return
    if (!socketOpen || status.connection !== 'online') return
    const commands = diffBricksToCommands(previous.bricks, state.bricks)
    if (commands.length > 0) send({ v: MULTIPLAYER_PROTOCOL_VERSION, type: 'commands', commands })
  })

  connect()

  return {
    status: () => status,
    subscribeStatus: (listener) => {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      unsubscribeStore()
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      socket?.close()
      setStatus({ connection: 'offline' })
      statusListeners.clear()
    },
  }
}

/**
 * React entry point used by BrickStudioApp. Returns null (and does nothing at
 * all) unless the page URL carries a valid ?room=CODE parameter.
 */
export function useMultiplayerSync(): MultiplayerStatus | null {
  const [status, setStatus] = useState<MultiplayerStatus | null>(null)
  useEffect(() => {
    const room = getMultiplayerRoomCode(window.location.search)
    if (!room) return
    const client = createMultiplayerClient({ room, store: useBrickStore })
    setStatus(client.status())
    const unsubscribe = client.subscribeStatus(() => setStatus(client.status()))
    return () => {
      unsubscribe()
      client.dispose()
      setStatus(null)
    }
  }, [])
  return status
}
