import { DEFAULT_RACE } from '../engine/kits'
import type { LevelDesign } from '../engine/level'
import { RT, raceTrack } from '../engine/raceTiles'
import type { Course } from './courses'

// The race kit's ready-made tracks. Each is drawn from a centre line, then dressed with ice, dirt, a jump and
// scenery, the same track the race kit mock shipped with.

const W = 72
const H = 44

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy
  const k = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0
  return Math.hypot(px - ax - k * dx, py - ay - k * dy)
}

/** Centre line of Brick Speedway, in tiles, driven clockwise from the start straight. */
export const SPEEDWAY_LINE: readonly (readonly [number, number])[] = [
  [14, 37], [56, 37], [62, 35], [65, 30], [65, 14], [62, 9], [56, 7], [46, 7], [40, 9], [36, 14], [32, 17], [28, 14],
  [24, 9], [18, 7], [11, 7], [7, 10], [6, 15], [6, 30], [8, 35], [14, 37],
]

export function brickSpeedway(): LevelDesign {
  const t = new Uint8Array(W * H)
  const at = (x: number, y: number) => y * W + x
  const set = (x: number, y: number, c: number, only?: (c: number) => boolean) => {
    if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) return
    if (!only || only(t[at(x, y)])) t[at(x, y)] = c
  }
  const road = (c: number) => c === RT.ROAD
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
        t[at(x, y)] = RT.BARRIER
        continue
      }
      let d = Infinity
      for (let i = 0; i < SPEEDWAY_LINE.length - 1; i++) d = Math.min(d, segDist(x, y, ...SPEEDWAY_LINE[i], ...SPEEDWAY_LINE[i + 1]))
      if (d <= 2.7) t[at(x, y)] = RT.ROAD
      else if (d <= 3.8 && ((x >= 60 && y >= 31) || (x <= 10 && y <= 10) || (x >= 61 && y <= 10))) t[at(x, y)] = RT.TIRES
    }
  }
  // Infield garden behind a barrier ring: a pond, trees and flowers.
  for (let x = 14; x <= 58; x++) { t[at(x, 22)] = RT.BARRIER; t[at(x, 30)] = RT.BARRIER }
  for (let y = 22; y <= 30; y++) { t[at(14, y)] = RT.BARRIER; t[at(58, y)] = RT.BARRIER }
  for (let y = 24; y <= 28; y++) for (let x = 30; x <= 42; x++) if (Math.hypot((x - 36) / 6.5, (y - 26) / 2.6) <= 1) t[at(x, y)] = RT.WATER
  for (const [x, y] of [[18, 25], [22, 27], [26, 24], [47, 25], [51, 27], [55, 24], [17, 28], [53, 29]]) set(x, y, RT.TREE)
  for (let y = 23; y <= 29; y++) for (let x = 15; x <= 57; x++) if (t[at(x, y)] === RT.GRASS && (x * 7 + y * 13) % 11 === 0) t[at(x, y)] = RT.FLOWERS
  // Ice on the left straight, dirt in the dip.
  for (let y = 12; y <= 19; y++) for (let x = 1; x <= 12; x++) set(x, y, RT.ICE, road)
  for (let y = 15; y <= 21; y++) for (let x = 27; x <= 37; x++) set(x, y, RT.DIRT, road)
  // Right straight: a boost, then a ramp over a water gap, with tire stacks so you can't drive round it.
  for (let x = 62; x <= 68; x++) {
    for (const y of [28, 29]) set(x, y, RT.BOOST_U, road)
    for (const y of [25, 26]) set(x, y, RT.RAMP, road)
    for (const y of [21, 22, 23]) {
      if (t[at(x, y)] === RT.ROAD) t[at(x, y)] = RT.WATER
      else if (t[at(x, y)] === RT.GRASS) t[at(x, y)] = RT.TIRES
    }
  }
  for (let y = 36; y <= 38; y++) for (let x = 34; x <= 35; x++) set(x, y, RT.BOOST_R, road)
  for (const [x, y] of [[32, 10], [30, 8], [34, 8]]) set(x, y, RT.BUMPER)
  for (let y = 33; y <= 41; y++) if (raceTrack(t[at(20, y)])) t[at(20, y)] = RT.FINISH
  for (let x = 24; x <= 52; x++) { set(x, 41, RT.STAND); set(x, 42, RT.STAND) }
  for (let x = 4; x <= 66; x += 6) set(x, 2, RT.TREE, (c) => c === RT.GRASS)
  for (let y = 4; y <= 40; y += 5) set(70, y, RT.TREE, (c) => c === RT.GRASS)
  return {
    title: 'Brick Speedway',
    width: W,
    height: H,
    theme: 'day',
    style: 'cartoon',
    tiles: t,
    contents: new Uint8Array(W * H),
    pipes: [],
    objects: [{ id: 1, kind: 'start', x: 15, y: 37, dir: 1, alt: 0 }],
    kit: 'race',
    race: { ...DEFAULT_RACE },
  }
}

export const RACE_COURSES: Course[] = [
  { id: 'speedway', title: 'Brick Speedway', blurb: 'Ice, a dirt dip, boost pads and a jump over the water.', level: brickSpeedway },
]

export const raceCourseById = (id: string) => RACE_COURSES.find((c) => c.id === id)
