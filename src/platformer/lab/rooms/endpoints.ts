/**
 * Where Hackable rooms live (docs/qa/hackable-rooms M1): the same Worker as the other live rooms
 * (VITE_LIVE_SERVER_URL). A project kept in this browser opens a guest room, joined by link; an account project opens
 * its class room, joined by classmates it is shared with, each connection with a fresh signed-in ticket.
 */
import { resolveLiveServerBaseUrl } from '../../../brick/live/liveWorldGateway'
import { browserClassroomClient } from '../../../classroom/client'
import type { CreateRoomResponse, RoomInfo } from './protocol'

export { roomHref } from './hrefs'

const httpBase = () => resolveLiveServerBaseUrl()
const socketBase = () => httpBase().replace(/^http/, 'ws')

export class RoomServiceError extends Error {
  constructor(message: string, readonly status = 0, readonly code = '') {
    super(message)
  }
}

/** Opens a guest room for a project (designText). This browser keeps the owner token and hosts the room. */
/** A link room for `project` (designText), with its blocks for the code editors (M2). */
export async function createGuestRoom(project: string, title: string, workspaces?: Record<string, unknown>): Promise<CreateRoomResponse> {
  let response: Response
  try {
    response = await fetch(`${httpBase()}/hackable/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project, title, ...(workspaces ? { workspaces } : {}) }) })
  } catch {
    throw new RoomServiceError('The room service is unreachable. Check your connection and try again.')
  }
  if (response.status === 429) throw new RoomServiceError('Lots of rooms were opened from this network in the last hour. Try again in a little while.', 429, 'creation_rate_limited')
  if (response.status === 413) throw new RoomServiceError('This project is too big to play together yet. Try smaller costumes.', 413, 'project_too_big')
  if (!response.ok) throw new RoomServiceError(`Could not open a room (status ${response.status}).`, response.status)
  return (await response.json()) as CreateRoomResponse
}

/** A guest room's title and head count, or null when it does not exist (or expired). */
export async function guestRoomInfo(roomId: string): Promise<RoomInfo | null> {
  let response: Response
  try {
    response = await fetch(`${httpBase()}/hackable/rooms/${roomId}`)
  } catch {
    throw new RoomServiceError('The room service is unreachable. Check your connection and try again.')
  }
  if (response.status === 404) return null
  if (!response.ok) throw new RoomServiceError(`The room service said no (status ${response.status}).`, response.status)
  return (await response.json()) as RoomInfo
}

export function guestRoomSocketUrl(roomId: string, ownerToken?: string | null): string {
  const query = ownerToken ? `?ownerToken=${encodeURIComponent(ownerToken)}` : ''
  return `${socketBase()}/hackable/rooms/${roomId}/connect${query}`
}

/** A fresh connection address for an account project's room (asks the classroom API for a ticket). */
export async function classRoomSocketUrl(worldId: string): Promise<string> {
  const { ticket } = await browserClassroomClient.request<{ ticket: string }>(`/worlds/${worldId}/hackable-ticket`, 'POST')
  return `${socketBase()}/hackable/worlds/${worldId}/connect?ticket=${encodeURIComponent(ticket)}`
}

/** Guest rooms this browser opened, so a reload keeps hosting them. The token never goes in a link. */
const OWNER_KEY = 'brickgineers.hackable-room-owner.v1'

export function rememberOwnerToken(roomId: string, ownerToken: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(OWNER_KEY) ?? '{}') as Record<string, string>
    all[roomId] = ownerToken
    const kept = Object.fromEntries(Object.entries(all).slice(-20))
    localStorage.setItem(OWNER_KEY, JSON.stringify(kept))
  } catch { /* a private window: this tab still hosts */ }
}

export function ownerTokenOf(roomId: string): string | null {
  try {
    return (JSON.parse(localStorage.getItem(OWNER_KEY) ?? '{}') as Record<string, string>)[roomId] ?? null
  } catch {
    return null
  }
}
