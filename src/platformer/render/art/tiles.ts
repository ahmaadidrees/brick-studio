import { Bitmap, fromRows, hex } from './bitmap'
import { PAL } from './palette'
import type { Theme } from '@brick-studio/platformer-core/engine/level'

/*
 * Tile art, drawn procedurally so every block shares one look: toy bricks seen from the front,
 * with two studs on top.
 */

const K = hex(PAL.outline)

/** Two 4-pixel studs on the top two rows. */
function studs(b: Bitmap, light: string, mid: string, xs: number[] = [2, 10]) {
  for (const sx of xs) {
    b.set(sx, 0, K)
    b.set(sx + 1, 0, hex(light))
    b.set(sx + 2, 0, hex(light))
    b.set(sx + 3, 0, K)
    b.set(sx, 1, K)
    b.set(sx + 1, 1, hex(mid))
    b.set(sx + 2, 1, hex(mid))
    b.set(sx + 3, 1, K)
  }
}

/** An outlined block body from row `top` down, with bevel highlight and shade. */
function body(b: Bitmap, top: number, fill: string, light: string, shade: string) {
  b.rect(0, top, 16, 16 - top, hex(fill))
  b.hline(1, 14, top + 1, hex(light))
  b.vline(1, top + 1, 14, hex(light))
  b.hline(1, 14, 14, hex(shade))
  b.vline(14, top + 2, 14, hex(shade))
  b.hline(0, 15, top, K)
  b.hline(0, 15, 15, K)
  b.vline(0, top, 15, K)
  b.vline(15, top, 15, K)
}

function rivets(b: Bitmap, c: string) {
  for (const [x, y] of [
    [3, 4],
    [12, 4],
    [3, 12],
    [12, 12],
  ])
    b.set(x, y, hex(c))
}

// ---------------------------------------------------------------------------------------------
// Ground, auto-tiled from its neighbours.

export const GROUND_UP = 1
export const GROUND_DOWN = 2
export const GROUND_LEFT = 4
export const GROUND_RIGHT = 8

interface GroundColors {
  top: string
  topLight: string
  topShade: string
  body: string
  bodyLight: string
  bodyShade: string
  mortar: string
}

const GROUND_THEMES: Record<Theme, GroundColors> = {
  day: {
    top: PAL.grass,
    topLight: PAL.grassLight,
    topShade: PAL.grassShade,
    body: PAL.earth,
    bodyLight: PAL.earthLight,
    bodyShade: PAL.earthShade,
    mortar: PAL.mortar,
  },
  underground: {
    top: PAL.stoneLight,
    topLight: '#d6e6ff',
    topShade: PAL.stone,
    body: PAL.stone,
    bodyLight: PAL.stoneLight,
    bodyShade: PAL.stoneShade,
    mortar: PAL.stoneMortar,
  },
}

export function groundTile(mask: number, theme: Theme, tx: number, ty: number): Bitmap {
  const g = GROUND_THEMES[theme]
  const b = new Bitmap(16, 16)
  const up = (mask & GROUND_UP) !== 0
  const top = up ? 0 : 2
  // Earth: courses of bricks 8 rows tall, joints staggered by course.
  b.rect(0, top, 16, 16 - top, hex(g.body))
  for (let y = top; y < 16; y++) {
    const course = Math.floor((ty * 16 + y) / 8)
    const rowInCourse = (ty * 16 + y) % 8
    const offset = course % 2 === 0 ? 0 : 8
    for (let x = 0; x < 16; x++) {
      const wx = (tx * 16 + x + offset) % 16
      if (rowInCourse === 7 || wx === 15) b.set(x, y, hex(g.mortar))
      else if (rowInCourse === 0 || wx === 0) b.set(x, y, hex(g.bodyLight))
      else if (rowInCourse === 6 || wx === 14) b.set(x, y, hex(g.bodyShade))
    }
  }
  if (!up) {
    // The studded plate on top.
    studs(b, g.topLight, g.top)
    b.hline(0, 15, 2, K)
    b.hline(0, 15, 3, hex(g.topLight))
    b.rect(0, 4, 16, 2, hex(g.top))
    b.hline(0, 15, 6, hex(g.topShade))
    b.hline(0, 15, 7, K)
  }
  if (!(mask & GROUND_LEFT)) b.vline(0, top, 15, K)
  if (!(mask & GROUND_RIGHT)) {
    b.vline(15, top, 15, K)
  }
  if (!(mask & GROUND_DOWN)) b.hline(0, 15, 15, K)
  if (!up && !(mask & GROUND_LEFT)) clear(b, 0, 2)
  if (!up && !(mask & GROUND_RIGHT)) clear(b, 15, 2)
  return b
}

function clear(b: Bitmap, x: number, y: number) {
  const i = (y * b.w + x) * 4
  b.data[i + 3] = 0
}

// ---------------------------------------------------------------------------------------------
// Blocks

