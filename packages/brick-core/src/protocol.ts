import type { BrickStudioDocument } from './brickDocument'
import type { BrickInstance, PlayerProfile } from './types'

export const LIVE_PROTOCOL_VERSION = 1
export const LIVE_MAX_PLAYERS = 30
export const LIVE_MAX_COMMAND_BYTES = 64 * 1024
export const LIVE_MAX_COMMANDS = 500
export const LIVE_MAX_DOCUMENT_BYTES = 800_000
export const LIVE_MAX_POSE_BYTES = 2 * 1024
export const LIVE_MAX_DISPLAY_NAME_LENGTH = 32
export const LIVE_OP_ID_PATTERN = /^[A-Za-z0-9_-]{6,48}#[1-9]\d{0,15}$/

export type LiveWorldMode = 'build' | 'explore'
export type LiveConnectionState = 'connecting' | 'online' | 'reconnecting' | 'offline'

export type LiveBrickCommand =
  | { op: 'place' | 'move' | 'rotate' | 'recolor' | 'update'; brick: BrickInstance }
  | { op: 'delete'; id: string }

export type LivePlayer = {
  playerId: string
  isOwner: boolean
  profile: PlayerProfile
}

export type LivePose = {
  x: number
  y: number
  z: number
  yaw: number
  moving: boolean
  jumping: boolean
}

type VersionedMessage = { v: typeof LIVE_PROTOCOL_VERSION }

export type LiveClientMessage = VersionedMessage & (
  | { type: 'commands'; opId: string; commands: LiveBrickCommand[] }
  | { type: 'replaceDocument'; opId: string; document: BrickStudioDocument }
  | { type: 'resync' }
  | { type: 'setMode'; mode: LiveWorldMode }
  | { type: 'setLocked'; locked: boolean }
  | { type: 'setProfile'; profile: PlayerProfile }
  | ({ type: 'pose' } & LivePose)
)

export type LiveServerMessage = VersionedMessage & (
  | {
      type: 'welcome'
      roomId: string
      playerId: string
      isOwner: boolean
      revision: number
      mode: LiveWorldMode
      locked: boolean
      document: BrickStudioDocument
      players: LivePlayer[]
      reconnectToken?: string
      operationHighWater?: string
    }
  | {
      type: 'apply'
      from: string
      opId: string
      revision: number
      commands: LiveBrickCommand[]
    }
  | { type: 'snapshot'; opId?: string; revision: number; mode: LiveWorldMode; document: BrickStudioDocument }
  | { type: 'reject'; opId?: string; code: string; message: string; revision: number; document: BrickStudioDocument }
  | { type: 'modeChanged'; mode: LiveWorldMode; revision: number }
  | { type: 'players'; players: LivePlayer[] }
  | ({ type: 'pose'; playerId: string; at: number } & LivePose)
  | { type: 'locked'; locked: boolean }
  | { type: 'error'; code: string; message: string }
)

export type CreateLiveWorldRequest = {
  title: string
  document: BrickStudioDocument
  profile: PlayerProfile
}

export type CreateLiveWorldResponse = {
  roomId: string
  ownerToken: string
}
