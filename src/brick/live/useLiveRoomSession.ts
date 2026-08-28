import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PlayerProfile } from '../types'
import type { ConnectLiveRoom, LiveRoomActions, LiveRoomController, LiveRoomSnapshot } from './liveRoomModel'

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
  | { status: 'active'; snapshot: LiveRoomSnapshot; actions: LiveRoomActions }

const noSubscription = () => () => {}

/**
 * Owns the connect/disconnect lifecycle of a `LiveRoomController` and exposes
 * its snapshot through `useSyncExternalStore`. The profile used at connect
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

  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noSubscription,
    () => (controller ? controller.getSnapshot() : null),
    () => (controller ? controller.getSnapshot() : null),
  )

  if (!connectRoom) return { status: 'unwired' }
  if (!controller || !snapshot) return { status: 'idle' }
  return { status: 'active', snapshot, actions: controller.actions }
}
