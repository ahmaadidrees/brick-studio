import { TILE } from '@brick-studio/platformer-core/engine/constants'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { RT } from '@brick-studio/platformer-core/engine/raceTiles'
import { drawRaceTile } from './raceArt'

const cache = new Map<string, string>()

/** A small picture of a whole race track, for cards. Cached by key. */
export function raceThumb(level: LevelDesign, key: string, width = 320): string {
  const hit = cache.get(key)
  if (hit) return hit
  const { width: w, height: h, tiles } = level
  const s = width / (w * TILE)
  const c = document.createElement('canvas')
  c.width = width
  c.height = Math.round(h * TILE * s)
  const g = c.getContext('2d')
  if (!g) return ''
  g.scale(s, s)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      drawRaceTile(g, x, y, tiles[y * w + x], (dx, dy) => {
        const nx = x + dx, ny = y + dy
        return nx < 0 || ny < 0 || nx >= w || ny >= h ? RT.BARRIER : tiles[ny * w + nx]
      })
    }
  }
  let url = ''
  try {
    url = c.toDataURL('image/png')
  } catch {
    // jsdom and locked-down browsers: no picture.
  }
  cache.set(key, url)
  return url
}
