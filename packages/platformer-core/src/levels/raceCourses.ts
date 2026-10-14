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
  // ? blocks across the start straight and the top straight; coins along the start straight and down the left side.
  for (let y = 34; y <= 40; y++) set(44, y, RT.ITEM, road)
  for (let y = 4; y <= 10; y++) set(52, y, RT.ITEM, road)
  for (const x of [24, 26, 28, 30]) set(x, 37, RT.COIN, road)
  for (const y of [26, 28, 30, 32]) set(6, y, RT.COIN, road)
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
    objects: [
      { id: 1, kind: 'start', x: 15, y: 37, dir: 1, alt: 0 },
      // Walkers pace across the left straight and the dirt dip.
      { id: 2, kind: 'walker', x: 6, y: 23, dir: 1, alt: 0 },
      { id: 3, kind: 'walker', x: 32, y: 17, dir: 1, alt: 0 },
    ],
    kit: 'race',
    race: { ...DEFAULT_RACE },
  }
}

/** A track drawn along a closed centre line: road within `half` tiles of it, grass elsewhere, a barrier fence round the edge. */
function paintTrack(w: number, h: number, line: readonly (readonly [number, number])[], half: number) {
  const t = new Uint8Array(w * h)
  const dist = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let d = Infinity
      for (let i = 0; i < line.length - 1; i++) d = Math.min(d, segDist(x, y, ...line[i], ...line[i + 1]))
      dist[y * w + x] = d
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) t[y * w + x] = RT.BARRIER
      else if (d <= half) t[y * w + x] = RT.ROAD
    }
  }
  const at = (x: number, y: number) => y * w + x
  const set = (x: number, y: number, c: number, only?: (c: number) => boolean) => {
    if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) return
    if (!only || only(t[at(x, y)])) t[at(x, y)] = c
  }
  return { t, dist, at, set }
}
const isRoad = (c: number) => c === RT.ROAD

/** Centre line of Snowy Oval: a wide, gentle oval for first races, driven anticlockwise from the bottom straight. */
const OVAL_LINE: readonly (readonly [number, number])[] = [
  [14, 31], [50, 31], [55, 29], [57, 24], [57, 16], [55, 11], [50, 9], [14, 9], [9, 11], [7, 16], [7, 24], [9, 29], [14, 31],
]

/** Snowy Oval: wide road, icy corners, a few ? blocks and coins, no Walkers. The gentlest place to start. */
export function snowyOval(): LevelDesign {
  const W = 64, H = 40
  const { t, at, set } = paintTrack(W, H, OVAL_LINE, 3.4)
  // Icy corners (the straights stay grippy), and snowy scenery: a frozen pond and trees in the middle.
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if ((x <= 13 || x >= 51) && isRoad(t[at(x, y)])) t[at(x, y)] = RT.ICE
  for (let y = 16; y <= 24; y++) for (let x = 24; x <= 40; x++) if (Math.hypot((x - 32) / 7.5, (y - 20) / 3.6) <= 1) t[at(x, y)] = RT.ICE
  for (const [x, y] of [[18, 17], [20, 22], [16, 20], [44, 17], [46, 22], [48, 19], [32, 15], [32, 25]]) set(x, y, RT.TREE)
  for (let x = 4; x <= 60; x += 5) { set(x, 2, RT.TREE); set(x + 2, 37, RT.TREE) }
  for (let x = 22; x <= 42; x++) set(x, 36, RT.STAND)
  // Items on the top straight, coins along the bottom one, a boost pad leaving the last corner.
  for (let y = 5; y <= 13; y++) set(36, y, RT.ITEM, isRoad)
  for (const x of [26, 29, 32, 35, 38]) set(x, 31, RT.COIN, isRoad)
  for (let y = 28; y <= 34; y++) set(15, y, RT.BOOST_R, isRoad)
  for (let y = 27; y <= 35; y++) if (t[at(22, y)] === RT.ROAD || t[at(22, y)] === RT.COIN) t[at(22, y)] = RT.FINISH
  return {
    title: 'Snowy Oval',
    width: W,
    height: H,
    theme: 'day',
    style: 'cartoon',
    tiles: t,
    contents: new Uint8Array(W * H),
    pipes: [],
    objects: [{ id: 1, kind: 'start', x: 18, y: 31, dir: 1, alt: 0 }],
    kit: 'race',
    race: { ...DEFAULT_RACE },
  }
}

/** Centre line of Canyon Twist: round the outside, then down into a hairpin dip in the middle of the top. */
const CANYON_LINE: readonly (readonly [number, number])[] = [
  [14, 41], [64, 41], [69, 38], [71, 32], [71, 12], [68, 8], [62, 7], [56, 8], [51, 13], [50, 22], [46, 27], [40, 28],
  [34, 27], [30, 22], [29, 13], [25, 8], [19, 7], [12, 8], [9, 12], [8, 18], [8, 34], [10, 39], [14, 41],
]

