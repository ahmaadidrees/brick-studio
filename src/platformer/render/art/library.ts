import { Bitmap, fromRows, hex } from './bitmap'
import { colorPlayer, playerSprite, type PlayerPose } from './characters'
import * as CR from './creatures'
import { PAL, PLAYER_COLORS } from './palette'
import { bush, cloud, hill } from './scenery'
import {
  GROUND_DOWN,
  GROUND_LEFT,
  GROUND_RIGHT,
  GROUND_UP,
  bounceTile,
  brickTile,
  groundTile,
  hardTile,
  lavaTile,
  pipeTile,
  questionTile,
  semiTile,
  spikesTile,
  springTile,
  startSign,
  usedTile,
} from './tiles'
import { T } from '@brick-studio/platformer-core/engine/tiles'
import type { Theme } from '@brick-studio/platformer-core/engine/level'

/*
 * Every piece of art has a string key. The browser atlas turns keys into canvases lazily; Node
 * previews turn them into bitmaps. A trailing "|f" means mirrored.
 */

/** The art key for the tile at (x, y), or null for nothing to draw. */
export function tileKey(tiles: Uint8Array, width: number, height: number, x: number, y: number, theme: Theme, frame: number): string | null {
  const at = (tx: number, ty: number, outside: number) => (tx < 0 || tx >= width || ty < 0 || ty >= height ? outside : tiles[ty * width + tx])
  const t = tiles[y * width + x]
  switch (t) {
    case T.EMPTY:
      return null
    case T.GROUND: {
      let mask = 0
      if (at(x, y - 1, T.EMPTY) === T.GROUND) mask |= GROUND_UP
      if (at(x, y + 1, T.GROUND) === T.GROUND) mask |= GROUND_DOWN
      if (at(x - 1, y, T.GROUND) === T.GROUND) mask |= GROUND_LEFT
      if (at(x + 1, y, T.GROUND) === T.GROUND) mask |= GROUND_RIGHT
      return `g:${mask}:${theme}`
    }
    case T.HARD:
      return 'hard'
    case T.BRICK:
      return 'brick'
    case T.QBLOCK:
      return `q:${frame % 4}`
    case T.USED:
      return 'used'
    case T.BOUNCE:
      return 'bounce'
    case T.SEMI:
      return `semi:${at(x - 1, y, T.EMPTY) === T.SEMI ? 1 : 0}${at(x + 1, y, T.EMPTY) === T.SEMI ? 1 : 0}`
    case T.PIPE_L:
      return `pipe:L:${at(x, y - 1, T.EMPTY) === T.PIPE_L ? 0 : 1}`
    case T.PIPE_R:
      return `pipe:R:${at(x, y - 1, T.EMPTY) === T.PIPE_R ? 0 : 1}`
    case T.SPIKES:
      return 'spikes'
    case T.LAVA:
      return `lava:${frame % 8}:${at(x, y - 1, T.EMPTY) === T.LAVA ? 0 : 1}`
    case T.COIN:
      return `coin:${frame % 4}`
    case T.SPRING:
      return 'spring:0'
    default:
      return null
  }
}

function checkpointFlag(active: number): Bitmap {
  const b = new Bitmap(16, 32)
  const pole = hex(PAL.metal)
  b.rect(2, 2, 2, 30, pole)
  b.vline(1, 2, 31, hex(PAL.outline))
  b.vline(4, 2, 31, hex(PAL.outline))
  b.disc(3, 2, 2, hex(PAL.gold))
  const [color, shade] = active ? PLAYER_COLORS[(active - 1) % PLAYER_COLORS.length] : [PAL.metalLight, PAL.metalShade]
  const flag = fromRows(
    ['KKKKKKKKKK', 'KCCCCCCCCCK', 'KCCCCCCCCCCK', 'KCCWWCCCCCK', 'KCCCCCCCCK', 'KcccccccK', 'KKKKKKKK'],
    { K: PAL.outline, C: color, c: shade, W: PAL.white },
  )
  b.blit(flag, 5, 4)
  b.rect(0, 29, 7, 3, hex(PAL.hardShade))
  b.hline(0, 6, 28, hex(PAL.outline))
  return b
}

