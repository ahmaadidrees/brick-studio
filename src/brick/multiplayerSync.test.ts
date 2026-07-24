import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyWireCommands,
  buildRemotePatch,
  classifyBrickChange,
  createMultiplayerClient,
  diffBricksToCommands,
  getMultiplayerRoomCode,
  type ClientMessage,
  type MultiplayerClient,
  type MultiplayerClientOptions,
  type MultiplayerSocketLike,
  type WireCommand,
} from './multiplayerSync'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'

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
  return { id, partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#e7473c', ...overrides }
}

function placeAt(x: number, z: number, partId = 'brick_1x1') {
  useBrickStore.getState().choosePart(partId)
  useBrickStore.getState().setDraftPosition(x, 0, z)
  return useBrickStore.getState().placeDraft()
}

class FakeSocket implements MultiplayerSocketLike {
  url: string
  sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
    this.onclose?.()
  }

  open() {
    this.onopen?.()
  }

  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  /** Server-side drop (close not initiated by the client). */
  drop() {
    this.onclose?.()
  }

  sentMessages(): ClientMessage[] {
    return this.sent.map((raw) => JSON.parse(raw) as ClientMessage)
  }

  sentCommandOps(): string[][] {
    return this.sentMessages()
      .filter((message) => message.type === 'commands')
      .map((message) => (message as Extract<ClientMessage, { type: 'commands' }>).commands.map((command) => command.op))
  }
}

const activeClients: MultiplayerClient[] = []

function createHarness(overrides: Partial<MultiplayerClientOptions> = {}) {
  const sockets: FakeSocket[] = []
  const client = createMultiplayerClient({
    room: 'ABC',
    store: useBrickStore,
    clientId: 'builder-test-1',
    createSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
    ...overrides,
  })
  activeClients.push(client)
  return { client, sockets, socket: () => sockets.at(-1)! }
}

function openWithWelcome(socket: FakeSocket, overrides: Record<string, unknown> = {}) {
  socket.open()
  socket.receive({ v: 1, type: 'welcome', room: 'ABC', revision: 0, snapshot: [], peers: 1, ...overrides })
}

beforeEach(() => {
  vi.useRealTimers()
  resetStore()
})

afterEach(() => {
  while (activeClients.length) activeClients.pop()!.dispose()
  vi.useRealTimers()
})

describe('room code parsing', () => {
  it('is inert without a valid ?room parameter', () => {
    expect(getMultiplayerRoomCode('')).toBeNull()
    expect(getMultiplayerRoomCode('?other=1')).toBeNull()
    expect(getMultiplayerRoomCode('?room=')).toBeNull()
    expect(getMultiplayerRoomCode('?room=not%20a%20room')).toBeNull()
    expect(getMultiplayerRoomCode('?room=WAYTOOLONGROOMCODE')).toBeNull()
  })

  it('normalizes valid codes to uppercase', () => {
    expect(getMultiplayerRoomCode('?room=abc')).toBe('ABC')
    expect(getMultiplayerRoomCode('?room=Class42')).toBe('CLASS42')
    expect(getMultiplayerRoomCode('?mode=build&room=zz9')).toBe('ZZ9')
  })
})

describe('command derivation by diffing', () => {
  it('classifies single-field changes and collapses mixed edits into update', () => {
    const before = brick('a')
    expect(classifyBrickChange(before, { ...before, x: 12 })).toBe('move')
    expect(classifyBrickChange(before, { ...before, y: 3 })).toBe('move')
    expect(classifyBrickChange(before, { ...before, rotation: 1 })).toBe('rotate')
    expect(classifyBrickChange(before, { ...before, color: '#3e83d7' })).toBe('recolor')
    expect(classifyBrickChange(before, { ...before, x: 12, color: '#3e83d7' })).toBe('update')
    expect(classifyBrickChange(before, { ...before, partId: 'brick_1x1' })).toBe('update')
  })

  it('emits deletes, then changes, then places, and ignores pure reorders', () => {
    const a = brick('a', { x: 0, z: 0 })
    const b = brick('b', { x: 20, z: 20 })
    const c = brick('c', { x: 40, z: 40 })
    expect(diffBricksToCommands([a, b], [b, a])).toEqual([])
    expect(diffBricksToCommands([a, b], [{ ...b, x: 22 }, c])).toEqual([
      { op: 'delete', id: 'a' },
      { op: 'move', brick: { ...b, x: 22 } },
      { op: 'place', brick: c },
    ])
  })
})

