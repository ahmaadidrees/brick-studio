import { TILE } from '@brick-studio/platformer-core/engine/constants'
import { RT, isRaceBoost } from '@brick-studio/platformer-core/engine/raceTiles'
import { thrownToDraw, walkersToDraw } from '@brick-studio/platformer-core/engine/raceItems'
import type { World } from '@brick-studio/platformer-core/engine/world'
import { drawCoin, drawItemBox, drawNameTag, drawRaceCar, drawRaceTile, drawThrown, drawWalker } from './raceArt'
import type { DrawnCar } from './raceRun'

/*
 * Draws a race level inside the 2D renderer, in the same world pixels and camera as the platformer, so the editor,
 * panning and pointer code are shared. Tiles are painted into 16-by-16-tile chunks and repainted only when a tile
 * (or its neighbour, for kerbs and shadows) changes.
 */

const CHUNK = 16
const CHUNK_PX = CHUNK * TILE
/** Chunks are painted at up to this many screen pixels per world pixel, then scaled. */
const MAX_BAKE = 3

export interface RaceScene {
  cars: DrawnCar[]
  skids: { x: number; y: number }[]
  /** Draws over the track, under the cars (build mode's cursor, the grid, arrows). */
  overlay?: (ctx: CanvasRenderingContext2D) => void
  /** Name tags for cars that are not yours. */
  tags: boolean
  /** Turn the map around the middle of the view ("map turns with car"). */
  rot?: number
  /** Whether the ? block or coin at this tile index is there for you (taken ones come back later); absent: all are. */
  showing?: (i: number) => boolean
}

interface Chunk {
  canvas: HTMLCanvasElement
  dirty: boolean
}

export class RaceView {
  private chunks = new Map<number, Chunk>()
  private shadow: Uint8Array | null = null
  private shadowKey = ''
  private bake = 1
  private boosts: number[] = []
  /** ? blocks and coins: drawn live, since they come and go. */
  private pickups: number[] = []

