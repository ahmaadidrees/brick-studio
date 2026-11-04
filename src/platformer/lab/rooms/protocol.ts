/**
 * The Hackable room protocol (docs/qa/hackable-rooms M1), shared by the browser and the room server. JSON over one
 * WebSocket, the same shape as the classic 2D rooms (packages/platformer-core/src/net/protocol.ts) without poses.
 *
 * The server does not run the game. It keeps the clock, puts every event in one order, stamps it with the tick it
 * applies before, and passes it to everyone. Every browser runs the same Hackable game from the same events: players
 * joining and leaving, every player's keys, and the host's edits to the project. Every Hero runs in that shared game,
 * because kids' code reads Heroes.
 *
 * The project travels as text: a compact save file (core/save.ts designText) without the editor's workspaces. The
 * room checks it with the same `parse` every save goes through before passing it on.
 */
import { MAX_PLAYERS as CLASSIC_MAX_PLAYERS } from '@brick-studio/platformer-core/net/protocol'

export { cleanName, isCleanName } from '@brick-studio/platformer-core/net/protocol'

export const HACKABLE_PROTOCOL = 1
export const MAX_PLAYERS = CLASSIC_MAX_PLAYERS
/** Hackable games tick 30 times a second (core/contracts TICKS_PER_SECOND), so these are half the classic counts. */
export const MAX_LATE = 15
export const MAX_EARLY = 5
/** Room events (joins, leaves, edits) land this many ticks ahead, so nobody has to go back for them. */
export const ROOM_LEAD = 3
export const HASH_EVERY = 60
/** Twenty seconds; a multiple of the timeline's copies (every 4 ticks) and of HASH_EVERY. */
export const KEYFRAME_EVERY = 600
/** Ordinary messages. */
export const MAX_MESSAGE_BYTES = 16 * 1024
/** A project or a keyframe. Painted costumes make projects big; past this a project can't be shared live yet. */
export const MAX_PROJECT_BYTES = 900 * 1024
export const MAX_KEY_LENGTH = 16
/** A player whose connection drops keeps their Hero this long, in case they come back. */
export const RECONNECT_GRACE_MS = 30_000

/** The keys a game hears (studio/stage/keys.ts browserKeyToScratchKey). */
export function isGameKey(key: unknown): key is string {
  return typeof key === 'string' && key.length <= MAX_KEY_LENGTH && /^(space|enter|(left|right|up|down) arrow|[a-z0-9])$/.test(key)
}

/** What happens to the game, in the room's order. */
export type RoomEv =
  /** The room: a player joined (their Hero appears). */
  | { t: 'join'; num: number; name: string }
  /** The room: a player left (their Hero goes). */
  | { t: 'leave'; num: number }
  /** A player's key went down or up. */
  | { t: 'key'; key: string; down: boolean }
  /** The host changed the project: the bricks change live; with `restart`, everyone plays again from it. */
  | { t: 'project'; text: string; restart: boolean }
  /** The host pressed Play again: a fresh game from the project as it is now, with everyone in it. */
  | { t: 'restart' }

/** Events a player may send (the room makes joins and leaves itself). */
export type PlayerEv = Extract<RoomEv, { t: 'key' | 'project' | 'restart' }>

export function isPlayerEv(ev: unknown): ev is PlayerEv {
  if (!ev || typeof ev !== 'object') return false
  const e = ev as Record<string, unknown>
  if (e.t === 'key') return isGameKey(e.key) && typeof e.down === 'boolean'
  if (e.t === 'project') return typeof e.text === 'string' && e.text.length <= MAX_PROJECT_BYTES && typeof e.restart === 'boolean'
  return e.t === 'restart'
}

export interface StampedEvent {
  tick: number
  seq: number
  /** Player number of the author; 0 for the room itself. */
  by: number
  cid: string
  ev: RoomEv
}

export interface PlayerInfo {
  num: number
  name: string
  /** The player whose game sends the room keyframes for people joining. */
  provider: boolean
  host: boolean
  /** Their connection dropped: their Hero waits (RECONNECT_GRACE_MS) in case they come back. */
  away?: boolean
}

export interface RoomSettings {
  /** Nobody new may join (people already admitted can still reconnect). */
  closed: boolean
}

export const DEFAULT_SETTINGS: RoomSettings = { closed: false }

/**
 * Where a joining player starts: the project at `tick`, and either the game as tick `tick` is about to run (a
 * keyframe, core/snapshot worldToJson) or nothing, meaning a fresh game from the project with the green flag at
 * `tick`. Events at `tick` and later follow.
 */
export interface Base {
  tick: number
  project: string
  world?: string
}

export type ClientMsg =
  /** `key` identifies this browser (reconnects to closed rooms). */
  | { type: 'hello'; v: typeof HACKABLE_PROTOCOL; name: string; key: string; host?: string }
  | { type: 'ev'; cid: string; tick: number; ev: PlayerEv }
  | { type: 'ping'; c: number }
  | { type: 'hash'; tick: number; h: number }
  | { type: 'keyframe'; tick: number; lastSeq: number; world: string }
  | { type: 'name'; name: string }
  /** Our game fell too far behind (an event older than it can go back for): send a fresh copy. */
  | { type: 'sync' }
  // Host only:
  | { type: 'settings'; closed?: boolean }
  | { type: 'kick'; num: number }
  | { type: 'unban' }

export type RejectReason = 'invalid' | 'host_only' | 'too_big' | 'busy'

export type ServerMsg =
  | {
      type: 'welcome'
      you: number
      host: boolean
      roomId: string
      title: string
      epoch: number
      now: number
      base: Base
      events: StampedEvent[]
      players: PlayerInfo[]
      settings: RoomSettings
      classroom: boolean
    }
  | { type: 'ev'; e: StampedEvent }
  | { type: 'reject'; cid: string; reason: RejectReason }
  | { type: 'pong'; c: number; s: number }
  | { type: 'players'; players: PlayerInfo[] }
  | { type: 'settings'; settings: RoomSettings; banned: number }
  | { type: 'resync'; base: Base; events: StampedEvent[] }
  | { type: 'notice'; message: string }
  | { type: 'error'; code: 'full' | 'closed' | 'kicked' | 'access' | 'version' | 'bad_json' | 'too_big' | 'no_hello' | 'rate'; message: string }

export interface CreateRoomRequest {
  /** The project as designText. */
  project: string
  title?: string
}

export interface CreateRoomResponse {
  roomId: string
  /** Secret that makes whoever holds it the host. Never put it in an invite link. */
  ownerToken: string
}

export interface RoomInfo {
  roomId: string
  title: string
  kit: string
  players: number
  full: boolean
  closed: boolean
}

/** Guest rooms: 32 random hex digits. Class rooms use their world's id without dashes (the same shape). */
export const ROOM_ID_PATTERN = /^[a-f0-9]{32}$/
