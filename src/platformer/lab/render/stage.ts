import { SUB, TILE } from '@brick-studio/platformer-core/engine/constants'
import { createPlayer } from '@brick-studio/platformer-core/engine/player'
import { DEFAULT_CHARACTER } from '@brick-studio/platformer-core/net/protocol'
import { drawGeneratedCharacter } from '../../characters/atlas'
import { rr } from '../../render/cartoon/paint'
import { playerLook } from '../../game/session'
import { drawSprite, type Skin } from '../../render/skin'
import { MEMORY_ICONS, PHRASE_TEXT, type MemoryName } from '../program/types'
import { COSTUME_BOX } from '../sim/things'
import type { LabWorld, Thing } from '../sim/types'
import { COLOR_HEX, type CostumeArt } from './costumes'

/*
 * What the lab draws over the level's tiles (the /2d renderer draws the sky and the tiles): every thing in its
 * costume, you, speech bubbles, memories shown over things, the thing being watched, and the build guides.
 */

const FONT = 'Fredoka, Nunito, system-ui, sans-serif'

export interface StageView {
  world: LabWorld
  frame: number
  /** The thing whose code is open: outlined. */
  watch: number
  build: boolean
  /** Build: the cell under the pointer, what a click would place there, and the thing picked up. */
  hover: { x: number; y: number } | null
  ghost: { costume: Thing['costume']; w: number } | null
  erasing: boolean
  selected: number
}

/** Draw order: goal behind, then blocks and platforms, then everything else. */
function layer(t: Thing): number {
  if (t.costume === 'goal') return 0
  if (t.solid) return 1
  return 2
}

function drawThing(ctx: CanvasRenderingContext2D, skin: Skin, art: CostumeArt, t: Thing, frame: number, tick: number, camX: number, camY: number) {
  const placed = art.costume(skin, t.costume, frame + t.id * 7, t.facing, t.color)
  if (!placed) return
  const s = placed.sprite
  const k = t.size / 100
  const w = s.w * k
  const h = s.h * k
  const cx = (t.x + t.w / 2) / SUB
  const bottom = (t.y + t.h) / SUB + placed.drop * k
  const x = skin.snap(cx - w / 2)
  const y = skin.snap(bottom - h)
  const blink = t.hurtAt > 0 && tick - t.hurtAt < 60 && (frame >> 2) % 2 === 0
  if (blink) ctx.globalAlpha = 0.45
  drawSprite(ctx, { ...s, ox: 0, oy: 0 }, x - camX, y - camY, w, h)
  ctx.globalAlpha = 1
}

let tintCanvas: HTMLCanvasElement | null = null

/** The builder in a color: drawn on its own canvas, painted keeping its shading, then put on the stage. */
function drawPlayerTinted(ctx: CanvasRenderingContext2D, skin: Skin, w: LabWorld, t: Thing, frame: number, camX: number, camY: number) {
  const k = skin.scale
  const size = 64
  if (!tintCanvas) tintCanvas = document.createElement('canvas')
  const c = tintCanvas
  c.width = size * k
  c.height = size * k
  const g = c.getContext('2d')
  if (!g) return
  // Draw as if the camera put the player's feet at the middle bottom of this small canvas.
  const feetX = (t.x + t.w / 2) / SUB
  const feetY = (t.y + t.h) / SUB
  g.setTransform(k, 0, 0, k, 0, 0)
  drawPlayer(g, skin, w, t, frame, feetX - size / 2, feetY - size + 4)
  g.setTransform(1, 0, 0, 1, 0, 0)
  const color = COLOR_HEX[t.color as Exclude<Thing['color'], 'none'>]
  if (t.color === 'white' || t.color === 'black') {
    g.globalCompositeOperation = 'source-atop'
    g.globalAlpha = 0.62
    g.fillStyle = color
    g.fillRect(0, 0, c.width, c.height)
  } else {
    const mask = document.createElement('canvas')
    mask.width = c.width
    mask.height = c.height
    mask.getContext('2d')?.drawImage(c, 0, 0)
    g.globalCompositeOperation = 'color'
    g.fillStyle = color
    g.fillRect(0, 0, c.width, c.height)
    g.globalCompositeOperation = 'destination-in'
    g.drawImage(mask, 0, 0)
  }
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  ctx.drawImage(c, feetX - size / 2 - camX, feetY - size + 4 - camY, size, size)
}

