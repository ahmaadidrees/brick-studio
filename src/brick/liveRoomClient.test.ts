import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrickStudioDocument, type BrickStudioDocument } from './brickDocument'
import {
  applyLiveCommands,
  buildLiveRemotePatch,
  classifyLiveBrickChange,
  createLiveRoomClient,
  createLiveWorld,
  diffBricksToLiveCommands,
  getLiveWorld,
  hasSavedLiveRoomIdentity,
  LIVE_MAX_PENDING_OPERATIONS,
  LIVE_ROOM_IDENTITY_STORAGE_PREFIX,
  type LiveRoomClient,
  type LiveRoomClientOptions,
  type LiveRoomIdentityStorage,
  type LiveRoomSocketLike,
} from './liveRoomClient'
import type { LiveClientMessage, LivePlayer, LiveServerMessage } from './liveProtocol'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'
import type { PoseVisibilitySource } from './efficientPoseSender'

const initialState = useBrickStore.getInitialState()

function resetStore() {
  useBrickStore.setState({
    ...initialState,
    bricks: [],
    selectedIds: [],
    selectedId: null,
    draft: initialState.draft ? { ...initialState.draft } : null,
    undoStack: [],
    redoStack: [],
    viewRequest: { ...initialState.viewRequest },
    touchMove: { ...initialState.touchMove },
  }, true)
}

function brick(id: string, overrides: Partial<BrickInstance> = {}): BrickInstance {
  return { id, partId: 'brick_1x1', x: 10, y: 0, z: 10, rotation: 0, color: '#e7473c', ...overrides }
}

function documentWith(...bricks: BrickInstance[]): BrickStudioDocument {
  return createBrickStudioDocument(bricks)
}

function player(playerId: string, isOwner = false): LivePlayer {
  return { playerId, isOwner, profile: { displayName: playerId } }
}

class FakeSocket implements LiveRoomSocketLike {
  sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event?: { code: number }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly url: string) {}

  send(data: string) { this.sent.push(data) }
  close() { this.closed = true; this.onclose?.() }
  open() { this.onopen?.() }
  drop(code?: number) { this.onclose?.(code === undefined ? undefined : { code }) }
  receive(message: LiveServerMessage) { this.onmessage?.({ data: JSON.stringify(message) }) }
  messages(): LiveClientMessage[] { return this.sent.map((raw) => JSON.parse(raw) as LiveClientMessage) }
  commandMessages() {
    return this.messages().filter((message): message is Extract<LiveClientMessage, { type: 'commands' }> => message.type === 'commands')
  }
}

class FakeVisibility implements PoseVisibilitySource {
  visible = true
  listeners = new Set<() => void>()
  isVisible = () => this.visible
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  setVisible(visible: boolean) { this.visible = visible; this.listeners.forEach((listener) => listener()) }
}

function memoryIdentityStorage(): LiveRoomIdentityStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value) },
  }
}

const activeClients: LiveRoomClient[] = []

function createHarness(overrides: Partial<LiveRoomClientOptions> = {}) {
  const sockets: FakeSocket[] = []
  const callbacks = {
    documents: [] as Array<{ document: BrickStudioDocument; reason: string }>,
    presence: [] as LivePlayer[][],
    modes: [] as string[],
    locks: [] as boolean[],
    poses: [] as Array<{ playerId: string; x: number }>,
    errors: [] as string[],
  }
  const client = createLiveRoomClient({
    roomId: 'ROOM1234',
    profile: { displayName: 'Ada' },
    clientId: 'live-test-client',
    baseUrl: 'https://live.example',
    store: useBrickStore,
    identityStorage: null,
    createSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
    onDocument: (document, reason) => callbacks.documents.push({ document, reason }),
    onPresence: (players) => callbacks.presence.push(players),
    onMode: (mode) => callbacks.modes.push(mode),
    onLocked: (locked) => callbacks.locks.push(locked),
    onPose: (pose) => callbacks.poses.push({ playerId: pose.playerId, x: pose.x }),
    onError: (error) => callbacks.errors.push(error.code),
    ...overrides,
  })
  activeClients.push(client)
  return { client, sockets, socket: () => sockets.at(-1)!, callbacks }
}

type TestWelcome = Extract<LiveServerMessage, { type: 'welcome' }> & {
  reconnectToken?: string
  operationHighWater?: string
}

function welcome(socket: FakeSocket, overrides: Partial<TestWelcome> = {}) {
  socket.open()
  socket.receive({
    v: 1,
    type: 'welcome',
    roomId: 'ROOM1234',
    playerId: 'live-test-client',
    isOwner: false,
    revision: 0,
    mode: 'build',
    locked: false,
    document: documentWith(),
    players: [player('live-test-client')],
    ...overrides,
  } as LiveServerMessage)
}

beforeEach(() => {
  vi.useRealTimers()
  resetStore()
})

afterEach(() => {
  while (activeClients.length) activeClients.pop()!.dispose()
  vi.useRealTimers()
})

describe('live world REST routes', () => {
  it('creates and fetches WorldRoom resources on the frozen routes', async () => {
    const empty = documentWith()
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ roomId: 'ROOM1234', ownerToken: 'owner-capability' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ roomId: 'ROOM1234', title: 'Class world', revision: 2, mode: 'build', locked: false, document: empty, players: [] }),
      })

    await expect(createLiveWorld(
      { title: 'Class world', document: empty, profile: { displayName: 'Ada' } },
      { baseUrl: 'https://live.example/', fetch: fetcher },
    )).resolves.toEqual({ roomId: 'ROOM1234', ownerToken: 'owner-capability' })
    await expect(getLiveWorld('ROOM 1234', { baseUrl: 'https://live.example/', fetch: fetcher })).resolves.toMatchObject({ revision: 2, document: empty })

    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://live.example/worlds', expect.objectContaining({ method: 'POST' }))
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://live.example/worlds/ROOM%201234', undefined)
  })
})

