import { TILE } from '@brick-studio/platformer-core/engine/constants'
import { RT, isRaceBoost, raceBoostDir, raceGrassy, raceSolid } from '@brick-studio/platformer-core/engine/raceTiles'
import type { CarSpot } from '@brick-studio/platformer-core/engine/car'

/*
 * The race kit seen from above, in the toy-brick look: studded grass and dirt plates, smooth grey road tiles with
 * red and white kerbs where they meet grass, raised barrier bricks that cast a shadow down and to the right. Drawn in
 * world pixels (a tile is 16); the caller scales.
 */

type Ctx = CanvasRenderingContext2D
/** The tile next to this one, dx and dy away. Outside the level counts as a barrier. */
export type Neighbour = (dx: number, dy: number) => number

const T = TILE
const DEG = Math.PI / 180

function studs(c: Ctx, x: number, y: number, face: string, r = 2.6) {
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const cx = x + 4 + i * 8, cy = y + 4 + j * 8
      c.fillStyle = 'rgba(0,0,0,.16)'
      c.beginPath(); c.arc(cx + 0.6, cy + 0.8, r, 0, 7); c.fill()
      c.fillStyle = face
      c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill()
      c.fillStyle = 'rgba(255,255,255,.35)'
      c.beginPath(); c.arc(cx - 0.6, cy - 0.7, r / 2, 0, 7); c.fill()
    }
  }
}

function roadBase(c: Ctx, px: number, py: number, x: number, y: number) {
  c.fillStyle = '#626a7c'
  c.fillRect(px, py, T, T)
  const h = (x * 73 + y * 151) % 7
  c.fillStyle = 'rgba(255,255,255,.07)'
  c.fillRect(px + h * 2, py + ((h * 5) % 13), 2, 2)
  c.fillRect(px + ((h * 3) % 13), py + h + 6, 2, 2)
}

export function drawArrow(c: Ctx, cx: number, cy: number, dir: number, size: number, color: string) {
  c.save()
  c.translate(cx, cy)
  c.rotate(dir * 90 * DEG)
  c.fillStyle = color
  c.beginPath()
  c.moveTo(size, 0); c.lineTo(-size * 0.2, -size * 0.75); c.lineTo(-size * 0.2, -size * 0.3); c.lineTo(-size, -size * 0.3)
  c.lineTo(-size, size * 0.3); c.lineTo(-size * 0.2, size * 0.3); c.lineTo(-size * 0.2, size * 0.75)
  c.closePath(); c.fill()
  c.restore()
}

