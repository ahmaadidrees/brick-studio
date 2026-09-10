import { useSyncExternalStore } from 'react'
import type { RemoteRaceAvatar } from './BrickStudioScene'

/** A stable source lets moving classmates update only the avatar layer. */
export type RemoteAvatarSource = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => RemoteRaceAvatar[]
}

const emptyAvatars: RemoteRaceAvatar[] = []
const noSubscription = () => () => {}

export function useRemoteAvatars(source?: RemoteAvatarSource, fallback = emptyAvatars): RemoteRaceAvatar[] {
  return useSyncExternalStore(
    source?.subscribe ?? noSubscription,
    source?.getSnapshot ?? (() => fallback),
    source?.getSnapshot ?? (() => fallback),
  )
}
