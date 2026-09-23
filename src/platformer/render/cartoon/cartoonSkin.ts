import { TILE } from '@brick-studio/platformer-core/engine/constants'
import type { Theme } from '@brick-studio/platformer-core/engine/level'
import type { PlayerPose } from '../art/characters'
import { playerColor } from '../art/palette'
import { formatTime, type Hud, type View } from '../renderer'
import { drawSprite, type Skin, type Sprite } from '../skin'
import { BUILDER_SIZE, drawBuilder } from './builder'
import { INK, TONE, WHITE, rr, type G, type Tone } from './paint'
import { SCENERY_SIZE, drawScenery, layerSpots } from './scenery'
import { THING_SIZE, drawThing } from './things'
import { cartoonTileKey, drawTile, fromPixelKey } from './tiles'

const PLAYER_KEY = /^p:(\d+):(small|big):([a-z0-9]+):([01])$/
const CARTOON_TILE = /^([GHBQUOSPXL](:|$)|spring:)/
const FONT = 'Fredoka, Nunito, system-ui, sans-serif'

/** A colour blended toward white (`t` 0..1). */
function lighten(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * t)
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

/** A player's colour as a brick tone. */
export function playerTone(num: number): Tone {
  const [base, dark] = playerColor(num)
  return [base, lighten(base, 0.38), dark]
}

/**
 * The cartoon look: toy bricks, drawn at the screen's resolution. Pictures are made on first use and kept; a new skin
 * is made when the screen scale changes, so they are always sharp.
 */
export class CartoonSkin implements Skin {
  readonly style = 'cartoon' as const
  readonly chunked = false
  readonly hairline: number
  readonly grid: { color: string; width: number }
  private cache = new Map<string, Sprite>()
  private skyKey = ''
  private sky: CanvasGradient | null = null

  constructor(readonly scale: number) {
    this.hairline = 1 / scale
    this.grid = { color: 'rgba(38, 60, 81, 0.11)', width: Math.max(1.5 / scale, 0.2) }
  }

  snap(v: number) {
    return Math.round(v * this.scale) / this.scale
  }

  tileKey(tiles: Uint8Array, width: number, height: number, x: number, y: number, theme: Theme, frame: number) {
    return cartoonTileKey(tiles, width, height, x, y, theme, frame)
  }

  sprite(key: string): Sprite {
    let s = this.cache.get(key)
    if (s) return s
    if (key.endsWith('|f')) s = this.mirror(this.sprite(key.slice(0, -2)), true)
    else if (key.endsWith('|v')) s = this.mirror(this.sprite(key.slice(0, -2)), false)
    else s = this.build(key)
    this.cache.set(key, s)
    return s
  }