export function brickTile(): Bitmap {
  const b = new Bitmap(16, 16)
  studs(b, PAL.brickLight, PAL.brick)
  body(b, 2, PAL.brick, PAL.brickLight, PAL.brickShade)
  const m = hex(PAL.brickMortar)
  b.hline(1, 14, 8, m)
  b.vline(8, 3, 7, m)
  b.vline(4, 9, 14, m)
  b.vline(11, 9, 14, m)
  b.set(9, 3, hex(PAL.brickLight))
  b.set(5, 9, hex(PAL.brickLight))
  b.set(12, 9, hex(PAL.brickLight))
  return b
}

const QMARK = [
  '.WWWW.',
  'WWsWWs',
  '.s..WWs',
  '...WWs.',
  '..WWs..',
  '..WWs..',
  '...s...',
  '..WWs..',
  '...s...',
]

export function questionTile(frame: number): Bitmap {
  const b = new Bitmap(16, 16)
  const glow = [PAL.goldLight, '#ffffff', PAL.goldLight, PAL.gold][frame % 4]
  studs(b, glow, PAL.gold)
  body(b, 2, PAL.gold, glow, PAL.goldShade)
  rivets(b, PAL.goldDeep)
  const glyph = fromRows(QMARK, { W: PAL.white, s: PAL.goldDeep })
  b.blit(glyph, 5, 4)
  return b
}

export function usedTile(): Bitmap {
  const b = new Bitmap(16, 16)
  studs(b, PAL.usedLight, PAL.used)
  body(b, 2, PAL.used, PAL.usedLight, PAL.usedShade)
  rivets(b, PAL.outline)
  return b
}

export function hardTile(): Bitmap {
  const b = new Bitmap(16, 16)
  studs(b, PAL.hardLight, PAL.hard)
  body(b, 2, PAL.hard, PAL.hardLight, PAL.hardShade)
  b.hline(2, 13, 4, hex(PAL.hardLight))
  b.vline(2, 4, 12, hex(PAL.hardLight))
  b.hline(3, 13, 12, hex(PAL.hardShade))
  b.vline(13, 5, 12, hex(PAL.hardShade))
  b.rect(5, 7, 6, 3, hex(PAL.hardShade))
  b.hline(5, 10, 7, hex(PAL.hardDeep))
  return b
}

export function bounceTile(): Bitmap {
  const b = new Bitmap(16, 16)
  studs(b, '#ffffff', PAL.bounce)
  body(b, 2, PAL.bounce, '#ffffff', PAL.bounceShade)
  const coil = fromRows(
    ['.PPPPPP.', 'P......P', '.PPPPPP.', 'P......P', '.PPPPPP.', 'P......P', '.PPPPPP.'],
    { P: PAL.bouncePink },
  )
  b.blit(coil, 4, 5)
  return b
}

export function springTile(compressed: boolean): Bitmap {
  const C = { K: PAL.outline, M: PAL.springMetal, L: PAL.metalLight, R: PAL.spring, r: PAL.springLight, d: PAL.metalShade }
  return fromRows(
    compressed
      ? [
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          'KKKKKKKKKKKKKKKK',
          'KLLLLLLLLLLLLLLK',
          'KddddddddddddddK',
          '.KRRRRRRRRRRRRK.',
          '.KrrrrrrrrrrrrK.',
          '.KRRRRRRRRRRRRK.',
          'KKKKKKKKKKKKKKKK',
          'KMMMMMMMMMMMMMMK',
          'KKKKKKKKKKKKKKKK',
        ]
      : [
          '................',
          '................',
          'KKKKKKKKKKKKKKKK',
          'KLLLLLLLLLLLLLLK',
          'KddddddddddddddK',
          '..KRRRRRRRRRRK..',
          '...KrrrrrrrrK...',
          '..KRRRRRRRRRRK..',
          '...KrrrrrrrrK...',
          '..KRRRRRRRRRRK..',
          '...KrrrrrrrrK...',
          '..KRRRRRRRRRRK..',
          '...KKKKKKKKKK...',
          'KKKKKKKKKKKKKKKK',
          'KMMMMMMMMMMMMMMK',
          'KKKKKKKKKKKKKKKK',
        ],
    C,
  )
}

/** One-way platform: a studded blue plate. `left`/`right`: there is plate on that side. */
export function semiTile(left: boolean, right: boolean): Bitmap {
  const b = new Bitmap(16, 16)
  studs(b, PAL.plateLight, PAL.plate)
  b.rect(0, 2, 16, 6, hex(PAL.plate))
  b.hline(0, 15, 2, K)
  b.hline(0, 15, 3, hex(PAL.plateLight))
  b.hline(0, 15, 6, hex(PAL.plateShade))
  b.hline(0, 15, 7, K)
  if (!left) {
    b.vline(0, 2, 7, K)
    clear(b, 0, 2)
    clear(b, 0, 7)
    b.set(1, 3, hex(PAL.plateLight))
  }
  if (!right) {
    b.vline(15, 2, 7, K)
    clear(b, 15, 2)
    clear(b, 15, 7)
  }
  return b
}

