import type { Theme } from '@brick-studio/platformer-core/engine/level'
import { T } from '@brick-studio/platformer-core/engine/tiles'
import { INK, TONE, WHITE, brick, edge, hash2, rr, shade, stud, type G, type Tone } from './paint'

/*
 * Tiles as toy bricks. Ground is laid like a real brick wall: two-wide bricks in a running bond, green where the top
 * is open to the sky, earth below. Anything with an open top shows its studs.
 *
 * Keys (see cartoonTileKey):
 *   G:<L|R|S>:<top>:<tint>:<theme>  ground: left or right half of a two-wide brick, or a single; top open; colour variant
 *   H:<top> hard · B:<top> brick · Q:<frame>:<top> ? brick · U:<top> used · O:<top> bounce
 *   S:<left><right> plate (one-way) · P:<L|R>:<top> tube · X spikes · L:<frame>:<top> lava · coin:<frame> · spring:<0|1>
 */

/** Tiles that fill their whole cell: a brick under one of these has no open top. */
const FULL = new Set<number>([T.GROUND, T.HARD, T.BRICK, T.QBLOCK, T.USED, T.BOUNCE, T.PIPE_L, T.PIPE_R])

export function cartoonTileKey(tiles: Uint8Array, width: number, height: number, x: number, y: number, theme: Theme, frame: number): string | null {
  const at = (tx: number, ty: number, outside: number) => (tx < 0 || tx >= width || ty < 0 || ty >= height ? outside : tiles[ty * width + tx])
  const t = tiles[y * width + x]
  const open = (tx: number, ty: number) => !FULL.has(at(tx, ty, T.EMPTY))
  const top = open(x, y - 1) ? 1 : 0
  switch (t) {
    case T.EMPTY:
      return null
    case T.GROUND: {
      // Running bond: pairs start on even columns in even rows and odd columns in odd rows. A half only joins its
      // partner when both are ground with the same open top; otherwise it is a single brick.
      const first = (x + y) % 2 === 0
      const px = first ? x + 1 : x - 1
      const partner = at(px, y, T.EMPTY) === T.GROUND && (open(px, y - 1) ? 1 : 0) === top
      const role = partner ? (first ? 'L' : 'R') : 'S'
      const left = role === 'R' ? x - 1 : x
      const tint = Math.floor(hash2(left, y) * 3)
      return `G:${role}:${top}:${tint}:${theme}`
    }
    case T.HARD:
      return `H:${top}`
    case T.BRICK:
      return `B:${top}`
    case T.QBLOCK:
      return `Q:${frame % 4}:${top}`
    case T.USED:
      return `U:${top}`
    case T.BOUNCE:
      return `O:${top}`
    case T.SEMI:
      return `S:${at(x - 1, y, T.EMPTY) === T.SEMI ? 1 : 0}${at(x + 1, y, T.EMPTY) === T.SEMI ? 1 : 0}`
    case T.PIPE_L:
      return `P:L:${at(x, y - 1, T.EMPTY) === T.PIPE_L ? 0 : 1}`
    case T.PIPE_R:
      return `P:R:${at(x, y - 1, T.EMPTY) === T.PIPE_R ? 0 : 1}`
    case T.SPIKES:
      return 'X'
    case T.LAVA:
      return `L:${frame % 8}:${at(x, y - 1, T.EMPTY) === T.LAVA ? 0 : 1}`
    case T.COIN:
      return `coin:${frame % 4}`
    case T.SPRING:
      return 'spring:0'
    default:
      return null
  }
}

/** The pixel look's tile keys (the editor's cursor and the drawer use them) in cartoon form. */
export function fromPixelKey(key: string): string | null {
  const [kind, a, b] = key.split(':')
  switch (kind) {
    case 'g':
      return `G:S:1:0:${b ?? 'day'}`
    case 'hard':
      return 'H:1'
    case 'brick':
      return 'B:1'
    case 'q':
      return `Q:${a ?? 0}:1`
    case 'used':
      return 'U:1'
    case 'bounce':
      return 'O:1'
    case 'semi':
      return `S:${a ?? '00'}`
    case 'pipe':
      return `P:${a}:${b}`
    case 'spikes':
      return 'X'
    case 'lava':
      return `L:${a}:${b}`
    default:
      return null
  }
}

/** Studs sit two to a tile. */
const STUDS = [4, 12]

