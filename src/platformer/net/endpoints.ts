import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { levelToJson } from '@brick-studio/platformer-core/engine/level'
import type { CreateRoomResponse, RoomInfo } from '@brick-studio/platformer-core/net/protocol'
import { resolveLiveServerBaseUrl } from '../../brick/live/liveWorldGateway'
import { browserClassroomClient } from '../../classroom/client'

/*
 * Where 2D rooms live: the same Worker as 3D live rooms (VITE_LIVE_SERVER_URL, http://localhost:8787 when unset).
 * Guest rooms are opened by link; a class level's room needs a signed-in ticket from the classroom API, fetched
 * fresh for every connection because it expires after a minute.
 */

const httpBase = () => resolveLiveServerBaseUrl()
const socketBase = () => httpBase().replace(/^http/, 'ws')

export class RoomServiceError extends Error {
  constructor(message: string, readonly status = 0, readonly code = '') {
    super(message)
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    return {} as T
  }
}

/** Opens a guest room for a level. This browser keeps the owner token and hosts the room. */
export async function createGuestRoom(level: LevelDesign): Promise<CreateRoomResponse> {
  let response: Response
  try {
    response = await fetch(`${httpBase()}/platformer/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: levelToJson(level) }) })
  } catch {
    throw new RoomServiceError('The room service is unreachable. Check your connection and try again.')
  }
  if (response.status === 429) throw new RoomServiceError('Lots of rooms were opened from this network in the last hour. Try again in a little while.', 429, 'creation_rate_limited')
  if (!response.ok) throw new RoomServiceError(`Could not open a room (status ${response.status}).`, response.status)
  return readJson<CreateRoomResponse>(response)
}

/** A guest room's title and head count, or null when it does not exist (or expired). */
export async function guestRoomInfo(roomId: string): Promise<RoomInfo | null> {
  let response: Response
  try {
    response = await fetch(`${httpBase()}/platformer/rooms/${roomId}`)
  } catch {
    throw new RoomServiceError('The room service is unreachable. Check your connection and try again.')
  }
  if (response.status === 404) return null
  if (!response.ok) throw new RoomServiceError(`The room service said no (status ${response.status}).`, response.status)
  return readJson<RoomInfo>(response)
}

export function guestRoomSocketUrl(roomId: string, ownerToken?: string | null): string {
  const query = ownerToken ? `?ownerToken=${encodeURIComponent(ownerToken)}` : ''
  return `${socketBase()}/platformer/rooms/${roomId}/connect${query}`
}

/** A fresh connection address for a class level's room (asks the classroom API for a ticket). */
export async function classRoomSocketUrl(worldId: string): Promise<string> {
  const { ticket } = await browserClassroomClient.request<{ ticket: string }>(`/worlds/${worldId}/platformer-ticket`, 'POST')
  return `${socketBase()}/platformer/worlds/${worldId}/connect?ticket=${encodeURIComponent(ticket)}`
}
