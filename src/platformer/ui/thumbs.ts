import { TILE } from '@brick-studio/platformer-core/engine/constants'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { createWorld } from '@brick-studio/platformer-core/engine/world'
import { Renderer } from '../render/renderer'

/* Picture cards for levels: the start of the level, drawn by the game's own renderer. */

export const THUMB_W = 256
export const THUMB_H = 144

const cache = new Map<string, string>()
let renderer: Renderer | null = null

export function levelThumb(design: LevelDesign, cacheKey: string): string {
  const hit = cache.get(cacheKey)
  if (hit) return hit
  // One renderer for every thumbnail keeps its art cache warm.
  renderer ??= new Renderer(document.createElement('canvas'))
  const r = renderer
  // Pixel art is crisp at one pixel per world pixel (the page scales it up); the cartoon look is drawn at 2×.
  r.configure(THUMB_W, THUMB_H, design.style === 'cartoon' ? 2 : 1)
  const start = design.objects.find((o) => o.kind === 'start')
  const sx = start ? start.x * TILE + TILE / 2 : 2 * TILE
  const sy = start ? (start.y + 1) * TILE : (design.height - 2) * TILE
  const camX = Math.max(0, Math.min(sx - 72, design.width * TILE - THUMB_W))
  const camY = Math.max(0, Math.min(sy - Math.round(THUMB_H * 0.74), design.height * TILE - THUMB_H))
  r.draw({
    world: createWorld(design),
    camX,
    camY,
    frame: 0,
    players: start ? [{ num: 1, x: sx, y: sy, facing: 1, size: 'small', pose: 'stand', spark: false, visible: true }] : [],
    particles: [],
    localNum: 1,
    localCheckpoint: 0,
    hud: null,
  })
  const url = r.canvas.toDataURL()
  cache.set(cacheKey, url)
  return url
}
