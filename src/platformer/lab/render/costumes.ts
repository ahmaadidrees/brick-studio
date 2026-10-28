import { INK, TONE, WHITE, brick, edge, eye, rr, shade, type G } from '../../render/cartoon/paint'
import type { Skin, Sprite } from '../../render/skin'
import type { Costume, LabColor } from '../program/types'
import type { CostumeFrame, CostumeSet } from '../costumes/model'

/*
 * Costume pictures. Creatures, blocks, springs, coins, the platform and the goal are the cartoon look's own art
 * (asked of the skin by its keys); the ball, car, rocket, crate and star are drawn here the same way, with the same
 * paint helpers, at the screen's resolution. A color paints over a picture keeping its shading.
 */

/** The cartoon skin's key for a costume, when it has one. */
export function skinKey(costume: Costume, frame: number): string | null {
  switch (costume) {
    case 'walker':
      return `walker:${(frame >> 4) % 2 ? 2 : 1}`
    case 'walkerFlat':
      return 'walker:flat'
    case 'spiky':
      return `spiky:${(frame >> 4) % 2 ? 2 : 1}`
    case 'flyer':
      return `flyer:${(frame >> 2) % 2 ? 2 : 1}`
    case 'spring':
      return 'spring:0'
    case 'springDown':
      return 'spring:1'
    case 'qblock':
      return `Q:${(frame >> 3) % 4}:1`
    case 'usedBlock':
      return 'U:1'
    case 'platform':
      return 'lift'
    case 'coin':
      return `coin:${(frame >> 3) % 4}`
    case 'goal':
      return 'goal'
    default:
      return null
  }
}

export const COLOR_HEX: Readonly<Record<Exclude<LabColor, 'none'>, string>> = {
  red: '#e7473c',
  orange: '#ff8b3d',
  yellow: '#ffc93c',
  green: '#4cae62',
  blue: '#3e83d7',
  purple: '#7b5cd1',
  pink: '#f27bb0',
  white: '#ffffff',
  black: '#26323f',
}

interface Drawn {
  w: number
  h: number
  /** How far the art hangs below the box's bottom (a rocket's flame). */
  drop: number
  draw: (g: G) => void
}

function ball(g: G) {
  g.beginPath()
  g.arc(5, 5, 4.2, 0, Math.PI * 2)
  g.fillStyle = TONE.blue[0]
  g.fill()
  g.save()
  g.clip()
  g.fillStyle = TONE.blue[2]
  g.fillRect(0, 6.2, 10, 4)
  g.fillStyle = WHITE
  g.globalAlpha = 0.9
  g.fillRect(0, 4.2, 10, 1.3)
  g.restore()
  g.beginPath()
  g.arc(3.6, 3.4, 1.1, 0, Math.PI * 2)
  g.fillStyle = WHITE
  g.globalAlpha = 0.75
  g.fill()
  g.globalAlpha = 1
  g.beginPath()
  g.arc(5, 5, 4.2, 0, Math.PI * 2)
  edge(g, 0.5, 0.6)
}

function wheel(g: G, cx: number, cy: number) {
  g.beginPath()
  g.arc(cx, cy, 3.3, 0, Math.PI * 2)
  g.fillStyle = INK
  g.fill()
  g.beginPath()
  g.arc(cx, cy, 1.5, 0, Math.PI * 2)
  g.fillStyle = TONE.metal[0]
  g.fill()
  edge(g, 0.4, 0.4)
}

/** A convertible of bricks, facing right; the rider sits in it. */
function car(g: G) {
  // Windscreen
  g.beginPath()
  g.moveTo(21, 6)
  g.lineTo(23.5, 0.8)
  g.lineTo(25, 1.2)
  g.lineTo(23.2, 6)
  g.closePath()
  g.fillStyle = 'rgba(151, 216, 248, 0.85)'
  g.fill()
  edge(g, 0.45, 0.5)
  // Body
  brick(g, TONE.red, 1, 5.5, 30, 7, { r: [2.5, 3.5, 2.5, 2.5] })
  brick(g, TONE.red, 22, 4, 9, 3, { r: [1, 2.5, 0, 0] })
  // Seat back
  brick(g, TONE.used, 3, 1.5, 4.5, 5, { r: 1.4 })
  // Lights
  rr(g, 29, 7, 2, 2.4, 0.8)
  g.fillStyle = TONE.gold[1]
  g.fill()
  rr(g, 0.6, 7.5, 1.6, 2, 0.6)
  g.fillStyle = TONE.coral[0]
  g.fill()
  wheel(g, 8, 12.8)
  wheel(g, 24, 12.8)
}

