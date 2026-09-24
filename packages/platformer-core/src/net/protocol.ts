import type { WorldEvent } from '../engine/events'
import type { LevelJson } from '../engine/level'
import type { WorldJson } from '../engine/world'
import { isCharacterId, type CharacterId } from '../characters'
export { CHARACTER_IDS, DEFAULT_CHARACTER, isCharacterId, type CharacterId } from '../characters'

/*
 * The room protocol, shared by the browser and the room server. JSON over one WebSocket.
 *
 * The server does not run the game. It keeps the clock, puts every event in one order, stamps it
 * with the tick it applies at, and passes it to everyone. Each game runs the same world from the
 * same events, so every screen agrees. Players' own movement is not ordered: each game sends
 * where its player is ("pose") and the room passes everyone's latest pose around 20 times a second.
 *
 * Who each player is comes from the Worker, not the browser: a guest room's owner proves it with the
 * owner token from creating the room, and a class room's players with a signed-in ticket (the class
 * teacher and the world's owner host it; classmates who may only look can play but not build). The
 * host can lock building, close the room to newcomers, remove players, and save or restore the level.
 */

export const PROTOCOL = 3
export const MAX_PLAYERS = 16
/** An event may be stamped this many ticks in the past (the server clamps anything older). */
export const MAX_LATE = 30
/** ...and this many ticks in the future (clock-estimate slack). */
export const MAX_EARLY = 10
export const MAX_MESSAGE_BYTES = 64 * 1024
export const MAX_KEYFRAME_BYTES = 600 * 1024
export const KEYFRAME_EVERY = 300
export const HASH_EVERY = 60
export const NAME_MAX = 16
/** How often the room sends everyone the latest poses. */
export const POSE_FLUSH_MS = 50

export interface StampedEvent {
  tick: number
  seq: number
  /** Player number of the author; 0 for the room itself (a restored level). */
  by: number
  cid: string
  ev: WorldEvent
}

export interface PlayerInfo {
  num: number
  name: string
  /** The one player whose game sends the server snapshots for people joining. */
  provider: boolean
  host: boolean
  /** May change the level (class rooms: false for classmates who were given look-only access). */
  canBuild: boolean
}

export interface RoomSettings {
  /** Only the host may change the level. */
  buildLocked: boolean
  /** Nobody new may join (people already admitted can still reconnect). */
  closed: boolean
}

export const DEFAULT_SETTINGS: RoomSettings = { buildLocked: false, closed: false }

/** Where a player is and what they look like, sent about 20 times a second. */
export interface Pose {
  /** 0 playing, 1 building. */
  m: 0 | 1
  /** Playing: pixel position of the hitbox's bottom-centre. Building: cursor tile (or -1). */
  x: number
  y: number
  f: 1 | -1
  /** Sprite pose name. */
  a: string
  /** 0 small, 1 big, 2 spark. */
  s: number
  /** Visible this frame (blinking after a hit). */
  v: 0 | 1
  /** Squashed by someone landing on their head. */
  q: number
  /** The sender's tick when this pose was taken. */
  t: number
  /** Building: the palette item in hand. */
  it?: string
  /** Cosmetic identity. Older clients omit it and appear as Classic. */
  ch?: CharacterId
  /** Cosmetic animation clock (0..255), independent of the world simulation. */
  af?: number
  /** Cosmetic ground gait: 0 walk, 1 run. Older clients omit it. */
  ga?: 0 | 1
  /** Distance-based gait phase quantized to 0..255; independent of gameplay state. */
  gp?: number
}

/** What a joining player needs: a starting world and every event since. */
export type Base = { tick: number; world: WorldJson } | { tick: number; level: LevelJson }

export type ClientMsg =
  /** `key` identifies this browser (reconnects to closed rooms); `host` is the host key if we have it. */
  | { type: 'hello'; v: typeof PROTOCOL; name: string; key: string; host?: string }
  | { type: 'ev'; cid: string; tick: number; ev: WorldEvent }
  | { type: 'pose'; p: Pose }
  | { type: 'ping'; c: number }
  | { type: 'hash'; tick: number; h: number }
  | { type: 'keyframe'; tick: number; lastSeq: number; world: WorldJson }
  | { type: 'bonk'; target: number }
  | { type: 'name'; name: string }
  // Host only:
  | { type: 'settings'; buildLocked?: boolean; closed?: boolean }
  | { type: 'kick'; num: number }
  | { type: 'unban' }
  | { type: 'save' }
  | { type: 'restore' }

