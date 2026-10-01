import {
  LEVEL_MAX_HEIGHT,
  LEVEL_MAX_OBJECTS,
  LEVEL_MAX_WIDTH,
  LEVEL_MIN_HEIGHT,
  LEVEL_MIN_WIDTH,
} from './constants'
import { CONTENT_ID_COUNT, TILE_ID_COUNT, T, holdsContent } from './tiles'

/** Things placed on the grid that are not tiles: course markers, enemies, gizmos, power-ups. */
export const OBJECT_KINDS = [
  'start',
  'goal',
  'checkpoint',
  'walker',
  'shellbug',
  'spiky',
  'flyer',
  'platform',
  'grow',
  'spark',
] as const
export type ObjKind = (typeof OBJECT_KINDS)[number]

export type Theme = 'day' | 'underground'
export const THEMES: Theme[] = ['day', 'underground']

/** How the level is drawn: the original pixel art, or the cartoon look built from toy bricks. Looks only. */
export type LevelStyle = 'pixel' | 'cartoon'
export const STYLES: LevelStyle[] = ['pixel', 'cartoon']

export interface LevelObject {
  /** Random positive 31-bit id, chosen by whoever placed it. */
  id: number
  kind: ObjKind
  /** Tile coordinates of the object's anchor cell (its bottom-left for tall things). */
  x: number
  y: number
  /** Starting direction for enemies; travel direction for platforms. */
  dir: 1 | -1
  /** Variant: platforms 0 = horizontal, 1 = vertical. */
  alt: 0 | 1
}

/** Upright pipe mouth, linked by stable identity rather than terrain coordinates. */
export interface PipeEndpoint {
  id: number
  /** Top-left mouth tile of a two-column pipe. */
  x: number
  y: number
  exitId: number | null
}

export interface LevelDesign {
  title: string
  width: number
  height: number
  theme: Theme
  style: LevelStyle
  /** Row-major, y = 0 is the top row. */
  tiles: Uint8Array
  /** What each ? block or brick releases, same indexing as tiles. */
  contents: Uint8Array
  objects: LevelObject[]
  /** Absent in old designs; loaders and constructors normalize to an empty list. */
  pipes?: PipeEndpoint[]
}

export const SINGLETON_KINDS: ReadonlySet<ObjKind> = new Set(['start', 'goal'])

/** New levels start in the cartoon look; levels saved before looks existed open as pixel art. */
export function createBlankLevel(width = 120, height = 27, title = 'Untitled level', style: LevelStyle = 'cartoon'): LevelDesign {
  const tiles = new Uint8Array(width * height)
  for (let y = height - 2; y < height; y++) {
    for (let x = 0; x < width; x++) tiles[y * width + x] = T.GROUND
  }
  return {
    title,
    width,
    height,
    theme: 'day',
    style,
    tiles,
    contents: new Uint8Array(width * height),
    pipes: [],
    objects: [
      { id: 1, kind: 'start', x: 3, y: height - 3, dir: 1, alt: 0 },
      { id: 2, kind: 'goal', x: width - 6, y: height - 3, dir: 1, alt: 0 },
    ],
  }
}

export function cloneLevel(level: LevelDesign): LevelDesign {
  return {
    ...level,
    tiles: level.tiles.slice(),
    contents: level.contents.slice(),
    objects: level.objects.map((o) => ({ ...o })),
    pipes: (level.pipes ?? []).map((p) => ({ ...p })),
  }
}

export const findPipeEndpoint = (level: Pick<LevelDesign, 'pipes'>, id: number): PipeEndpoint | undefined => level.pipes?.find((p) => p.id === id)
export const pipeEndpointAt = (level: Pick<LevelDesign, 'pipes'>, x: number, y: number): PipeEndpoint | undefined => level.pipes?.find((p) => p.x === x && p.y === y)

/** Metadata may outlive edited terrain. A mouth is usable only while the matching top remains. */
export function isPipeMouth(level: Pick<LevelDesign, 'width' | 'height' | 'tiles'>, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x + 1 >= level.width || y < 0 || y >= level.height) return false
  const i = y * level.width + x
  return level.tiles[i] === T.PIPE_L && level.tiles[i + 1] === T.PIPE_R &&
    !(y > 0 && level.tiles[i - level.width] === T.PIPE_L && level.tiles[i - level.width + 1] === T.PIPE_R)
}

export const randomObjectId = (): number => 1 + Math.floor(Math.random() * 0x7ffffffe)

// ---------------------------------------------------------------------------------------------
// Compact JSON form, used for share links, local saves and the room server.

export interface LevelJson {
  v: 1
  title: string
  w: number
  h: number
  theme: Theme
  /** Absent in levels saved before looks existed, which are pixel art. */
  style?: LevelStyle
  /** Run-length encoded tiles, see encodeRuns. */
  tiles: string
  contents: string
  /** [id, kind index, x, y, dir, alt] */
  objects: [number, number, number, number, number, number][]
  /** [endpoint id, mouth x, mouth y, destination id or null]. Old levels omit this. */
  pipes?: [number, number, number, number | null][]
}

/**
 * Run-length encoding: each run is an uppercase letter for the value (A = 0) followed by the run
 * length in lowercase base 36, omitted when it is 1. "AdwBk" is 500 zeros then 20 ones.
 */