/** Draw a tile key into a 16 × 16 cell at the origin (studs reach up to y = -3). Returns false for unknown keys. */
export function drawTile(g: G, key: string): boolean {
  const p = key.split(':')
  const top = (i: number) => p[i] === '1'
  switch (p[0]) {
    case 'G':
      ground(g, p[1] as 'L' | 'R' | 'S', top(2), Number(p[3]), p[4] as Theme)
      return true
    case 'H':
      hard(g, top(1))
      return true
    case 'B':
      brick(g, TONE.red, 0.35, 0.35, 15.3, 15.3, { studs: top(1) ? STUDS : [], groove: true })
      return true
    case 'Q':
      question(g, Number(p[1]), top(2))
      return true
    case 'U':
      used(g, top(1))
      return true
    case 'O':
      bounce(g, top(1))
      return true
    case 'S':
      plate(g, p[1][0] === '1', p[1][1] === '1')
      return true
    case 'P':
      tube(g, p[1] as 'L' | 'R', top(2))
      return true
    case 'X':
      spikes(g)
      return true
    case 'L':
      lava(g, Number(p[1]), top(2))
      return true
    case 'coin':
      coin(g, Number(p[1]))
      return true
    case 'spring':
      spring(g, p[1] === '1')
      return true
    default:
      return false
  }
}

