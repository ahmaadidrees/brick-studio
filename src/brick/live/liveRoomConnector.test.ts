import { describe, expect, it, vi } from 'vitest'
import { createBrickStudioDocument } from '../brickDocument'
import {
  type LiveRoomClient,
  type LiveRoomClientOptions,
  type LiveRoomSnapshot as ClientSnapshot,
} from '../liveRoomClient'
import type { LivePlayer, LivePose } from '../liveProtocol'
import { createLiveRoomConnector } from './liveRoomConnector'

function player(playerId: string, isOwner = false): LivePlayer {
  return { playerId, isOwner, profile: { displayName: playerId } }
}

function createClientHarness(overrides: Partial<ClientSnapshot> = {}) {
  const document = createBrickStudioDocument([])
  let snapshot: ClientSnapshot = {
    roomId: 'ROOM1234',
    clientId: 'self-player',
    connection: 'online',
    revision: 4,
    mode: 'build',
    locked: false,
    isOwner: false,
    players: [player('self-player'), player('friend-player')],
    document,
    pendingOperations: 0,
    awaitingSnapshot: false,
    ...overrides,
  }
  let options: LiveRoomClientOptions | undefined
  const calls = {
    modes: [] as Array<'build' | 'explore'>,
    locked: [] as boolean[],
    profiles: [] as Array<{ displayName: string }>,
    poses: [] as LivePose[],
    resync: 0,
    reconnect: 0,
    dispose: 0,
  }
  const client: LiveRoomClient = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    setProfile: (profile) => { calls.profiles.push(profile); return true },
    setMode: (mode) => { calls.modes.push(mode); return true },
    setLocked: (locked) => { calls.locked.push(locked); return true },
    replaceDocument: () => null,
    sendPose: (pose) => { calls.poses.push(pose) },
    requestResync: () => { calls.resync += 1; return true },
    reconnect: () => { calls.reconnect += 1 },
    dispose: () => {
      calls.dispose += 1
      options?.onStatus?.({ ...snapshot, connection: 'offline' })
    },
  }
  const createClient = vi.fn((nextOptions: LiveRoomClientOptions) => {
    options = nextOptions
    return client
  })
  return {
    calls,
    createClient,
    emitStatus: (patch: Partial<ClientSnapshot>) => {
      snapshot = { ...snapshot, ...patch }
      options?.onStatus?.(snapshot)
    },
    emitPose: (pose: Parameters<NonNullable<LiveRoomClientOptions['onPose']>>[0]) => options?.onPose?.(pose),
    emitError: (code: string, message: string) => options?.onError?.({ code, message }),
    emitDiagnostic: (event: Parameters<NonNullable<LiveRoomClientOptions['onDiagnostic']>>[0], details: Parameters<NonNullable<LiveRoomClientOptions['onDiagnostic']>>[1]) => options?.onDiagnostic?.(event, details),
  }
}