export type ServerMsg =
  | {
      type: 'welcome'
      you: number
      host: boolean
      roomId: string
      epoch: number
      now: number
      base: Base
      events: StampedEvent[]
      players: PlayerInfo[]
      settings: RoomSettings
      /** Whether this player may build at all (the room-wide lock comes on top). */
      canBuild: boolean
      /** Class rooms save to the account world by themselves; the room's own save/restore is for guest rooms. */
      classroom: boolean
    }
  | { type: 'ev'; e: StampedEvent }
  | { type: 'reject'; cid: string; reason: 'invalid' | 'locked' | 'read_only' | 'host_only' | 'unchecked' }
  | { type: 'poses'; list: [number, Pose][] }
  | { type: 'pong'; c: number; s: number }
  | { type: 'players'; players: PlayerInfo[] }
  | { type: 'settings'; settings: RoomSettings; banned: number }
  | { type: 'resync'; base: Base; events: StampedEvent[] }
  | { type: 'bonk'; from: number }
  | { type: 'saved' }
  /** Something everyone should know (the level was reloaded, saving is delayed). */
  | { type: 'notice'; message: string }
  | { type: 'error'; code: 'full' | 'closed' | 'kicked' | 'access' | 'version' | 'bad_json' | 'too_big' | 'no_hello' | 'rate'; message: string }

export interface CreateRoomRequest {
  level: LevelJson
}

export interface CreateRoomResponse {
  roomId: string
  /** Secret that makes whoever holds it the host. Never put it in an invite link. */
  ownerToken: string
}

export interface RoomInfo {
  roomId: string
  title: string
  players: number
  full: boolean
  closed: boolean
}

/** Guest rooms: 32 random hex digits. Class rooms use their world's id without dashes (the same shape). */
export const ROOM_ID_PATTERN = /^[a-f0-9]{32}$/

// ---------------------------------------------------------------------------------------------
// Names. Kids type these; keep them short, printable and clean.

/*
 * A deliberately small filter. Strong words are caught anywhere, even inside other letters; milder
 * ones only as whole words, so names like "Skyler", "Peacock" or "Grape" stay allowed. Common
 * disguises are undone first (0 for o, 1 for i, 5 for s, stretched letters).
 */
const STRONG = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'whore', 'slut', 'porn', 'asshole', 'bastard', 'wank', 'twat', 'retard', 'hitler', 'penis', 'vagina']
const WORDS = new Set(['fuk', 'nazi', 'nazis', 'dick', 'cock', 'sex', 'ass', 'arse', 'butt', 'poop', 'boob', 'boobs', 'tits', 'fag', 'kill', 'damn', 'crap', 'piss', 'rape', 'suicide', 'porno', 'sexy'])

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'l' }

export function isCleanName(name: string): boolean {
  const norm = name
    .toLowerCase()
    .split('')
    .map((ch) => LEET[ch] ?? ch)
    .join('')
  const flat = norm.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1')
  if (STRONG.some((w) => flat.includes(w.replace(/(.)\1+/g, '$1')))) return false
  return !norm
    .split(/[^a-z]+/)
    .map((w) => w.replace(/(.)\1{2,}/g, '$1$1'))
    .some((w) => WORDS.has(w))
}

export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Builder'
  const s = raw.replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  if (!s || !isCleanName(s)) return 'Builder'
  return s
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const POSE_NAMES = new Set(['stand', 'walk1', 'walk2', 'walk3', 'jump', 'skid', 'wall', 'kick', 'throw', 'crouch', 'dead'])

export function isValidPose(p: unknown): p is Pose {
  if (!p || typeof p !== 'object') return false
  const o = p as Record<string, unknown>
  return (
    (o.m === 0 || o.m === 1) &&
    isInt(o.x) &&
    isInt(o.y) &&
    Math.abs(o.x) < 1e6 &&
    Math.abs(o.y) < 1e6 &&
    (o.f === 1 || o.f === -1) &&
    typeof o.a === 'string' &&
    POSE_NAMES.has(o.a) &&
    isInt(o.s) &&
    o.s >= 0 &&
    o.s <= 2 &&
    (o.v === 0 || o.v === 1) &&
    isInt(o.q) &&
    isInt(o.t) &&
    (o.it === undefined || (typeof o.it === 'string' && o.it.length <= 16)) &&
    (o.ch === undefined || isCharacterId(o.ch)) &&
    (o.af === undefined || (isInt(o.af) && o.af >= 0 && o.af <= 255)) &&
    (o.ga === undefined || o.ga === 0 || o.ga === 1) &&
    (o.gp === undefined || (isInt(o.gp) && o.gp >= 0 && o.gp <= 255))
  )
}