/** A toy rocket, nose up; with `fire`, a flame below. */
function rocket(g: G, fire: boolean) {
  if (fire) {
    g.beginPath()
    g.moveTo(3.5, 29)
    g.quadraticCurveTo(7, 44, 10.5, 29)
    g.closePath()
    g.fillStyle = TONE.lava[0]
    g.fill()
    g.beginPath()
    g.moveTo(5, 29)
    g.quadraticCurveTo(7, 38, 9, 29)
    g.closePath()
    g.fillStyle = TONE.gold[1]
    g.fill()
  }
  // Fins
  for (const side of [-1, 1]) {
    g.beginPath()
    const x = side < 0 ? 3 : 11
    g.moveTo(x, 18)
    g.lineTo(side < 0 ? -0.5 : 14.5, 27)
    g.lineTo(side < 0 ? -0.5 : 14.5, 29.5)
    g.lineTo(x, 27)
    g.closePath()
    g.fillStyle = TONE.red[0]
    g.fill()
    edge(g, 0.45, 0.5)
  }
  // Nozzle
  rr(g, 4, 26.5, 6, 3.3, 1)
  g.fillStyle = TONE.hard[0]
  g.fill()
  edge(g, 0.4, 0.45)
  // Body
  g.beginPath()
  g.moveTo(7, 0.4)
  g.bezierCurveTo(12.2, 4, 12.2, 10, 11.6, 27.5)
  g.lineTo(2.4, 27.5)
  g.bezierCurveTo(1.8, 10, 1.8, 4, 7, 0.4)
  g.closePath()
  shade(g, TONE.metal, 1.8, 0.4, 10.4, 27.1, 0.2, 0.25)
  g.beginPath()
  g.moveTo(7, 0.4)
  g.bezierCurveTo(12.2, 4, 12.2, 10, 11.6, 27.5)
  g.lineTo(2.4, 27.5)
  g.bezierCurveTo(1.8, 10, 1.8, 4, 7, 0.4)
  g.closePath()
  edge(g, 0.5, 0.6)
  // Nose band and window
  g.save()
  g.beginPath()
  g.moveTo(7, 0.4)
  g.bezierCurveTo(12.2, 4, 12.2, 10, 11.6, 27.5)
  g.lineTo(2.4, 27.5)
  g.bezierCurveTo(1.8, 10, 1.8, 4, 7, 0.4)
  g.clip()
  g.fillStyle = TONE.red[0]
  g.fillRect(0, 0, 14, 6.5)
  g.restore()
  g.beginPath()
  g.arc(7, 12.5, 2.6, 0, Math.PI * 2)
  g.fillStyle = TONE.plate[1]
  g.fill()
  g.lineWidth = 1
  g.strokeStyle = TONE.plate[2]
  g.stroke()
  g.beginPath()
  g.arc(6.2, 11.7, 0.8, 0, Math.PI * 2)
  g.fillStyle = WHITE
  g.fill()
}

function crate(g: G) {
  brick(g, TONE.used, 0.3, 0.3, 15.4, 15.4, { r: 1.6, studs: [4, 12] })
  g.strokeStyle = TONE.used[2]
  g.lineWidth = 1.3
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(2.6, 2.6)
  g.lineTo(13.4, 13.4)
  g.moveTo(13.4, 2.6)
  g.lineTo(2.6, 13.4)
  g.stroke()
  rr(g, 2, 2, 12, 12, 1)
  g.lineWidth = 0.8
  g.stroke()
}

function star(g: G) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 3.1 : 7
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const x = 7 + Math.cos(a) * r
    const y = 7.6 + Math.sin(a) * r
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
  shade(g, TONE.gold, 0, 0.6, 14, 14, 0.35, 0.2)
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 3.1 : 7
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const x = 7 + Math.cos(a) * r
    const y = 7.6 + Math.sin(a) * r
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
  edge(g, 0.55, 0.6)
  eye(g, 5.6, 7.4, 0.9, 1.2, 1, 0.3)
  eye(g, 8.4, 7.4, 0.9, 1.2, 1, 0.3)
}

