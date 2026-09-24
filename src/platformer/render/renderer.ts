import { SUB, TILE } from '@brick-studio/platformer-core/engine/constants'
import type { LevelStyle } from '@brick-studio/platformer-core/engine/level'
import { T, isAnimated } from '@brick-studio/platformer-core/engine/tiles'
import { EK, ES, type Entity, type World } from '@brick-studio/platformer-core/engine/world'
import type { CharacterId } from '@brick-studio/platformer-core/net/protocol'
import { drawGeneratedCharacter } from '../characters/atlas'
import type { PlayerPose } from './art/characters'
import { CartoonSkin } from './cartoon/cartoonSkin'
import { PixelSkin } from './pixelSkin'
import { drawSprite, type Skin } from './skin'

export interface PlayerLook {
  num: number
  /** Pixel position of the bottom-centre of the hitbox. */
  x: number
  y: number
  facing: 1 | -1
  size: 'small' | 'big'
  pose: PlayerPose
  spark: boolean
  visible: boolean
  name?: string
  /** Selected appearance. Omission keeps the original procedural look for older callers. */
  character?: CharacterId
  /** Shared animation clock; poses still determine movement when this is omitted. */
  animationFrame?: number
  /** 0..1 translucency for players shown while building. */
  alpha?: number
  squash?: number
}

export interface Particle {
  key: string
  frames: number
  x: number
  y: number
  vx: number
  vy: number
  g: number
  age: number
  life: number
  spin?: boolean
}

export interface Hud {
  coins: number
  timeTicks: number | null
  pmeter: number
  pFull: boolean
  message?: string
  sub?: string
}

export interface View {
  world: World
  camX: number
  camY: number
  frame: number
  players: PlayerLook[]
  particles: Particle[]
  localNum: number
  localCheckpoint: number
  hud: Hud | null
  /** Drawn after the world, before the HUD (editor overlays), in world pixels from the camera the frame used. */
  overlay?: (ctx: CanvasRenderingContext2D, skin: Skin, camX: number, camY: number) => void
}

const CHUNK = 16
const CHUNK_PX = CHUNK * TILE
const BUMP_OFFSET = [0, 0, -1, -2, -3, -4, -5, -6, -7, -7, -6, -4, -2]

interface Chunk {
  canvas: HTMLCanvasElement
  animated: number[]
  dirty: boolean
}