  /** `k` screen pixels per world pixel; the context already has that scale applied. */
  draw(ctx: CanvasRenderingContext2D, w: World, k: number, camX: number, camY: number, viewW: number, viewH: number, frame: number, scene: RaceScene) {
    this.sync(w, Math.min(MAX_BAKE, Math.max(1, Math.ceil(k))))
    ctx.fillStyle = '#4e9a37'
    ctx.fillRect(-viewW, -viewH, viewW * 3, viewH * 3)
    ctx.save()
    const rot = scene.rot ?? 0
    if (rot) {
      ctx.translate(viewW / 2, viewH / 2)
      ctx.rotate(rot)
      ctx.translate(-viewW / 2, -viewH / 2)
    }
    ctx.translate(-camX, -camY)
    // A turned map shows more around the corners: draw everything within the view's diagonal.
    const pad = rot ? Math.hypot(viewW, viewH) / 2 : 0
    const cx0 = Math.max(0, Math.floor((camX - pad) / CHUNK_PX)), cy0 = Math.max(0, Math.floor((camY - pad) / CHUNK_PX))
    const cx1 = Math.min(Math.ceil(w.width / CHUNK) - 1, Math.floor((camX + viewW + pad) / CHUNK_PX))
    const cy1 = Math.min(Math.ceil(w.height / CHUNK) - 1, Math.floor((camY + viewH + pad) / CHUNK_PX))
    ctx.imageSmoothingEnabled = true
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) ctx.drawImage(this.chunk(w, cx, cy).canvas, cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX, CHUNK_PX)
    // Boost pads pulse.
    ctx.fillStyle = `rgba(255,236,140,${0.2 + 0.2 * Math.sin(frame / 6)})`
    for (const i of this.boosts) ctx.fillRect((i % w.width) * TILE, Math.floor(i / w.width) * TILE, TILE, TILE)
    ctx.fillStyle = 'rgba(25,28,36,.28)'
    for (const s of scene.skids) ctx.fillRect(s.x - 0.9, s.y - 0.9, 1.8, 1.8)
    const itemsOn = w.design.race?.items ?? true
    for (const i of this.pickups) {
      if (scene.showing && !scene.showing(i)) continue
      const x = (i % w.width) * TILE + TILE / 2, y = Math.floor(i / w.width) * TILE + TILE / 2
      if (w.design.tiles[i] === RT.ITEM) drawItemBox(ctx, x, y, frame + i * 7, itemsOn ? 1 : 0.35)
      else drawCoin(ctx, x, y, frame + i * 5)
    }
    const thrown = thrownToDraw(w)
    for (const t of thrown) if (t.kind === 'oil') drawThrown(ctx, t.kind, t.x, t.y, frame, t.left)
    scene.overlay?.(ctx)
    for (const k of walkersToDraw(w)) drawWalker(ctx, k.x, k.y, k.dir, frame, k.flat)
    for (const t of thrown) if (t.kind !== 'oil') drawThrown(ctx, t.kind, t.x, t.y, frame, t.left)
    for (const c of scene.cars) drawRaceCar(ctx, c, c.color, { lift: c.lift, flame: c.flame, shield: c.shield, frame })
    if (scene.tags) for (const c of scene.cars) if (!c.you) drawNameTag(ctx, c.x, c.y - c.lift * 6, c.name, c.color, rot)
    ctx.restore()
  }

  /** Mark chunks whose tiles changed; start over when the level's size or the bake scale changes. */
  private sync(w: World, bake: number) {
    const tiles = w.design.tiles
    const key = `${w.width}x${w.height}`
    if (!this.shadow || this.shadowKey !== key || this.bake !== bake) {
      this.shadow = tiles.slice()
      this.shadowKey = key
      this.bake = bake
      this.chunks.clear()
      this.findLive(tiles)
      return
    }
    let changed = false
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === this.shadow[i]) continue
      this.shadow[i] = tiles[i]
      changed = true
      const x = i % w.width, y = Math.floor(i / w.width)
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const c = this.chunks.get(Math.floor((y + dy) / CHUNK) * 4096 + Math.floor((x + dx) / CHUNK))
        if (c) c.dirty = true
      }
    }
    if (changed) this.findLive(tiles)
  }

  /** Tiles drawn live over the chunks: pulsing boost pads, ? blocks and coins. */
  private findLive(tiles: Uint8Array) {
    this.boosts = []
    this.pickups = []
    for (let i = 0; i < tiles.length; i++) {
      if (isRaceBoost(tiles[i])) this.boosts.push(i)
      else if (tiles[i] === RT.ITEM || tiles[i] === RT.COIN) this.pickups.push(i)
    }
  }

  private chunk(w: World, cx: number, cy: number): Chunk {
    const id = cy * 4096 + cx
    let c = this.chunks.get(id)
    if (!c) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = CHUNK_PX * this.bake
      c = { canvas, dirty: true }
      this.chunks.set(id, c)
    }
    if (c.dirty) {
      const g = c.canvas.getContext('2d')
      if (g) {
        const { tiles, width, height } = { tiles: w.design.tiles, width: w.width, height: w.height }
        g.setTransform(this.bake, 0, 0, this.bake, -cx * CHUNK_PX * this.bake, -cy * CHUNK_PX * this.bake)
        g.clearRect(cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX, CHUNK_PX)
        for (let y = cy * CHUNK; y < Math.min(height, (cy + 1) * CHUNK); y++) {
          for (let x = cx * CHUNK; x < Math.min(width, (cx + 1) * CHUNK); x++) {
            drawRaceTile(g, x, y, tiles[y * width + x], (dx, dy) => {
              const nx = x + dx, ny = y + dy
              return nx < 0 || ny < 0 || nx >= width || ny >= height ? RT.BARRIER : tiles[ny * width + nx]
            })
          }
        }
      }
      c.dirty = false
    }
    return c
  }
}
