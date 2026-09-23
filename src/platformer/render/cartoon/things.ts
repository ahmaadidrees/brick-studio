import { INK, TONE, WHITE, brick, edge, eye, foot, rr, shade, stud, type G, type Tone } from './paint'
import { coin } from './tiles'

/*
 * Everything that is not a tile: creatures (all built from bricks, and all facing right; the skin mirrors them),
 * power-ups, course pieces and effects. Each draws into a box whose size is listed in THING_SIZE, with its feet on
 * the box's bottom edge.
 */

export const THING_SIZE: Record<string, { w: number; h: number; ox?: number; oy?: number }> = {
  walker: { w: 16, h: 17 },
  'walker:flat': { w: 16, h: 8 },
  shellbug: { w: 17, h: 16 },
  shell: { w: 16, h: 13 },
  spiky: { w: 16, h: 17 },
  flyer: { w: 16, h: 18 },
  grow: { w: 16, h: 17 },
  sparkitem: { w: 16, h: 16 },
  sparkshot: { w: 8, h: 8 },
  burst: { w: 12, h: 12 },
  coin: { w: 16, h: 16 },
  sparkle: { w: 8, h: 8 },
  poof: { w: 16, h: 16 },
  dust: { w: 8, h: 8 },
  debris: { w: 8, h: 8 },
  start: { w: 32, h: 16 },
  checkpoint: { w: 16, h: 32 },
  goal: { w: 32, h: 160 },
  goalicon: { w: 32, h: 32 },
  lift: { w: 48, h: 11, oy: 2.6 },
  pipeicon: { w: 32, h: 32 },
}

export function drawThing(g: G, key: string, extra: { playerColor?: (num: number) => Tone }): boolean {
  const [kind, a] = key.split(':')
  switch (kind) {
    case 'walker':
      if (a === 'flat') walkerFlat(g)
      else walker(g, a === '2')
      return true
    case 'shellbug':
      shellbug(g, a === '2')
      return true
    case 'shell':
      shell(g, Number(a) || 0)
      return true
    case 'spiky':
      spiky(g, a === '2')
      return true
    case 'flyer':
      flyer(g, a === '2')
      return true
    case 'grow':
      powerBrick(g)
      return true
    case 'sparkitem':
      boltTile(g, a === '2')
      return true
    case 'sparkshot':
      sparkShot(g, Number(a) || 0)
      return true
    case 'burst':
      burst(g)
      return true
    case 'coin':
      coin(g, Number(a) || 0)
      return true
    case 'sparkle':
      sparkle(g, Number(a) || 0)
      return true
    case 'poof':
      poof(g, Number(a) || 0)
      return true
    case 'dust':
      dust(g, Number(a) || 0)
      return true
    case 'debris':
      debris(g)
      return true
    case 'start':
      startSign(g)
      return true
    case 'checkpoint': {
      const num = Number(a) || 0
      checkpoint(g, num ? extra.playerColor?.(num) ?? TONE.blue : null)
      return true
    }
    case 'goal':
      goal(g)
      return true
    case 'goalicon':
      g.save()
      g.translate(8, 2)
      g.scale(0.62, 0.62)
      goal(g, true)
      g.restore()
      return true
    case 'lift':
      lift(g)
      return true
    default:
      return false
  }
}

// ---------------------------------------------------------------------------------------------
// Creatures

/** A walking brick: two studs on its head, grumpy eyes, little feet. */
function walker(g: G, step: boolean) {
  foot(g, step ? 4.5 : 5.5, 17, 4.4, 2.6)
  foot(g, step ? 11 : 10.5, 17, 4.4, 2.6)
  brick(g, TONE.bot, 1.2, 3, 13.6, 12.4, { r: 4, studs: [5, 11] })
  eye(g, 7.2, 8.6, 1.9, 2.3, 1, 0.45)
  eye(g, 11.3, 8.6, 1.9, 2.3, 1, 0.45)
  // Brows
  g.strokeStyle = INK
  g.lineWidth = 1
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(5.4, 5.3)
  g.lineTo(8.4, 6.3)
  g.moveTo(13.1, 5.3)
  g.lineTo(10.2, 6.3)
  g.stroke()
  g.beginPath()
  g.moveTo(8.2, 13)
  g.quadraticCurveTo(9.4, 12.2, 10.6, 13)
  g.lineWidth = 0.7
  g.stroke()
}