describe('live brick command helpers', () => {
  it('classifies changes and emits deterministic delete/change/place batches', () => {
    const a = brick('a', { x: 0, z: 0 })
    const b = brick('b', { x: 20, z: 20 })
    const c = brick('c', { x: 40, z: 40 })
    expect(classifyLiveBrickChange(a, { ...a, x: 2 })).toBe('move')
    expect(classifyLiveBrickChange(a, { ...a, rotation: 1 })).toBe('rotate')
    expect(classifyLiveBrickChange(a, { ...a, color: '#65b85a' })).toBe('recolor')
    expect(classifyLiveBrickChange(a, { ...a, x: 2, color: '#65b85a' })).toBe('update')
    expect(diffBricksToLiveCommands([a, b], [{ ...b, x: 22 }, c])).toEqual([
      { op: 'delete', id: 'a' },
      { op: 'move', brick: { ...b, x: 22 } },
      { op: 'place', brick: c },
    ])
    expect(diffBricksToLiveCommands([a, b], [b, a])).toEqual([])
  })

  it('applies idempotent upserts/deletes and builds selection-safe store patches', () => {
    const a = brick('a')
    const b = brick('b', { x: 20, z: 20 })
    expect(applyLiveCommands([a], [
      { op: 'update', brick: { ...a, color: '#65b85a' } },
      { op: 'place', brick: b },
      { op: 'delete', id: 'missing' },
    ])).toEqual([{ ...a, color: '#65b85a' }, b])

    expect(buildLiveRemotePatch(
      { selectedIds: ['a', 'gone'], selectedId: 'gone', movingId: 'gone' },
      documentWith(a),
      'explore',
    )).toMatchObject({ selectedIds: ['a'], selectedId: 'a', movingId: null, draft: null, mode: 'explore' })
  })

  it('applies field-specific commands without clobbering concurrent brick properties', () => {
    const current = brick('a', { x: 2, y: 3, z: 4, rotation: 1, color: '#65b85a' })
    const stale = brick('a', { x: 20, y: 6, z: 22, rotation: 0, color: '#e7473c' })

    expect(applyLiveCommands([current], [{ op: 'move', brick: stale }])).toEqual([
      { ...current, x: 20, y: 6, z: 22 },
    ])
    expect(applyLiveCommands([current], [{ op: 'rotate', brick: stale }])).toEqual([
      { ...current, rotation: 0 },
    ])
    expect(applyLiveCommands([current], [{ op: 'recolor', brick: stale }])).toEqual([
      { ...current, color: '#e7473c' },
    ])
  })
})