describe('live room controller adapter', () => {
  it('maps the client snapshot once and delegates every UI action', () => {
    const harness = createClientHarness({ isOwner: true, awaitingSnapshot: true })
    const connect = createLiveRoomConnector(harness.createClient)
    const controller = connect({
      roomId: 'ROOM1234',
      ownerToken: 'owner-secret',
      profile: { displayName: 'Ada' },
    })

    const first = controller.getSnapshot()
    expect(first).toMatchObject({
      roomId: 'ROOM1234',
      selfPlayerId: 'self-player',
      isOwner: true,
      revision: 4,
      syncing: true,
      pendingOperations: 0,
      connection: 'online',
      remotePoses: [],
    })
    expect(controller.getSnapshot()).toBe(first)
    expect(harness.createClient).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'ROOM1234',
      ownerToken: 'owner-secret',
      profile: { displayName: 'Ada' },
    }))

    const pose: LivePose = { x: 1, y: 2, z: 3, yaw: 0.5, moving: true, jumping: false }
    controller.actions.setMode('explore')
    controller.actions.setLocked(true)
    controller.actions.setProfile({ displayName: 'Grace' })
    controller.actions.sendPose(pose)
    controller.actions.requestResync()
    controller.actions.reconnect?.()

    expect(harness.calls).toMatchObject({
      modes: ['explore'],
      locked: [true],
      profiles: [{ displayName: 'Grace' }],
      poses: [pose],
      resync: 1,
      reconnect: 1,
    })
  })

  it('publishes latest remote poses and removes poses when players depart', () => {
    const harness = createClientHarness()
    const controller = createLiveRoomConnector(harness.createClient)({
      roomId: 'ROOM1234',
      profile: { displayName: 'Ada' },
    })
    const listener = vi.fn()
    controller.subscribe(listener)

    harness.emitPose({
      playerId: 'friend-player',
      at: 10,
      x: 1,
      y: 2,
      z: 3,
      yaw: 0,
      moving: true,
      jumping: false,
    })
    harness.emitPose({
      playerId: 'friend-player',
      at: 11,
      x: 5,
      y: 2,
      z: 3,
      yaw: 1,
      moving: false,
      jumping: false,
    })
    harness.emitPose({
      playerId: 'unknown-player',
      at: 12,
      x: 9,
      y: 9,
      z: 9,
      yaw: 0,
      moving: false,
      jumping: false,
    })

    expect(controller.getSnapshot().remotePoses).toEqual([
      expect.objectContaining({ playerId: 'friend-player', at: 11, x: 5 }),
    ])
    expect(listener).toHaveBeenCalledTimes(2)

    harness.emitStatus({ players: [player('self-player')] })
    expect(controller.getSnapshot().remotePoses).toEqual([])
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('turns every client error into a new monotonic notice without replaying it on status changes', () => {
    const harness = createClientHarness()
    const controller = createLiveRoomConnector(harness.createClient)({
      roomId: 'ROOM1234',
      profile: { displayName: 'Ada' },
    })

    harness.emitError('room_busy', 'Wait for sync.')
    const firstNotice = controller.getSnapshot().notice
    expect(firstNotice).toEqual({ seq: 1, code: 'room_busy', message: 'Wait for sync.' })

    harness.emitStatus({ awaitingSnapshot: true, error: { code: 'room_busy', message: 'Wait for sync.' } })
    expect(controller.getSnapshot().notice).toBe(firstNotice)

    harness.emitError('room_busy', 'Wait for sync.')
    expect(controller.getSnapshot().notice).toEqual({ seq: 2, code: 'room_busy', message: 'Wait for sync.' })
  })

  it('clears a stale reconnect warning on recovery but preserves real errors', () => {
    const harness = createClientHarness()
    const controller = createLiveRoomConnector(harness.createClient)({
      roomId: 'ROOM1234',
      profile: { displayName: 'Ada' },
    })
    const listener = vi.fn()
    controller.subscribe(listener)

    harness.emitStatus({ connection: 'reconnecting' })
    harness.emitError('reconnecting', 'Connection lost. Rejoining the live world…')
    expect(controller.getSnapshot()).toMatchObject({
      connection: 'reconnecting',
      notice: { seq: 1, code: 'reconnecting' },
    })

    harness.emitStatus({ connection: 'online' })
    expect(controller.getSnapshot()).toMatchObject({ connection: 'online', notice: null })

    harness.emitError('edit_rejected', 'That brick was changed by another builder.')
    harness.emitStatus({ connection: 'online', revision: 5 })
    expect(controller.getSnapshot().notice).toEqual({
      seq: 2,
      code: 'edit_rejected',
      message: 'That brick was changed by another builder.',
    })
    expect(listener).toHaveBeenCalledTimes(5)
  })

  it('clears takeover notices only after rejoin succeeds and exports sanitized diagnostics', () => {
    const harness = createClientHarness()
    const controller = createLiveRoomConnector(harness.createClient)({ roomId: 'ROOM1234', profile: { displayName: 'Ada' } })
    harness.emitStatus({ connection: 'offline' })
    harness.emitError('session_replaced', 'This room is open in another tab or device.')
    harness.emitDiagnostic('socket_close', { closeCode: 4001 })
    harness.emitDiagnostic('error', { code: 'session_replaced' })
    controller.actions.reconnect?.()
    harness.emitStatus({ connection: 'connecting' })
    expect(controller.getSnapshot().notice?.code).toBe('session_replaced')
    harness.emitStatus({ connection: 'online' })
    expect(controller.getSnapshot().notice).toBeNull()
    expect(harness.createClient).toHaveBeenCalledOnce()
    const report = controller.actions.exportDiagnostics?.() ?? ''
    expect(report).toContain('4001')
    expect(report).toContain('session_replaced')
    expect(report).not.toContain('ROOM1234')
    expect(report).not.toContain('Ada')
  })

  it('disconnects idempotently and ignores late callbacks or actions', () => {
    const harness = createClientHarness()
    const controller = createLiveRoomConnector(harness.createClient)({
      roomId: 'ROOM1234',
      profile: { displayName: 'Ada' },
    })
    const listener = vi.fn()
    controller.subscribe(listener)
    const beforeDisconnect = controller.getSnapshot()

    controller.disconnect()
    controller.disconnect()
    harness.emitError('late', 'Too late')
    harness.emitPose({
      playerId: 'friend-player', at: 20, x: 1, y: 1, z: 1,
      yaw: 0, moving: false, jumping: false,
    })
    controller.actions.setMode('explore')
    controller.actions.sendPose({ x: 1, y: 1, z: 1, yaw: 0, moving: false, jumping: false })
    controller.actions.reconnect?.()

    expect(harness.calls.dispose).toBe(1)
    expect(harness.calls.modes).toEqual([])
    expect(harness.calls.poses).toEqual([])
    expect(harness.calls.reconnect).toBe(0)
    expect(controller.getSnapshot()).toBe(beforeDisconnect)
    expect(listener).not.toHaveBeenCalled()
  })
})