export function encodeRuns(values: Uint8Array): string {
  let out = ''
  let i = 0
  while (i < values.length) {
    const v = values[i]
    let n = 1
    while (i + n < values.length && values[i + n] === v) n++
    out += String.fromCharCode(65 + v) + (n > 1 ? n.toString(36) : '')
    i += n
  }
  return out
}

export function decodeRuns(text: string, length: number, maxValue: number): Uint8Array {
  const out = new Uint8Array(length)
  let pos = 0
  let i = 0
  while (i < text.length) {
    const v = text.charCodeAt(i) - 65
    if (v < 0 || v >= maxValue) throw new Error('bad run value')
    i++
    let j = i
    while (j < text.length && /[0-9a-z]/.test(text[j])) j++
    const n = j > i ? parseInt(text.slice(i, j), 36) : 1
    if (!Number.isFinite(n) || n < 1 || pos + n > length) throw new Error('bad run length')
    out.fill(v, pos, pos + n)
    pos += n
    i = j
  }
  if (pos !== length) throw new Error('runs do not cover the level')
  return out
}

export function levelToJson(level: LevelDesign): LevelJson {
  return {
    v: 1,
    title: level.title,
    w: level.width,
    h: level.height,
    theme: level.theme,
    style: level.style,
    tiles: encodeRuns(level.tiles),
    contents: encodeRuns(level.contents),
    objects: level.objects.map((o) => [o.id, OBJECT_KINDS.indexOf(o.kind), o.x, o.y, o.dir, o.alt]),
    pipes: (level.pipes ?? []).map((p) => [p.id, p.x, p.y, p.exitId]),
  }
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

/** Parse and fully validate untrusted level JSON. Throws on anything malformed. */
export function levelFromJson(raw: unknown): LevelDesign {
  if (!raw || typeof raw !== 'object') throw new Error('level must be an object')
  const j = raw as Partial<LevelJson>
  if (j.v !== 1) throw new Error('unsupported level version')
  const { w, h } = j
  if (!isInt(w) || w < LEVEL_MIN_WIDTH || w > LEVEL_MAX_WIDTH) throw new Error('bad width')
  if (!isInt(h) || h < LEVEL_MIN_HEIGHT || h > LEVEL_MAX_HEIGHT) throw new Error('bad height')
  if (typeof j.tiles !== 'string' || typeof j.contents !== 'string') throw new Error('bad tiles')
  const tiles = decodeRuns(j.tiles, w * h, TILE_ID_COUNT)
  const contents = decodeRuns(j.contents, w * h, CONTENT_ID_COUNT)
  for (let i = 0; i < contents.length; i++) if (!holdsContent(tiles[i])) contents[i] = 0
  if (!Array.isArray(j.objects) || j.objects.length > LEVEL_MAX_OBJECTS) throw new Error('bad objects')
  const seen = new Set<number>()
  const singletons = new Set<ObjKind>()
  const objects: LevelObject[] = []
  for (const row of j.objects) {
    if (!Array.isArray(row) || row.length !== 6 || !row.every(isInt)) throw new Error('bad object')
    const [id, k, x, y, dir, alt] = row
    const kind = OBJECT_KINDS[k]
    if (!kind || id < 1 || id > 0x7fffffff || seen.has(id)) throw new Error('bad object id/kind')
    if (x < 0 || x >= w || y < 0 || y >= h) throw new Error('object out of bounds')
    if ((dir !== 1 && dir !== -1) || (alt !== 0 && alt !== 1)) throw new Error('bad object dir/alt')
    if (SINGLETON_KINDS.has(kind)) {
      if (singletons.has(kind)) continue
      singletons.add(kind)
    }
    seen.add(id)
    objects.push({ id, kind, x, y, dir, alt })
  }
  const pipes: PipeEndpoint[] = []
  if (j.pipes !== undefined) {
    if (!Array.isArray(j.pipes) || j.pipes.length > LEVEL_MAX_OBJECTS) throw new Error('bad pipes')
    const ids = new Set<number>()
    const mouths = new Set<string>()
    for (const row of j.pipes) {
      if (!Array.isArray(row) || row.length !== 4) throw new Error('bad pipe')
      const [id, x, y, exitId] = row
      if (!isInt(id) || id < 1 || id > 0x7fffffff || ids.has(id)) throw new Error('bad pipe id')
      if (!isInt(x) || !isInt(y) || x < 0 || x + 1 >= w || y < 0 || y >= h || mouths.has(`${x},${y}`)) throw new Error('bad pipe mouth')
      if (exitId !== null && (!isInt(exitId) || exitId < 1 || exitId > 0x7fffffff || exitId === id)) throw new Error('bad pipe link')
      ids.add(id)
      mouths.add(`${x},${y}`)
      pipes.push({ id, x, y, exitId })
    }
    if (pipes.some((p) => p.exitId !== null && !ids.has(p.exitId))) throw new Error('missing pipe exit')
  }
  const title = typeof j.title === 'string' ? j.title.slice(0, 60) : 'Untitled level'
  const theme: Theme = j.theme === 'underground' ? 'underground' : 'day'
  const style: LevelStyle = j.style === 'cartoon' ? 'cartoon' : 'pixel'
  return { title, width: w, height: h, theme, style, tiles, contents, objects, pipes }
}