describe('live room synchronization', () => {
  it('sends a placed group as one command batch and cancels a preview when a peer changes any member', () => {
    const { socket } = createHarness()
    const a = brick('a')
    const b = brick('b', { x: 14 })
    welcome(socket(), { document: documentWith(a, b) })
    useBrickStore.setState({ selectedIds: ['a', 'b'], selectedId: 'b' })
    useBrickStore.getState().startMove()
    useBrickStore.setState({ draft: { ...a, z: 16 } })
    expect(socket().commandMessages()).toHaveLength(0)
    useBrickStore.getState().placeDraft()
    const command = socket().commandMessages()[0]
    expect(command.commands).toHaveLength(2)
    expect(command.commands.every((item) => item.op === 'move')).toBe(true)
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
    socket().receive({ v: 1, type: 'apply', revision: 1, from: 'live-test-client', opId: command.opId, commands: command.commands })
    useBrickStore.getState().startMove()
    socket().receive({ v: 1, type: 'apply', revision: 2, from: 'peer', opId: 'peer#1', commands: [
      { op: 'recolor', brick: { ...b, z: 16, color: '#65b85a' } },
    ] })
    expect(useBrickStore.getState()).toMatchObject({ movingSelection: null, movingId: null, draft: null })
    expect(useBrickStore.getState().bricks.find((item) => item.id === 'b')?.color).toBe('#65b85a')
    expect(socket().commandMessages()).toHaveLength(1)
    expect(useBrickStore.getState().undoStack).toHaveLength(0)
  })

  it('preserves group preview across unrelated peer edits and clears it on authoritative resync', () => {
    const { socket } = createHarness()
    const a = brick('a')
    const b = brick('b', { x: 14 })
    const peer = brick('peer-brick', { x: 30 })
    welcome(socket(), { document: documentWith(a, b, peer) })
    useBrickStore.setState({ selectedIds: ['a', 'b'], selectedId: 'b' })
    useBrickStore.getState().startMove()
    const preview = useBrickStore.getState().movingSelection
    socket().receive({ v: 1, type: 'apply', revision: 1, from: 'peer', opId: 'peer#1', commands: [
      { op: 'move', brick: { ...peer, x: 32 } },
    ] })
    expect(useBrickStore.getState().movingSelection).toBe(preview)
    socket().receive({ v: 1, type: 'snapshot', revision: 1, mode: 'build', document: documentWith(a, b, { ...peer, x: 32 }) })
    expect(useBrickStore.getState()).toMatchObject({ movingSelection: null, draft: null })
    expect(socket().commandMessages()).toHaveLength(0)
  })

  it('connects on the WorldRoom route, sends its profile, and adopts welcome state', () => {
    const { client, socket, callbacks } = createHarness({ ownerToken: 'owner capability' })
    expect(socket().url).toContain('wss://live.example/worlds/ROOM1234/connect?')
    expect(socket().url).toContain('playerId=live-test-client')
    expect(socket().url).toContain('ownerToken=owner+capability')
    welcome(socket(), {
      revision: 4,
      isOwner: true,
      document: documentWith(brick('a')),
      players: [player('live-test-client', true), player('peer')],
    })
    expect(socket().messages()[0]).toEqual({ v: 1, type: 'setProfile', profile: { displayName: 'Ada' } })
    expect(client.getSnapshot()).toMatchObject({ connection: 'online', revision: 4, isOwner: true, pendingOperations: 0 })
    expect(useBrickStore.getState().bricks).toEqual([brick('a')])
    expect(callbacks.presence.at(-1)).toHaveLength(2)
  })

  it('preserves character palettes through initial and updated profile messages', () => {
    const initialPalette = { primary: '#e7473c', accent: '#ffd34e' }
    const { client, socket } = createHarness({
      profile: { displayName: 'Ada', characterId: 'toy-figure', palette: initialPalette },
    })
    welcome(socket(), {
      players: [{
        playerId: 'live-test-client',
        isOwner: false,
        profile: { displayName: 'Ada', characterId: 'toy-figure', palette: initialPalette },
      }],
    })
    expect(socket().messages()[0]).toEqual({
      v: 1,
      type: 'setProfile',
      profile: { displayName: 'Ada', characterId: 'toy-figure', palette: initialPalette },
    })

    const updatedPalette = { primary: '#3e83d7' }
    expect(client.setProfile({
      displayName: 'Ada',
      characterId: 'cc0-hero',
      palette: updatedPalette,
    })).toBe(true)
    updatedPalette.primary = '#000000'
    expect(socket().messages().at(-1)).toEqual({
      v: 1,
      type: 'setProfile',
      profile: { displayName: 'Ada', characterId: 'cc0-hero', palette: { primary: '#3e83d7' } },
    })
  })

  it('survives synchronous socket construction failure and retries without leaking its client handle', () => {
    vi.useFakeTimers()
    let attempts = 0
    const sockets: FakeSocket[] = []
    const client = createLiveRoomClient({
      roomId: 'ROOM1234',
      profile: { displayName: 'Ada' },
      clientId: 'live-test-client',
      baseUrl: 'https://live.example',
      store: useBrickStore,
      reconnectDelaysMs: [25],
      createSocket: (url) => {
        attempts += 1
        if (attempts === 1) throw new Error('WebSocket unavailable')
        const socket = new FakeSocket(url)
        sockets.push(socket)
        return socket
      },
    })
    activeClients.push(client)

    expect(client.getSnapshot()).toMatchObject({ connection: 'reconnecting', error: { code: 'connection_error' } })
    vi.advanceTimersByTime(25)
    expect(attempts).toBe(2)
    welcome(sockets[0])
    expect(client.getSnapshot()).toMatchObject({ connection: 'online' })
  })

  it('persists a first-join guest capability and uses it only on reconnect', () => {
    vi.useFakeTimers()
    const storage = memoryIdentityStorage()
    const reconnectToken = 'guest_reconnect_capability_123456789'
    const { client, sockets, socket } = createHarness({
      identityStorage: storage,
      reconnectDelaysMs: [25],
    })

    expect(new URL(socket().url).searchParams.get('reconnectToken')).toBeNull()
    welcome(socket(), { reconnectToken })

    expect(storage.entries.get(`${LIVE_ROOM_IDENTITY_STORAGE_PREFIX}ROOM1234`)).toBe(JSON.stringify({
      playerId: 'live-test-client',
      reconnectToken,
    }))
    expect(JSON.stringify(client.getSnapshot())).not.toContain(reconnectToken)

    socket().drop()
    vi.advanceTimersByTime(25)
    expect(sockets).toHaveLength(2)
    const reconnectUrl = new URL(socket().url)
    expect(reconnectUrl.searchParams.get('playerId')).toBe('live-test-client')
    expect(reconnectUrl.searchParams.get('reconnectToken')).toBe(reconnectToken)
  })

  it('stops automatic reconnect after takeover and keeps unconfirmed work as a recovery copy on explicit rejoin', () => {
    vi.useFakeTimers()
    const { client, sockets, socket, callbacks } = createHarness({ reconnectDelaysMs: [25], syncTimeoutMs: 100 })
    welcome(socket(), { revision: 1, document: documentWith(brick('a')) })
    useBrickStore.setState({ bricks: [brick('a'), brick('pending', { x: 20, z: 20 })] })
    const replacedSocket = socket()

    replacedSocket.drop(4001)
    expect(client.getSnapshot()).toMatchObject({ connection: 'offline', pendingOperations: 1, error: { code: 'session_replaced' } })
    expect(callbacks.errors).toContain('session_replaced')
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(1)
    expect(useBrickStore.getState().bricks.map(({ id }) => id)).toEqual(['a', 'pending'])
    useBrickStore.setState({ bricks: [brick('accidental-offline-edit')] })
    expect(useBrickStore.getState().bricks.map(({ id }) => id)).toEqual(['a', 'pending'])

    client.reconnect?.()
    client.reconnect?.()
    expect(sockets).toHaveLength(2)
    expect(client.getSnapshot().connection).toBe('connecting')
    // Events queued on the superseded socket cannot restart or rewrite the new session.
    replacedSocket.receive({ v: 1, type: 'snapshot', revision: 99, mode: 'build', document: documentWith(brick('stale')) })
    replacedSocket.drop(4001)
    welcome(socket(), { revision: 1, document: documentWith(brick('a')) })
    expect(socket().commandMessages()).toEqual([])
    expect(client.getSnapshot()).toMatchObject({ connection: 'online', revision: 1, pendingOperations: 0, error: { code: 'changes_need_review' } })
    expect(client.getSnapshot().recoveryDocument?.bricks.map(({ id }) => id)).toEqual(['a', 'pending'])
    expect(useBrickStore.getState().bricks.map(({ id }) => id)).toEqual(['a'])
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(2)
  })

  it.each(['socket opening', 'welcome'] as const)('retries a stalled %s without losing the client handle', (stage) => {
    vi.useFakeTimers()
    const { client, sockets, socket } = createHarness({ connectionTimeoutMs: 100, reconnectDelaysMs: [25] })
    const first = socket()
    if (stage === 'welcome') first.open()
    vi.advanceTimersByTime(100)
    expect(client.getSnapshot()).toMatchObject({ connection: 'reconnecting', error: { code: 'connection_timeout' } })
    expect(first.closed).toBe(true)
    vi.advanceTimersByTime(25)
    expect(sockets).toHaveLength(2)
    welcome(socket())
    vi.advanceTimersByTime(500)
    expect(client.getSnapshot().connection).toBe('online')
    expect(sockets).toHaveLength(2)
  })

  it('keeps a recovery draft when the replacement tab consumed an ambiguous pending operation id', () => {
    const { client, socket } = createHarness()
    welcome(socket())
    useBrickStore.setState({ bricks: [brick('old-tab-unsent')] })
    const oldOperation = socket().commandMessages()[0]
    socket().drop(4001)
    client.reconnect?.()
    // The new tab accepted a different edit using the same playerId#1.
    const otherTabDocument = documentWith(brick('new-tab', { x: 30, z: 30 }))
    welcome(socket(), { revision: 1, operationHighWater: '1', document: otherTabDocument })
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: oldOperation.opId, revision: 1, commands: [] })
    expect(client.getSnapshot()).toMatchObject({
      connection: 'online', pendingOperations: 0, document: otherTabDocument,
      recoveryDocument: documentWith(brick('old-tab-unsent')), error: { code: 'changes_need_review' },
    })
    expect(socket().commandMessages()).toHaveLength(0)
    client.dismissRecovery?.()
    expect(client.getSnapshot()).toMatchObject({ recoveryDocument: null, error: undefined })
  })

  it('retains an earlier recovery copy through a second takeover until each copy is explicitly dismissed', () => {
    const { client, socket } = createHarness()
    welcome(socket())
    useBrickStore.setState({ bricks: [brick('first-draft')] })
    socket().drop(4001)
    client.dismissRecovery?.()
    expect(client.getSnapshot().recoveryDocument?.bricks[0].id).toBe('first-draft')
    client.reconnect?.()
    welcome(socket())
    useBrickStore.setState({ bricks: [brick('second-draft')] })
    socket().drop(4001)
    expect(client.getSnapshot()).toMatchObject({ recoveryDocumentCount: 2, recoveryDocument: documentWith(brick('first-draft')) })
    client.reconnect?.()
    welcome(socket())
    client.dismissRecovery?.()
    expect(client.getSnapshot()).toMatchObject({ recoveryDocumentCount: 1, recoveryDocument: documentWith(brick('second-draft')), error: { code: 'changes_need_review' } })
    client.dismissRecovery?.()
    expect(client.getSnapshot()).toMatchObject({ recoveryDocumentCount: 0, recoveryDocument: null, error: undefined })
  })

  it('recovers an ambiguous consumed operation after an ordinary network close that hid the takeover', () => {
    vi.useFakeTimers()
    const { client, socket } = createHarness({ reconnectDelaysMs: [25] })
    welcome(socket())
    useBrickStore.setState({ bricks: [brick('old-tab-unsent')] })
    socket().drop(1006)
    vi.advanceTimersByTime(25)
    const otherTabDocument = documentWith(brick('new-tab', { x: 30, z: 30 }))
    welcome(socket(), { revision: 1, operationHighWater: '1', document: otherTabDocument })
    expect(socket().commandMessages()).toHaveLength(0)
    expect(client.getSnapshot()).toMatchObject({
      connection: 'online', pendingOperations: 0, document: otherTabDocument,
      recoveryDocument: documentWith(brick('old-tab-unsent')), error: { code: 'changes_need_review' },
    })
    useBrickStore.setState({ bricks: [...otherTabDocument.bricks, brick('new-change')] })
    expect(socket().commandMessages()[0].opId).toBe('live-test-client#2')
  })

  it('does not request recovery when a lost acknowledgement is confirmed by an identical canonical document', () => {
    vi.useFakeTimers()
    const { client, socket } = createHarness({ reconnectDelaysMs: [25] })
    welcome(socket())
    const saved = documentWith(brick('accepted'))
    useBrickStore.setState({ bricks: saved.bricks })
    socket().drop(1006)
    vi.advanceTimersByTime(25)
    welcome(socket(), { revision: 1, operationHighWater: '1', document: saved })
    expect(socket().commandMessages()).toHaveLength(0)
    expect(client.getSnapshot()).toMatchObject({ connection: 'online', pendingOperations: 0, document: saved, recoveryDocument: null, error: undefined })
  })

  it('disposal cancels a stalled connection deadline and ignores explicit rejoin', () => {
    vi.useFakeTimers()
    const { client, sockets } = createHarness({ connectionTimeoutMs: 100, reconnectDelaysMs: [25] })
    client.dispose()
    client.reconnect?.()
    vi.advanceTimersByTime(1_000)
    expect(sockets).toHaveLength(1)
  })

  it('restores a guest identity after reload while keeping identities room-scoped', () => {
    const storage = memoryIdentityStorage()
    const reconnectToken = 'guest_reconnect_capability_987654321'
    const first = createHarness({ identityStorage: storage, clientId: undefined })
    const firstPlayerId = first.client.getSnapshot().clientId
    welcome(first.socket(), {
      playerId: firstPlayerId,
      players: [player(firstPlayerId)],
      reconnectToken,
    })
    first.client.dispose()

    const reloaded = createHarness({ identityStorage: storage, clientId: undefined })
    const reloadedUrl = new URL(reloaded.socket().url)
    expect(reloaded.client.getSnapshot().clientId).toBe(firstPlayerId)
    expect(reloadedUrl.searchParams.get('playerId')).toBe(firstPlayerId)
    expect(reloadedUrl.searchParams.get('reconnectToken')).toBe(reconnectToken)

    const otherRoom = createHarness({ roomId: 'OTHER123', identityStorage: storage, clientId: undefined })
    const otherUrl = new URL(otherRoom.socket().url)
    expect(otherRoom.client.getSnapshot().clientId).not.toBe(firstPlayerId)
    expect(otherUrl.searchParams.get('reconnectToken')).toBeNull()
    expect(hasSavedLiveRoomIdentity('ROOM1234', storage)).toBe(true)
    expect(hasSavedLiveRoomIdentity('OTHER123', storage)).toBe(false)
  })

  it('keeps owner connections on the owner capability instead of guest identity', () => {
    const storage = memoryIdentityStorage()
    const reconnectToken = 'guest_reconnect_capability_555555555'
    storage.setItem(`${LIVE_ROOM_IDENTITY_STORAGE_PREFIX}ROOM1234`, JSON.stringify({
      playerId: 'saved-guest',
      reconnectToken,
    }))

    const { client, socket } = createHarness({
      clientId: 'owner-client',
      ownerToken: 'owner-capability',
      identityStorage: storage,
    })
    const ownerUrl = new URL(socket().url)
    expect(ownerUrl.searchParams.get('playerId')).toBe('owner-client')
    expect(ownerUrl.searchParams.get('ownerToken')).toBe('owner-capability')
    expect(ownerUrl.searchParams.get('reconnectToken')).toBeNull()

    welcome(socket(), {
      playerId: 'owner-client',
      isOwner: true,
      reconnectToken: 'unexpected_guest_capability_555555',
    })
    expect(storage.entries.get(`${LIVE_ROOM_IDENTITY_STORAGE_PREFIX}ROOM1234`)).toContain(reconnectToken)
    expect(JSON.stringify(client.getSnapshot())).not.toContain(reconnectToken)
  })

  it('continues operation ids above the server high-water after a reload', () => {
    const { socket } = createHarness()
    welcome(socket(), { operationHighWater: '41' })
    useBrickStore.setState({ bricks: [brick('a')] })
    expect(socket().commandMessages()[0].opId).toBe('live-test-client#42')
  })

  it('diffs every local brick transition with monotonic opIds and consumes its own echoes', () => {
    const { client, socket } = createHarness()
    welcome(socket())
    useBrickStore.setState({ bricks: [brick('a')] })
    useBrickStore.setState({ bricks: [brick('a', { color: '#65b85a' })] })
    const commands = socket().commandMessages()
    expect(commands.map((message) => message.opId)).toEqual(['live-test-client#1', 'live-test-client#2'])
    expect(commands.map((message) => message.commands[0].op)).toEqual(['place', 'recolor'])

    const sentBeforeEcho = socket().sent.length
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: commands[0].opId, revision: 1, commands: commands[0].commands })
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: commands[1].opId, revision: 2, commands: commands[1].commands })
    expect(socket().sent).toHaveLength(sentBeforeEcho)
    expect(client.getSnapshot()).toMatchObject({ revision: 2, pendingOperations: 0 })
    expect(useBrickStore.getState().bricks[0].color).toBe('#65b85a')
  })

  it('bounds unacknowledged operations below the server dedupe window', () => {
    const { client, socket, callbacks } = createHarness()
    welcome(socket(), { document: documentWith(brick('a')) })

    for (let index = 0; index < LIVE_MAX_PENDING_OPERATIONS; index += 1) {
      useBrickStore.setState({ bricks: [brick('a', { x: 10 + index + 1 })] })
    }
    expect(client.getSnapshot().pendingOperations).toBe(LIVE_MAX_PENDING_OPERATIONS)
    expect(socket().commandMessages()).toHaveLength(LIVE_MAX_PENDING_OPERATIONS)

    useBrickStore.setState({ bricks: [brick('a', { x: 999 })] })
    expect(socket().commandMessages()).toHaveLength(LIVE_MAX_PENDING_OPERATIONS)
    expect(client.getSnapshot().pendingOperations).toBe(LIVE_MAX_PENDING_OPERATIONS)
    expect(callbacks.errors).toContain('too_many_pending_operations')
    expect(useBrickStore.getState().bricks[0].x).not.toBe(999)
  })

  it('applies remote commands without echoing and resyncs a revision gap', () => {
    const { client, socket } = createHarness()
    welcome(socket())
    useBrickStore.setState({
      undoStack: [{
        deltas: [],
        selectionBefore: [],
        selectionAfter: [],
        label: 'Local edit',
        group: null,
        recordedAt: 1,
      }],
      redoStack: [{
        deltas: [],
        selectionBefore: [],
        selectionAfter: [],
        label: 'Local redo',
        group: null,
        recordedAt: 1,
      }],
    })
    const sentBefore = socket().sent.length
    socket().receive({ v: 1, type: 'apply', from: 'peer', opId: 'peer-client#1', revision: 1, commands: [{ op: 'place', brick: brick('remote') }] })
    expect(useBrickStore.getState().bricks).toEqual([brick('remote')])
    expect(useBrickStore.getState()).toMatchObject({ undoStack: [], redoStack: [] })
    expect(socket().sent).toHaveLength(sentBefore)

    socket().receive({ v: 1, type: 'apply', from: 'peer', opId: 'peer-client#3', revision: 3, commands: [{ op: 'place', brick: brick('skipped', { x: 30, z: 30 }) }] })
    expect(client.getSnapshot().awaitingSnapshot).toBe(true)
    expect(socket().messages().at(-1)).toEqual({ v: 1, type: 'resync' })
    socket().receive({ v: 1, type: 'apply', from: 'peer', opId: 'peer-client#4', revision: 4, commands: [{ op: 'delete', id: 'remote' }] })
    expect(useBrickStore.getState().bricks).toEqual([brick('remote')])
    socket().receive({ v: 1, type: 'snapshot', revision: 4, mode: 'build', document: documentWith(brick('healed')) })
    expect(client.getSnapshot()).toMatchObject({ revision: 4, awaitingSnapshot: false })
    expect(useBrickStore.getState().bricks).toEqual([brick('healed')])
  })

  it('keeps own placement undo and redo across independent peer placements without changing peer bricks', () => {
    const { client, socket } = createHarness()
    welcome(socket())
    useBrickStore.getState().choosePart('brick_1x1')
    useBrickStore.getState().setDraftPosition(4, 0, 4)
    expect(useBrickStore.getState().placeDraft()).toBe(true)
    const ownBrick = useBrickStore.getState().bricks[0]
    const placement = socket().commandMessages()[0]
    const peerBrick = brick('peer', { x: 30, z: 30 })
    // Both builders placed before receiving the other's change.
    socket().receive({ v: 1, type: 'apply', from: 'peer', opId: 'peer#1', revision: 1, commands: [{ op: 'place', brick: peerBrick }] })
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: placement.opId, revision: 2, commands: placement.commands })
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
    useBrickStore.getState().undo()
    const undo = socket().commandMessages().at(-1)!
    expect(undo.commands).toEqual([{ op: 'delete', id: ownBrick.id }])
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: undo.opId, revision: 3, commands: undo.commands })
    expect(useBrickStore.getState().bricks).toEqual([peerBrick])

    const otherPeerBrick = brick('peer-again', { x: 40, z: 40 })
    socket().receive({ v: 1, type: 'apply', from: 'peer', opId: 'peer#2', revision: 4, commands: [{ op: 'place', brick: otherPeerBrick }] })
    expect(useBrickStore.getState().redoStack).toHaveLength(1)
    useBrickStore.getState().redo()
    const redo = socket().commandMessages().at(-1)!
    expect(redo.commands).toEqual([{ op: 'place', brick: ownBrick }])
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: redo.opId, revision: 5, commands: redo.commands })
    expect(client.getSnapshot()).toMatchObject({ revision: 5, pendingOperations: 0 })
    expect(useBrickStore.getState().bricks).toEqual([peerBrick, otherPeerBrick, ownBrick])
  })

  it('invalidates both undo and redo touching a brick a peer edits', () => {
    const { socket } = createHarness()
    welcome(socket(), { revision: 1, document: documentWith(brick('a')) })
    useBrickStore.getState().selectBrick('a')
    useBrickStore.getState().setActiveColor('#65b85a')
    const recolor = socket().commandMessages()[0]
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: recolor.opId, revision: 2, commands: recolor.commands })
    useBrickStore.getState().nudge(1, 0, 0)
    const nudge = socket().commandMessages().at(-1)!
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: nudge.opId, revision: 3, commands: nudge.commands })
    useBrickStore.getState().undo()
    const undo = socket().commandMessages().at(-1)!
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: undo.opId, revision: 4, commands: undo.commands })
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
    expect(useBrickStore.getState().redoStack).toHaveLength(1)
    const peerVersion = brick('a', { color: '#3e83d7' })
    socket().receive({ v: 1, type: 'apply', from: 'peer', opId: 'peer#1', revision: 5, commands: [{ op: 'recolor', brick: peerVersion }] })
    const beforeAttempt = socket().commandMessages().length
    useBrickStore.getState().undo()
    useBrickStore.getState().redo()
    expect(socket().commandMessages()).toHaveLength(beforeAttempt)
    expect(useBrickStore.getState()).toMatchObject({ undoStack: [], redoStack: [], bricks: [peerVersion] })
  })

  it('invalidates a whole grouped history entry when one member changes remotely while keeping unrelated history', () => {
    const { socket } = createHarness()
    const a = brick('a')
    const b = brick('b', { x: 20, z: 20 })
    welcome(socket(), { revision: 1, document: documentWith(a, b) })
    useBrickStore.getState().selectBricks(['a', 'b'])
    useBrickStore.getState().setActiveColor('#65b85a')
    const group = socket().commandMessages()[0]
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: group.opId, revision: 2, commands: group.commands })
    expect(useBrickStore.getState().undoStack[0].deltas).toHaveLength(2)
    useBrickStore.getState().choosePart('brick_1x1')
    useBrickStore.getState().setDraftPosition(4, 0, 4)
    expect(useBrickStore.getState().placeDraft()).toBe(true)
    const unrelated = socket().commandMessages().at(-1)!
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: unrelated.opId, revision: 3, commands: unrelated.commands })
    const peerVersion = { ...a, x: 12, color: '#65b85a' }
    socket().receive({ v: 1, type: 'apply', from: 'peer', opId: 'peer#1', revision: 4, commands: [{ op: 'move', brick: peerVersion }] })
    expect(useBrickStore.getState().undoStack).toHaveLength(1)
    useBrickStore.getState().undo()
    const ownUndo = socket().commandMessages().at(-1)!
    expect(ownUndo.commands).toHaveLength(1)
    expect(ownUndo.commands[0]).toMatchObject({ op: 'delete' })
    expect(useBrickStore.getState().bricks).toEqual([peerVersion, { ...b, color: '#65b85a' }])
    const beforeAttempt = socket().commandMessages().length
    useBrickStore.getState().undo()
    expect(socket().commandMessages()).toHaveLength(beforeAttempt)
  })

  it('drops full-document restore history on any remote edit even if its deltas use unrelated IDs', () => {
    const { socket } = createHarness()
    welcome(socket(), { document: documentWith(brick('a')) })
    useBrickStore.setState({
      undoStack: [{ deltas: [], selectionBefore: [], selectionAfter: [], label: 'New build', group: null, recordedAt: 1, documentBefore: documentWith() }],
      redoStack: [{ deltas: [], selectionBefore: [], selectionAfter: [], label: 'Import', group: null, recordedAt: 1, documentAfter: documentWith(brick('replacement')) }],
    })
    socket().receive({ v: 1, type: 'apply', from: 'peer', opId: 'peer#1', revision: 1, commands: [{ op: 'place', brick: brick('peer', { x: 30, z: 30 }) }] })
    expect(useBrickStore.getState()).toMatchObject({ undoStack: [], redoStack: [] })
  })

  it('rolls back a rejected optimistic change to the canonical document', () => {
    const { client, socket, callbacks } = createHarness()
    welcome(socket(), { revision: 3, document: documentWith(brick('a')) })
    useBrickStore.setState({ bricks: [brick('a'), brick('b', { x: 20, z: 20 })] })
    const operation = socket().commandMessages()[0]
    expect(client.getSnapshot().pendingOperations).toBe(1)
    socket().receive({
      v: 1,
      type: 'reject',
      opId: operation.opId,
      code: 'invalid_layout',
      message: 'A brick already occupies that space.',
      revision: 3,
      document: documentWith(brick('a')),
    })
    expect(useBrickStore.getState().bricks).toEqual([brick('a')])
    expect(client.getSnapshot()).toMatchObject({ revision: 3, pendingOperations: 0, error: { code: 'invalid_layout' } })
    expect(callbacks.documents.at(-1)?.reason).toBe('reject')
    expect(callbacks.errors).toContain('invalid_layout')
  })

  it('replays the same opId after reconnect and clears a cached duplicate ack without clobbering newer canonical state', () => {
    vi.useFakeTimers()
    const { client, sockets, socket } = createHarness({ reconnectDelaysMs: [50] })
    welcome(socket(), { revision: 1, document: documentWith(brick('a')) })
    useBrickStore.setState({ bricks: [brick('a', { color: '#65b85a' })] })
    const original = socket().commandMessages()[0]
    socket().drop()
    expect(client.getSnapshot().connection).toBe('reconnecting')
    vi.advanceTimersByTime(50)
    expect(sockets).toHaveLength(2)

    welcome(socket(), { revision: 3, document: documentWith(brick('a', { color: '#3e83d7' })) })
    expect(socket().commandMessages().at(-1)?.opId).toBe(original.opId)
    expect(useBrickStore.getState().bricks[0].color).toBe('#65b85a')

    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: original.opId, revision: 2, commands: [] })
    expect(client.getSnapshot()).toMatchObject({ revision: 3, pendingOperations: 0 })
    expect(useBrickStore.getState().bricks[0].color).toBe('#3e83d7')
  })

  it('rebases an unconfirmed move over another builder’s recolor without losing either change', () => {
    const { client, socket } = createHarness()
    welcome(socket(), { revision: 1, document: documentWith(brick('a')) })
    useBrickStore.setState({ bricks: [brick('a', { x: 20 })] })
    const move = socket().commandMessages()[0]
    socket().receive({
      v: 1, type: 'apply', from: 'peer', opId: 'peer#1', revision: 2,
      commands: [{ op: 'recolor', brick: brick('a', { color: '#65b85a' }) }],
    })
    expect(useBrickStore.getState().bricks).toEqual([brick('a', { x: 20, color: '#65b85a' })])
    socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: move.opId, revision: 3, commands: move.commands })
    expect(client.getSnapshot()).toMatchObject({ pendingOperations: 0, revision: 3 })
    expect(useBrickStore.getState().bricks).toEqual([brick('a', { x: 20, color: '#65b85a' })])
    expect(socket().commandMessages()).toHaveLength(1)
  })

  it('replays a deletion and its local undo across reconnect without erasing a peer’s new brick', () => {
    vi.useFakeTimers()
    const { client, socket } = createHarness({ reconnectDelaysMs: [25] })
    welcome(socket(), { revision: 1, document: documentWith(brick('a')) })
    useBrickStore.setState({ selectedIds: ['a'], selectedId: 'a', draft: null })
    useBrickStore.getState().deleteSelected()
    useBrickStore.getState().undo()
    const originals = socket().commandMessages()
    expect(originals.map(({ commands }) => commands[0].op)).toEqual(['delete', 'place'])
    expect(useBrickStore.getState().bricks).toEqual([brick('a')])
    socket().drop()
    vi.advanceTimersByTime(25)
    const peerBrick = brick('peer-brick', { x: 30, z: 30 })
    welcome(socket(), { revision: 2, document: documentWith(brick('a'), peerBrick) })
    expect(socket().commandMessages()).toEqual(originals)
    for (const [index, operation] of originals.entries()) {
      socket().receive({ v: 1, type: 'apply', from: 'live-test-client', opId: operation.opId, revision: 3 + index, commands: operation.commands })
    }
    expect(client.getSnapshot()).toMatchObject({ revision: 4, pendingOperations: 0 })
    expect(useBrickStore.getState().bricks).toEqual([peerBrick, brick('a')])
    // Old history is deliberately discarded when adopting the new shared world.
    const beforeUndo = socket().commandMessages().length
    useBrickStore.getState().undo()
    expect(socket().commandMessages()).toHaveLength(beforeUndo)
    expect(useBrickStore.getState().bricks).toContainEqual(peerBrick)
  })

  it('reconnects and replays the same optimistic operation when socket.send throws', () => {
    vi.useFakeTimers()
    const { client, sockets, socket, callbacks } = createHarness({ reconnectDelaysMs: [25] })
    welcome(socket(), { revision: 1, document: documentWith(brick('a')) })
    const firstSocket = socket()
    const originalSend = firstSocket.send.bind(firstSocket)
    firstSocket.send = (data) => {
      const message = JSON.parse(data) as LiveClientMessage
      if (message.type === 'commands') throw new Error('socket entered CLOSING state')
      originalSend(data)
    }

    useBrickStore.setState({ bricks: [brick('a'), brick('b', { x: 20, z: 20 })] })
    expect(client.getSnapshot()).toMatchObject({ connection: 'reconnecting', pendingOperations: 1 })
    expect(firstSocket.closed).toBe(true)
    expect(callbacks.errors).toContain('connection_error')

    vi.advanceTimersByTime(25)
    expect(sockets).toHaveLength(2)
    welcome(socket(), { revision: 1, document: documentWith(brick('a')) })
    const replay = socket().commandMessages()[0]
    expect(replay.opId).toBe('live-test-client#1')
    socket().receive({
      v: 1,
      type: 'apply',
      from: 'live-test-client',
      opId: replay.opId,
      revision: 2,
      commands: replay.commands,
    })
    expect(client.getSnapshot()).toMatchObject({ connection: 'online', revision: 2, pendingOperations: 0 })
    expect(useBrickStore.getState().bricks).toEqual([brick('a'), brick('b', { x: 20, z: 20 })])
  })

  it('forces a reconnect when an optimistic operation is never acknowledged, then rolls it back from an authoritative outcome', () => {
    vi.useFakeTimers()
    const canonical = documentWith(brick('a'))
    const { client, sockets, socket, callbacks } = createHarness({
      reconnectDelaysMs: [25],
      syncTimeoutMs: 100,
    })
    welcome(socket(), { revision: 1, document: canonical })
    useBrickStore.setState({ bricks: [brick('a'), brick('b', { x: 20, z: 20 })] })
    const operation = socket().commandMessages()[0]

    vi.advanceTimersByTime(99)
    expect(client.getSnapshot()).toMatchObject({ connection: 'online', pendingOperations: 1 })
    vi.advanceTimersByTime(1)
    expect(client.getSnapshot()).toMatchObject({ connection: 'reconnecting', pendingOperations: 1 })
    expect(callbacks.errors).toContain('sync_timeout')

    vi.advanceTimersByTime(25)
    expect(sockets).toHaveLength(2)
    welcome(socket(), { revision: 1, document: canonical })
    expect(socket().commandMessages().at(-1)?.opId).toBe(operation.opId)
    expect(useBrickStore.getState().bricks).toHaveLength(2)

    socket().receive({
      v: 1,
      type: 'snapshot',
      opId: operation.opId,
      revision: 1,
      mode: 'build',
      document: canonical,
    })
    expect(client.getSnapshot()).toMatchObject({
      connection: 'online',
      awaitingSnapshot: false,
      pendingOperations: 0,
    })
    expect(useBrickStore.getState().bricks).toEqual(canonical.bricks)

    vi.advanceTimersByTime(100)
    expect(sockets).toHaveLength(2)
  })

  it('escapes an indefinitely unanswered resync by reconnecting to a fresh welcome snapshot', () => {
    vi.useFakeTimers()
    const { client, sockets, socket, callbacks } = createHarness({
      reconnectDelaysMs: [25],
      syncTimeoutMs: 100,
    })
    welcome(socket(), { revision: 1, document: documentWith(brick('a')) })
    socket().receive({
      v: 1,
      type: 'apply',
      from: 'peer-client',
      opId: 'peer-client#3',
      revision: 3,
      commands: [{ op: 'place', brick: brick('gap') }],
    })
    expect(client.getSnapshot()).toMatchObject({ connection: 'online', awaitingSnapshot: true })
    expect(socket().messages().at(-1)).toEqual({ v: 1, type: 'resync' })

    vi.advanceTimersByTime(100)
    expect(client.getSnapshot()).toMatchObject({ connection: 'reconnecting', awaitingSnapshot: true })
    expect(callbacks.errors).toContain('sync_timeout')
    vi.advanceTimersByTime(25)

    const healed = documentWith(brick('healed'))
    welcome(socket(), { revision: 3, document: healed })
    expect(client.getSnapshot()).toMatchObject({ connection: 'online', revision: 3, awaitingSnapshot: false })
    expect(useBrickStore.getState().bricks).toEqual(healed.bricks)
    expect(sockets).toHaveLength(2)
  })

  it('clears stale cached replace and reject outcomes without regressing the newer welcome snapshot', () => {
    vi.useFakeTimers()
    const { client, sockets, socket, callbacks } = createHarness({ reconnectDelaysMs: [50] })
    welcome(socket(), { isOwner: true, revision: 1, document: documentWith(brick('a')) })
    const replacement = documentWith(brick('replacement'))
    const replaceOpId = client.replaceDocument(replacement)!
    socket().drop()
    vi.advanceTimersByTime(50)
    expect(sockets).toHaveLength(2)

    const newer = documentWith(brick('newer', { color: '#3e83d7' }))
    welcome(socket(), { isOwner: true, revision: 4, document: newer })
    socket().receive({ v: 1, type: 'snapshot', opId: replaceOpId, revision: 2, mode: 'build', document: replacement })
    expect(client.getSnapshot()).toMatchObject({ revision: 4, pendingOperations: 0 })
    expect(useBrickStore.getState().bricks).toEqual(newer.bricks)

    useBrickStore.setState({ bricks: [brick('newer', { color: '#65b85a' })] })
    const rejectedOpId = socket().commandMessages().at(-1)!.opId
    socket().drop()
    vi.advanceTimersByTime(50)
    expect(sockets).toHaveLength(3)
    const latest = documentWith(brick('latest', { x: 22, z: 22 }))
    welcome(socket(), { isOwner: true, revision: 7, document: latest })
    socket().receive({
      v: 1,
      type: 'reject',
      opId: rejectedOpId,
      code: 'invalid_layout',
      message: 'The cached operation was rejected.',
      revision: 4,
      document: newer,
    })
    expect(client.getSnapshot()).toMatchObject({ revision: 7, pendingOperations: 0, error: { code: 'invalid_layout' } })
    expect(useBrickStore.getState().bricks).toEqual(latest.bricks)
    expect(callbacks.errors).toContain('invalid_layout')
  })

  it('supports owner replace/mode/lock controls and rejects local edits during Explore', () => {
    const modes: string[] = []
    const locks: boolean[] = []
    const { client, socket } = createHarness({ onMode: (mode) => modes.push(mode), onLocked: (locked) => locks.push(locked) })
    welcome(socket(), { isOwner: true, revision: 0 })
    expect(client.setMode('explore')).toBe(true)
    expect(client.setLocked(true)).toBe(true)
    expect(socket().messages().slice(-2)).toEqual([
      { v: 1, type: 'setMode', mode: 'explore' },
      { v: 1, type: 'setLocked', locked: true },
    ])

    socket().receive({ v: 1, type: 'modeChanged', mode: 'explore', revision: 1 })
    socket().receive({ v: 1, type: 'locked', locked: true })
    expect(useBrickStore.getState().mode).toBe('explore')
    expect(modes).toEqual(['explore'])
    expect(locks).toEqual([true])
    const commandCount = socket().commandMessages().length
    useBrickStore.setState({ bricks: [brick('not-allowed')] })
    expect(socket().commandMessages()).toHaveLength(commandCount)
    expect(useBrickStore.getState().bricks).toEqual([])

    socket().receive({ v: 1, type: 'modeChanged', mode: 'build', revision: 2 })
    const replacement = documentWith(brick('replacement'))
    const opId = client.replaceDocument(replacement)
    expect(opId).toBe('live-test-client#1')
    expect(useBrickStore.getState().bricks).toEqual(replacement.bricks)
    expect(socket().messages().at(-1)).toMatchObject({ type: 'replaceDocument', opId })
    socket().receive({ v: 1, type: 'snapshot', opId: opId!, revision: 3, mode: 'build', document: replacement })
    expect(client.getSnapshot()).toMatchObject({ revision: 3, pendingOperations: 0 })
  })

  it('allows known builders to edit a join-locked room but restores disconnected edits', () => {
    vi.useFakeTimers()
    const canonical = documentWith(brick('a'))
    const { client, socket } = createHarness()
    welcome(socket(), { revision: 1, locked: true, document: canonical })
    const accepted = documentWith(brick('a', { color: '#65b85a' }))
    useBrickStore.setState({ bricks: accepted.bricks })
    const operation = socket().commandMessages()[0]
    expect(operation).toBeDefined()
    socket().receive({
      v: 1,
      type: 'apply',
      from: 'live-test-client',
      opId: operation.opId,
      revision: 2,
      commands: operation.commands,
    })
    expect(client.getSnapshot()).toMatchObject({ locked: true, pendingOperations: 0 })

    socket().drop()
    useBrickStore.setState({ bricks: [brick('offline-edit')] })
    expect(socket().commandMessages()).toHaveLength(1)
    expect(useBrickStore.getState().bricks).toEqual(accepted.bricks)
    expect(client.getSnapshot()).toMatchObject({ connection: 'reconnecting', pendingOperations: 0 })
  })

  it('reverts local mode attempts without leaking a simultaneous brick edit', () => {
    const canonical = documentWith(brick('a'))
    const { client, socket } = createHarness()
    welcome(socket(), { revision: 1, mode: 'build', document: canonical })
    useBrickStore.setState({ mode: 'explore', bricks: [brick('leaked-edit')] })
    expect(useBrickStore.getState()).toMatchObject({ mode: 'build', bricks: canonical.bricks })
    expect(socket().commandMessages()).toHaveLength(0)
    expect(client.getSnapshot()).toMatchObject({ mode: 'build', pendingOperations: 0 })
  })

  it('keeps owner controls unavailable to guests and reports presence plus remote poses', () => {
    const { client, socket, callbacks } = createHarness()
    welcome(socket())
    expect(client.setMode('explore')).toBe(false)
    expect(client.setLocked(true)).toBe(false)
    expect(client.replaceDocument(documentWith(brick('owner-only')))).toBeNull()
    socket().receive({ v: 1, type: 'players', players: [player('live-test-client'), player('peer')] })
    socket().receive({ v: 1, type: 'pose', playerId: 'peer', at: 20, x: 3, y: 1, z: 4, yaw: 0.5, moving: true, jumping: false })
    expect(callbacks.presence.at(-1)).toHaveLength(2)
    expect(callbacks.poses).toEqual([{ playerId: 'peer', x: 3 }])
  })

  it('suppresses unchanged poses, sends a final stop, heartbeats slowly, and suspends while hidden', () => {
    vi.useFakeTimers()
    let now = 1_000
    const visibility = new FakeVisibility()
    const { client, socket } = createHarness({
      now: () => now,
      visibility,
      poseIntervalMs: 100,
      poseHeartbeatMs: 1_500,
    })
    welcome(socket())
    const pose = { x: 0, y: 1, z: 0, yaw: 0, moving: true, jumping: false }
    client.sendPose(pose)
    now += 10
    client.sendPose(pose)
    expect(socket().messages().filter((message) => message.type === 'pose')).toHaveLength(1)

    client.sendPose({ ...pose, moving: false })
    let poses = socket().messages().filter((message): message is Extract<LiveClientMessage, { type: 'pose' }> => message.type === 'pose')
    expect(poses).toHaveLength(2)
    expect(poses.at(-1)?.moving).toBe(false)

    now += 1_500
    vi.advanceTimersByTime(1_500)
    poses = socket().messages().filter((message): message is Extract<LiveClientMessage, { type: 'pose' }> => message.type === 'pose')
    expect(poses).toHaveLength(3)

    now += 10
    client.sendPose({ ...pose, x: 2, moving: true })
    now += 100
    vi.advanceTimersByTime(100)
    visibility.setVisible(false)
    const hiddenCount = socket().messages().filter((message) => message.type === 'pose').length
    client.sendPose({ ...pose, x: 4, moving: true })
    now += 5_000
    vi.advanceTimersByTime(5_000)
    expect(socket().messages().filter((message) => message.type === 'pose')).toHaveLength(hiddenCount)
    expect((socket().messages().filter((message) => message.type === 'pose').at(-1) as Extract<LiveClientMessage, { type: 'pose' }>).moving).toBe(false)
  })
})