  private make(w: number, h: number, ox: number, oy: number, draw: (g: G) => void): Sprite {
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.ceil(w * this.scale))
    c.height = Math.max(1, Math.ceil(h * this.scale))
    const g = c.getContext('2d')
    if (g) {
      g.scale(this.scale, this.scale)
      g.translate(ox, oy)
      draw(g)
    }
    return { img: c, w, h, ox, oy }
  }

  private mirror(s: Sprite, horizontal: boolean): Sprite {
    const src = s.img as HTMLCanvasElement
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    const g = c.getContext('2d')
    if (g) {
      if (horizontal) {
        g.translate(c.width, 0)
        g.scale(-1, 1)
      } else {
        g.translate(0, c.height)
        g.scale(1, -1)
      }
      g.drawImage(src, 0, 0)
    }
    return { ...s, img: c }
  }

  private build(key: string): Sprite {
    const tile = CARTOON_TILE.test(key) ? key : fromPixelKey(key)
    if (tile) return this.make(16, 19, 0, 3, (g) => drawTile(g, tile))
    if (key.startsWith('spring:')) return this.make(16, 19, 0, 3, (g) => drawTile(g, key))
    if (key === 'pipeicon')
      return this.make(32, 35, 0, 3, (g) => {
        drawTile(g, 'P:L:1')
        g.translate(16, 0)
        drawTile(g, 'P:R:1')
        g.translate(-16, 16)
        drawTile(g, 'P:L:0')
        g.translate(16, 0)
        drawTile(g, 'P:R:0')
      })
    const m = PLAYER_KEY.exec(key)
    if (m) {
      const size = m[2] as 'small' | 'big'
      const box = BUILDER_SIZE[size]
      return this.make(box.w, box.h, box.w / 2, box.h, (g) => drawBuilder(g, size, m[3] as PlayerPose, { shirt: playerTone(Number(m[1])), spark: m[4] === '1' }))
    }
    const scenery = SCENERY_SIZE[key]
    if (scenery) return this.make(scenery.w, scenery.h, 0, 0, (g) => drawScenery(g, key))
    const base = key.split(':')[0]
    const size = THING_SIZE[key] ?? THING_SIZE[base]
    if (size) return this.make(size.w, size.h, size.ox ?? 0, size.oy ?? 0, (g) => drawThing(g, key, { playerColor: playerTone }))
    return this.make(16, 16, 0, 0, () => {})
  }

  background(ctx: CanvasRenderingContext2D, v: View, camX: number, camY: number, viewW: number, viewH: number) {
    const w = v.world
    const under = w.design.theme === 'underground'
    const skyKey = `${viewH}:${under}`
    if (!this.sky || this.skyKey !== skyKey) {
      const grad = ctx.createLinearGradient(0, 0, 0, viewH)
      if (under) {
        grad.addColorStop(0, '#141c33')
        grad.addColorStop(1, '#27365c')
      } else {
        grad.addColorStop(0, '#62bcf2')
        grad.addColorStop(0.62, '#a9ddfa')
        grad.addColorStop(1, '#e3f6ff')
      }
      this.sky = grad
      this.skyKey = skyKey
    }
    ctx.fillStyle = this.sky
    ctx.fillRect(0, 0, viewW, viewH)
    const groundY = w.height * TILE - camY - 2 * TILE
    const layer = (key: string, par: number, spacing: number, salt: number, y: (h: number) => number, keep?: number) => {
      const s = this.sprite(key)
      const top = y(s.h)
      if (top > viewH || top + s.h < 0) return
      for (const x of layerSpots(camX * par, viewW, spacing, s.w, salt, keep)) drawSprite(ctx, s, this.snap(x), this.snap(top))
    }
    if (!under) {
      // The sun, fixed in the sky.
      const sx = viewW * 0.84
      const sy = Math.min(viewH * 0.18, 42)
      const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 34)
      glow.addColorStop(0, 'rgba(255, 244, 190, 0.9)')
      glow.addColorStop(1, 'rgba(255, 244, 190, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(sx - 34, sy - 34, 68, 68)
      ctx.beginPath()
      ctx.arc(sx, sy, 11, 0, Math.PI * 2)
      ctx.fillStyle = '#fff2b0'
      ctx.fill()
      layer('cloud:big', 0.12, 260, 11, () => groundY - 196)
      layer('cloud:small', 0.2, 190, 12, () => groundY - 148)
      layer('hill:far', 0.3, 230, 13, (h) => groundY - h + 22, 0.9)
      layer('tree', 0.42, 150, 14, (h) => groundY - h + 12, 0.55)
      layer('hill:near', 0.55, 170, 15, (h) => groundY - h + 8, 0.8)
    } else {
      // Rock hangs from the top of the view; crystals glow in the gloom; stalagmites rise from the floor.
      layer('rock:top', 0.25, 140, 21, () => -10, 0.8)
      layer('glow', 0.32, 90, 23, () => Math.min(viewH * 0.45, groundY - 70), 0.5)
      layer('glow', 0.36, 120, 24, () => Math.min(viewH * 0.25, groundY - 120), 0.4)
      layer('rock:bottom', 0.4, 170, 22, (h) => groundY - h + 18, 0.85)
    }
    // Below the level (visible when touch buttons push the view down).
    const below = w.height * TILE - camY
    if (below < viewH) {
      ctx.fillStyle = under ? '#1d2745' : TONE.earth[0][2]
      ctx.fillRect(0, below, viewW, viewH - below)
    }
  }

  hud(ctx: CanvasRenderingContext2D, h: Hud, viewW: number, viewH: number) {
    ctx.save()
    ctx.textBaseline = 'middle'
    // Coins
    this.pill(ctx, 5, 5, 37, 14)
    drawSprite(ctx, this.sprite('coin:0'), 6.2, 6, 12, 12)
    ctx.font = `700 9px ${FONT}`
    ctx.fillStyle = INK
    ctx.fillText(`× ${String(h.coins).padStart(2, '0')}`, 19, 12.4)
    // Time
    if (h.timeTicks !== null) {
      this.pill(ctx, 45, 5, 44, 14)
      ctx.beginPath()
      ctx.arc(52, 12, 3.6, 0, Math.PI * 2)
      ctx.fillStyle = WHITE
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 0.9
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(52, 12)
      ctx.lineTo(52, 9.8)
      ctx.moveTo(52, 12)
      ctx.lineTo(53.6, 12.8)
      ctx.lineWidth = 0.8
      ctx.stroke()
      ctx.fillStyle = INK
      ctx.fillText(formatTime(h.timeTicks), 57.5, 12.4)
    }
    // Run meter: six chevrons and a P.
    for (let i = 0; i < 6; i++) {
      const lit = h.pmeter > i
      const x = 7 + i * 5.2
      ctx.beginPath()
      ctx.moveTo(x, 22)
      ctx.lineTo(x + 3, 25)
      ctx.lineTo(x, 28)
      ctx.lineTo(x + 1.6, 28)
      ctx.lineTo(x + 4.6, 25)
      ctx.lineTo(x + 1.6, 22)
      ctx.closePath()
      ctx.fillStyle = lit ? TONE.gold[0] : 'rgba(38, 60, 81, 0.28)'
      ctx.fill()
      if (lit) {
        ctx.strokeStyle = INK
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
    }
    rr(ctx, 39, 21, 9, 8, 2)
    ctx.fillStyle = h.pFull ? TONE.gold[0] : 'rgba(255, 255, 255, 0.72)'
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 0.5
    ctx.stroke()
    ctx.font = `700 6.5px ${FONT}`
    ctx.fillStyle = h.pFull ? INK : 'rgba(38, 60, 81, 0.55)'
    ctx.textAlign = 'center'
    ctx.fillText('P', 43.5, 25.4)
    ctx.textAlign = 'left'
    if (h.message) this.banner(ctx, h.message, viewW, viewH, h.sub)
    ctx.restore()
  }

  private pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    rr(ctx, x, y, w, h, h / 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(38, 60, 81, 0.18)'
    ctx.lineWidth = 0.6
    ctx.stroke()
  }

  private banner(ctx: CanvasRenderingContext2D, msg: string, viewW: number, viewH: number, sub?: string) {
    const title = msg.charAt(0) + msg.slice(1).toLowerCase()
    ctx.font = `700 16px ${FONT}`
    const tw = ctx.measureText(title).width
    ctx.font = `600 7px ${FONT}`
    const sw = sub ? ctx.measureText(sub).width : 0
    const w = Math.max(tw, sw) + 24
    const h = sub ? 38 : 28
    const x = (viewW - w) / 2
    const y = viewH * 0.26
    rr(ctx, x, y, w, h, 9)
    ctx.fillStyle = 'rgba(38, 60, 81, 0.9)'
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.font = `700 16px ${FONT}`
    ctx.fillStyle = TONE.gold[0]
    ctx.fillText(title, viewW / 2, y + 14.5)
    if (sub) {
      ctx.font = `600 7px ${FONT}`
      ctx.fillStyle = WHITE
      ctx.fillText(sub, viewW / 2, y + 29)
    }
    ctx.textAlign = 'left'
  }

  label(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number, color: string) {
    ctx.save()
    ctx.font = `700 6px ${FONT}`
    const tw = ctx.measureText(text).width
    const w = tw + 6
    const h = 8
    const x = cx - w / 2
    const y = bottom - h - 1.5
    rr(ctx, x, y, w, h, h / 2)
    ctx.fillStyle = 'rgba(38, 60, 81, 0.78)'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.fillStyle = WHITE
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cx, y + h / 2 + 0.3)
    ctx.restore()
  }
}