const DRAWN: Partial<Record<Costume, Drawn>> = {
  ball: { w: 10, h: 10, drop: 1, draw: (g) => ball(g) },
  car: { w: 32, h: 16.2, drop: 2.2, draw: (g) => car(g) },
  rocket: { w: 14, h: 30, drop: 0, draw: (g) => rocket(g, false) },
  rocketFire: { w: 14, h: 44, drop: 14, draw: (g) => rocket(g, true) },
  crate: { w: 16, h: 16, drop: 0, draw: (g) => crate(g) },
  star: { w: 14, h: 15, drop: 1, draw: (g) => star(g) },
}

/** A picture for a costume, placed with its bottom middle on a box's bottom middle. */
export interface Placed {
  sprite: Sprite
  /** Art that hangs below the box, in world pixels. */
  drop: number
}

const customCanvases = new WeakMap<CostumeFrame, HTMLCanvasElement>()
const thumbnailCache = new WeakMap<CostumeFrame, Map<number, string>>()

/** Turn one saved frame into a canvas once; its immutable frame object is the cache key. */
export function costumeFrameCanvas(set: CostumeSet, frame: CostumeFrame): HTMLCanvasElement {
  let canvas = customCanvases.get(frame)
  if (canvas) return canvas
  canvas = document.createElement('canvas')
  canvas.width = set.width
  canvas.height = set.height
  const g = canvas.getContext('2d')
  if (g) {
    const data = g.createImageData(set.width, set.height)
    for (let i = 0; i < set.width * set.height; i++) {
      const at = i * 8
      const out = i * 4
      for (let c = 0; c < 4; c++) data.data[out + c] = parseInt(frame.pixels.slice(at + c * 2, at + c * 2 + 2), 16)
    }
    g.putImageData(data, 0, 0)
  }
  customCanvases.set(frame, canvas)
  return canvas
}

export function costumeThumbnail(set: CostumeSet, px = 64): string {
  return costumeFrameThumbnail(set, 0, px)
}

export function costumeFrameThumbnail(set: CostumeSet, index: number, px = 64): string {
  const frame = set.frames[index] ?? set.frames[0]
  if (!frame || px < 1) return ''
  const cached = thumbnailCache.get(frame)?.get(px)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = c.height = px
  const g = c.getContext('2d')
  if (!g) return ''
  g.imageSmoothingEnabled = false
  g.drawImage(costumeFrameCanvas(set, frame), 0, 0, px, px)
  const url = c.toDataURL()
  const bySize = thumbnailCache.get(frame) ?? new Map<number, string>()
  bySize.set(px, url)
  thumbnailCache.set(frame, bySize)
  return url
}

/** Pictures for costumes at a skin's scale, cached (with their colors and their mirror images). */
export class CostumeArt {
  private cache = new Map<string, Sprite>()
  private customCache = new WeakMap<CostumeFrame, Map<string, Sprite>>()

  constructor(readonly scale: number) {}

