import {
  createLiveRoomClient,
  type LiveRoomClient,
  type LiveRoomClientOptions,
  type LiveRoomSnapshot as ClientSnapshot,
} from '../liveRoomClient'
import {
  createInitialLiveRoomSnapshot,
  type ConnectLiveRoom,
  type LiveRoomRemotePose,
  type LiveRoomSnapshot,
} from './liveRoomModel'

export type LiveRoomClientFactory = (options: LiveRoomClientOptions) => LiveRoomClient

function samePlayers(first: LiveRoomSnapshot['players'], second: LiveRoomSnapshot['players']) {
  return first === second
}

/**
 * Adapts the transport/store-oriented live client to the cached UI controller
 * consumed by `useSyncExternalStore`.
 */
export function createLiveRoomConnector(
  createClient: LiveRoomClientFactory = createLiveRoomClient,
): ConnectLiveRoom {
  return (options) => {
    let disconnected = false
    let client: LiveRoomClient | null = null
    let noticeSequence = 0
    let snapshot = createInitialLiveRoomSnapshot(options.roomId, Boolean(options.ownerToken))
    const poses = new Map<string, LiveRoomRemotePose>()
    const listeners = new Set<() => void>()

    const emit = () => {
      for (const listener of [...listeners]) listener()
    }

    const commit = (next: LiveRoomSnapshot) => {
      if (disconnected || next === snapshot) return
      snapshot = next
      emit()
    }

    const adoptClientSnapshot = (source: ClientSnapshot) => {
      if (disconnected) return

      const connectedPlayerIds = new Set(source.players.map((player) => player.playerId))
      let posesChanged = false
      for (const playerId of poses.keys()) {
        if (playerId === source.clientId || !connectedPlayerIds.has(playerId)) {
          poses.delete(playerId)
          posesChanged = true
        }
      }
      const remotePoses = posesChanged ? [...poses.values()] : snapshot.remotePoses
      const syncing = source.document === null || source.awaitingSnapshot
      // `reconnecting` is a transient transport notice. The status chip announces
      // the online recovery, so do not leave the old warning over a healthy room.
      // All server/rejection errors remain visible until the user dismisses them.
      const notice = source.connection === 'online' && snapshot.notice?.code === 'reconnecting'
        ? null
        : snapshot.notice

      if (
        source.connection === snapshot.connection
        && syncing === snapshot.syncing
        && source.roomId === snapshot.roomId
        && source.clientId === snapshot.selfPlayerId
        && source.isOwner === snapshot.isOwner
        && source.revision === snapshot.revision
        && source.mode === snapshot.mode
        && source.locked === snapshot.locked
        && source.document === snapshot.document
        && samePlayers(source.players, snapshot.players)
        && remotePoses === snapshot.remotePoses
        && notice === snapshot.notice
      ) return

      commit({
        ...snapshot,
        connection: source.connection,
        syncing,
        roomId: source.roomId,
        selfPlayerId: source.clientId,
        isOwner: source.isOwner,
        revision: source.revision,
        mode: source.mode,
        locked: source.locked,
        document: source.document,
        players: source.players,
        remotePoses,
        notice,
      })
    }

    const receivePose = (pose: LiveRoomRemotePose) => {
      if (
        disconnected
        || pose.playerId === snapshot.selfPlayerId
        || !snapshot.players.some((player) => player.playerId === pose.playerId)
      ) return
      const nextPose = { ...pose }
      poses.set(nextPose.playerId, nextPose)
      commit({ ...snapshot, remotePoses: [...poses.values()] })
    }

    const receiveError = (error: { code: string; message: string }) => {
      if (disconnected) return
      commit({
        ...snapshot,
        notice: { seq: ++noticeSequence, code: error.code, message: error.message },
      })
    }

    client = createClient({
      ...options,
      onStatus: adoptClientSnapshot,
      onPose: receivePose,
      onError: receiveError,
    })
    adoptClientSnapshot(client.getSnapshot())

    return {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        if (disconnected) return () => {}
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      actions: {
        setMode: (mode) => { if (!disconnected) client?.setMode(mode) },
        setLocked: (locked) => { if (!disconnected) client?.setLocked(locked) },
        setProfile: (profile) => { if (!disconnected) client?.setProfile(profile) },
        sendPose: (pose) => { if (!disconnected) client?.sendPose(pose) },
        requestResync: () => { if (!disconnected) client?.requestResync() },
      },
      disconnect: () => {
        if (disconnected) return
        disconnected = true
        listeners.clear()
        const activeClient = client
        client = null
        activeClient?.dispose()
      },
    }
  }
}

/** Production connector backed by the Cloudflare live-world client. */
export const defaultConnectLiveRoom: ConnectLiveRoom = createLiveRoomConnector()
