import type { RemoteRaceAvatar } from '../BrickStudioScene'
import { resolveCharacterId } from '../contentCatalog'
import type { RemoteAvatarSource } from '../remoteAvatarSource'
import { livePlayerColor, type LiveRoomController, type LiveRoomSnapshot, type LiveRoomUiSnapshot } from './liveRoomModel'

/**
 * Two cached views of the same controller. Room state drives the editor and
 * its access gates; transient movement drives only the avatar layer.
 * Neither view changes the transport, document store, or subscription lifetime.
 */
export function createLiveRoomViewStore(controller: LiveRoomController) {
  let previousRoomSource: LiveRoomSnapshot | null = null
  let roomSnapshot: LiveRoomUiSnapshot
  let previousPlayers: LiveRoomSnapshot['players'] | undefined
  let previousPoses: LiveRoomSnapshot['remotePoses'] | undefined
  let avatars: RemoteRaceAvatar[] = []

  const getSnapshot = (): LiveRoomUiSnapshot => {
    const source = controller.getSnapshot()
    if (source !== previousRoomSource) {
      // Include every non-pose field, including new room state added later.
      // In particular, reconnect and access-revocation notices must never wait
      // for a document or roster update to reach the page.
      const changed = !previousRoomSource || (Object.keys(source) as (keyof LiveRoomSnapshot)[])
        .some((key) => key !== 'remotePoses' && source[key] !== previousRoomSource![key])
      if (changed) {
        const { remotePoses: _remotePoses, ...next } = source
        roomSnapshot = next
      }
      previousRoomSource = source
    }
    return roomSnapshot
  }

  const remoteAvatarSource: RemoteAvatarSource = {
    subscribe: controller.subscribe,
    getSnapshot: () => {
      const { players, remotePoses } = controller.getSnapshot()
      if (players !== previousPlayers || remotePoses !== previousPoses) {
        const playerById = new Map(players.map((player) => [player.playerId, player]))
        avatars = remotePoses.flatMap((pose): RemoteRaceAvatar[] => {
          const player = playerById.get(pose.playerId)
          // A departure removes the avatar immediately even if a controller
          // delivers the roster update before clearing its transient poses.
          if (!player) return []
          return [{
            id: pose.playerId,
            name: player.profile.displayName || 'Builder',
            color: livePlayerColor(pose.playerId),
            characterId: resolveCharacterId(player.profile.characterId),
            palette: player.profile.palette,
            position: [pose.x, pose.y, pose.z],
            facingYaw: pose.yaw,
            horizontalSpeed: pose.moving ? 1 : 0,
            grounded: !pose.jumping,
          }]
        })
        previousPlayers = players
        previousPoses = remotePoses
      }
      return avatars
    },
  }

  return { subscribe: controller.subscribe, getSnapshot, remoteAvatarSource }
}
