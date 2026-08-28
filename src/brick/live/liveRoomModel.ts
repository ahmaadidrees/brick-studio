import type { BrickStudioDocument } from '../brickDocument'
import {
  LIVE_MAX_DISPLAY_NAME_LENGTH,
  LIVE_MAX_PLAYERS,
  type LiveConnectionState,
  type LivePlayer,
  type LivePose,
  type LiveWorldMode,
} from '../liveProtocol'
import type { PlayerProfile } from '../types'

/**
 * UI-side session model for a live world room.
 *
 * Everything here is derived from the frozen wire contract in
 * `packages/brick-core/src/protocol.ts` but adds no wire messages of its own:
 * the realtime `liveRoomClient` (built in a parallel lane) owns the socket and
 * adapts its state into this shape through the `LiveRoomController` contract.
 */

export const LIVE_CREATE_ROOM_SEGMENT = 'new'

export type LiveWorldLocation =
  | { kind: 'create' }
  | { kind: 'join'; roomId: string; ownerToken?: string }
  | { kind: 'invalid' }

/** Parses `/live/new` and `/live/:roomId` URLs. The owner capability rides in the `#owner=` hash and never in the path. */
export function parseLiveWorldLocation(pathname: string, hash: string): LiveWorldLocation {
  const match = /^\/live\/([^/]+)\/?$/.exec(pathname)
  if (!match) return { kind: 'invalid' }
  let segment = ''
  try {
    segment = decodeURIComponent(match[1])
  } catch {
    return { kind: 'invalid' }
  }
  if (!segment.trim()) return { kind: 'invalid' }
  if (segment === LIVE_CREATE_ROOM_SEGMENT) return { kind: 'create' }
  const ownerToken = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('owner')
  return ownerToken ? { kind: 'join', roomId: segment, ownerToken } : { kind: 'join', roomId: segment }
}

/** The link guests join through. Never carries the owner capability. */
export function liveGuestLink(origin: string, roomId: string): string {
  return new URL(`/live/${encodeURIComponent(roomId)}`, origin).toString()
}

/** In-app owner location (path + hash). The token stays in the fragment so it is never sent to a server. */
export function liveOwnerLocation(roomId: string, ownerToken: string): string {
  return `/live/${encodeURIComponent(roomId)}#${new URLSearchParams({ owner: ownerToken }).toString()}`
}

/** Collapses whitespace, strips control characters, and clamps to the protocol's display-name budget. */
export function normalizeDisplayName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIVE_MAX_DISPLAY_NAME_LENGTH)
    .trim()
}

export function displayNameError(normalized: string): string | null {
  if (!normalized) return 'Pick a builder name so friends know who you are.'
  return null
}

export type LiveRoomNotice = {
  /** Monotonic per-notice id so repeated identical notices still re-announce. */
  seq: number
  code: string
  message: string
}

export type LiveRoomRemotePose = LivePose & {
  playerId: string
  at: number
}

/**
 * The one snapshot the live UI renders. A `LiveRoomController` keeps this in
 * sync from server messages (`welcome`, `players`, `modeChanged`, `locked`,
 * `snapshot`, `reject`, `error`) and must return a stable object reference
 * between changes (it feeds `useSyncExternalStore`).
 */
export type LiveRoomSnapshot = {
  connection: LiveConnectionState
  /** True while the client is waiting on a `welcome`/`snapshot` to close a revision gap. */
  syncing: boolean
  roomId: string
  selfPlayerId: string | null
  isOwner: boolean
  revision: number
  mode: LiveWorldMode
  locked: boolean
  document: BrickStudioDocument | null
  players: LivePlayer[]
  /** Latest transient exploration pose for each connected remote player. */
  remotePoses: LiveRoomRemotePose[]
  /** Latest `reject`/`error` surfaced to the user, if any. */
  notice: LiveRoomNotice | null
}

export function createInitialLiveRoomSnapshot(roomId: string, isOwner = false): LiveRoomSnapshot {
  return {
    connection: 'connecting',
    syncing: true,
    roomId,
    selfPlayerId: null,
    isOwner,
    revision: 0,
    mode: 'build',
    locked: false,
    document: null,
    players: [],
    remotePoses: [],
    notice: null,
  }
}

/** Owner/self intents the HUD can raise. Each maps 1:1 onto a frozen client message; `reconnect` is transport-level and optional. */
export type LiveRoomActions = {
  setMode: (mode: LiveWorldMode) => void
  setLocked: (locked: boolean) => void
  setProfile: (profile: PlayerProfile) => void
  sendPose: (pose: LivePose) => void
  requestResync: () => void
  reconnect?: () => void
}