/** One tile at tile (x, y). Item boxes and coins are drawn live on top (they come and go), not here. */
export function drawRaceTile(c: Ctx, x: number, y: number, t: number, nb: Neighbour) {
  const px = x * T, py = y * T
  if (t === RT.GRASS || t === RT.FLOWERS || t === RT.TREE) {
    c.fillStyle = '#5fb244'; c.fillRect(px, py, T, T)
    studs(c, px, py, '#6fc254')
    if (t === RT.FLOWERS) {
      const cols = ['#ff7eb6', '#ffd34d', '#ffffff', '#b18cff']
      for (let i = 0; i < 4; i++) {
        c.fillStyle = cols[(x + y + i) % 4]
        c.beginPath(); c.arc(px + 4 + (i % 2) * 8, py + 4 + (i >> 1) * 8, 1.9, 0, 7); c.fill()
      }
    }
    if (t === RT.TREE) {
      c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.arc(px + 9.5, py + 10, 7, 0, 7); c.fill()
      c.fillStyle = '#2f7d32'; c.beginPath(); c.arc(px + 8, py + 8, 7.2, 0, 7); c.fill()
      c.fillStyle = '#3f9a3c'; c.beginPath(); c.arc(px + 7, py + 7, 4.6, 0, 7); c.fill()
      c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(px + 5.5, py + 5.5, 1.6, 0, 7); c.fill()
    }
  } else if (t === RT.DIRT) {
    c.fillStyle = '#b5844e'; c.fillRect(px, py, T, T)
    studs(c, px, py, '#c39260', 2.2)
  } else if (t === RT.ICE) {
    c.fillStyle = '#c9ecf8'; c.fillRect(px, py, T, T)
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1
    c.beginPath(); c.moveTo(px + 2 + ((x + y) % 3) * 2, py + 13); c.lineTo(px + 8 + ((x + y) % 3) * 2, py + 3); c.stroke()
  } else if (t === RT.WATER) {
    c.fillStyle = '#3d8fe0'; c.fillRect(px, py, T, T)
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1
    const o = (x % 2) * 4
    c.beginPath(); c.moveTo(px + 2, py + 6 + o); c.quadraticCurveTo(px + 5, py + 4 + o, px + 8, py + 6 + o); c.stroke()
  } else if (t === RT.BARRIER) {
    const red = (x + y) % 2 === 0
    c.fillStyle = red ? '#d9473c' : '#efe9dc'; c.fillRect(px, py, T, T)
    c.fillStyle = red ? '#a8322a' : '#c9c0ad'; c.fillRect(px, py + T - 2, T, 2); c.fillRect(px + T - 2, py, 2, T)
    c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(px, py, T, 1); c.fillRect(px, py, 1, T)
    studs(c, px, py, red ? '#e65a4e' : '#fbf7ee')
  } else if (t === RT.TIRES) {
    c.fillStyle = '#5fb244'; c.fillRect(px, py, T, T)
    for (let i = 0; i < 4; i++) {
      const cx = px + 4 + (i % 2) * 8, cy = py + 4 + (i >> 1) * 8
      c.fillStyle = '#23262d'; c.beginPath(); c.arc(cx, cy, 3.9, 0, 7); c.fill()
      c.fillStyle = (x + y + i) % 3 ? '#4a5060' : '#d9473c'; c.beginPath(); c.arc(cx, cy, 1.7, 0, 7); c.fill()
    }
  } else if (t === RT.BUMPER) {
    c.fillStyle = '#5fb244'; c.fillRect(px, py, T, T)
    c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.arc(px + 9, py + 9.5, 7, 0, 7); c.fill()
    c.fillStyle = '#ff5fa2'; c.beginPath(); c.arc(px + 8, py + 8, 7, 0, 7); c.fill()
    c.fillStyle = '#fff'; c.beginPath(); c.arc(px + 8, py + 8, 4.4, 0, 7); c.fill()
    c.fillStyle = '#ff5fa2'; c.beginPath(); c.arc(px + 8, py + 8, 2.6, 0, 7); c.fill()
  } else if (t === RT.STAND) {
    c.fillStyle = '#8b93a3'; c.fillRect(px, py, T, T)
    c.fillStyle = '#737b8c'; c.fillRect(px, py + 7, T, 2); c.fillRect(px, py + 15, T, 1)
    const cols = ['#ef4b3f', '#ffd34d', '#5888DA', '#ffffff', '#2e9d57', '#ff8c1a']
    for (let i = 0; i < 6; i++) {
      c.fillStyle = cols[(x * 3 + y + i) % 6]
      c.beginPath(); c.arc(px + 2.5 + (i % 3) * 5.5, py + 3.5 + (i > 2 ? 8 : 0), 1.8, 0, 7); c.fill()
    }
  } else {
    // Road and everything laid on road.
    roadBase(c, px, py, x, y)
    if (isRaceBoost(t)) {
      c.fillStyle = '#f7c33b'; c.beginPath(); c.roundRect(px + 1.5, py + 1.5, T - 3, T - 3, 3); c.fill()
      drawArrow(c, px + 8, py + 8, raceBoostDir(t), 5.5, '#e0700f')
    } else if (t === RT.RAMP) {
      c.fillStyle = '#ffb02e'; c.fillRect(px + 1, py + 1, T - 2, T - 2)
      c.save(); c.beginPath(); c.rect(px + 1, py + 1, T - 2, T - 2); c.clip(); c.fillStyle = '#263C51'
      for (let k = -16; k < 16; k += 6) {
        c.beginPath(); c.moveTo(px + 1 + k, py + 15); c.lineTo(px + 4 + k, py + 15); c.lineTo(px + 15 + k, py + 1); c.lineTo(px + 12 + k, py + 1); c.closePath(); c.fill()
      }
      c.restore()
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(px + 1, py + 1, T - 2, 2)
    } else if (t === RT.FINISH) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        c.fillStyle = (i + j) % 2 ? '#22262e' : '#f6f4ef'; c.fillRect(px + i * 4, py + j * 4, 4, 4)
      }
    }
    const kerb = (side: number) => {
      for (let k = 0; k < 4; k++) {
        c.fillStyle = (((side < 2 ? x : y) * 4 + k) & 1) ? '#ef4b3f' : '#ffffff'
        if (side === 0) c.fillRect(px + k * 4, py, 4, 3)
        if (side === 1) c.fillRect(px + k * 4, py + T - 3, 4, 3)
        if (side === 2) c.fillRect(px, py + k * 4, 3, 4)
        if (side === 3) c.fillRect(px + T - 3, py + k * 4, 3, 4)
      }
    }
    if (raceGrassy(nb(0, -1))) kerb(0)
    if (raceGrassy(nb(0, 1))) kerb(1)
    if (raceGrassy(nb(-1, 0))) kerb(2)
    if (raceGrassy(nb(1, 0))) kerb(3)
  }
  // Raised bricks cast a shadow down and to the right.
  if (!raceSolid(t)) {
    c.fillStyle = 'rgba(0,0,0,.2)'
    if (nb(-1, 0) === RT.BARRIER || nb(-1, 0) === RT.STAND) c.fillRect(px, py, 3, T)
    if (nb(0, -1) === RT.BARRIER || nb(0, -1) === RT.STAND) c.fillRect(px, py, T, 3)
  }
}

