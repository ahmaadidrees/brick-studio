/** Tile ids. Stored one byte per cell. */
export const T = {
  EMPTY: 0,
  GROUND: 1,
  HARD: 2,
  BRICK: 3,
  QBLOCK: 4,
  USED: 5,
  BOUNCE: 6,
  SEMI: 7,
  PIPE_L: 8,
  PIPE_R: 9,
  SPIKES: 10,
  LAVA: 11,
  COIN: 12,
  SPRING: 13,
} as const
export type TileId = (typeof T)[keyof typeof T]
export const TILE_ID_COUNT = 14

/** What a ? block or brick releases when bumped from below. */
export const C = {
  NONE: 0,
  COIN: 1,
  GROW: 2,
  SPARK: 3,
} as const
export type ContentId = (typeof C)[keyof typeof C]
export const CONTENT_ID_COUNT = 4

const SOLID = 1
const ONE_WAY = 2
const BUMPABLE = 4
const HURTS = 8
const KILLS = 16
const COLLECT = 32
const ANIMATED = 64
const HOLDS_CONTENT = 128

const FLAGS = new Uint8Array(32)
FLAGS[T.GROUND] = SOLID
FLAGS[T.HARD] = SOLID
FLAGS[T.BRICK] = SOLID | BUMPABLE | HOLDS_CONTENT
FLAGS[T.QBLOCK] = SOLID | BUMPABLE | ANIMATED | HOLDS_CONTENT
FLAGS[T.USED] = SOLID
FLAGS[T.BOUNCE] = SOLID | BUMPABLE
FLAGS[T.SEMI] = ONE_WAY
FLAGS[T.PIPE_L] = SOLID
FLAGS[T.PIPE_R] = SOLID
FLAGS[T.SPIKES] = SOLID | HURTS
FLAGS[T.LAVA] = KILLS | ANIMATED
FLAGS[T.COIN] = COLLECT | ANIMATED
FLAGS[T.SPRING] = SOLID

export const isSolid = (t: number): boolean => (FLAGS[t] & SOLID) !== 0
export const isOneWay = (t: number): boolean => (FLAGS[t] & ONE_WAY) !== 0
/** Something you can stand on: solid, or a one-way top. */
export const isFloor = (t: number): boolean => (FLAGS[t] & (SOLID | ONE_WAY)) !== 0
export const isBumpable = (t: number): boolean => (FLAGS[t] & BUMPABLE) !== 0
export const hurts = (t: number): boolean => (FLAGS[t] & HURTS) !== 0
export const kills = (t: number): boolean => (FLAGS[t] & KILLS) !== 0
export const isCollectible = (t: number): boolean => (FLAGS[t] & COLLECT) !== 0
export const isAnimated = (t: number): boolean => (FLAGS[t] & ANIMATED) !== 0
export const holdsContent = (t: number): boolean => (FLAGS[t] & HOLDS_CONTENT) !== 0