/** The goal: a studded post ten tiles tall with a chequered flag. */
function goalPost(): Bitmap {
  const b = new Bitmap(32, 160)
  const K = hex(PAL.outline)
  b.rect(14, 8, 4, 136, hex(PAL.metal))
  b.vline(13, 8, 144, K)
  b.vline(18, 8, 144, K)
  b.vline(15, 8, 144, hex(PAL.metalLight))
  b.disc(16, 6, 5, hex(PAL.gold))
  b.disc(15, 5, 2, hex(PAL.goldLight))
  // chequered flag
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 13; x++) {
      const on = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0
      b.set(x, 14 + y, hex(on ? PAL.white : PAL.outline))
    }
  }
  b.hline(0, 12, 13, K)
  b.hline(0, 12, 28, K)
  b.vline(0, 13, 28, K)
  // base block
  const base = hardTile()
  b.blit(base, 8, 144)
  b.blit(base, 16, 144)
  return b.outlined(PAL.outline)
}

const PLAYER_KEY = /^p:(\d+):(small|big):([a-z0-9]+):([01])$/

/** A moving lift: yellow and black hazard stripes, three tiles wide. */
function lift(): Bitmap {
  const b = new Bitmap(48, 8)
  for (let y = 1; y < 7; y++) {
    for (let x = 1; x < 47; x++) {
      const stripe = Math.floor((x + y) / 4) % 2 === 0
      b.set(x, y, hex(stripe ? PAL.gold : PAL.outline))
    }
  }
  b.hline(1, 46, 1, hex(PAL.goldLight))
  return b.outlined(PAL.outline)
}

export function buildArt(key: string): Bitmap {
  if (key.endsWith('|f')) return buildArt(key.slice(0, -2)).flipped()
  if (key.endsWith('|v')) return buildArt(key.slice(0, -2)).flippedV()
  const [kind, a, b] = key.split(':')
  switch (kind) {
    case 'g':
      return groundTile(Number(a), b as Theme, 0, 0)
    case 'hard':
      return hardTile()
    case 'brick':
      return brickTile()
    case 'q':
      return questionTile(Number(a))
    case 'used':
      return usedTile()
    case 'bounce':
      return bounceTile()
    case 'semi':
      return semiTile(a[0] === '1', a[1] === '1')
    case 'pipe':
      return pipeTile(a as 'L' | 'R', b === '1')
    case 'spikes':
      return spikesTile()
    case 'lava':
      return lavaTile(Number(a), b === '1')
    case 'coin':
      return CR.COIN_FRAMES[Number(a) % 4]
    case 'spring':
      return springTile(a === '1')
    case 'walker':
      return a === 'flat' ? CR.WALKER_FLAT : a === '2' ? CR.WALKER_2 : CR.WALKER_1
    case 'flyer':
      return a === '2' ? CR.FLYER_2 : CR.FLYER_1
    case 'shellbug':
      return a === '2' ? CR.SHELLBUG_2 : CR.SHELLBUG_1
    case 'shell':
      return CR.SHELL_FRAMES[Number(a) % 4]
    case 'spiky':
      return a === '2' ? CR.SPIKY_2 : CR.SPIKY_1
    case 'grow':
      return CR.GROW
    case 'sparkitem':
      return a === '2' ? CR.SPARK_ITEM_2 : CR.SPARK_ITEM_1
    case 'sparkshot':
      return CR.SPARK_SHOT[Number(a) % 4]
    case 'burst':
      return CR.SPARK_BURST
    case 'sparkle':
      return CR.SPARKLE[Number(a) % 3]
    case 'poof':
      return CR.POOF[Number(a) % 3]
    case 'dust':
      return CR.DUST[Number(a) % 3]
    case 'debris':
      return CR.DEBRIS
    case 'cloud':
      return cloud(a as 'small' | 'big')
    case 'bush':
      return bush()
    case 'hill':
      return hill(a === 'big', b === 'far')
    case 'start':
      return startSign()
    case 'checkpoint':
      return checkpointFlag(Number(a))
    case 'goal':
      return goalPost()
    case 'lift':
      return lift()
    case 'goalicon':
      return goalPost().crop(0, 0, 32, 32)
    case 'pipeicon': {
      const b = new Bitmap(32, 32)
      b.blit(pipeTile('L', true), 0, 0)
      b.blit(pipeTile('R', true), 16, 0)
      b.blit(pipeTile('L', false), 0, 16)
      b.blit(pipeTile('R', false), 16, 16)
      return b
    }
    case 'p': {
      const m = PLAYER_KEY.exec(key)
      if (!m) break
      return colorPlayer(playerSprite(m[2] as 'small' | 'big', m[3] as PlayerPose), Number(m[1]), m[4] === '1')
    }
  }
  throw new Error(`unknown art key ${key}`)
}
