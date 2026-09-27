import { T } from '@brick-studio/platformer-core/engine/tiles'
import type { LabLevel, PlacedThing } from '../sim/world'

/*
 * The lab's starter level, left to right:
 *
 *   x 0–4     an island with coins, across a 12-brick lava gap: too far for one jump, easy with a double jump
 *   x 19      the start
 *   x 22–31   a ? block, coins, a spring, a crate
 *   x 34–54   two ledges with Walkers on them (built-in Walkers walk off the ends)
 *   x 57      a moving platform
 *   x 62–100  a long flat road with Walkers, a Flyer and a Spiky: room to drive and to throw
 *   x 104–115 a cliff 14 bricks high with coins on top: out of jumping reach, not of a rocket's
 *   x 134     the goal
 */

export const STARTER_W = 140
export const STARTER_H = 22

/** The lava gap left of the start (inclusive columns), for the tests. */
export const GAP = { from: 5, to: 16, islandRight: 4 } as const
export const CLIFF = { from: 104, to: 115, top: 6 } as const

export function starterLevel(): LabLevel {
  const W = STARTER_W
  const H = STARTER_H
  const tiles = new Uint8Array(W * H)
  const fill = (x0: number, x1: number, y0: number, y1: number, t: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles[y * W + x] = t
  }
  // Ground, two bricks deep.
  fill(0, W - 1, H - 2, H - 1, T.GROUND)
  // The gap: open above, lava at the bottom.
  fill(GAP.from, GAP.to, H - 2, H - 2, T.EMPTY)
  fill(GAP.from, GAP.to, H - 1, H - 1, T.LAVA)
  // Two ledges for the Walkers.
  fill(34, 41, 16, 16, T.BRICK)
  fill(45, 54, 12, 12, T.BRICK)
  // The cliff.
  fill(CLIFF.from, CLIFF.to, CLIFF.top, H - 3, T.HARD)

  let id = 1
  const things: PlacedThing[] = []
  const put = (brick: string, x: number, y: number, dir: 1 | -1 = 1) => things.push({ id: id++, brick, x, y, dir })
  for (let x = 1; x <= 3; x++) put('coin', x, 17)
  put('qblock', 22, 16)
  for (let x = 24; x <= 27; x++) put('coin', x, 17)
  put('spring', 29, 19)
  put('crate', 31, 19)
  put('walker', 36, 15, 1)
  put('walker', 48, 11, -1)
  put('walker', 44, 19, -1)
  put('platform', 58, 14)
  for (let x = 66; x <= 70; x++) put('coin', x, 16)
  put('walker', 74, 19, -1)
  put('flyer', 80, 15, -1)
  put('walker', 86, 19, -1)
  put('spiky', 95, 19, -1)
  for (let x = 106; x <= 113; x++) put('coin', x, 5)
  put('goal', 134, 19)

  return { width: W, height: H, theme: 'day', tiles, start: { x: 19, y: H - 3 }, things }
}