describe('applying wire commands', () => {
  it('upserts non-delete ops in place and treats deletes as idempotent', () => {
    const a = brick('a', { x: 0, z: 0 })
    const b = brick('b', { x: 20, z: 20 })
    const commands: WireCommand[] = [
      { op: 'recolor', brick: { ...b, color: '#65b85a' } },
      { op: 'place', brick: brick('c', { x: 40, z: 40 }) },
      { op: 'delete', id: 'a' },
      { op: 'delete', id: 'never-existed' },
    ]
    expect(applyWireCommands([a, b], commands).map((entry) => entry.id)).toEqual(['b', 'c'])
    // Upsert convergence: replaying a place over an existing id replaces it.
    expect(applyWireCommands([a], [{ op: 'place', brick: { ...a, color: '#65b85a' } }])).toEqual([{ ...a, color: '#65b85a' }])
  })

  it('prunes dead selections and cancels a move whose brick vanished', () => {
    const next = [brick('kept')]
    const patch = buildRemotePatch(
      { selectedIds: ['kept', 'gone'], selectedId: 'gone', movingId: 'gone' },
      next,
    )
    expect(patch.selectedIds).toEqual(['kept'])
    expect(patch.selectedId).toBe('kept')
    expect(patch.movingId).toBeNull()
    expect(patch.draft).toBeNull()
  })
})

