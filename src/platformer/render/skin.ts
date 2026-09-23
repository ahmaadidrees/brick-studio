import type { LevelStyle, Theme } from '@brick-studio/platformer-core/engine/level'
import type { Hud, View } from './renderer'

/**
 * A picture in world pixels. `img` may hold more pixels than that: the cartoon look draws its art at screen
 * resolution. `ox`/`oy` is how far the picture reaches left of and above the point it is drawn at (tiles with
 * studs reach up into the cell above).
 */
export interface Sprite {
  img: CanvasImageSource
  w: number
  h: number
  ox: number
  oy: number
}

/**
 * How a level looks. The renderer walks the world the same way for every look; a skin supplies the pictures (by the
 * same art keys, so the editor and the entities need not know which look is on), the background and the HUD.
 */
export interface Skin {
  readonly style: LevelStyle
  /** Device pixels per world pixel the art is drawn at (1 for pixel art, which the page scales up). */
  readonly scale: number
  /** One device pixel in world units: grid lines and thin outlines. */
  readonly hairline: number
  /** Pixel art pre-draws the level in chunks; the cartoon look draws each tile. */
  readonly chunked: boolean
  /** The build grid's lines. */
  readonly grid: { color: string; width: number }
  sprite(key: string): Sprite
  tileKey(tiles: Uint8Array, width: number, height: number, x: number, y: number, theme: Theme, frame: number): string | null
  background(ctx: CanvasRenderingContext2D, v: View, camX: number, camY: number, viewW: number, viewH: number): void
  hud(ctx: CanvasRenderingContext2D, h: Hud, viewW: number, viewH: number): void
  /** A player's name, centred on `cx`, sitting on `bottom`. */
  label(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number, color: string): void
  /** Round a world coordinate to what this look can show (whole pixels for pixel art). */
  snap(v: number): number
}

/** Draw a sprite with its anchor at (x, y), optionally stretched to w × h world pixels (margins stretch with it). */
export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, w = s.w, h = s.h) {
  ctx.drawImage(s.img, x - (s.ox * w) / s.w, y - (s.oy * h) / s.h, w, h)
}
