import { OBJECT_KINDS, THEMES, type LevelJson, type LevelObject, type Theme } from './level'
import { CONTENT_ID_COUNT, TILE_ID_COUNT } from './tiles'

/** A change a builder makes to the level design. */
export type EditOp =
  | { o: 'tile'; x: number; y: number; t: number; c: number }
  | { o: 'add'; obj: LevelObject }
  | { o: 'del'; id: number }
  | { o: 'move'; id: number; x: number; y: number }
  | { o: 'theme'; theme: Theme }
  | { o: 'title'; title: string }

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
  /** Replace the whole level (a host restoring a saved level). Only the server sends this. */
  | { t: 'load'; level: LevelJson }

export const MAX_EDIT_OPS = 400

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const isDir = (n: unknown): n is 1 | -1 => n === 1 || n === -1
const inRange = (n: unknown, lo: number, hi: number): n is number => isInt(n) && n >= lo && n <= hi
const isId = (n: unknown): n is number => inRange(n, 1, 0x7fffffff)

function validObject(o: unknown, w: number, h: number): o is LevelObject {
  if (!o || typeof o !== 'object') return false
  const obj = o as Record<string, unknown>
  return (
    isId(obj.id) &&
    (OBJECT_KINDS as readonly string[]).includes(obj.kind as string) &&
    inRange(obj.x, 0, w - 1) &&
    inRange(obj.y, 0, h - 1) &&
    isDir(obj.dir) &&
    (obj.alt === 0 || obj.alt === 1)
  )
}

function validOp(op: unknown, w: number, h: number): op is EditOp {
  if (!op || typeof op !== 'object') return false
  const o = op as Record<string, unknown>
  switch (o.o) {
    case 'tile':
      return inRange(o.x, 0, w - 1) && inRange(o.y, 0, h - 1) && inRange(o.t, 0, TILE_ID_COUNT - 1) && inRange(o.c, 0, CONTENT_ID_COUNT - 1)
    case 'add':
      return validObject(o.obj, w, h)
    case 'del':
      return isId(o.id)
    case 'move':
      return isId(o.id) && inRange(o.x, 0, w - 1) && inRange(o.y, 0, h - 1)
    case 'theme':
      return THEMES.includes(o.theme as Theme)
    case 'title':
      return typeof o.title === 'string' && o.title.length <= 60
    default:
      return false
  }
}

/** Shape and range check for an event from an untrusted source. World size bounds coordinates. */
export function isValidEvent(ev: unknown, w: number, h: number): ev is WorldEvent {
  if (!ev || typeof ev !== 'object') return false
  const e = ev as Record<string, unknown>
  const maxX = w * 16 * 256
  const maxY = h * 16 * 256
  switch (e.t) {
    case 'edit':
      return Array.isArray(e.ops) && e.ops.length > 0 && e.ops.length <= MAX_EDIT_OPS && e.ops.every((op) => validOp(op, w, h))
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
    default:
      // 'load' included: players can never send it, only the room server.
      return false
  }
}
