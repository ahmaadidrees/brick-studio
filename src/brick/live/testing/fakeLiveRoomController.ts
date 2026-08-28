import type { LiveWorldMode } from '../../liveProtocol'
import type { LivePose } from '../../liveProtocol'
import type { PlayerProfile } from '../../types'
import {
  createInitialLiveRoomSnapshot,
  type ConnectLiveRoom,
  type ConnectLiveRoomOptions,
  type LiveRoomController,
  type LiveRoomSnapshot,
} from '../liveRoomModel'

export type FakeLiveRoomCalls = {
  setMode: LiveWorldMode[]
  setLocked: boolean[]
  setProfile: PlayerProfile[]
  sendPose: LivePose[]
  resync: number
  reconnect: number
  disconnect: number
}

export type FakeLiveRoom = {
  controller: LiveRoomController
  connectOptions: ConnectLiveRoomOptions
  /** Applies a snapshot patch and notifies subscribers (wrap in `act` inside React tests). */
  emit: (patch: Partial<LiveRoomSnapshot>) => void
  calls: FakeLiveRoomCalls
}

export type FakeLiveRoomConnector = {
  connect: ConnectLiveRoom
  rooms: FakeLiveRoom[]
}

/**
 * In-memory `ConnectLiveRoom` for tests and demos: it never opens a socket
 * and speaks no wire protocol, it only replays UI snapshots on demand while
 * recording every action the HUD raises.
 */
export function createFakeLiveRoomConnector(initial: Partial<LiveRoomSnapshot> = {}): FakeLiveRoomConnector {
  const rooms: FakeLiveRoom[] = []
  const connect: ConnectLiveRoom = (options) => {
    let snapshot: LiveRoomSnapshot = {
      ...createInitialLiveRoomSnapshot(options.roomId, Boolean(options.ownerToken)),
      ...initial,
    }
    const listeners = new Set<() => void>()
    const calls: FakeLiveRoomCalls = { setMode: [], setLocked: [], setProfile: [], sendPose: [], resync: 0, reconnect: 0, disconnect: 0 }
    const controller: LiveRoomController = {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      actions: {
        setMode: (mode) => { calls.setMode.push(mode) },
        setLocked: (locked) => { calls.setLocked.push(locked) },
        setProfile: (profile) => { calls.setProfile.push(profile) },
        sendPose: (pose) => { calls.sendPose.push(pose) },
        requestResync: () => { calls.resync += 1 },
        reconnect: () => { calls.reconnect += 1 },
      },
      disconnect: () => { calls.disconnect += 1 },
    }
    rooms.push({
      controller,
      connectOptions: options,
      emit: (patch) => {
        snapshot = { ...snapshot, ...patch }
        listeners.forEach((listener) => listener())
      },
      calls,
    })
    return controller
  }
  return { connect, rooms }
}