function drawPlayer(ctx: CanvasRenderingContext2D, skin: Skin, w: LabWorld, t: Thing, frame: number, camX: number, camY: number) {
  const p = createPlayer(1)
  Object.assign(p, {
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
    vx: t.riding ? 0 : t.vx,
    vy: t.vy,
    facing: t.facing,
    onGround: t.onGround || !!t.riding,
    skid: t.hs.skid,
    anim: t.hs.anim,
  })
  const look = playerLook(p, frame)
  if (t.riding) look.pose = 'stand'
  if (t.hurtAt > 0 && w.tick - t.hurtAt < 60 && (frame >> 2) % 2 === 0) return
  const k = t.size / 100
  ctx.save()
  if (k !== 1) {
    const fx = look.x - camX
    const fy = look.y - camY
    ctx.translate(fx, fy)
    ctx.scale(k, k)
    ctx.translate(-fx, -fy)
  }
  const top = drawGeneratedCharacter(ctx, { ...look, character: DEFAULT_CHARACTER }, 'cartoon', skin.snap.bind(skin), camX, camY)
  if (top === null) {
    const s = skin.sprite(`p:1:small:${look.pose}:0${look.facing < 0 ? '|f' : ''}`)
    drawSprite(ctx, s, skin.snap(look.x - s.w / 2) + s.ox - camX, skin.snap(look.y - s.h) + s.oy - camY)
  }
  ctx.restore()
}

function bubble(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number) {
  ctx.save()
  ctx.font = `700 7px ${FONT}`
  const tw = ctx.measureText(text).width
  const w = tw + 10
  const h = 12
  const x = cx - w / 2
  const y = bottom - h - 5
  rr(ctx, x, y, w, h, 5)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(38, 60, 81, 0.55)'
  ctx.lineWidth = 0.7
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - 3, y + h - 0.4)
  ctx.lineTo(cx, y + h + 4)
  ctx.lineTo(cx + 3, y + h - 0.4)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.fillStyle = '#263c51'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, y + h / 2 + 0.4)
  ctx.restore()
}

