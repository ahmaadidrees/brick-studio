import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { ROOM_ID_PATTERN } from '@brick-studio/platformer-core/net/protocol'
import { createGuestRoom } from '../net/endpoints'
import { rememberOwnerToken } from './prefs'

/** A guest room id from a pasted invite link (…/2d/r/<id>) or the bare id. */
export function parseRoomRef(text: string): string | null {
  const t = text.trim().toLowerCase()
  const fromLink = /\/2d\/r\/([a-f0-9]{32})\b/.exec(t)?.[1]
  if (fromLink) return fromLink
  const bare = t.replace(/[\s-]/g, '')
  return ROOM_ID_PATTERN.test(bare) ? bare : null
}

/** Open a guest room for a level and go there as its host. */
export async function playWithFriends(level: LevelDesign): Promise<void> {
  const { roomId, ownerToken } = await createGuestRoom(level)
  rememberOwnerToken(roomId, ownerToken)
  window.location.assign(`/2d/r/${roomId}`)
}