it('requests a fresh classroom ticket and stops reconnecting after access revocation', async () => {
  const getTicket = vi.fn().mockResolvedValue('short-lived-ticket')
  const { sockets, socket, client } = createHarness({ getTicket })
  expect(sockets).toHaveLength(0)
  await Promise.resolve()
  expect(new URL(socket().url).searchParams.get('ticket')).toBe('short-lived-ticket')
  welcome(socket())
  ;(socket() as LiveRoomSocketLike).onclose?.({ code: 4003 })
  expect(client.getSnapshot().connection).toBe('offline')
  expect(client.getSnapshot().error?.code).toBe('access_changed')
  expect(getTicket).toHaveBeenCalledTimes(1)
})

it('rechecks classroom access on explicit rejoin and does not reuse a revoked ticket', async () => {
  vi.useFakeTimers()
  const getTicket = vi.fn().mockResolvedValueOnce('first-ticket').mockRejectedValueOnce(Object.assign(new Error('access revoked'), { status: 403 }))
  const { client, socket, sockets } = createHarness({ getTicket, reconnectDelaysMs: [25] })
  await Promise.resolve()
  welcome(socket())
  socket().drop(4003)
  vi.advanceTimersByTime(60_000)
  expect(getTicket).toHaveBeenCalledTimes(1)
  client.reconnect?.()
  client.reconnect?.()
  await Promise.resolve()
  await Promise.resolve()
  expect(getTicket).toHaveBeenCalledTimes(2)
  expect(sockets).toHaveLength(1)
  expect(client.getSnapshot()).toMatchObject({ connection: 'offline', error: { code: 'access_changed' } })
})