/**
 * Draws the game. How it looks comes from the level's style: pixel art is drawn one pixel per world pixel and scaled
 * up by the page; the cartoon look is drawn at the screen's own resolution. Either way the view is the same number
 * of world pixels, so the camera, the editor and the game never need to know which look is on.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D
  /** The view in world pixels. */
  width = 400
  height = 240
  /** Screen pixels per world pixel. */
  scale = 1
  private skin: Skin
  private pixel = new PixelSkin()
  private cartoon: CartoonSkin | null = null
  private chunks = new Map<number, Chunk>()
  private shadow: Uint8Array | null = null
  private shadowKey = ''
  private bumped = new Set<number>()
  private cssW = 0
  private cssH = 0

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.skin = this.pixel
  }

  /** Fit the canvas to its box with whole-number scaling. */
  resize(cssW: number, cssH: number, dpr: number) {
    const pw = Math.max(1, Math.floor(cssW * dpr))
    const ph = Math.max(1, Math.floor(cssH * dpr))
    const s = Math.max(1, Math.min(Math.floor(ph / 224), Math.floor(pw / 320)))
    this.configure(Math.min(Math.ceil(pw / s), 640), Math.min(Math.ceil(ph / s), 360), s, dpr)
  }

  /** Set the view directly: `width` × `height` world pixels at `scale` screen pixels each (thumbnails). */
  configure(width: number, height: number, scale: number, dpr = 1) {
    this.width = width
    this.height = height
    this.scale = scale
    this.cssW = (width * scale) / dpr
    this.cssH = (height * scale) / dpr
    this.applySkin(this.skin.style)
  }

  /** The skin for a style, at the current scale; sizes the canvas for it. */
  private applySkin(style: LevelStyle) {
    if (style === 'cartoon') {
      if (!this.cartoon || this.cartoon.scale !== this.scale) this.cartoon = new CartoonSkin(this.scale)
      this.skin = this.cartoon
    } else this.skin = this.pixel
    const k = this.skin.scale
    this.canvas.width = this.width * k
    this.canvas.height = this.height * k
    this.canvas.style.width = `${this.cssW}px`
    this.canvas.style.height = `${this.cssH}px`
    this.canvas.style.imageRendering = style === 'cartoon' ? 'auto' : ''
    this.chunks.clear()
  }

  /** The look being drawn (for pictures elsewhere in the interface). */
  get style(): LevelStyle {
    return this.skin.style
  }

  /** Convert a CSS-pixel point on the canvas to world pixels. */
  toWorld(cssX: number, cssY: number, camX: number, camY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    return [((cssX - r.left) / r.width) * this.width + camX, ((cssY - r.top) / r.height) * this.height + camY]
  }

  draw(v: View) {
    const w = v.world
    if (w.design.style !== this.skin.style) this.applySkin(w.design.style)
    const skin = this.skin
    const ctx = this.ctx
    const k = skin.scale
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.imageSmoothingEnabled = k > 1
    ctx.imageSmoothingQuality = 'high'
    ctx.globalAlpha = 1
    const camX = skin.snap(v.camX)
    const camY = skin.snap(v.camY)
    skin.background(ctx, v, camX, camY, this.width, this.height)
    this.syncTiles(w)
    // Items still rising out of their block are drawn behind it.
    for (const e of w.entities) if ((e.kind === EK.GROW || e.kind === EK.SPARK_ITEM) && e.state === ES.EMERGING) this.entity(e, v.frame, camX, camY)
    if (skin.chunked) this.tilesChunked(w, v.frame, camX, camY)
    else this.tilesEach(w, v.frame, camX, camY)
    this.course(v, camX, camY)
    for (const e of w.entities) if (!((e.kind === EK.GROW || e.kind === EK.SPARK_ITEM) && e.state === ES.EMERGING)) this.entity(e, v.frame, camX, camY)
    for (const p of v.players) if (p.num !== v.localNum) this.player(p, camX, camY)
    for (const p of v.players) if (p.num === v.localNum) this.player(p, camX, camY)
    this.particles(v.particles, camX, camY)
    v.overlay?.(ctx, skin, camX, camY)
    if (v.hud) skin.hud(ctx, v.hud, this.width, this.height)
  }

  // -------------------------------------------------------------------------------------------

  /** Mark chunks whose tiles changed since they were drawn. */
  private syncTiles(w: World) {
    const key = `${w.width}x${w.height}:${w.design.theme}`
    if (!this.shadow || this.shadowKey !== key) {
      this.shadow = w.tiles.slice()
      this.shadowKey = key
      this.chunks.clear()
      return
    }
    const s = this.shadow
    const t = w.tiles
    for (let i = 0; i < t.length; i++) {
      if (t[i] === s[i]) continue
      s[i] = t[i]
      const x = i % w.width
      const y = (i / w.width) | 0
      for (const [dx, dy] of [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ])
        this.dirty(x + dx, y + dy)
    }
    const now = new Set<number>()
    for (const b of w.bumps) now.add(b.ty * w.width + b.tx)
    for (const i of now) if (!this.bumped.has(i)) this.dirty(i % w.width, (i / w.width) | 0)
    for (const i of this.bumped) if (!now.has(i)) this.dirty(i % w.width, (i / w.width) | 0)
    this.bumped = now
  }

  private dirty(tx: number, ty: number) {
    const c = this.chunks.get(Math.floor(ty / CHUNK) * 4096 + Math.floor(tx / CHUNK))
    if (c) c.dirty = true
  }

  private chunk(w: World, cx: number, cy: number): Chunk {
    const id = cy * 4096 + cx
    let c = this.chunks.get(id)
    if (!c) {
      const canvas = document.createElement('canvas')
      canvas.width = CHUNK_PX
      canvas.height = CHUNK_PX
      c = { canvas, animated: [], dirty: true }
      this.chunks.set(id, c)
    }
    if (c.dirty) {
      const g = c.canvas.getContext('2d')!
      g.clearRect(0, 0, CHUNK_PX, CHUNK_PX)
      c.animated = []
      for (let y = cy * CHUNK; y < Math.min(w.height, (cy + 1) * CHUNK); y++) {
        for (let x = cx * CHUNK; x < Math.min(w.width, (cx + 1) * CHUNK); x++) {
          const i = y * w.width + x
          const t = w.tiles[i]
          if (t === T.EMPTY) continue
          if (isAnimated(t) || this.bumped.has(i)) {
            c.animated.push(i)
            continue
          }
          const k = this.skin.tileKey(w.tiles, w.width, w.height, x, y, w.design.theme, 0)
          if (k) drawSprite(g, this.skin.sprite(k), (x - cx * CHUNK) * TILE, (y - cy * CHUNK) * TILE)
        }
      }
      c.dirty = false
    }
    return c
  }

  /** Pixel art: the level pre-drawn in chunks, with animated and bumped tiles on top. */
  private tilesChunked(w: World, frame: number, camX: number, camY: number) {
    const ctx = this.ctx
    const cx0 = Math.max(0, Math.floor(camX / CHUNK_PX))
    const cy0 = Math.max(0, Math.floor(camY / CHUNK_PX))
    const cx1 = Math.min(Math.ceil(w.width / CHUNK) - 1, Math.floor((camX + this.width) / CHUNK_PX))
    const cy1 = Math.min(Math.ceil(w.height / CHUNK) - 1, Math.floor((camY + this.height) / CHUNK_PX))
    const bumpOf = new Map<number, number>()
    for (const b of w.bumps) bumpOf.set(b.ty * w.width + b.tx, b.timer)
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunk(w, cx, cy)
        ctx.drawImage(c.canvas, cx * CHUNK_PX - camX, cy * CHUNK_PX - camY)
        for (const i of c.animated) {
          const x = i % w.width
          const y = (i / w.width) | 0
          const k = this.skin.tileKey(w.tiles, w.width, w.height, x, y, w.design.theme, Math.floor(frame / 8))
          if (!k) continue
          const dy = BUMP_OFFSET[bumpOf.get(i) ?? 0] ?? 0
          drawSprite(ctx, this.skin.sprite(k), x * TILE - camX, y * TILE - camY + dy)
        }
      }
    }
  }

  /** The cartoon look: every visible tile from its cached picture, top row first so studs sit behind the row above. */
  private tilesEach(w: World, frame: number, camX: number, camY: number) {
    const ctx = this.ctx
    const x0 = Math.max(0, Math.floor(camX / TILE) - 1)
    const y0 = Math.max(0, Math.floor(camY / TILE) - 1)
    const x1 = Math.min(w.width - 1, Math.floor((camX + this.width) / TILE) + 1)
    const y1 = Math.min(w.height - 1, Math.floor((camY + this.height) / TILE) + 1)
    const bumpOf = new Map<number, number>()
    for (const b of w.bumps) bumpOf.set(b.ty * w.width + b.tx, b.timer)
    const f = Math.floor(frame / 8)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w.width + x
        if (w.tiles[i] === T.EMPTY) continue
        const k = this.skin.tileKey(w.tiles, w.width, w.height, x, y, w.design.theme, f)
        if (!k) continue
        const dy = BUMP_OFFSET[bumpOf.get(i) ?? 0] ?? 0
        drawSprite(ctx, this.skin.sprite(k), x * TILE - camX, y * TILE - camY + dy)
      }
    }
  }

  private course(v: View, camX: number, camY: number) {
    const ctx = this.ctx
    for (const o of v.world.design.objects) {
      let key: string
      let x = o.x * TILE
      let y = (o.y + 1) * TILE
      if (o.kind === 'goal') {
        key = 'goal'
        x -= 8
        y -= 160
      } else if (o.kind === 'checkpoint') {
        key = `checkpoint:${v.localCheckpoint === o.id ? v.localNum : 0}`
        y -= 32
      } else if (o.kind === 'start') {
        key = 'start'
        x -= TILE
        y -= 16
      } else continue
      const s = this.skin.sprite(key)
      if (x - s.ox - camX > this.width || x - s.ox + s.w - camX < 0 || y - s.oy - camY > this.height || y - s.oy + s.h - camY < 0) continue
      drawSprite(ctx, s, x - camX, y - camY)
    }
  }

  private entity(e: Entity, frame: number, camX: number, camY: number) {
    const skin = this.skin
    const ex = e.x / SUB
    const ey = e.y / SUB
    if (ex - camX > this.width + 32 || ex - camX < -64 || ey - camY > this.height + 32 || ey - camY < -64) return
    const flip = e.dir < 0 ? '|f' : ''
    const dead = e.state === ES.DEAD
    let key: string
    switch (e.kind) {
      case EK.WALKER:
        key = e.state === ES.SQUASHED ? 'walker:flat' : `walker:${(frame >> 4) % 2 ? 2 : 1}${flip}`
        break
      case EK.FLYER:
        key = `flyer:${(frame >> 2) % 2 ? 2 : 1}${flip}`
        break
      case EK.SHELLBUG:
        if (e.state === ES.SLIDING) key = `shell:${(frame >> 1) % 4}`
        else if (e.state === ES.SHELL || dead) key = 'shell:0'
        else key = `shellbug:${(frame >> 4) % 2 ? 2 : 1}${flip}`
        break
      case EK.SPIKY:
        key = `spiky:${(frame >> 4) % 2 ? 2 : 1}${flip}`
        break
      case EK.PLATFORM:
        drawSprite(this.ctx, skin.sprite('lift'), skin.snap(ex) - camX, skin.snap(ey) - camY)
        return
      case EK.GROW:
        key = 'grow'
        break
      case EK.SPARK_ITEM:
        key = `sparkitem:${(frame >> 3) % 2 ? 2 : 1}`
        break
      case EK.SPARK_SHOT:
        key = e.state === ES.BURST ? 'burst' : `sparkshot:${(frame >> 2) % 4}`
        break
      case EK.COIN_POP:
        key = `coin:${(frame >> 1) % 4}`
        break
      default:
        return
    }
    if (dead) key += '|v'
    const s = skin.sprite(key)
    let dx = skin.snap(ex + e.w / SUB / 2 - s.w / 2)
    const dy = skin.snap(ey + e.h / SUB - s.h)
    if (e.kind === EK.SHELLBUG && e.state === ES.SHELL && e.timer > 420) dx += (frame >> 1) % 2 ? 1 : -1
    drawSprite(this.ctx, s, dx + s.ox - camX, dy + s.oy - camY)
  }

  private player(p: PlayerLook, camX: number, camY: number) {
    if (!p.visible) return
    const ctx = this.ctx
    const skin = this.skin
    if (p.alpha !== undefined) ctx.globalAlpha = p.alpha
    const generatedTop = p.character && p.character !== 'classic'
      ? drawGeneratedCharacter(ctx, { ...p, character: p.character }, skin.style, skin.snap.bind(skin), camX, camY)
      : null
    if (generatedTop !== null) {
      ctx.globalAlpha = 1
      if (p.name) skin.label(ctx, p.name, p.x - camX, generatedTop, '#ffffff')
      return
    }
    const key = `p:${p.num}:${p.size}:${p.pose}:${p.spark ? 1 : 0}${p.facing < 0 ? '|f' : ''}`
    const s = skin.sprite(key)
    const x = skin.snap(p.x - s.w / 2) - camX
    let y = skin.snap(p.y - s.h) - camY
    if (p.squash) {
      const h = skin.snap(s.h * 0.6)
      y += s.h - h
      drawSprite(ctx, s, x - 1 + s.ox, y + s.oy, s.w + 2, h)
    } else drawSprite(ctx, s, x + s.ox, y + s.oy)
    ctx.globalAlpha = 1
    if (p.name) skin.label(ctx, p.name, p.x - camX, y, '#ffffff')
  }

  private particles(list: Particle[], camX: number, camY: number) {
    const skin = this.skin
    for (const q of list) {
      const f = Math.min(q.frames - 1, Math.floor((q.age / q.life) * q.frames))
      let key = q.frames > 1 ? `${q.key}:${f}` : q.key
      if (q.spin && (q.age >> 2) % 2) key += '|f'
      const s = skin.sprite(key)
      drawSprite(this.ctx, s, skin.snap(q.x - s.w / 2) + s.ox - camX, skin.snap(q.y - s.h / 2) + s.oy - camY)
    }
  }
}

export function formatTime(ticks: number): string {
  const s = ticks / 60
  const m = Math.floor(s / 60)
  const rest = (s - m * 60).toFixed(1).padStart(4, '0')
  return `${m}:${rest}`
}
