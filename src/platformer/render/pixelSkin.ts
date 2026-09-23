import { TILE } from '@brick-studio/platformer-core/engine/constants'
import type { Theme } from '@brick-studio/platformer-core/engine/level'
import { tileKey } from './art/library'
import { PAL } from './art/palette'
import { Atlas } from './atlas'
import { formatTime, type Hud, type View } from './renderer'
import type { Skin, Sprite } from './skin'

const hash = (n: number) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/** The original look: NES-flavoured pixel art, drawn at one pixel per world pixel and scaled up by the page. */
export class PixelSkin implements Skin {
  readonly style = 'pixel' as const
  readonly scale = 1
  readonly hairline = 1
  readonly chunked = true
  readonly grid = { color: 'rgba(255,255,255,0.10)', width: 1 }
  readonly atlas = new Atlas()
  private sprites = new Map<string, Sprite>()

  sprite(key: string): Sprite {
    let s = this.sprites.get(key)
    if (!s) {
      const img = this.atlas.get(key)
      s = { img, w: img.width, h: img.height, ox: 0, oy: 0 }
      this.sprites.set(key, s)
    }
    return s
  }

  tileKey(tiles: Uint8Array, width: number, height: number, x: number, y: number, theme: Theme, frame: number) {
    return tileKey(tiles, width, height, x, y, theme, frame)
  }

  snap(v: number) {
    return Math.round(v)
  }

  background(ctx: CanvasRenderingContext2D, v: View, camX: number, camY: number, viewW: number, viewH: number) {
    const w = v.world
    const underground = w.design.theme === 'underground'
    ctx.fillStyle = underground ? PAL.skyUnder : PAL.sky
    ctx.fillRect(0, 0, viewW, viewH)
    // Below the level (visible when touch buttons push the view down): solid earth.
    const below = w.height * TILE - camY
    if (below < viewH) {
      ctx.fillStyle = underground ? PAL.stoneMortar : PAL.mortar
      ctx.fillRect(0, below, viewW, viewH - below)
    }
    if (underground) return
    // Scenery sits on the level's ground line and scrolls sideways more slowly than the level.
    const groundY = w.height * TILE - camY - 2 * TILE
    const layers: { key: string; spacing: number; par: number; y: (h: number) => number; salt: number }[] = [
      { key: 'cloud:big', spacing: 300, par: 0.15, y: () => groundY - 200, salt: 1 },
      { key: 'cloud:small', spacing: 220, par: 0.22, y: () => groundY - 150, salt: 2 },
      { key: 'hill:big:far', spacing: 380, par: 0.3, y: (h) => groundY - h + 14, salt: 3 },
      { key: 'hill:small:near', spacing: 260, par: 0.55, y: (h) => groundY - h + 4, salt: 4 },
    ]
    for (const L of layers) {
      const img = this.atlas.get(L.key)
      const offset = camX * L.par
      const first = Math.floor((offset - img.width) / L.spacing)
      const last = Math.ceil((offset + viewW) / L.spacing)
      for (let i = first; i <= last; i++) {
        const r = hash(i * 7 + L.salt)
        if (r < 0.25) continue
        const x = Math.round(i * L.spacing + r * L.spacing * 0.5 - offset)
        ctx.drawImage(img, x, Math.round(L.y(img.height)))
      }
    }
  }

  hud(ctx: CanvasRenderingContext2D, h: Hud, viewW: number, viewH: number) {
    const a = this.atlas
    ctx.drawImage(a.get('coin:0'), 4, 3)
    a.text(ctx, `x${String(h.coins).padStart(2, '0')}`, 19, 7)
    // Run meter: six arrows and a P.
    for (let i = 0; i < 6; i++) {
      const lit = h.pmeter > i
      ctx.fillStyle = lit ? '#ffffff' : '#3b4560'
      const x = 6 + i * 7
      ctx.fillRect(x, 22, 2, 5)
      ctx.fillRect(x + 2, 23, 2, 3)
      ctx.fillRect(x + 4, 24, 1, 1)
    }
    const pOn = h.pFull
    ctx.fillStyle = pOn ? '#ffcf33' : '#3b4560'
    ctx.fillRect(49, 20, 11, 9)
    a.text(ctx, 'P', 51, 21, pOn ? '#1d1a2e' : '#8a94a6')
    if (h.timeTicks !== null) a.text(ctx, `TIME ${formatTime(h.timeTicks)}`, 4, 33)
    if (h.message) this.banner(ctx, h.message, viewW, viewH, h.sub)
  }

  label(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number, color: string) {
    const tw = this.atlas.textWidth(text)
    this.atlas.text(ctx, text, Math.round(cx - tw / 2), bottom - 11, color)
  }

  private banner(ctx: CanvasRenderingContext2D, msg: string, viewW: number, viewH: number, sub?: string) {
    const w = this.atlas.textWidth(msg) * 2
    const x = Math.round((viewW - w) / 2)
    const y = Math.round(viewH * 0.3)
    ctx.fillStyle = 'rgba(29,26,46,0.75)'
    ctx.fillRect(x - 8, y - 6, w + 16, sub ? 38 : 28)
    // Big text: draw each glyph canvas at double size.
    const tmp = document.createElement('canvas')
    tmp.width = this.atlas.textWidth(msg)
    tmp.height = 9
    this.atlas.text(tmp.getContext('2d')!, msg, 0, 0, '#ffcf33')
    ctx.drawImage(tmp, x, y, tmp.width * 2, 18)
    if (sub) {
      const sw = this.atlas.textWidth(sub)
      this.atlas.text(ctx, sub, Math.round((viewW - sw) / 2), y + 21, '#ffffff')
    }
  }
}
