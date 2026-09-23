import { C, T } from '../engine/tiles'
import type { LevelDesign, LevelObject, LevelStyle, ObjKind, Theme } from '../engine/level'

/**
 * Levels written as text, one character per tile. Handy for hand-built courses and tests.
 *
 *   #  ground        X  hard block     B  brick         ?  ? block (coin)
 *   M  ? block (grow)                  F  ? block (spark)
 *   b  brick holding a coin            N  bounce block   S  spring
 *   o  coin          =  one-way platform                 [ ]  pipe (left, right)
 *   ^  spikes        ~  lava
 *   @  start         G  goal           C  checkpoint
 *   g  walker        k  shellbug       s  spiky          f  flyer
 *   p  moving platform (sideways)      P  moving platform (up and down)
 *   m  grow power-up                   z  spark power-up
 *   .  or space: empty
 */
const TILES: Record<string, [number, number]> = {
  '#': [T.GROUND, C.NONE],
  X: [T.HARD, C.NONE],
  B: [T.BRICK, C.NONE],
  b: [T.BRICK, C.COIN],
  '?': [T.QBLOCK, C.COIN],
  M: [T.QBLOCK, C.GROW],
  F: [T.QBLOCK, C.SPARK],
  N: [T.BOUNCE, C.NONE],
  S: [T.SPRING, C.NONE],
  o: [T.COIN, C.NONE],
  '=': [T.SEMI, C.NONE],
  '[': [T.PIPE_L, C.NONE],
  ']': [T.PIPE_R, C.NONE],
  '^': [T.SPIKES, C.NONE],
  '~': [T.LAVA, C.NONE],
}

const OBJECTS: Record<string, [ObjKind, 1 | -1, 0 | 1]> = {
  '@': ['start', 1, 0],
  G: ['goal', 1, 0],
  C: ['checkpoint', 1, 0],
  g: ['walker', -1, 0],
  k: ['shellbug', -1, 0],
  s: ['spiky', -1, 0],
  f: ['flyer', -1, 0],
  p: ['platform', 1, 0],
  P: ['platform', 1, 1],
  m: ['grow', 1, 0],
  z: ['spark', 1, 0],
}

export function levelFromAscii(rows: string[], title = 'Level', theme: Theme = 'day', style: LevelStyle = 'cartoon'): LevelDesign {
  const height = rows.length
  const width = rows[0].length
  rows.forEach((r, i) => {
    if (r.length !== width) throw new Error(`row ${i} is ${r.length} wide, expected ${width}`)
  })
  const tiles = new Uint8Array(width * height)
  const contents = new Uint8Array(width * height)
  const objects: LevelObject[] = []
  let nextId = 1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x]
      if (ch === '.' || ch === ' ') continue
      const tile = TILES[ch]
      if (tile) {
        tiles[y * width + x] = tile[0]
        contents[y * width + x] = tile[1]
        continue
      }
      const obj = OBJECTS[ch]
      if (!obj) throw new Error(`unknown level character '${ch}' at ${x},${y}`)
      objects.push({ id: nextId++, kind: obj[0], x, y, dir: obj[1], alt: obj[2] })
    }
  }
  return { title, width, height, theme, style, tiles, contents, objects }
}

/** Join level screens side by side. Every screen must have the same number of rows. */
export function joinScreens(...screens: string[][]): string[] {
  const height = screens[0].length
  for (const s of screens) if (s.length !== height) throw new Error('screens differ in height')
  return Array.from({ length: height }, (_, y) => screens.map((s) => s[y]).join(''))
}