/** Canyon Twist: narrower dirt sections, a hairpin dip, bumpers, a jump over the river and three Walkers. */
export function canyonTwist(): LevelDesign {
  const W = 80, H = 48
  const { t, dist, at, set } = paintTrack(W, H, CANYON_LINE, 2.6)
  // Canyon walls: tire stacks hug the road through the dip, so you can't cut across it.
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const d = dist[at(x, y)]
    if (t[at(x, y)] === RT.GRASS && d <= 3.8 && x >= 26 && x <= 54 && y >= 10 && y <= 31) t[at(x, y)] = RT.TIRES
  }
  // Dirt down the left side and through the bottom of the dip.
  for (let y = 12; y <= 36; y++) for (let x = 1; x <= 14; x++) set(x, y, RT.DIRT, isRoad)
  for (let y = 22; y <= 31; y++) for (let x = 34; x <= 46; x++) set(x, y, RT.DIRT, isRoad)
  // The river across the right side: boost, ramp, water, with tires so the only way over is the jump.
  for (let x = 66; x <= 76; x++) {
    for (const y of [31, 32]) set(x, y, RT.BOOST_U, isRoad)
    for (const y of [27, 28]) set(x, y, RT.RAMP, isRoad)
    for (const y of [22, 23, 24]) {
      if (t[at(x, y)] === RT.ROAD) t[at(x, y)] = RT.WATER
      else if (t[at(x, y)] === RT.GRASS) t[at(x, y)] = RT.TIRES
    }
  }
  for (let y = 18; y <= 28; y++) for (let x = 58; x <= 64; x++) if (t[at(x, y)] === RT.GRASS) t[at(x, y)] = RT.WATER
  // Bumpers at the top of the dip, a grandstand along the bottom, trees on the canyon rim.
  for (const [x, y] of [[40, 16], [37, 13], [43, 13]]) set(x, y, RT.BUMPER)
  for (let x = 24; x <= 58; x++) { set(x, 45, RT.STAND); set(x, 46, RT.STAND) }
  for (let x = 4; x <= 76; x += 6) set(x, 2, RT.TREE, (c) => c === RT.GRASS)
  for (const [x, y] of [[18, 20], [20, 26], [16, 30], [22, 16], [60, 34], [56, 16]]) set(x, y, RT.TREE)
  for (let y = 23; y <= 33; y++) for (let x = 16; x <= 22; x++) if (t[at(x, y)] === RT.GRASS && (x * 5 + y * 3) % 7 === 0) t[at(x, y)] = RT.FLOWERS
  // ? blocks on the bottom straight and the left side; coins round the dip.
  for (let y = 38; y <= 44; y++) set(48, y, RT.ITEM, isRoad)
  for (let x = 4; x <= 12; x++) set(x, 22, RT.ITEM, (c) => c === RT.DIRT)
  for (const [x, y] of [[50, 18], [48, 25], [40, 28], [32, 25], [30, 18]]) set(x, y, RT.COIN, (c) => isRoad(c) || c === RT.DIRT)
  for (let y = 37; y <= 45; y++) if (t[at(20, y)] === RT.ROAD) t[at(20, y)] = RT.FINISH
  return {
    title: 'Canyon Twist',
    width: W,
    height: H,
    theme: 'day',
    style: 'cartoon',
    tiles: t,
    contents: new Uint8Array(W * H),
    pipes: [],
    objects: [
      { id: 1, kind: 'start', x: 15, y: 41, dir: 1, alt: 0 },
      // Walkers cross the bottom straight, the left side and the top right.
      { id: 2, kind: 'walker', x: 36, y: 41, dir: 1, alt: 1 },
      { id: 3, kind: 'walker', x: 8, y: 28, dir: 1, alt: 0 },
      { id: 4, kind: 'walker', x: 71, y: 14, dir: 1, alt: 0 },
    ],
    kit: 'race',
    race: { ...DEFAULT_RACE },
  }
}

export const RACE_COURSES: Course[] = [
  { id: 'oval', title: 'Snowy Oval', blurb: 'A wide, easy oval with icy corners. Great for a first race.', level: snowyOval },
  { id: 'speedway', title: 'Brick Speedway', blurb: 'Ice, a dirt dip, boost pads, a jump over the water, ? blocks and Walkers.', level: brickSpeedway },
  { id: 'canyon', title: 'Canyon Twist', blurb: 'Hairpins, dirt, bumpers, a river jump and three Walkers. For experts.', level: canyonTwist },
]

export const raceCourseById = (id: string) => RACE_COURSES.find((c) => c.id === id)
