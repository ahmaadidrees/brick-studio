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
  LIVE_MAX_PENDING_OPERATIONS,
  type LiveRoomClient,
  type LiveRoomClientOptions,
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
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly url: string) {}

  send(data: string) { this.sent.push(data) }
  close() { this.closed = true; this.onclose?.() }
  open() { this.onopen?.() }
  drop() { this.onclose?.() }
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

function welcome(socket: FakeSocket, overrides: Partial<Extract<LiveServerMessage, { type: 'welcome' }>> = {}) {
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
  })
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