function ground(g: G, role: 'L' | 'R' | 'S', top: boolean, tint: number, theme: Theme) {
  const day = theme !== 'underground'
  const tone: Tone = top ? (day ? TONE.grass : TONE.stoneTop) : (day ? TONE.earth : TONE.stone)[tint % 3]
  const x0 = role === 'R' ? 0 : 0.35
  const x1 = role === 'L' ? 16 : 15.65
  const r = role === 'L' ? [2.2, 0, 0, 2.2] : role === 'R' ? [0, 2.2, 2.2, 0] : 2.2
  brick(g, tone, x0, 0.35, x1 - x0, 15.3, { r, studs: top ? STUDS : [] })
  // Two-wide bricks keep their outer edge lines only: paint over the seam where the halves meet.
  if (role !== 'S') {
    g.fillStyle = tone[0]
    const sx = role === 'L' ? 15.4 : 0
    g.fillRect(sx, 3.8, 0.6, 8.6)
  }
  // A few specks so a wall of earth does not look flat.
  if (!top) {
    g.fillStyle = tone[2]
    g.globalAlpha = 0.35
    const specks = [
      [4, 9, 0.9],
      [11, 6.5, 0.7],
      [9, 12, 0.6],
    ]
    const shift = tint * 2.3
    for (const [sx, sy, sr] of specks) {
      g.beginPath()
      g.arc(((sx + shift + (role === 'R' ? 3 : 0)) % 13) + 1.5, sy, sr, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  } else if (day) {
    // Grass bricks get a lighter lip under the studs.
    g.fillStyle = TONE.grass[1]
    g.globalAlpha = 0.5
    g.fillRect(x0 + 1, 3.6, x1 - x0 - 2, 0.8)
    g.globalAlpha = 1
  }
}

function hard(g: G, top: boolean) {
  brick(g, TONE.hard, 0.35, 0.35, 15.3, 15.3, { studs: top ? STUDS : [] })
  // A round hole through the middle, like a technic brick: this one never breaks.
  g.beginPath()
  g.arc(8, 8.6, 3.1, 0, Math.PI * 2)
  g.fillStyle = TONE.hard[1]
  g.fill()
  g.beginPath()
  g.arc(8, 8.8, 2.1, 0, Math.PI * 2)
  g.fillStyle = '#2d3440'
  g.fill()
}

function question(g: G, frame: number, top: boolean) {
  brick(g, TONE.gold, 0.35, 0.35, 15.3, 15.3, { studs: top ? STUDS : [] })
  // A light glint sweeping across.
  g.save()
  rr(g, 0.35, 0.35, 15.3, 15.3, 2.2)
  g.clip()
  g.globalAlpha = 0.35
  g.fillStyle = WHITE
  const sx = -6 + frame * 6
  g.beginPath()
  g.moveTo(sx, 16)
  g.lineTo(sx + 4, 16)
  g.lineTo(sx + 10, 0)
  g.lineTo(sx + 6, 0)
  g.closePath()
  g.fill()
  g.restore()
  // The question mark, with a navy shadow.
  const q = (dx: number, dy: number, color: string) => {
    g.save()
    g.translate(dx, dy)
    g.strokeStyle = color
    g.lineWidth = 2.1
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(5.6, 6.3)
    g.bezierCurveTo(5.6, 3.3, 10.6, 3.2, 10.6, 6.1)
    g.bezierCurveTo(10.6, 8.1, 8.1, 8.2, 8.1, 10.2)
    g.stroke()
    g.beginPath()
    g.arc(8.1, 12.9, 1.25, 0, Math.PI * 2)
    g.fillStyle = color
    g.fill()
    g.restore()
  }
  g.globalAlpha = 0.35
  q(0.5, 0.6, INK)
  g.globalAlpha = 1
  q(0, 0, WHITE)
}

function used(g: G, top: boolean) {
  brick(g, TONE.used, 0.35, 0.35, 15.3, 15.3, { studs: top ? STUDS : [] })
  rr(g, 3.2, 4.2, 9.6, 8.2, 1.6)
  g.fillStyle = TONE.used[2]
  g.globalAlpha = 0.45
  g.fill()
  g.globalAlpha = 1
}

function bounce(g: G, top: boolean) {
  brick(g, TONE.pink, 0.35, 0.35, 15.3, 15.3, { studs: top ? STUDS : [], r: 3.4 })
  // A white spring squiggle.
  g.strokeStyle = WHITE
  g.lineWidth = 1.5
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(4, 11.5)
  for (let i = 0; i < 4; i++) g.lineTo(i % 2 ? 4 : 12, 10 - i * 1.9)
  g.lineTo(8, 3.4)
  g.stroke()
}

function plate(g: G, left: boolean, right: boolean) {
  const x0 = left ? 0 : 0.4
  const x1 = right ? 16 : 15.6
  const r = [left ? 0 : 2, right ? 0 : 2, right ? 0 : 2, left ? 0 : 2]
  for (const cx of STUDS) stud(g, TONE.plate, cx, 0.6)
  rr(g, x0, 0.6, x1 - x0, 5.2, r)
  shade(g, TONE.plate, x0, 0.6, x1 - x0, 5.2, 0.35, 0.3)
  g.save()
  rr(g, x0, 0.6, x1 - x0, 5.2, r)
  g.clip()
  g.globalAlpha = 0.6
  g.fillStyle = WHITE
  g.fillRect(x0, 1.2, x1 - x0, 0.6)
  g.restore()
  rr(g, x0, 0.6, x1 - x0, 5.2, r)
  edge(g)
  // A soft shadow under the plate.
  g.fillStyle = INK
  g.globalAlpha = 0.12
  g.fillRect(x0 + 1, 5.8, x1 - x0 - 2, 1.1)
  g.globalAlpha = 1
}

function tube(g: G, side: 'L' | 'R', top: boolean) {
  const tone = TONE.tube
  // Shade across the whole two-tile tube: light left of centre, dark on the right.
  const grad = (x0: number, x1: number) => {
    const gr = g.createLinearGradient(side === 'L' ? x0 : x0 - 16, 0, side === 'L' ? x1 + 16 : x1, 0)
    gr.addColorStop(0, tone[2])
    gr.addColorStop(0.28, tone[1])
    gr.addColorStop(0.55, tone[0])
    gr.addColorStop(1, tone[2])
    return gr
  }
  const bx0 = side === 'L' ? 1.6 : 0
  const bx1 = side === 'L' ? 16 : 14.4
  g.beginPath()
  g.rect(bx0, top ? 5 : 0, bx1 - bx0, top ? 11 : 16)
  g.fillStyle = grad(1.6, 16)
  g.fill()
  g.fillStyle = INK
  g.globalAlpha = 0.3
  g.fillRect(side === 'L' ? bx0 : bx1 - 0.55, top ? 5 : 0, 0.55, top ? 11 : 16)
  g.globalAlpha = 1
  if (top) {
    const rx0 = side === 'L' ? 0.2 : 0
    const rx1 = side === 'L' ? 16 : 15.8
    const r = side === 'L' ? [1.8, 0, 0, 1.8] : [0, 1.8, 1.8, 0]
    rr(g, rx0, 0.4, rx1 - rx0, 5.4, r)
    g.fillStyle = grad(0, 16)
    g.fill()
    g.save()
    rr(g, rx0, 0.4, rx1 - rx0, 5.4, r)
    g.clip()
    g.fillStyle = WHITE
    g.globalAlpha = 0.5
    g.fillRect(rx0, 0.9, rx1 - rx0, 0.8)
    g.fillStyle = INK
    g.globalAlpha = 0.18
    g.fillRect(rx0, 4.6, rx1 - rx0, 1.2)
    g.restore()
    rr(g, rx0, 0.4, rx1 - rx0, 5.4, r)
    edge(g)
    g.fillStyle = tone[0]
    g.fillRect(side === 'L' ? 15.3 : 0, 1.4, 0.7, 3.4)
  }
}

function spikes(g: G) {
  for (const cx of [4.5, 11.5]) {
    g.beginPath()
    g.moveTo(cx - 3.3, 11.6)
    g.quadraticCurveTo(cx - 1.2, 5, cx - 0.5, 2.6)
    g.quadraticCurveTo(cx, 1.6, cx + 0.5, 2.6)
    g.quadraticCurveTo(cx + 1.2, 5, cx + 3.3, 11.6)
    g.closePath()
    const gr = g.createLinearGradient(cx - 3.3, 0, cx + 3.3, 0)
    gr.addColorStop(0, TONE.metal[1])
    gr.addColorStop(0.45, TONE.metal[0])
    gr.addColorStop(1, TONE.metal[2])
    g.fillStyle = gr
    g.fill()
    edge(g, 0.4, 0.5)
  }
  brick(g, TONE.hard, 0.35, 11.2, 15.3, 4.45, { r: 1.4 })
}

function lava(g: G, frame: number, top: boolean) {
  const tone = TONE.lava
  const phase = (frame / 8) * Math.PI * 2
  const surface = (x: number) => 3 + Math.sin(phase + x * 0.55) * 0.9
  const body = g.createLinearGradient(0, 0, 0, 16)
  body.addColorStop(0, tone[0])
  body.addColorStop(1, tone[2])
  g.fillStyle = body
  if (top) {
    g.beginPath()
    g.moveTo(0, 16)
    for (let x = 0; x <= 16; x += 1) g.lineTo(x, surface(x))
    g.lineTo(16, 16)
    g.closePath()
    g.fill()
    g.strokeStyle = tone[1]
    g.lineWidth = 1.4
    g.beginPath()
    for (let x = 0; x <= 16; x += 1) {
      if (x === 0) g.moveTo(x, surface(x) + 0.5)
      else g.lineTo(x, surface(x) + 0.5)
    }
    g.stroke()
    // Rising bubbles.
    g.fillStyle = tone[1]
    const b = (frame * 1.7) % 8
    g.globalAlpha = 0.8
    g.beginPath()
    g.arc(5, 12 - b, 1.1, 0, Math.PI * 2)
    g.arc(11.5, 14 - ((b + 4) % 8), 0.8, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
  } else {
    g.fillRect(0, 0, 16, 16)
    g.fillStyle = tone[1]
    g.globalAlpha = 0.35
    g.beginPath()
    g.arc(4 + (frame % 4), 6, 1, 0, Math.PI * 2)
    g.arc(12 - (frame % 3), 11, 0.8, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
  }
}

/** A spinning gold coin: a round tile with a stud pressed into it. */
export function coin(g: G, frame: number) {
  const squeeze = [1, 0.68, 0.22, 0.68][frame % 4]
  const cx = 8
  const cy = 8
  const rx = 5.3 * squeeze
  const ry = 6.3
  g.beginPath()
  g.ellipse(cx, cy, Math.max(0.9, rx), ry, 0, 0, Math.PI * 2)
  g.fillStyle = TONE.gold[2]
  g.fill()
  g.beginPath()
  g.ellipse(cx - 0.35 * squeeze, cy - 0.2, Math.max(0.6, rx - 0.9 * squeeze), ry - 0.9, 0, 0, Math.PI * 2)
  g.fillStyle = TONE.gold[0]
  g.fill()
  if (squeeze > 0.5) {
    g.beginPath()
    g.ellipse(cx - 0.3 * squeeze, cy - 0.2, 2.4 * squeeze, 2.8, 0, 0, Math.PI * 2)
    g.fillStyle = TONE.gold[1]
    g.fill()
    g.beginPath()
    g.ellipse(cx + 0.2 * squeeze, cy + 0.3, 2.4 * squeeze, 2.8, 0, 0, Math.PI * 2)
    g.strokeStyle = TONE.gold[2]
    g.globalAlpha = 0.5
    g.lineWidth = 0.6
    g.stroke()
    g.globalAlpha = 1
  }
  g.beginPath()
  g.ellipse(cx - rx * 0.45, cy - 2.6, Math.max(0.3, 0.8 * squeeze), 1.6, 0.3, 0, Math.PI * 2)
  g.fillStyle = WHITE
  g.globalAlpha = 0.8
  g.fill()
  g.globalAlpha = 1
  g.beginPath()
  g.ellipse(cx, cy, Math.max(0.9, rx), ry, 0, 0, Math.PI * 2)
  edge(g, 0.35, 0.55)
}

function spring(g: G, squashed: boolean) {
  const topY = squashed ? 8 : 2.5
  // Coil
  g.strokeStyle = TONE.red[0]
  g.lineWidth = 1.7
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  const turns = 4
  const y0 = 13
  const y1 = topY + 3
  for (let i = 0; i <= turns * 2; i++) {
    const y = y0 - ((y0 - y1) * i) / (turns * 2)
    const x = i % 2 ? 12 : 4
    if (i === 0) g.moveTo(8, y)
    else g.lineTo(x, y)
  }
  g.stroke()
  g.strokeStyle = TONE.red[1]
  g.lineWidth = 0.6
  g.stroke()
  // Top pad and base
  brick(g, TONE.red, 1.5, topY, 13, 3, { r: 1.4 })
  brick(g, TONE.metal, 0.5, 12.4, 15, 3.4, { r: 1.2 })
}
