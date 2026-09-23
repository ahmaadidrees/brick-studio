import { TONE, WHITE, brick, hash2, type G } from './paint'

/*
 * Backdrops. Day: a soft sky, a sun, puffy clouds, and two layers of rolling hills with brick-built trees, each layer
 * scrolling more slowly than the level. Underground: a deep blue cave with rock shapes and a few glowing crystals.
 */

export const SCENERY_SIZE: Record<string, { w: number; h: number }> = {
  'cloud:big': { w: 58, h: 26 },
  'cloud:small': { w: 38, h: 18 },
  'hill:far': { w: 150, h: 64 },
  'hill:near': { w: 96, h: 44 },
  tree: { w: 22, h: 34 },
  'rock:top': { w: 60, h: 46 },
  'rock:bottom': { w: 70, h: 40 },
  glow: { w: 14, h: 14 },
}

export function drawScenery(g: G, key: string): boolean {
  switch (key) {
    case 'cloud:big':
      cloud(g, 58, 26)
      return true
    case 'cloud:small':
      cloud(g, 38, 18)
      return true
    case 'hill:far':
      hill(g, 150, 64, '#b5e2c4', '#9ad3b0')
      return true
    case 'hill:near':
      hill(g, 96, 44, '#8fd49c', '#72c283')
      return true
    case 'tree':
      tree(g)
      return true
    case 'rock:top':
      rockTop(g)
      return true
    case 'rock:bottom':
      rockBottom(g)
      return true
    case 'glow': {
      const glow = g.createRadialGradient(7, 7, 0.5, 7, 7, 7)
      glow.addColorStop(0, 'rgba(160, 230, 255, 0.95)')
      glow.addColorStop(0.3, 'rgba(127, 214, 255, 0.45)')
      glow.addColorStop(1, 'rgba(127, 214, 255, 0)')
      g.fillStyle = glow
      g.fillRect(0, 0, 14, 14)
      return true
    }
    default:
      return false
  }
}

function cloud(g: G, w: number, h: number) {
  const puff = (cx: number, cy: number, r: number) => {
    g.moveTo(cx + r, cy)
    g.arc(cx, cy, r, 0, Math.PI * 2)
  }
  const shape = () => {
    g.beginPath()
    puff(w * 0.28, h * 0.62, h * 0.34)
    puff(w * 0.5, h * 0.44, h * 0.44)
    puff(w * 0.72, h * 0.6, h * 0.34)
    g.rect(w * 0.26, h * 0.6, w * 0.48, h * 0.34)
  }
  g.save()
  g.translate(0, 1.2)
  shape()
  g.fillStyle = '#c7e4f8'
  g.fill()
  g.restore()
  shape()
  g.fillStyle = WHITE
  g.fill()
}

function hill(g: G, w: number, h: number, color: string, shadow: string) {
  g.beginPath()
  g.moveTo(0, h)
  g.bezierCurveTo(w * 0.12, h * 0.1, w * 0.88, h * 0.1, w, h)
  g.closePath()
  g.fillStyle = color
  g.fill()
  g.save()
  g.clip()
  g.fillStyle = shadow
  g.beginPath()
  g.ellipse(w * 0.72, h * 0.95, w * 0.34, h * 0.62, 0, 0, Math.PI * 2)
  g.fill()
  // A few round bushes.
  g.fillStyle = WHITE
  g.globalAlpha = 0.18
  for (let i = 0; i < 4; i++) {
    g.beginPath()
    g.arc(w * (0.25 + i * 0.16), h * (0.62 - Math.sin(i) * 0.08), h * 0.05, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

/** A tree built from bricks: a trunk of two small bricks and a round canopy of green studs. */
function tree(g: G) {
  brick(g, TONE.earth[1], 8.5, 22, 5, 6, { r: 1 })
  brick(g, TONE.earth[1], 8.5, 28, 5, 6, { r: 1 })
  const canopy = (cx: number, cy: number, r: number, color: string) => {
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.fillStyle = color
    g.fill()
  }
  canopy(11, 13, 9.6, TONE.green[2])
  canopy(10.2, 12, 9, TONE.green[0])
  canopy(7.5, 9, 3.4, TONE.green[1])
  g.fillStyle = WHITE
  g.globalAlpha = 0.35
  g.beginPath()
  g.arc(6.8, 8.2, 1.4, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
}

function rockTop(g: G) {
  g.beginPath()
  g.moveTo(-2, 0)
  g.lineTo(62, 0)
  g.lineTo(52, 14)
  g.lineTo(44, 30)
  g.lineTo(38, 18)
  g.lineTo(30, 46)
  g.lineTo(22, 20)
  g.lineTo(14, 28)
  g.lineTo(8, 10)
  g.closePath()
  g.fillStyle = '#2d3b62'
  g.fill()
}

function rockBottom(g: G) {
  g.beginPath()
  g.moveTo(0, 40)
  g.lineTo(8, 22)
  g.lineTo(16, 30)
  g.lineTo(26, 6)
  g.lineTo(36, 26)
  g.lineTo(46, 14)
  g.lineTo(56, 28)
  g.lineTo(70, 40)
  g.closePath()
  g.fillStyle = '#2a3860'
  g.fill()
  g.fillStyle = '#7fd6ff'
  g.globalAlpha = 0.85
  g.beginPath()
  g.moveTo(24, 26)
  g.lineTo(26, 18)
  g.lineTo(28, 26)
  g.closePath()
  g.fill()
  g.globalAlpha = 1
}

/** Where things in a repeating layer go: a spot per `spacing`, some skipped, jittered but fixed. */
export function layerSpots(offset: number, viewW: number, spacing: number, width: number, salt: number, keep = 0.72): number[] {
  const out: number[] = []
  const first = Math.floor((offset - width) / spacing)
  const last = Math.ceil((offset + viewW) / spacing)
  for (let i = first; i <= last; i++) {
    const r = hash2(i, salt)
    if (r > keep) continue
    out.push(i * spacing + r * spacing * 0.45 - offset)
  }
  return out
}