  private canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.ceil(w * this.scale))
    c.height = Math.max(1, Math.ceil(h * this.scale))
    return [c, c.getContext('2d')]
  }

  private drawn(costume: Costume): Sprite | null {
    const d = DRAWN[costume]
    if (!d) return null
    const key = `drawn:${costume}`
    let s = this.cache.get(key)
    if (!s) {
      const [c, g] = this.canvas(d.w, d.h)
      if (g) {
        g.scale(this.scale, this.scale)
        d.draw(g)
      }
      s = { img: c, w: d.w, h: d.h, ox: 0, oy: 0 }
      this.cache.set(key, s)
    }
    return s
  }

  private mirrored(key: string, s: Sprite): Sprite {
    const k = `${key}|f`
    let m = this.cache.get(k)
    if (!m) {
      const src = s.img as HTMLCanvasElement
      const [c, g] = this.canvas(s.w, s.h)
      c.width = src.width
      c.height = src.height
      if (g) {
        g.translate(c.width, 0)
        g.scale(-1, 1)
        g.drawImage(src, 0, 0)
      }
      m = { ...s, img: c }
      this.cache.set(k, m)
    }
    return m
  }

  private tinted(key: string, s: Sprite, color: Exclude<LabColor, 'none'>): Sprite {
    const k = `${key}|${color}`
    let t = this.cache.get(k)
    if (!t) {
      const src = s.img as HTMLCanvasElement
      const c = document.createElement('canvas')
      c.width = src.width
      c.height = src.height
      const g = c.getContext('2d')
      if (g) {
        g.drawImage(src, 0, 0)
        if (color === 'white' || color === 'black') {
          g.globalCompositeOperation = 'source-atop'
          g.globalAlpha = 0.62
          g.fillStyle = COLOR_HEX[color]
          g.fillRect(0, 0, c.width, c.height)
        } else {
          g.globalCompositeOperation = 'color'
          g.fillStyle = COLOR_HEX[color]
          g.fillRect(0, 0, c.width, c.height)
          g.globalCompositeOperation = 'destination-in'
          g.drawImage(src, 0, 0)
        }
      }
      t = { ...s, img: c }
      this.cache.set(k, t)
    }
    return t
  }

  /** The picture for a costume this frame, facing a way, in a color. */
  costume(skin: Skin, costume: Costume, frame: number, facing: 1 | -1, color: LabColor): Placed | null {
    const sk = skinKey(costume, frame)
    let base: Sprite | null
    let key: string
    if (sk) {
      base = skin.sprite(sk)
      key = `skin:${sk}`
    } else {
      base = this.drawn(costume)
      key = `drawn:${costume}`
    }
    if (!base) return null
    let s = base
    // Creatures and vehicles are drawn facing right; blocks look the same either way.
    const mirrors = costume !== 'qblock' && costume !== 'usedBlock' && costume !== 'platform' && costume !== 'coin' && costume !== 'goal' && costume !== 'spring' && costume !== 'springDown' && costume !== 'crate' && costume !== 'rocket' && costume !== 'rocketFire' && costume !== 'ball'
    if (mirrors && facing < 0) {
      s = this.mirrored(key, s)
      key = `${key}|f`
    }
    if (color !== 'none') s = this.tinted(key, s, color)
    return { sprite: s, drop: DRAWN[costume]?.drop ?? 0 }
  }

  /** A kid's painted frame, anchored like the original art and scaled by the original art's outer extent. */
  custom(set: CostumeSet, index: number, facing: 1 | -1, color: LabColor, side: number): Placed | null {
    if (!set.frames.length) return null
    const frame = set.frames[((index % set.frames.length) + set.frames.length) % set.frames.length]
    const key = `${facing}|${color}|${side}`
    let variants = this.customCache.get(frame)
    if (!variants) {
      variants = new Map()
      this.customCache.set(frame, variants)
    }
    const hit = variants.get(key)
    if (hit) return { sprite: hit, drop: 0 }
    const source = costumeFrameCanvas(set, frame)
    const target = document.createElement('canvas')
    target.width = set.width
    target.height = set.height
    const g = target.getContext('2d')
    if (!g) return null
    g.imageSmoothingEnabled = false
    if (facing < 0) {
      g.translate(set.width, 0)
      g.scale(-1, 1)
    }
    g.drawImage(source, 0, 0)
    g.setTransform(1, 0, 0, 1, 0, 0)
    if (color !== 'none') {
      if (color === 'white' || color === 'black') {
        g.globalCompositeOperation = 'source-atop'
        g.globalAlpha = 0.62
        g.fillStyle = COLOR_HEX[color]
        g.fillRect(0, 0, set.width, set.height)
      } else {
        const mask = document.createElement('canvas')
        mask.width = set.width
        mask.height = set.height
        mask.getContext('2d')?.drawImage(target, 0, 0)
        g.globalCompositeOperation = 'color'
        g.fillStyle = COLOR_HEX[color]
        g.fillRect(0, 0, set.width, set.height)
        g.globalCompositeOperation = 'destination-in'
        g.drawImage(mask, 0, 0)
      }
    }
    const sprite: Sprite = { img: target, w: side, h: side, ox: 0, oy: 0 }
    variants.set(key, sprite)
    return { sprite, drop: 0 }
  }
}

/** A plain-paint preview of a costume for menus and lists (a data URL), at `px` pixels square. */
export function costumePreview(skin: Skin, art: CostumeArt, costume: Costume, color: LabColor, px: number): string {
  const placed = art.costume(skin, costume, 0, 1, color)
  if (!placed) return ''
  const s = placed.sprite
  const c = document.createElement('canvas')
  c.width = px
  c.height = px
  const g = c.getContext('2d')
  if (!g) return ''
  const k = Math.min((px - 4) / s.w, (px - 4) / s.h)
  const w = s.w * k
  const h = s.h * k
  g.imageSmoothingQuality = 'high'
  g.drawImage(s.img, (px - w) / 2, (px - h) / 2, w, h)
  return c.toDataURL()
}
