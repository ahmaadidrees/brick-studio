import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { PlayerProfile } from '../types'
import type { RemoteAvatarSource } from '../remoteAvatarSource'
import type { ConnectLiveRoom, LiveRoomActions, LiveRoomController, LiveRoomUiSnapshot } from './liveRoomModel'
import { createLiveRoomViewStore } from './liveRoomViewStore'

export type UseLiveRoomSessionOptions = {
  connectRoom?: ConnectLiveRoom
  /** Pass null until the player has entered a display name; the socket opens only once both exist. */
  roomId: string | null
  ownerToken?: string
  profile: PlayerProfile | null
}

export type LiveRoomSession =
  | { status: 'unwired' }
  | { status: 'idle' }
  | { status: 'active'; snapshot: LiveRoomUiSnapshot; actions: LiveRoomActions; remoteAvatarSource: RemoteAvatarSource }

const noSubscription = () => () => {}

/**
 * Owns the connect/disconnect lifecycle of a `LiveRoomController` and exposes
 * its room snapshot through `useSyncExternalStore`. Poses have a separate
 * source for the scene's avatar layer. The profile used at connect
 * time is captured once; later renames flow through `actions.setProfile`
 * instead of tearing the socket down.
 */
export function useLiveRoomSession({ connectRoom, roomId, ownerToken, profile }: UseLiveRoomSessionOptions): LiveRoomSession {
  const [controller, setController] = useState<LiveRoomController | null>(null)
  const profileRef = useRef(profile)
  if (profile) profileRef.current = profile
  const ready = Boolean(connectRoom && roomId && profile)

  useEffect(() => {
    if (!connectRoom || !roomId || !ready || !profileRef.current) return
    const next = connectRoom({ roomId, ...(ownerToken ? { ownerToken } : {}), profile: profileRef.current })
    setController(next)
    return () => {
      setController((current) => (current === next ? null : current))
      next.disconnect()
    }
  }, [connectRoom, roomId, ownerToken, ready])

  const viewStore = useMemo(() => controller ? createLiveRoomViewStore(controller) : null, [controller])
  const snapshot = useSyncExternalStore(
    viewStore?.subscribe ?? noSubscription,
    () => viewStore?.getSnapshot() ?? null,
    () => viewStore?.getSnapshot() ?? null,
  )

  if (!connectRoom) return { status: 'unwired' }
  if (!controller || !viewStore || !snapshot) return { status: 'idle' }
  return { status: 'active', snapshot, actions: controller.actions, remoteAvatarSource: viewStore.remoteAvatarSource }
}
