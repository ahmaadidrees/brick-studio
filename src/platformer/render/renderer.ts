import { SUB, TILE } from '@brick-studio/platformer-core/engine/constants'
import { T, isAnimated } from '@brick-studio/platformer-core/engine/tiles'
import { EK, ES, type Entity, type World } from '@brick-studio/platformer-core/engine/world'
import { tileKey } from './art/library'
import { PAL } from './art/palette'
import type { PlayerPose } from './art/characters'
import { Atlas } from './atlas'

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
  /** Drawn after the world, before the HUD (editor overlays). */
  overlay?: (ctx: CanvasRenderingContext2D, atlas: Atlas) => void
}

const CHUNK = 16
const CHUNK_PX = CHUNK * TILE
const BUMP_OFFSET = [0, 0, -1, -2, -3, -4, -5, -6, -7, -7, -6, -4, -2]

interface Chunk {
  canvas: HTMLCanvasElement
  animated: number[]
  dirty: boolean
}

const hash = (n: number) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

export class Renderer {
  readonly atlas = new Atlas()
  readonly ctx: CanvasRenderingContext2D
  width = 400
  height = 240
  scale = 1
  private chunks = new Map<number, Chunk>()
  private shadow: Uint8Array | null = null
  private shadowKey = ''
  private bumped = new Set<number>()

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!
  }

  /** Fit the canvas to its box with whole-number pixel scaling. */
  resize(cssW: number, cssH: number, dpr: number) {
    const pw = Math.max(1, Math.floor(cssW * dpr))
    const ph = Math.max(1, Math.floor(cssH * dpr))
    const s = Math.max(1, Math.min(Math.floor(ph / 224), Math.floor(pw / 320)))
    this.scale = s
    this.width = Math.min(Math.ceil(pw / s), 640)
    this.height = Math.min(Math.ceil(ph / s), 360)
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.canvas.style.width = `${(this.width * s) / dpr}px`
    this.canvas.style.height = `${(this.height * s) / dpr}px`
    this.ctx.imageSmoothingEnabled = false
  }

  /** Convert a CSS-pixel point on the canvas to world pixels. */
  toWorld(cssX: number, cssY: number, camX: number, camY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    return [((cssX - r.left) / r.width) * this.width + camX, ((cssY - r.top) / r.height) * this.height + camY]
  }

  draw(v: View) {
    const ctx = this.ctx
    const w = v.world
    const camX = Math.round(v.camX)
    const camY = Math.round(v.camY)
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = 1
    this.background(v, camX, camY)
    this.syncTiles(w)
    // Items still rising out of their block are drawn behind it.
    for (const e of w.entities) if ((e.kind === EK.GROW || e.kind === EK.SPARK_ITEM) && e.state === ES.EMERGING) this.entity(e, v.frame, camX, camY)
    this.tiles(w, v.frame, camX, camY)
    this.course(v, camX, camY)
    for (const e of w.entities) if (!((e.kind === EK.GROW || e.kind === EK.SPARK_ITEM) && e.state === ES.EMERGING)) this.entity(e, v.frame, camX, camY)
    for (const p of v.players) if (p.num !== v.localNum) this.player(p, camX, camY)
    for (const p of v.players) if (p.num === v.localNum) this.player(p, camX, camY)
    this.particles(v.particles, camX, camY)
    v.overlay?.(ctx, this.atlas)
    if (v.hud) this.hud(v.hud)
  }

  // -------------------------------------------------------------------------------------------

  private background(v: View, camX: number, camY: number) {
    const ctx = this.ctx
    const w = v.world
    const underground = w.design.theme === 'underground'
    ctx.fillStyle = underground ? PAL.skyUnder : PAL.sky
    ctx.fillRect(0, 0, this.width, this.height)
    // Below the level (visible when touch buttons push the view down): solid earth.
    const below = w.height * TILE - camY
    if (below < this.height) {
      ctx.fillStyle = underground ? PAL.stoneMortar : PAL.mortar
      ctx.fillRect(0, below, this.width, this.height - below)
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
      const last = Math.ceil((offset + this.width) / L.spacing)
      for (let i = first; i <= last; i++) {
        const r = hash(i * 7 + L.salt)
        if (r < 0.25) continue
        const x = Math.round(i * L.spacing + r * L.spacing * 0.5 - offset)
        ctx.drawImage(img, x, Math.round(L.y(img.height)))
      }
    }
  }

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
          const k = tileKey(w.tiles, w.width, w.height, x, y, w.design.theme, 0)
          if (k) g.drawImage(this.atlas.get(k), (x - cx * CHUNK) * TILE, (y - cy * CHUNK) * TILE)
        }
      }
      c.dirty = false
    }
    return c
  }

  private tiles(w: World, frame: number, camX: number, camY: number) {
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
          const k = tileKey(w.tiles, w.width, w.height, x, y, w.design.theme, Math.floor(frame / 8))
          if (!k) continue
          const dy = BUMP_OFFSET[bumpOf.get(i) ?? 0] ?? 0
          ctx.drawImage(this.atlas.get(k), x * TILE - camX, y * TILE - camY + dy)
        }
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
      const img = this.atlas.get(key)
      if (x - camX > this.width || x + img.width - camX < 0 || y - camY > this.height || y + img.height - camY < 0) continue
      ctx.drawImage(img, x - camX, y - camY)
    }
  }

  private entity(e: Entity, frame: number, camX: number, camY: number) {
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
        this.ctx.drawImage(this.atlas.get('lift'), Math.round(ex) - camX, Math.round(ey) - camY)
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
    const img = this.atlas.get(key)
    let dx = Math.round(ex + e.w / SUB / 2 - img.width / 2)
    const dy = Math.round(ey + e.h / SUB - img.height)
    if (e.kind === EK.SHELLBUG && e.state === ES.SHELL && e.timer > 420) dx += (frame >> 1) % 2 ? 1 : -1
    this.ctx.drawImage(img, dx - camX, dy - camY)
  }

  private player(p: PlayerLook, camX: number, camY: number) {
    if (!p.visible) return
    const ctx = this.ctx
    const key = `p:${p.num}:${p.size}:${p.pose}:${p.spark ? 1 : 0}${p.facing < 0 ? '|f' : ''}`
    const img = this.atlas.get(key)
    const x = Math.round(p.x - img.width / 2) - camX
    let y = Math.round(p.y - img.height) - camY
    if (p.alpha !== undefined) ctx.globalAlpha = p.alpha
    if (p.squash) {
      const h = Math.round(img.height * 0.6)
      y += img.height - h
      ctx.drawImage(img, x - 1, y, img.width + 2, h)
    } else ctx.drawImage(img, x, y)
    ctx.globalAlpha = 1
    if (p.name) {
      const tw = this.atlas.textWidth(p.name)
      this.atlas.text(ctx, p.name, Math.round(p.x - tw / 2) - camX, y - 11, '#ffffff')
    }
  }

  private particles(list: Particle[], camX: number, camY: number) {
    for (const q of list) {
      const f = Math.min(q.frames - 1, Math.floor((q.age / q.life) * q.frames))
      let key = q.frames > 1 ? `${q.key}:${f}` : q.key
      if (q.spin && (q.age >> 2) % 2) key += '|f'
      const img = this.atlas.get(key)
      this.ctx.drawImage(img, Math.round(q.x - img.width / 2) - camX, Math.round(q.y - img.height / 2) - camY)
    }
  }

  private hud(h: Hud) {
    const ctx = this.ctx
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
    if (h.message) this.banner(h.message, h.sub)
  }

  private banner(msg: string, sub?: string) {
    const ctx = this.ctx
    const w = this.atlas.textWidth(msg) * 2
    const x = Math.round((this.width - w) / 2)
    const y = Math.round(this.height * 0.3)
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
      this.atlas.text(ctx, sub, Math.round((this.width - sw) / 2), y + 21, '#ffffff')
    }
  }
}

export function formatTime(ticks: number): string {
  const s = ticks / 60
  const m = Math.floor(s / 60)
  const rest = (s - m * 60).toFixed(1).padStart(4, '0')
  return `${m}:${rest}`
}
