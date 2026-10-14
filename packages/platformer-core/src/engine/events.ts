import { OBJECT_KINDS, STYLES, THEMES, type LevelJson, type LevelObject, type PipeEndpoint, type LevelStyle, type Theme } from './level'
import { isValidRaceSettings, tileIdCount, type Kit, type RaceSettings } from './kits'
import { CONTENT_ID_COUNT } from './tiles'

/** A change a builder makes to the level design. */
export type EditOp =
  | { o: 'tile'; x: number; y: number; t: number; c: number }
  | { o: 'add'; obj: LevelObject }
  | { o: 'pipe'; pipe: PipeEndpoint }
  | { o: 'pipeDel'; id: number }
  | { o: 'del'; id: number }
  | { o: 'move'; id: number; x: number; y: number }
  | { o: 'theme'; theme: Theme }
  | { o: 'style'; style: LevelStyle }
  | { o: 'title'; title: string }
  /** Race levels only: laps, which way the grid and the finish line face, items on or off. */
  | { o: 'race'; race: RaceSettings }

/**
 * Everything that changes the shared world. Players' own movement is not here: each game moves
 * its own player and tells the others where it is. What a player does *to the world* (stomp, kick,
 * hit a block, grab a coin, throw a spark, edit) is an event, applied at the same tick everywhere.
 */
export type WorldEvent =
  | { t: 'edit'; ops: EditOp[] }
  | { t: 'stomp'; id: number; dir: 1 | -1 }
  | { t: 'kick'; id: number; dir: 1 | -1 }
  | { t: 'bump'; x: number; y: number; big: 0 | 1; dir: 1 | -1 }
  | { t: 'coin'; x: number; y: number }
  | { t: 'take'; id: number }
  | { t: 'spark'; x: number; y: number; dir: 1 | -1 }
  | { t: 'reset' }
  /** Race tracks: everyone lines up on the grid and the start lights begin, at this tick for everyone. */
  | { t: 'race' }
  /**
   * Race tracks: a thrown item enters the world at pixel (x, y) with velocity (vx, vy) in sub-pixels per tick. `k` is
   * the item (RACE_THROWN), `o` which of the thrower's cars threw it (0 is the player, 1..3 computer racers).
   */
  | { t: 'item'; k: number; x: number; y: number; vx: number; vy: number; o: number }
  /** Race tracks: a car ran into a thrown item or an oil slick, which is used up. The car that was hit says so. */
  | { t: 'hit'; id: number }
  /** Replace the whole level (a host restoring a saved level). Only the server sends this. */
  | { t: 'load'; level: LevelJson }

export const MAX_EDIT_OPS = 400

/** Race items that go into the world when used: a bouncy ball, a spark and an oil slick (`item` events' `k`). */
export const RACE_THROWN = { BALL: 0, SPARK: 1, OIL: 2 } as const
export const RACE_THROWN_COUNT = 3
/** Fastest a thrown item may start, in sub-pixels per tick (16 px per frame). */
export const MAX_THROW_SPEED = 16 * 256

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const isDir = (n: unknown): n is 1 | -1 => n === 1 || n === -1
const inRange = (n: unknown, lo: number, hi: number): n is number => isInt(n) && n >= lo && n <= hi
const isId = (n: unknown): n is number => inRange(n, 1, 0x7fffffff)

/** A race track has a starting grid and Walkers, nothing else. */
const RACE_OBJECT_KINDS: readonly string[] = ['start', 'walker']

function validObject(o: unknown, w: number, h: number, kit: Kit): o is LevelObject {
  if (!o || typeof o !== 'object') return false
  const obj = o as Record<string, unknown>
  return (
    isId(obj.id) &&
    (kit === 'race' ? RACE_OBJECT_KINDS : (OBJECT_KINDS as readonly string[])).includes(obj.kind as string) &&
    inRange(obj.x, 0, w - 1) &&
    inRange(obj.y, 0, h - 1) &&
    isDir(obj.dir) &&
    (obj.alt === 0 || obj.alt === 1)
  )
}

