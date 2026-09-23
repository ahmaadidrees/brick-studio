/*
 * The cartoon look's colours and drawing helpers. Everything is drawn with canvas paths in world pixels (a tile is
 * 16 × 16), at whatever resolution the sprite canvas has, so the art stays sharp on any screen.
 *
 * The look is toy bricks: soft rounded blocks with a light top edge, a shaded bottom edge and studs on any top that
 * is open to the sky. Colours are the Brickgineers palette (the 3D studio's brick colours and the brand's navy ink).
 */

/** base, light, dark */
export type Tone = readonly [string, string, string]

export const INK = '#263c51'
export const INK_SOFT = 'rgba(38, 60, 81, 0.28)'
export const WHITE = '#ffffff'

export const TONE = {
  grass: ['#5cc466', '#93e38f', '#3b9a4b'],
  earth: [
    ['#e6a764', '#f8cb92', '#bd7d3d'],
    ['#dc9a57', '#f1bf85', '#b37333'],
    ['#eab372', '#fbd4a2', '#c4884a'],
  ],
  stoneTop: ['#94abd3', '#c2d1ec', '#6a7fa8'],
  stone: [
    ['#6f83ad', '#96a9ce', '#4d5f88'],
    ['#687ba5', '#8ea1c8', '#475880'],
    ['#768ab3', '#9db0d4', '#53658f'],
  ],
  hard: ['#5f6b7d', '#8994a6', '#414b5a'],
  red: ['#e7473c', '#ff8274', '#b3302a'],
  gold: ['#ffc93c', '#ffe88f', '#dc9914'],
  used: ['#c49a6c', '#ddbd94', '#997248'],
  pink: ['#f27bb0', '#ffb3d4', '#c8508a'],
  plate: ['#4db4ea', '#97d8f8', '#2d86bf'],
  tube: ['#2fb8a8', '#7ae2d5', '#1a897b'],
  metal: ['#c6d0dc', '#f2f6fa', '#8995a7'],
  lava: ['#ff6a2b', '#ffb547', '#d4331d'],
  blue: ['#3e83d7', '#86b6ee', '#285ea7'],
  violet: ['#7b5cd1', '#a88fea', '#5a3fa6'],
  coral: ['#f17861', '#ffab98', '#c95442'],
  bot: ['#c8603c', '#ec9265', '#9a4225'],
  green: ['#4cae62', '#86d68f', '#337d45'],
  orange: ['#ff8b3d', '#ffbd83', '#d4611b'],
} as const satisfies Record<string, Tone | readonly Tone[]>

export type G = CanvasRenderingContext2D

export function rr(g: G, x: number, y: number, w: number, h: number, r: number | number[]) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

/** A path filled with a shape's light top band and dark bottom band, clipped to itself. */
export function shade(g: G, tone: Tone, x: number, y: number, w: number, h: number, top = 0.24, bottom = 0.2) {
  g.save()
  g.clip()
  g.fillStyle = tone[0]
  g.fillRect(x - 1, y - 1, w + 2, h + 2)
  g.fillStyle = tone[1]
  g.fillRect(x - 1, y - 1, w + 2, h * top + 1)
  g.fillStyle = tone[2]
  g.fillRect(x - 1, y + h * (1 - bottom), w + 2, h * bottom + 1)
  g.restore()
}

/** A thin navy edge around the current path. */
export function edge(g: G, alpha = 0.32, width = 0.55) {
  g.save()
  g.globalAlpha = alpha
  g.strokeStyle = INK
  g.lineWidth = width
  g.stroke()
  g.restore()
}

/**
 * One toy brick: a rounded block with a light top, a shaded bottom and studs on top. `r` rounds each corner
 * (tl, tr, br, bl); halves of a two-wide brick round only their outer corners.
 */
export function brick(g: G, tone: Tone, x: number, y: number, w: number, h: number, opts: { r?: number | number[]; studs?: number[]; groove?: boolean } = {}) {
  const r = opts.r ?? 2.2
  for (const cx of opts.studs ?? []) stud(g, tone, cx, y)
  rr(g, x, y, w, h, r)
  shade(g, tone, x, y, w, h)
  // A soft sheen along the top edge.
  g.save()
  rr(g, x, y, w, h, r)
  g.clip()
  g.globalAlpha = 0.55
  g.fillStyle = WHITE
  g.fillRect(x + 1.2, y + 0.9, w - 2.4, 0.7)
  g.restore()
  if (opts.groove) {
    g.fillStyle = tone[2]
    g.globalAlpha = 0.55
    g.fillRect(x + 0.8, y + h / 2 - 0.3, w - 1.6, 0.6)
    g.globalAlpha = 0.5
    g.fillStyle = tone[1]
    g.fillRect(x + 0.8, y + h / 2 + 0.3, w - 1.6, 0.5)
    g.globalAlpha = 1
  }
  rr(g, x, y, w, h, r)
  edge(g)
}

/** A stud standing on a brick's top edge at `topY`, centred on `cx`. */
export function stud(g: G, tone: Tone, cx: number, topY: number, w = 5, h = 2.3) {
  const x = cx - w / 2
  const y = topY - h
  rr(g, x, y, w, h + 1, [1.1, 1.1, 0, 0])
  shade(g, tone, x, y, w, h + 1, 0.45, 0.15)
  g.save()
  rr(g, x, y, w, h + 1, [1.1, 1.1, 0, 0])
  g.clip()
  g.fillStyle = WHITE
  g.globalAlpha = 0.5
  g.fillRect(x + 0.8, y + 0.5, 1.1, h - 0.3)
  g.restore()
  rr(g, x, y, w, h + 0.4, [1.1, 1.1, 0, 0])
  edge(g, 0.3, 0.5)
}

/** A friendly eye looking toward `dir` (1 right, -1 left). */
export function eye(g: G, cx: number, cy: number, rx: number, ry: number, dir: number, look = 0.35) {
  g.beginPath()
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  g.fillStyle = WHITE
  g.fill()
  edge(g, 0.45, 0.45)
  g.beginPath()
  g.ellipse(cx + dir * rx * look, cy + ry * 0.12, rx * 0.55, ry * 0.62, 0, 0, Math.PI * 2)
  g.fillStyle = INK
  g.fill()
  g.beginPath()
  g.arc(cx + dir * rx * look - rx * 0.2, cy - ry * 0.25, Math.max(0.35, rx * 0.2), 0, Math.PI * 2)
  g.fillStyle = WHITE
  g.fill()
}

/** A small dark oval foot. */
export function foot(g: G, cx: number, bottom: number, w: number, h: number) {
  rr(g, cx - w / 2, bottom - h, w, h, [h / 2, h / 2, 0.8, 0.8])
  g.fillStyle = INK
  g.fill()
}

export const rad = (deg: number) => (deg * Math.PI) / 180

/** A little deterministic hash for variety that stays put. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