it.each([undefined, 429, 500, 503])('keeps a temporary classroom ticket failure (%s) recoverable without losing its draft', async (status) => {
  const failure = Object.assign(new Error('temporarily unavailable'), { status })
  const getTicket = vi.fn().mockResolvedValueOnce('first-ticket').mockRejectedValueOnce(failure).mockResolvedValueOnce('fresh-ticket')
  const { client, socket, sockets } = createHarness({ getTicket })
  await Promise.resolve()
  welcome(socket())
  useBrickStore.setState({ bricks: [brick('unconfirmed')] })
  socket().drop(4001)
  client.reconnect?.()
  await Promise.resolve()
  await Promise.resolve()
  expect(client.getSnapshot()).toMatchObject({ connection: 'offline', error: { code: 'connection_error' }, recoveryDocument: documentWith(brick('unconfirmed')) })
  client.reconnect?.()
  await Promise.resolve()
  expect(sockets).toHaveLength(2)
  expect(new URL(socket().url).searchParams.get('ticket')).toBe('fresh-ticket')
  welcome(socket())
  expect(client.getSnapshot()).toMatchObject({ connection: 'online', recoveryDocument: documentWith(brick('unconfirmed')), error: { code: 'changes_need_review' } })
})

it('keeps a true unauthorized classroom ticket response blocked while retaining its recovery copy', async () => {
  const getTicket = vi.fn().mockResolvedValueOnce('first-ticket').mockRejectedValueOnce(Object.assign(new Error('sign in required'), { status: 401 }))
  const { client, socket, sockets } = createHarness({ getTicket })
  await Promise.resolve()
  welcome(socket())
  useBrickStore.setState({ bricks: [brick('unconfirmed')] })
  socket().drop(4001)
  client.reconnect?.()
  await Promise.resolve()
  await Promise.resolve()
  expect(sockets).toHaveLength(1)
  expect(client.getSnapshot()).toMatchObject({ connection: 'offline', error: { code: 'classroom_auth_required' }, recoveryDocument: documentWith(brick('unconfirmed')) })
})

it('does not open a socket if disposed while classroom authorization is pending', async () => {
  let grant!: (ticket: string) => void
  const { client, sockets } = createHarness({ getTicket: () => new Promise(resolve => { grant = resolve }) })
  client.dispose()
  grant('expired-before-open')
  await Promise.resolve()
  expect(sockets).toHaveLength(0)
})