function validOp(op: unknown, w: number, h: number, kit: Kit): op is EditOp {
  if (!op || typeof op !== 'object') return false
  const o = op as Record<string, unknown>
  switch (o.o) {
    case 'tile':
      return inRange(o.x, 0, w - 1) && inRange(o.y, 0, h - 1) && inRange(o.t, 0, tileIdCount(kit) - 1) && inRange(o.c, 0, kit === 'race' ? 0 : CONTENT_ID_COUNT - 1)
    case 'add':
      return validObject(o.obj, w, h, kit)
    case 'pipe': {
      if (!o.pipe || typeof o.pipe !== 'object') return false
      const p = o.pipe as Record<string, unknown>
      return isId(p.id) && inRange(p.x, 0, w - 2) && inRange(p.y, 0, h - 1) &&
        (p.exitId === null || (isId(p.exitId) && p.exitId !== p.id))
    }
    case 'pipeDel':
    case 'del':
      return isId(o.id)
    case 'move':
      return isId(o.id) && inRange(o.x, 0, w - 1) && inRange(o.y, 0, h - 1)
    case 'theme':
      return THEMES.includes(o.theme as Theme)
    case 'style':
      return STYLES.includes(o.style as LevelStyle)
    case 'title':
      return typeof o.title === 'string' && o.title.length <= 60
    case 'race':
      return kit === 'race' && isValidRaceSettings(o.race)
    default:
      return false
  }
}

/** Events that only make sense in a platformer (they act on its critters, blocks and coins). */
const PLATFORMER_ONLY = new Set(['stomp', 'kick', 'bump', 'coin', 'take', 'spark'])

/**
 * Shape and range check for an event from an untrusted source. World size bounds coordinates; the level's kit decides
 * which tile ids an edit may use and which events exist at all.
 */
export function isValidEvent(ev: unknown, w: number, h: number, kit: Kit = 'platformer'): ev is WorldEvent {
  if (!ev || typeof ev !== 'object') return false
  const e = ev as Record<string, unknown>
  const maxX = w * 16 * 256
  const maxY = h * 16 * 256
  if (kit === 'race' && PLATFORMER_ONLY.has(e.t as string)) return false
  switch (e.t) {
    case 'edit':
      return Array.isArray(e.ops) && e.ops.length > 0 && e.ops.length <= MAX_EDIT_OPS && e.ops.every((op) => validOp(op, w, h, kit))
    case 'stomp':
    case 'kick':
      return inRange(e.id, 1, 2 ** 40) && isDir(e.dir)
    case 'bump':
      return inRange(e.x, 0, w - 1) && inRange(e.y, 0, h - 1) && (e.big === 0 || e.big === 1) && isDir(e.dir)
    case 'coin':
      return inRange(e.x, 0, w - 1) && inRange(e.y, 0, h - 1)
    case 'take':
      return inRange(e.id, 1, 2 ** 40)
    case 'spark':
      return inRange(e.x, -maxX, 2 * maxX) && inRange(e.y, -maxY, 2 * maxY) && isDir(e.dir)
    case 'reset':
      return true
    case 'race':
      return kit === 'race'
    case 'item':
      return kit === 'race' && inRange(e.k, 0, RACE_THROWN_COUNT - 1) && inRange(e.x, 0, w * 16) && inRange(e.y, 0, h * 16) &&
        inRange(e.vx, -MAX_THROW_SPEED, MAX_THROW_SPEED) && inRange(e.vy, -MAX_THROW_SPEED, MAX_THROW_SPEED) && inRange(e.o, 0, 3)
    case 'hit':
      return kit === 'race' && inRange(e.id, 1, 2 ** 40)
    default:
      // 'load' included: players can never send it, only the room server.
      return false
  }
}