function walkerFlat(g: G) {
  brick(g, TONE.bot, 0.6, 2.5, 14.8, 5.3, { r: 2.4 })
  g.strokeStyle = INK
  g.lineWidth = 0.7
  g.lineCap = 'round'
  for (const cx of [6, 10.4]) {
    g.beginPath()
    g.moveTo(cx - 1, 4.2)
    g.lineTo(cx + 1, 6)
    g.moveTo(cx + 1, 4.2)
    g.lineTo(cx - 1, 6)
    g.stroke()
  }
}

/** A beetle under a round dome brick with studs on its back. */
function shellbug(g: G, step: boolean) {
  foot(g, step ? 4 : 5, 16, 3.2, 2.2)
  foot(g, step ? 9.5 : 8.5, 16, 3.2, 2.2)
  // Head
  g.beginPath()
  g.ellipse(13.2, 10.6, 3.3, 3.1, 0, 0, Math.PI * 2)
  g.fillStyle = '#f3c46b'
  g.fill()
  edge(g)
  eye(g, 14.2, 9.9, 1.25, 1.55, 1, 0.4)
  domeShell(g, 0.4, 3, 12.6, 11.4, 0)
}

function domeShell(g: G, x: number, y: number, w: number, h: number, turn: number) {
  const tone = TONE.green
  g.beginPath()
  g.moveTo(x, y + h)
  g.bezierCurveTo(x, y - h * 0.18, x + w, y - h * 0.18, x + w, y + h)
  g.closePath()
  shade(g, tone, x, y, w, h, 0.3, 0.18)
  g.beginPath()
  g.moveTo(x, y + h)
  g.bezierCurveTo(x, y - h * 0.18, x + w, y - h * 0.18, x + w, y + h)
  g.closePath()
  edge(g)
  // Studs on the dome, turning as the shell spins.
  g.fillStyle = tone[1]
  for (let i = 0; i < 3; i++) {
    const t = ((i + turn * 0.25) % 3) / 3
    const cx = x + w * (0.2 + t * 0.62)
    const cy = y + h * 0.42 + Math.abs(t - 0.5) * h * 0.35
    g.beginPath()
    g.ellipse(cx, cy, 1.5, 1.2, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = INK
  g.globalAlpha = 0.25
  g.fillRect(x + 0.4, y + h - 1.2, w - 0.8, 1.2)
  g.globalAlpha = 1
}

function shell(g: G, turn: number) {
  domeShell(g, 1.2, 1.8, 13.6, 10.8, turn)
}

/** A round critter wearing silver cones. */
function spiky(g: G, step: boolean) {
  foot(g, step ? 4.5 : 5.5, 17, 4.2, 2.6)
  foot(g, step ? 11 : 10.5, 17, 4.2, 2.6)
  for (const [cx, h] of [
    [4.4, 5.6],
    [8.3, 7],
    [12.2, 5.6],
  ]) {
    g.beginPath()
    g.moveTo(cx - 2.2, 6.6)
    g.lineTo(cx, 6.6 - h)
    g.lineTo(cx + 2.2, 6.6)
    g.closePath()
    const gr = g.createLinearGradient(cx - 2.2, 0, cx + 2.2, 0)
    gr.addColorStop(0, TONE.metal[1])
    gr.addColorStop(1, TONE.metal[2])
    g.fillStyle = gr
    g.fill()
    edge(g, 0.4, 0.45)
  }
  g.beginPath()
  g.ellipse(8.2, 10.4, 7, 5.6, 0, 0, Math.PI * 2)
  shade(g, TONE.violet, 1.2, 4.8, 14, 11.2)
  g.beginPath()
  g.ellipse(8.2, 10.4, 7, 5.6, 0, 0, Math.PI * 2)
  edge(g)
  eye(g, 9.4, 9.6, 1.7, 2, 1, 0.45)
  eye(g, 13, 9.6, 1.5, 1.9, 1, 0.45)
  g.strokeStyle = INK
  g.lineWidth = 0.9
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(7.8, 7.2)
  g.lineTo(10.4, 8)
  g.stroke()
}

/** A little propeller bot. */
function flyer(g: G, spin: boolean) {
  // Propeller
  g.fillStyle = TONE.metal[2]
  g.fillRect(7.4, 2.6, 1.2, 2.6)
  rr(g, spin ? 5.2 : 1.6, 1, spin ? 5.6 : 12.8, 1.8, 0.9)
  g.fillStyle = spin ? TONE.metal[1] : TONE.metal[0]
  g.fill()
  edge(g, 0.35, 0.45)
  // Body
  rr(g, 1.8, 4.6, 12.4, 11, 5)
  shade(g, TONE.orange, 1.8, 4.6, 12.4, 11)
  rr(g, 1.8, 4.6, 12.4, 11, 5)
  edge(g)
  // Visor
  rr(g, 6.2, 7.4, 7.2, 4.6, 2.2)
  g.fillStyle = WHITE
  g.fill()
  edge(g, 0.4, 0.45)
  g.beginPath()
  g.arc(10.8, 9.7, 1.3, 0, Math.PI * 2)
  g.fillStyle = INK
  g.fill()
  // Little jets
  g.fillStyle = TONE.metal[2]
  g.fillRect(3.4, 15.3, 2.4, 1.2)
  g.fillRect(10.2, 15.3, 2.4, 1.2)
}

// ---------------------------------------------------------------------------------------------
// Power-ups

/** A red brick with a happy face: grab it to grow. */
function powerBrick(g: G) {
  foot(g, 5, 17, 3.6, 2)
  foot(g, 11, 17, 3.6, 2)
  brick(g, TONE.red, 1, 3.4, 14, 12.2, { r: 3, studs: [5, 11] })
  eye(g, 6.4, 8.6, 1.3, 1.7, 0.3, 0.3)
  eye(g, 10.2, 8.6, 1.3, 1.7, 0.3, 0.3)
  g.strokeStyle = INK
  g.lineWidth = 0.8
  g.lineCap = 'round'
  g.beginPath()
  g.arc(8.3, 11.2, 1.8, Math.PI * 0.15, Math.PI * 0.85)
  g.stroke()
  g.fillStyle = '#ffb3b3'
  g.globalAlpha = 0.6
  g.beginPath()
  g.arc(4.2, 11.4, 1, 0, Math.PI * 2)
  g.arc(12.4, 11.4, 1, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
}

/** A round blue tile with a lightning bolt: grab it to throw sparks. */
function boltTile(g: G, bright: boolean) {
  if (bright) {
    const glow = g.createRadialGradient(8, 8, 3, 8, 8, 8)
    glow.addColorStop(0, 'rgba(255, 240, 150, 0.55)')
    glow.addColorStop(1, 'rgba(255, 240, 150, 0)')
    g.fillStyle = glow
    g.fillRect(0, 0, 16, 16)
  }
  g.beginPath()
  g.arc(8, 8.6, 6.4, 0, Math.PI * 2)
  shade(g, TONE.blue, 1.6, 2.2, 12.8, 12.8, 0.3, 0.2)
  g.beginPath()
  g.arc(8, 8.6, 6.4, 0, Math.PI * 2)
  edge(g)
  g.beginPath()
  g.moveTo(9.2, 3.6)
  g.lineTo(5.2, 9.6)
  g.lineTo(8, 9.6)
  g.lineTo(6.8, 13.6)
  g.lineTo(11, 7.4)
  g.lineTo(8.2, 7.4)
  g.closePath()
  g.fillStyle = bright ? '#fff4a6' : TONE.gold[0]
  g.fill()
  edge(g, 0.45, 0.45)
}

function sparkShot(g: G, frame: number) {
  const glow = g.createRadialGradient(4, 4, 0.5, 4, 4, 4)
  glow.addColorStop(0, '#ffffff')
  glow.addColorStop(0.35, '#fff29a')
  glow.addColorStop(0.75, 'rgba(255, 170, 60, 0.7)')
  glow.addColorStop(1, 'rgba(255, 140, 40, 0)')
  g.fillStyle = glow
  g.fillRect(0, 0, 8, 8)
  g.strokeStyle = '#fff6c2'
  g.lineWidth = 0.6
  g.lineCap = 'round'
  const a0 = (frame / 4) * Math.PI
  g.beginPath()
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i * Math.PI) / 2
    g.moveTo(4 + Math.cos(a) * 2.2, 4 + Math.sin(a) * 2.2)
    g.lineTo(4 + Math.cos(a) * 3.8, 4 + Math.sin(a) * 3.8)
  }
  g.stroke()
}

function burst(g: G) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? 2.4 : 5.8
    g.lineTo(6 + Math.cos(a) * r, 6 + Math.sin(a) * r)
  }
  g.closePath()
  g.fillStyle = '#fff29a'
  g.fill()
  g.strokeStyle = TONE.orange[0]
  g.lineWidth = 0.6
  g.stroke()
}