function meter(ctx: CanvasRenderingContext2D, label: string, value: number | boolean, cx: number, bottom: number) {
  ctx.save()
  const text = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(Math.round(value * 10) / 10)
  ctx.font = `700 6.5px ${FONT}`
  const tw = ctx.measureText(`${label} ${text}`).width
  const w = tw + 8
  const h = 9
  const x = cx - w / 2
  const y = bottom - h
  rr(ctx, x, y, w, h, 4.5)
  ctx.fillStyle = 'rgba(38, 60, 81, 0.86)'
  ctx.fill()
  // A fill bar for 0–100 numbers (fuel, health).
  if (typeof value === 'number' && value >= 0 && value <= 100) {
    ctx.save()
    rr(ctx, x, y, w, h, 4.5)
    ctx.clip()
    ctx.fillStyle = value > 25 ? 'rgba(92, 196, 102, 0.55)' : 'rgba(241, 120, 97, 0.7)'
    ctx.fillRect(x, y, (w * value) / 100, h)
    ctx.restore()
  }
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${label} ${text}`, cx, y + h / 2 + 0.3)
  ctx.restore()
}

/** Everything the lab draws after the tiles, in world pixels from the camera. */
export function drawStage(ctx: CanvasRenderingContext2D, skin: Skin, art: CostumeArt, v: StageView, camX: number, camY: number, viewW: number, viewH: number) {
  const w = v.world
  if (v.build) {
    // A light grid to place by.
    ctx.save()
    ctx.strokeStyle = skin.grid.color
    ctx.lineWidth = skin.grid.width
    ctx.beginPath()
    for (let x = Math.floor(camX / TILE) * TILE; x < camX + viewW; x += TILE) {
      ctx.moveTo(x - camX, 0)
      ctx.lineTo(x - camX, viewH)
    }
    for (let y = Math.floor(camY / TILE) * TILE; y < camY + viewH; y += TILE) {
      ctx.moveTo(0, y - camY)
      ctx.lineTo(viewW, y - camY)
    }
    ctx.stroke()
    ctx.restore()
    // The start flag.
    const start = skin.sprite('start')
    drawSprite(ctx, start, w.start.x * TILE - TILE - camX, (w.start.y + 1) * TILE - 16 - camY)
  }
  const player = w.things.find((t) => t.id === w.playerId)
  // You are a thing like any other: in another costume you are drawn like one; in your own, as the builder.
  const you = (p: Thing) => {
    if (p.costume !== 'hero') drawThing(ctx, skin, art, p, v.frame, w.tick, camX, camY)
    else if (p.color !== 'none') drawPlayerTinted(ctx, skin, w, p, v.frame, camX, camY)
    else drawPlayer(ctx, skin, w, p, v.frame, camX, camY)
  }
  const inCar = player?.riding ? w.things.find((t) => t.id === player.riding && t.costume === 'car') : undefined
  const list = w.things.filter((t) => !t.removed && t.id !== w.playerId).sort((a, b) => layer(a) - layer(b) || a.id - b.id)
  for (const t of list) {
    if (t === inCar && player) you(player)
    drawThing(ctx, skin, art, t, v.frame, w.tick, camX, camY)
  }
  if (player && !inCar) you(player)

  // Words and numbers over things.
  for (const t of w.things) {
    if (t.removed) continue
    const cx = (t.x + t.w / 2) / SUB - camX
    let top = t.y / SUB - camY - (t.id === w.playerId ? 10 : 2)
    const pl = player
    for (const key of t.shown) {
      const [scope, name] = key.split(':') as ['my' | 'player', MemoryName]
      const mem = scope === 'my' ? t.mem : pl?.mem
      meter(ctx, MEMORY_ICONS[name] ?? name, mem?.[name] ?? 0, cx, top)
      top -= 10.5
    }
    if (t.say) bubble(ctx, PHRASE_TEXT[t.say], cx, top)
  }

  const outline = (t: Thing, color: string, dash: number[]) => {
    const pad = 2
    const box = COSTUME_BOX[t.costume]
    const hx = Math.max(t.w / SUB, box.w * (t.size / 100))
    const cx = (t.x + t.w / 2) / SUB
    ctx.save()
    ctx.setLineDash(dash)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    rr(ctx, cx - hx / 2 - pad - camX, t.y / SUB - pad - camY, hx + 2 * pad, t.h / SUB + 2 * pad, 3)
    ctx.stroke()
    ctx.restore()
  }
  const watched = w.things.find((t) => t.id === v.watch && !t.removed)
  if (watched) outline(watched, 'rgba(244, 202, 58, 0.95)', [3, 2])
  if (v.build) {
    const sel = w.things.find((t) => t.id === v.selected && !t.removed)
    if (sel && sel !== watched) outline(sel, 'rgba(53, 101, 191, 0.9)', [])
    if (v.hover) {
      const hx = v.hover.x * TILE - camX
      const hy = v.hover.y * TILE - camY
      ctx.save()
      if (v.ghost && !v.erasing) {
        const bw = Math.max(TILE, COSTUME_BOX[v.ghost.costume].w)
        ctx.globalAlpha = 0.5
        const placed = art.costume(skin, v.ghost.costume, 0, 1, 'none')
        if (placed) {
          const s = placed.sprite
          const left = bw > TILE ? hx : hx + TILE / 2 - s.w / 2
          drawSprite(ctx, { ...s, ox: 0, oy: 0 }, left, hy + TILE - s.h + placed.drop)
        }
        ctx.globalAlpha = 1
      }
      ctx.strokeStyle = v.erasing ? 'rgba(201, 70, 58, 0.9)' : 'rgba(53, 101, 191, 0.9)'
      ctx.lineWidth = 1
      ctx.strokeRect(hx + 0.5, hy + 0.5, TILE - 1, TILE - 1)
      ctx.restore()
    }
  }
}