export interface DrawCarOptions {
  /** 0..1, how high off the ground (a jump). */
  lift?: number
  /** Boost flame length in pixels, or 0. */
  flame?: number
  /** A shield bubble round the car, pulsing with `frame`. */
  shield?: boolean
  frame?: number
}

/** A top-down toy car, 14 by 9 pixels, pointing along `a`. */
export function drawRaceCar(c: Ctx, car: CarSpot, color: string, opts: DrawCarOptions = {}) {
  const lift = opts.lift ?? 0, s = 1 + lift * 0.45
  c.save()
  c.translate(car.x, car.y)
  c.fillStyle = `rgba(0,0,0,${0.25 - lift * 0.1})`
  c.beginPath(); c.ellipse(1.5 + lift * 6, 2 + lift * 8, 8 - lift, 5.5 - lift, car.a, 0, 7); c.fill()
  c.translate(0, -lift * 6)
  c.rotate(car.a)
  c.scale(s, s)
  c.fillStyle = '#1d222b'
  for (const [wx, wy] of [[-4.6, -5.6], [3.2, -5.6], [-4.6, 3.8], [3.2, 3.8]]) c.fillRect(wx, wy, 3.4, 1.8)
  c.fillStyle = color; c.beginPath(); c.roundRect(-7, -4.6, 14, 9.2, 2.6); c.fill()
  c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(-7, 2.8, 14, 1.8)
  c.fillStyle = '#bfe3ff'; c.beginPath(); c.roundRect(1.6, -3.4, 3, 6.8, 1.2); c.fill()
  c.fillStyle = 'rgba(255,255,255,.4)'
  c.beginPath(); c.arc(-3.4, -1.9, 1.6, 0, 7); c.arc(-3.4, 1.9, 1.6, 0, 7); c.fill()
  c.fillStyle = '#ffe9a6'; c.fillRect(6.2, -3.6, 1, 1.8); c.fillRect(6.2, 1.8, 1, 1.8)
  if (opts.flame) {
    c.fillStyle = 'rgba(255,170,40,.9)'
    c.beginPath(); c.moveTo(-7, -2.4); c.lineTo(-7 - opts.flame, 0); c.lineTo(-7, 2.4); c.fill()
  }
  c.restore()
  if (opts.shield) {
    c.strokeStyle = `rgba(110,210,255,${0.55 + 0.3 * Math.sin((opts.frame ?? 0) / 4)})`
    c.lineWidth = 1.6
    c.beginPath(); c.arc(car.x, car.y - lift * 6, 10.5, 0, 7); c.stroke()
  }
}

/** A ? block floating over the road at (cx, cy), bobbing with `frame`. Faded when items are off. */
export function drawItemBox(c: Ctx, cx: number, cy: number, frame: number, alpha = 1) {
  const bob = Math.sin(frame / 10) * 1.2
  c.save()
  c.globalAlpha = alpha
  c.translate(cx, cy + bob)
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(1, 7 - bob, 6, 2, 0, 0, 7); c.fill()
  c.rotate(Math.sin(frame / 25) * 0.15)
  c.fillStyle = '#c9951a'; c.beginPath(); c.roundRect(-6.5, -6.5, 13, 13, 2.5); c.fill()
  c.fillStyle = '#f7c33b'; c.beginPath(); c.roundRect(-6.5, -6.5, 13, 11.5, 2.5); c.fill()
  c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-5, -5, 3, 1.5)
  c.fillStyle = '#7a4d00'; c.font = '900 10px Nunito, ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText('?', 0, -0.5)
  c.restore()
}