export type LiveRoomController = {
  getSnapshot: () => LiveRoomSnapshot
  subscribe: (listener: () => void) => () => void
  actions: LiveRoomActions
  disconnect: () => void
}

export type ConnectLiveRoomOptions = {
  roomId: string
  /** Present only for the room owner; guests never hold this capability. */
  ownerToken?: string
  profile: PlayerProfile
}

/** The seam the parallel realtime lane implements: open a socket session and expose it as a controller. */
export type ConnectLiveRoom = (options: ConnectLiveRoomOptions) => LiveRoomController

export type LiveEditPermission = { canEdit: boolean; reason: string | null }

/**
 * UI mirror of the authority rules: everyone edits in Build, nobody edits in
 * Explore, and a locked room pauses guests. The server stays authoritative —
 * a stale UI guess just earns a `reject` that flows back through `notice`.
 */
export function liveEditPermission(
  snapshot: Pick<LiveRoomSnapshot, 'connection' | 'mode' | 'locked' | 'isOwner'>,
): LiveEditPermission {
  if (snapshot.connection === 'connecting') return { canEdit: false, reason: 'Connecting to the room…' }
  if (snapshot.connection === 'reconnecting') return { canEdit: false, reason: 'Reconnecting — building resumes in a moment.' }
  if (snapshot.connection === 'offline') return { canEdit: false, reason: 'You are offline, so building is paused.' }
  if (snapshot.mode !== 'build') {
    return {
      canEdit: false,
      reason: snapshot.isOwner
        ? 'Switch to Build to edit bricks.'
        : 'The owner switched everyone to Explore.',
    }
  }
  if (snapshot.locked && !snapshot.isOwner) {
    return { canEdit: false, reason: 'The owner locked building, so only they can edit right now.' }
  }
  return { canEdit: true, reason: null }
}

export type LiveConnectionTone = 'ok' | 'busy' | 'warn'

export type LiveConnectionStatus = {
  label: string
  detail: string
  tone: LiveConnectionTone
}

export function describeLiveConnection(connection: LiveConnectionState, syncing: boolean): LiveConnectionStatus {
  switch (connection) {
    case 'online':
      return syncing
        ? { label: 'Syncing…', detail: 'Catching up on the latest bricks', tone: 'busy' }
        : { label: 'Live', detail: 'Changes are shared instantly', tone: 'ok' }
    case 'connecting':
      return { label: 'Connecting…', detail: 'Opening the room', tone: 'busy' }
    case 'reconnecting':
      return { label: 'Reconnecting…', detail: 'Trying to reach the room again', tone: 'warn' }
    case 'offline':
      return { label: 'Offline', detail: 'The room is unreachable right now', tone: 'warn' }
  }
}

/** Owner first, then yourself, then everyone else by name, so the roster reads the same for the whole class. */
export function sortLivePlayers(players: LivePlayer[], selfPlayerId: string | null): LivePlayer[] {
  return [...players].sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1
    const aSelf = a.playerId === selfPlayerId
    const bSelf = b.playerId === selfPlayerId
    if (aSelf !== bSelf) return aSelf ? -1 : 1
    const aName = a.profile.displayName || a.playerId
    const bName = b.profile.displayName || b.playerId
    return aName.localeCompare(bName) || a.playerId.localeCompare(b.playerId)
  })
}

/** Kid-friendly presence swatches; assignment is stable per player id so colors never shuffle mid-session. */
export const LIVE_PLAYER_COLORS = [
  '#3e83d7', '#e2574c', '#31a06c', '#e79a3c', '#8d6bd9',
  '#1fa3b8', '#d95f9e', '#7f9f2f', '#b3722a', '#5a6ed0',
] as const

export function livePlayerColor(playerId: string): string {
  let hash = 0
  for (let index = 0; index < playerId.length; index += 1) hash = (hash * 31 + playerId.charCodeAt(index)) | 0
  return LIVE_PLAYER_COLORS[Math.abs(hash) % LIVE_PLAYER_COLORS.length]
}

export function formatLivePlayerCount(count: number): string {
  return `${count} of ${LIVE_MAX_PLAYERS} builders`
}

export function describeLiveMode(mode: LiveWorldMode): { label: string; detail: string } {
  return mode === 'build'
    ? { label: 'Build together', detail: 'Everyone can place and edit bricks' }
    : { label: 'Explore', detail: 'Walk around the build — editing is paused' }
}