describe('multiplayer client', () => {
  it('says hello when the socket opens and goes online on welcome', () => {
    const { client, socket } = createHarness()
    expect(client.status().connection).toBe('connecting')
    openWithWelcome(socket(), { revision: 4, snapshot: [brick('a')], peers: 2 })
    expect(socket().sentMessages()[0]).toEqual({ v: 1, type: 'hello', room: 'ABC', clientId: 'builder-test-1' })
    expect(client.status()).toMatchObject({ connection: 'online', peers: 2, revision: 4 })
    expect(useBrickStore.getState().bricks).toEqual([brick('a')])
  })

  it('replaces unsent local bricks with the authoritative snapshot (server-order-wins)', () => {
    const { socket } = createHarness()
    expect(placeAt(2, 2)).toBe(true)
    openWithWelcome(socket(), { revision: 5, snapshot: [brick('remote')] })
    expect(useBrickStore.getState().bricks).toEqual([brick('remote')])
    expect(socket().sentCommandOps()).toEqual([])
  })

  it('seeds an empty room from the local build', () => {
    expect(placeAt(2, 2)).toBe(true)
    expect(placeAt(30, 30)).toBe(true)
    const { socket } = createHarness()
    openWithWelcome(socket())
    expect(socket().sentCommandOps()).toEqual([['place', 'place']])
    expect(useBrickStore.getState().bricks).toHaveLength(2)
  })

  it('turns every local mutation path into classified command batches', () => {
    const { socket } = createHarness()
    openWithWelcome(socket())
    expect(placeAt(2, 2)).toBe(true)
    useBrickStore.getState().rotate()
    useBrickStore.getState().setActiveColor('#65b85a')
    useBrickStore.getState().nudge(1, 0, 0)
    useBrickStore.getState().undo()
    useBrickStore.getState().deleteSelected()
    expect(socket().sentCommandOps()).toEqual([['place'], ['rotate'], ['recolor'], ['move'], ['move'], ['delete']])
  })

  it('applies remote commands without echoing them back', () => {
    const { socket } = createHarness()
    openWithWelcome(socket())
    const sentBefore = socket().sent.length
    socket().receive({ v: 1, type: 'apply', from: 'builder-peer-2', revision: 1, commands: [{ op: 'place', brick: brick('remote') }] })
    expect(useBrickStore.getState().bricks).toEqual([brick('remote')])
    expect(socket().sent.length).toBe(sentBefore)
  })

  it('skips its own rebroadcast but still advances the revision', () => {
    const { client, socket } = createHarness()
    openWithWelcome(socket())
    expect(placeAt(2, 2)).toBe(true)
    const localBricks = useBrickStore.getState().bricks
    const sent = socket().sentMessages().find((message) => message.type === 'commands') as Extract<ClientMessage, { type: 'commands' }>
    socket().receive({ v: 1, type: 'apply', from: 'builder-test-1', revision: 1, commands: sent.commands })
    expect(useBrickStore.getState().bricks).toBe(localBricks)
    expect(client.status().revision).toBe(1)
  })

  it('requests a resync on a revision gap and resumes after the snapshot', () => {
    const { client, socket } = createHarness()
    openWithWelcome(socket())
    socket().receive({ v: 1, type: 'apply', from: 'builder-peer-2', revision: 3, commands: [{ op: 'place', brick: brick('skipped') }] })
    expect(socket().sentMessages().some((message) => message.type === 'resync')).toBe(true)
    expect(useBrickStore.getState().bricks).toEqual([])

    // Applies that race the snapshot are ignored; the snapshot then heals.
    socket().receive({ v: 1, type: 'apply', from: 'builder-peer-2', revision: 4, commands: [{ op: 'place', brick: brick('also-skipped') }] })
    socket().receive({ v: 1, type: 'snapshot', revision: 4, snapshot: [brick('healed')] })
    expect(useBrickStore.getState().bricks).toEqual([brick('healed')])
    expect(client.status().revision).toBe(4)
    socket().receive({ v: 1, type: 'apply', from: 'builder-peer-2', revision: 5, commands: [{ op: 'recolor', brick: brick('healed', { color: '#65b85a' }) }] })
    expect(useBrickStore.getState().bricks[0].color).toBe('#65b85a')
  })

  it('rolls back an optimistic change when the relay rejects it', () => {
    const { client, socket } = createHarness()
    openWithWelcome(socket(), { revision: 3, snapshot: [brick('a')] })
    expect(placeAt(30, 30)).toBe(true)
    expect(useBrickStore.getState().bricks).toHaveLength(2)
    socket().receive({ v: 1, type: 'reject', code: 'overlap', message: 'nope', revision: 3, snapshot: [brick('a')] })
    expect(useBrickStore.getState().bricks).toEqual([brick('a')])
    expect(useBrickStore.getState().selectedIds).toEqual([])
    expect(useBrickStore.getState().toast).toContain('A friend built there first')
    expect(client.status().revision).toBe(3)
  })

  it('cancels an in-flight move when a friend deletes that brick', () => {
    const { socket } = createHarness()
    openWithWelcome(socket(), { revision: 1, snapshot: [brick('a')] })
    useBrickStore.getState().selectBrick('a')
    useBrickStore.getState().startMove()
    expect(useBrickStore.getState().movingId).toBe('a')
    socket().receive({ v: 1, type: 'apply', from: 'builder-peer-2', revision: 2, commands: [{ op: 'delete', id: 'a' }] })
    const state = useBrickStore.getState()
    expect(state.bricks).toEqual([])
    expect(state.movingId).toBeNull()
    expect(state.draft).toBeNull()
    expect(state.selectedIds).toEqual([])
  })

  it('announces friends joining and leaving', () => {
    const { client, socket } = createHarness()
    openWithWelcome(socket())
    socket().receive({ v: 1, type: 'peers', peers: 2 })
    expect(client.status().peers).toBe(2)
    expect(useBrickStore.getState().toast).toContain('A friend joined!')
    socket().receive({ v: 1, type: 'peers', peers: 1 })
    expect(useBrickStore.getState().toast).toContain('A builder left')
  })

  it('stops syncing and closes the socket on dispose', () => {
    const { client, socket } = createHarness()
    openWithWelcome(socket())
    client.dispose()
    expect(socket().closed).toBe(true)
    expect(client.status().connection).toBe('offline')
    const sentBefore = socket().sent.length
    expect(placeAt(2, 2)).toBe(true)
    expect(socket().sent.length).toBe(sentBefore)
  })

  it('reconnects with backoff and rejoins after a drop', () => {
    vi.useFakeTimers()
    const { client, sockets, socket } = createHarness({ reconnectDelaysMs: [1000, 2000] })
    openWithWelcome(socket())
    socket().drop()
    expect(client.status().connection).toBe('reconnecting')
    expect(useBrickStore.getState().toast).toContain('Connection lost')

    vi.advanceTimersByTime(999)
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)
    openWithWelcome(socket(), { revision: 7, snapshot: [brick('after-drop')] })
    expect(client.status()).toMatchObject({ connection: 'online', revision: 7 })
    expect(useBrickStore.getState().bricks).toEqual([brick('after-drop')])
  })
})