/** A spinning coin at (cx, cy). */
export function drawCoin(c: Ctx, cx: number, cy: number, frame: number) {
  const sq = Math.abs(Math.cos(frame / 12)) * 0.8 + 0.2
  c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(cx + 1, cy + 5, 4, 1.5, 0, 0, 7); c.fill()
  c.fillStyle = '#e0a400'; c.beginPath(); c.ellipse(cx, cy, 4.6 * sq + 0.4, 5, 0, 0, 7); c.fill()
  c.fillStyle = '#ffd34d'; c.beginPath(); c.ellipse(cx, cy, 3 * sq + 0.3, 3.5, 0, 0, 7); c.fill()
}

const LOOK: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]

/** A Walker seen from above, looking `dir` (0 right, 1 down, 2 left, 3 up); squashed flat after an item hits it. */
export function drawWalker(c: Ctx, x: number, y: number, dir: number, frame: number, flat = false) {
  c.save()
  c.translate(x, y)
  if (flat) c.scale(1.35, 0.45)
  c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(1.5, 2, 7, 6, 0, 0, 7); c.fill()
  const wob = flat ? 0 : Math.sin(frame / 4) * 1.5
  c.fillStyle = '#6a49c4'; c.beginPath(); c.arc(-4, 4 + wob * 0.3, 2.4, 0, 7); c.arc(4, 4 - wob * 0.3, 2.4, 0, 7); c.fill()
  c.fillStyle = '#8f6be8'; c.beginPath(); c.arc(0, 0, 6.5, 0, 7); c.fill()
  const [ex, ey] = LOOK[dir & 3]
  c.fillStyle = '#fff'; c.beginPath(); c.arc(-2.4 + ex * 2, -1.5 + ey * 2, 2, 0, 7); c.arc(2.4 + ex * 2, -1.5 + ey * 2, 2, 0, 7); c.fill()
  c.fillStyle = '#1f2a44'; c.beginPath(); c.arc(-2.4 + ex * 2.8, -1.5 + ey * 2.8, 1, 0, 7); c.arc(2.4 + ex * 2.8, -1.5 + ey * 2.8, 1, 0, 7); c.fill()
  c.restore()
}

/** A thrown item: a bouncy ball, a spark, or an oil slick (fading as it dries up). */
export function drawThrown(c: Ctx, kind: 'ball' | 'spark' | 'oil', x: number, y: number, frame: number, left = 1) {
  if (kind === 'oil') {
    c.save()
    c.globalAlpha = Math.min(1, left * 5)
    c.fillStyle = '#23262d'; c.beginPath(); c.ellipse(x, y, 7, 5, 0.4, 0, 7); c.fill()
    c.beginPath(); c.arc(x + 5, y + 3, 2.6, 0, 7); c.arc(x - 5, y - 3, 2.2, 0, 7); c.fill()
    c.fillStyle = 'rgba(160,120,255,.35)'; c.beginPath(); c.ellipse(x - 1.5, y - 1, 3, 1.6, 0.4, 0, 7); c.fill()
    c.restore()
    return
  }
  if (kind === 'spark') {
    c.fillStyle = 'rgba(255,230,120,.45)'; c.beginPath(); c.arc(x, y, 5.5, 0, 7); c.fill()
    c.save(); c.translate(x, y); c.rotate(frame / 3)
    c.fillStyle = '#fff3b0'
    c.beginPath()
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 1.4 : 4.2, a = (i * Math.PI) / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r) }
    c.closePath(); c.fill()
    c.restore()
    return
  }
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(x + 1.5, y + 3, 3.4, 1.6, 0, 0, 7); c.fill()
  c.fillStyle = '#3e8ef0'; c.beginPath(); c.arc(x, y, 3.6, 0, 7); c.fill()
  c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(x - 1.2, y - 1.3, 1.2, 0, 7); c.fill()
}

/** A small name label above a car, kept upright when the map turns. */
export function drawNameTag(c: Ctx, x: number, y: number, text: string, color: string, rot: number) {
  c.save()
  c.translate(x, y)
  c.rotate(-rot)
  c.font = '800 6px Nunito, ui-rounded, system-ui, sans-serif'
  c.textAlign = 'center'
  c.textBaseline = 'alphabetic'
  const w = c.measureText(text).width + 6
  c.fillStyle = color; c.beginPath(); c.roundRect(-w / 2, -18, w, 9, 3); c.fill()
  c.fillStyle = '#fff'; c.fillText(text, 0, -11.6)
  c.restore()
}