/** Pipe halves. The lip is drawn when the tile above is not the same half. */
export function pipeTile(side: 'L' | 'R', lip: boolean): Bitmap {
  const b = new Bitmap(16, 16)
  const G = hex(PAL.pipe)
  const Gl = hex(PAL.pipeLight)
  const Gs = hex(PAL.pipeShade)
  const Gd = hex(PAL.pipeDeep)
  if (lip) {
    studs(b, PAL.pipeLight, PAL.pipe, side === 'L' ? [4, 12] : [0, 8])
    b.rect(0, 2, 16, 8, G)
    b.hline(0, 15, 2, K)
    b.hline(0, 15, 9, K)
    if (side === 'L') {
      b.vline(0, 2, 9, K)
      b.vline(2, 3, 8, Gl)
      b.vline(3, 3, 8, Gl)
      b.vline(6, 3, 8, Gl)
    } else {
      b.vline(15, 2, 9, K)
      b.vline(12, 3, 8, Gs)
      b.vline(13, 3, 8, Gs)
      b.vline(14, 3, 8, Gd)
    }
    // body below the lip
    drawPipeBody(b, side, 10)
  } else drawPipeBody(b, side, 0)
  return b
}

function drawPipeBody(b: Bitmap, side: 'L' | 'R', top: number) {
  const G = hex(PAL.pipe)
  const Gl = hex(PAL.pipeLight)
  const Gs = hex(PAL.pipeShade)
  const Gd = hex(PAL.pipeDeep)
  if (side === 'L') {
    b.rect(2, top, 14, 16 - top, G)
    b.vline(2, top, 15, K)
    b.vline(4, top, 15, Gl)
    b.vline(5, top, 15, Gl)
    b.vline(8, top, 15, Gl)
  } else {
    b.rect(0, top, 14, 16 - top, G)
    b.vline(13, top, 15, K)
    b.vline(10, top, 15, Gs)
    b.vline(11, top, 15, Gd)
    b.vline(12, top, 15, Gd)
  }
}

export function spikesTile(): Bitmap {
  const b = new Bitmap(16, 16)
  const S = hex(PAL.spike)
  const s = hex(PAL.spikeShade)
  // base
  b.rect(3, 3, 10, 10, hex(PAL.spikeBase))
  b.hline(3, 12, 3, K)
  b.hline(3, 12, 12, K)
  b.vline(3, 3, 12, K)
  b.vline(12, 3, 12, K)
  // spikes on all four sides, three per side, outlined
  for (const c of [5, 8, 11]) {
    b.hline(c - 1, c + 1, 2, S)
    b.set(c, 1, S)
    b.set(c, 0, K)
    b.set(c - 1, 1, K)
    b.set(c + 1, 1, K)
    b.hline(c - 1, c + 1, 13, s)
    b.set(c, 14, s)
    b.set(c, 15, K)
    b.set(c - 1, 14, K)
    b.set(c + 1, 14, K)
    b.vline(2, c - 1, c + 1, S)
    b.set(1, c, S)
    b.set(0, c, K)
    b.set(1, c - 1, K)
    b.set(1, c + 1, K)
    b.vline(13, c - 1, c + 1, s)
    b.set(14, c, s)
    b.set(15, c, K)
    b.set(14, c - 1, K)
    b.set(14, c + 1, K)
  }
  return b
}

export function lavaTile(frame: number, surface: boolean): Bitmap {
  const b = new Bitmap(16, 16)
  b.rect(0, 0, 16, 16, hex(PAL.lava))
  const deep = hex(PAL.lavaDeep)
  const light = hex(PAL.lavaLight)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = (x * 7 + y * 13 + frame * 5) % 23
      if (v === 0) b.set(x, y, light)
      else if (v === 11 && y > 3) b.set(x, y, deep)
    }
  }
  if (surface) {
    for (let x = 0; x < 16; x++) {
      const wave = Math.round(1.5 + 1.5 * Math.sin(((x + frame * 2) / 16) * Math.PI * 2))
      for (let y = 0; y < wave; y++) clear(b, x, y)
      b.set(x, wave, light)
      b.set(x, wave + 1, light)
    }
  }
  return b
}

/** Start sign: a signpost with an arrow pointing into the course. */
export function startSign(): Bitmap {
  return fromRows(
    [
      '.KKKKKKKKKKKKKK.',
      'KWWWWWWWWWWWWWWK',
      'KWWWWWWWGWWWWWWK',
      'KWWWWWWWGGWWWWWK',
      'KWWGGGGGGGGWWWWK',
      'KWWGGGGGGGGGWWWK',
      'KWWGGGGGGGGWWWWK',
      'KWWWWWWWGGWWWWWK',
      'KWWWWWWWGWWWWWWK',
      'KwwwwwwwwwwwwwwK',
      '.KKKKKKKKKKKKKK.',
      '......KBBK......',
      '......KBBK......',
      '......KBBK......',
      '......KBBK......',
      '.....KKKKKK.....',
    ],
    { K: PAL.outline, G: PAL.green, W: PAL.white, w: PAL.shirtShade, B: PAL.boot },
  )
}