// ---------------------------------------------------------------------------------------------
// Effects

function sparkle(g: G, frame: number) {
  const s = [3.6, 2.6, 1.5][frame % 3]
  g.globalAlpha = [1, 0.8, 0.55][frame % 3]
  g.beginPath()
  g.moveTo(4, 4 - s)
  g.quadraticCurveTo(4.4, 3.6, 4 + s, 4)
  g.quadraticCurveTo(4.4, 4.4, 4, 4 + s)
  g.quadraticCurveTo(3.6, 4.4, 4 - s, 4)
  g.quadraticCurveTo(3.6, 3.6, 4, 4 - s)
  g.fillStyle = '#fffbe0'
  g.fill()
  g.globalAlpha = 1
}

function poof(g: G, frame: number) {
  const r = [3, 4.6, 5.8][frame % 3]
  g.globalAlpha = [0.95, 0.75, 0.45][frame % 3]
  g.fillStyle = WHITE
  g.beginPath()
  g.arc(8, 9, r, 0, Math.PI * 2)
  g.arc(8 - r * 0.8, 10, r * 0.7, 0, Math.PI * 2)
  g.arc(8 + r * 0.8, 10, r * 0.7, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
}

function dust(g: G, frame: number) {
  g.globalAlpha = [0.7, 0.5, 0.3][frame % 3]
  g.fillStyle = '#e8dccb'
  g.beginPath()
  g.arc(4, 5, [1.6, 2.3, 2.8][frame % 3], 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
}

function debris(g: G) {
  stud(g, TONE.red, 3.2, 3, 2.6, 1.4)
  brick(g, TONE.red, 0.8, 3, 6, 4.2, { r: 1 })
}

// ---------------------------------------------------------------------------------------------
// Course pieces

/** Where the course starts: a brick post with an arrow board. */
function startSign(g: G) {
  brick(g, TONE.earth[0], 14, 8, 4, 8, { r: 1 })
  rr(g, 4.5, 0.8, 23, 9.4, 2.2)
  g.fillStyle = WHITE
  g.fill()
  edge(g, 0.45, 0.6)
  g.beginPath()
  g.moveTo(9, 4.6)
  g.lineTo(18, 4.6)
  g.lineTo(18, 2.6)
  g.lineTo(23, 5.5)
  g.lineTo(18, 8.4)
  g.lineTo(18, 6.4)
  g.lineTo(9, 6.4)
  g.closePath()
  g.fillStyle = TONE.green[0]
  g.fill()
}

/** A flag on a pole; grey until you touch it, then yours. */
function checkpoint(g: G, color: Tone | null) {
  const pole = g.createLinearGradient(3, 0, 5.4, 0)
  pole.addColorStop(0, TONE.metal[1])
  pole.addColorStop(1, TONE.metal[2])
  g.fillStyle = pole
  g.fillRect(3.2, 4, 2, 25)
  stud(g, TONE.gold, 4.2, 4, 3, 1.6)
  const tone = color ?? TONE.metal
  g.beginPath()
  g.moveTo(5.2, 5)
  g.quadraticCurveTo(10, 3.6, 15.4, 6)
  g.lineTo(15.4, 12.6)
  g.quadraticCurveTo(10, 10.6, 5.2, 12.4)
  g.closePath()
  shade(g, tone, 5, 3.6, 10.6, 9, 0.3, 0.25)
  g.beginPath()
  g.moveTo(5.2, 5)
  g.quadraticCurveTo(10, 3.6, 15.4, 6)
  g.lineTo(15.4, 12.6)
  g.quadraticCurveTo(10, 10.6, 5.2, 12.4)
  g.closePath()
  edge(g)
  if (color) {
    g.fillStyle = WHITE
    g.beginPath()
    g.arc(10.2, 8.6, 1.5, 0, Math.PI * 2)
    g.fill()
  }
  brick(g, TONE.hard, 0.4, 28, 9, 4, { r: 1.2 })
}

/** The goal: a tall pole with a gold stud on top, the Brickgineers flag, and a brick base. */
function goal(g: G, icon = false) {
  const pole = g.createLinearGradient(14.6, 0, 17.6, 0)
  pole.addColorStop(0, TONE.metal[1])
  pole.addColorStop(0.5, TONE.metal[0])
  pole.addColorStop(1, TONE.metal[2])
  g.fillStyle = pole
  g.fillRect(14.8, 8, 2.6, icon ? 44 : 137)
  g.beginPath()
  g.arc(16.1, 6.2, 4.4, 0, Math.PI * 2)
  shade(g, TONE.gold, 11.7, 1.8, 8.8, 8.8, 0.35, 0.25)
  g.beginPath()
  g.arc(16.1, 6.2, 4.4, 0, Math.PI * 2)
  edge(g)
  // The flag, waving to the left of the pole: white with the Brickgineers mark.
  g.beginPath()
  g.moveTo(14.8, 13)
  g.quadraticCurveTo(8, 11, 0.6, 14)
  g.lineTo(0.6, 33)
  g.quadraticCurveTo(8, 30, 14.8, 32)
  g.closePath()
  g.fillStyle = WHITE
  g.fill()
  edge(g, 0.45, 0.6)
  // Mark: two stacked rounded bars (blue over coral) with light studs, like the logo.
  rr(g, 3.6, 16.2, 8.4, 6, [1.2, 3, 3, 1.2])
  g.fillStyle = '#5888da'
  g.fill()
  rr(g, 3.6, 23.4, 8.4, 6, [1.2, 3, 3, 1.2])
  g.fillStyle = '#f17861'
  g.fill()
  g.fillStyle = '#dbe6fa'
  for (const [cx, cy] of [
    [6.4, 19.2],
    [9.2, 19.2],
  ]) {
    g.beginPath()
    g.arc(cx, cy, 0.9, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#fde0d8'
  for (const [cx, cy] of [
    [6.4, 26.4],
    [9.2, 26.4],
  ]) {
    g.beginPath()
    g.arc(cx, cy, 0.9, 0, Math.PI * 2)
    g.fill()
  }
  if (icon) return
  // Base: two dark bricks with studs.
  brick(g, TONE.hard, 0.35, 144.35, 15.65, 15.3, { r: [2.2, 0, 0, 2.2], studs: [4, 12] })
  brick(g, TONE.hard, 16, 144.35, 15.65, 15.3, { r: [0, 2.2, 2.2, 0], studs: [20, 28] })
}

/** A moving lift: a yellow plate with studs and a hazard edge. */
function lift(g: G) {
  const studs = [4, 12, 20, 28, 36, 44]
  for (const cx of studs) stud(g, TONE.gold, cx, 0.2)
  rr(g, 0.3, 0.2, 47.4, 7.6, 2)
  shade(g, TONE.gold, 0.3, 0.2, 47.4, 7.6, 0.3, 0.2)
  g.save()
  rr(g, 0.3, 0.2, 47.4, 7.6, 2)
  g.clip()
  g.fillStyle = INK
  g.globalAlpha = 0.75
  for (let x = -4; x < 52; x += 5) {
    g.beginPath()
    g.moveTo(x, 7.8)
    g.lineTo(x + 2.5, 5)
    g.lineTo(x + 5, 5)
    g.lineTo(x + 2.5, 7.8)
    g.closePath()
    g.fill()
  }
  g.restore()
  rr(g, 0.3, 0.2, 47.4, 7.6, 2)
  edge(g)
}
