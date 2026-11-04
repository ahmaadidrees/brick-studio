/**
 * Hackable Racing's track bricks and its beginner track (docs/qa/hackable-modes R1).
 *
 * Track bricks are grid bricks, painted like the Platformer's Ground. Only the Barrier has code (`solid [on]`); the
 * rest are just ground, and the Car's own feel scripts read them with `ground under me`. The Finish line says which
 * way racers cross it (`grid.finish`), and laps count from it (core/race.ts). Grass is the empty background.
 *
 * The beginner track is the size of the race kit's Snowy Oval (64 x 40 bricks): a wide oval driven anticlockwise,
 * starting on the bottom straight heading right, with icy corners on the left, a dirt patch on the top straight, a
 * boost pad after the finish line and a barrier all the way round the outside.
 */
import type { BrickDef, Costume, CopyPlacement, LevelDesign, TileLayer } from '../../core/contracts'
import { TILE_SIZE } from '../../core/contracts'
import { compileWorkspace, type WorkspaceJson } from '../../core/editor/compile'
import { Blocks } from '../blockBuilder'
import { costumeFromImage, imageFromRows } from '../pixels'
import { CAR_BRICK_ID, RACE_GLOBALS, RACER_BRICK_ID, createCarBrick, createRacerBrick } from './carBrick'

// -----------------------------------------------------------------------------
// Track bricks
// -----------------------------------------------------------------------------

export const TRACK_BRICK_KEYS = ['road', 'dirt', 'ice', 'barrier', 'boost', 'finish'] as const
export type TrackBrickKey = (typeof TRACK_BRICK_KEYS)[number]

interface TrackSpec {
  key: TrackBrickKey
  name: string
  char: string
  palette: Record<string, string>
  /** The 16 x 16 picture, as a palette key per pixel. */
  art: (x: number, y: number) => string
  solid?: boolean
  finish?: number
  /** A brick that points a way (a boost pad): its cells face it (`grid.way`). */
  way?: number
}

/** R1's boost pad art: chevrons that point left ("<"), though cars cross it going right. */
export const BOOST_ART_R1 = (x: number, y: number): string => (Math.abs(((x + 16 - Math.abs(y - 7.5)) % 8) - 4) < 1.5 ? 'b' : 'a')

const TRACK_SPECS: readonly TrackSpec[] = [
  { key: 'road', name: 'Road', char: 'R', palette: { a: '#4b5563', b: '#52525b' }, art: (x, y) => ((x * 7 + y * 3) % 11 === 0 ? 'b' : 'a') },
  { key: 'dirt', name: 'Dirt', char: 'D', palette: { a: '#a16207', b: '#854d0e' }, art: (x, y) => ((x * 5 + y * 9) % 7 === 0 ? 'b' : 'a') },
  { key: 'ice', name: 'Ice', char: 'I', palette: { a: '#bae6fd', b: '#f0f9ff' }, art: (x, y) => ((x + y) % 9 === 0 ? 'b' : 'a') },
  { key: 'barrier', name: 'Barrier', char: 'X', palette: { a: '#dc2626', b: '#f8fafc' }, art: (x, y) => (Math.floor((x + y) / 4) % 2 ? 'b' : 'a'), solid: true },
  // Chevrons pointing right (">"): the cells turn to the pad's way. R1's art pointed left (BOOST_ART_R1).
  { key: 'boost', name: 'Boost pad', char: 'B', palette: { a: '#1f2937', b: '#facc15' }, art: (x, y) => BOOST_ART_R1(15 - x, y), way: 90 },
  { key: 'finish', name: 'Finish line', char: 'F', palette: { a: '#0f172a', b: '#f8fafc' }, art: (x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 'b' : 'a'), finish: 90 },
]

/** R1's boost pad picture, to recognise a saved pad nobody repainted (remix.ts turns it to today's). */
export function boostCostumeR1(): Costume {
  const spec = TRACK_SPECS.find((s) => s.key === 'boost')!
  return trackCostume({ ...spec, art: BOOST_ART_R1 })
}

export function boostCostume(): Costume {
  return trackCostume(TRACK_SPECS.find((s) => s.key === 'boost')!)
}

function trackCostume(spec: TrackSpec): Costume {
  const rows = Array.from({ length: TILE_SIZE }, (_, y) => Array.from({ length: TILE_SIZE }, (_, x) => spec.art(x, y)).join(''))
  return costumeFromImage(spec.name, imageFromRows(rows, spec.palette), { x: 8, y: 8 })
}

/** A track brick's blocks: only the Barrier has any (`solid [on]`). */
export function trackWorkspace(key: TrackBrickKey): WorkspaceJson {
  const spec = TRACK_SPECS.find((s) => s.key === key)!
  const b = new Blocks(`track_${spec.key}`)
  if (spec.solid) b.flag('When the race starts: cars can\'t drive through me', [b.setSolid('on')])
  return b.workspace()
}

export function createTrackBrick(key: TrackBrickKey): BrickDef {
  const spec = TRACK_SPECS.find((s) => s.key === key)!
  return {
    id: `brick_${key}`,
    name: spec.name,
    costumes: [trackCostume(spec)],
    sounds: [],
    program: compileWorkspace(trackWorkspace(key)).program,
    grid: { char: spec.char, ...(spec.finish !== undefined ? { finish: spec.finish } : {}), ...(spec.way !== undefined ? { way: spec.way } : {}) },
  }
}

export const trackChar = (key: TrackBrickKey): string => TRACK_SPECS.find((s) => s.key === key)!.char

// -----------------------------------------------------------------------------
// The race starter: the countdown and the results (the Stage can't say things, so a flag-waver does)
// -----------------------------------------------------------------------------

export const STARTER_BRICK_ID = 'brick_starter'
/** Seconds between "3", "2", "1" and "Go!". */
export const COUNTDOWN_STEP = 1

/** The Starter's blocks: the countdown, then the results when someone finishes. */
export function createStarterWorkspace(): WorkspaceJson {
  const b = new Blocks('starter')
  const sayFor = (text: string) => [b.say(text), b.wait(COUNTDOWN_STEP)]
  b.flag('When the race starts: count down, then everyone can go', [
    ...sayFor('3'),
    ...sayFor('2'),
    ...sayFor('1'),
    b.say('Go!'),
    b.broadcast('go'),
    b.wait(COUNTDOWN_STEP),
    b.say(''),
  ])
  b.receive('When someone finishes: show the results', 'finished', [
    b.blk('looks_say', {
      inputs: {
        MESSAGE: { block: b.blk('operator_join', { inputs: { STRING1: b.text('Results: '), STRING2: { block: b.blk('data_listcontents', { fields: { LIST: RACE_GLOBALS.results } }) } } }) },
      },
    }),
  ])
  return b.workspace()
}

export function createStarterBrick(): BrickDef {
  const rows = Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => (x === 2 ? 'P' : x > 2 && x < 14 && y < 9 ? ((Math.floor((x - 3) / 3) + Math.floor(y / 3)) % 2 ? 'W' : 'K') : '.')).join(''),
  )
  return {
    id: STARTER_BRICK_ID,
    name: 'Starter',
    costumes: [costumeFromImage('Flag', imageFromRows(rows, { '.': '', P: '#78350f', W: '#f8fafc', K: '#0f172a' }), { x: 8, y: 8 })],
    sounds: [],
    program: compileWorkspace(createStarterWorkspace()).program,
    limit: 1,
  }
}

/** The race Stage's blocks: none, only its two globals (laps to win, and the results list). */
export function createRaceStageWorkspace(): WorkspaceJson {
  return { variables: [{ id: RACE_GLOBALS.lapsToWin, name: 'laps to win' }, { id: RACE_GLOBALS.results, name: 'results', type: 'list' }], blocks: { blocks: [] } }
}

function raceStage(): BrickDef {
  return {
    id: 'stage',
    name: 'Stage',
    isStage: true,
    costumes: [],
    sounds: [],
    program: {
      scripts: [],
      procedures: [],
      variables: [{ id: RACE_GLOBALS.lapsToWin, name: 'laps to win', value: 3 }],
      lists: [{ id: RACE_GLOBALS.results, name: 'results', value: [] }],
    },
  }
}

// -----------------------------------------------------------------------------
// Painting a track
// -----------------------------------------------------------------------------

/** A grid of characters to paint, row 0 at the bottom. */
export class TrackPainter {
  readonly cells: string[][]
  constructor(readonly cols: number, readonly rows: number) {
    this.cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => '.'))
  }
  get(c: number, r: number): string {
    return this.cells[r]?.[c] ?? '.'
  }
  set(c: number, r: number, ch: string, when?: (was: string) => boolean): void {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return
    if (when && !when(this.cells[r][c])) return
    this.cells[r][c] = ch
  }
  /** Paint every cell whose centre is within `radius` cells of the line (a closed list of [col, row] points). */
  road(line: readonly (readonly [number, number])[], radius: number, ch: string): Float64Array {
    const dist = new Float64Array(this.cols * this.rows).fill(Infinity)
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        let best = Infinity
        for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, segmentDistance(c, r, line[i], line[i + 1]))
        dist[r * this.cols + c] = best
        if (best <= radius) this.cells[r][c] = ch
      }
    }
    return dist
  }
  layer(): TileLayer {
    return { cols: this.cols, rows: this.rows, data: this.cells.map((row) => row.join('')) }
  }
}

function segmentDistance(c: number, r: number, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c - a[0]) * dx + (r - a[1]) * dy) / len2))
  const px = a[0] + t * dx - c, py = a[1] + t * dy - r
  return Math.sqrt(px * px + py * py)
}

/** A race design around a painted track: the track bricks, the Car, the racers and the starter. */
export function raceDesign(options: {
  id: string
  name: string
  tiles: TileLayer
  car?: { col: number; row: number; direction?: number }
  racers?: Array<{ col: number; row: number; direction?: number; costume?: number }>
  starter?: { col: number; row: number }
  /** Leave out the starter (feel tests): everyone may drive at once. */
  noCountdown?: boolean
}): LevelDesign {
  const cell = (c: number, r: number) => ({ x: c * TILE_SIZE + TILE_SIZE / 2, y: r * TILE_SIZE + TILE_SIZE / 2 })
  const copies: CopyPlacement[] = []
  const bricks: BrickDef[] = TRACK_BRICK_KEYS.map(createTrackBrick)
  if (options.starter && !options.noCountdown) {
    bricks.push(createStarterBrick())
    copies.push({ id: 'copy_starter', brickId: STARTER_BRICK_ID, ...cell(options.starter.col, options.starter.row) })
  }
  const stage = raceStage()
  if (options.noCountdown) {
    // No countdown: say go as soon as the race starts.
    const b = new Blocks('stage')
    b.flag('When the race starts: go!', [b.broadcast('go')])
    stage.program = { ...compileWorkspace(b.workspace()).program, variables: stage.program.variables, lists: stage.program.lists }
  }
  if (options.car) {
    bricks.push(createCarBrick().brick)
    copies.push({ id: 'copy_car', brickId: CAR_BRICK_ID, ...cell(options.car.col, options.car.row), direction: options.car.direction ?? 90 })
  }
  if (options.racers?.length) {
    bricks.push(createRacerBrick().brick)
    options.racers.forEach((r, i) =>
      copies.push({ id: `copy_racer_${i + 1}`, brickId: RACER_BRICK_ID, ...cell(r.col, r.row), direction: r.direction ?? 90, costume: r.costume ?? i % 2 }),
    )
  }
  return {
    id: options.id,
    name: options.name,
    kit: 'race',
    seed: 1,
    bounds: { left: 0, right: options.tiles.cols * TILE_SIZE, bottom: 0, top: options.tiles.rows * TILE_SIZE },
    stage,
    bricks,
    copies,
    tiles: options.tiles,
  }
}

// -----------------------------------------------------------------------------
// The beginner track
// -----------------------------------------------------------------------------

export const BEGINNER_COLS = 64
export const BEGINNER_ROWS = 40
/** Centre line, anticlockwise from the bottom straight (row 0 is the bottom), the shape of the race kit's Snowy Oval. */
const OVAL_LINE: readonly (readonly [number, number])[] = [
  [14, 8], [50, 8], [55, 10], [57, 15], [57, 23], [55, 28], [50, 30], [14, 30], [9, 28], [7, 23], [7, 15], [9, 10], [14, 8],
]
export const BEGINNER_FINISH_COL = 22

export function beginnerTrackTiles(): TileLayer {
  const p = new TrackPainter(BEGINNER_COLS, BEGINNER_ROWS)
  const R = trackChar('road')
  const dist = p.road(OVAL_LINE, 3.4, R)
  const isRoad = (ch: string) => ch === R
  // A barrier all the way round the outside of the road, a little way out: run wide and you bump it.
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      const d = dist[r * p.cols + c]
      const outside = c <= 6 || c >= 57 || r <= 9 || r >= 29 ? true : false
      if (d > 4.6 && d <= 5.6 && outside) p.set(c, r, trackChar('barrier'))
    }
  }
  // Icy corners on the left, a dirt patch on the top straight.
  for (let r = 0; r < p.rows; r++) for (let c = 0; c <= 12; c++) p.set(c, r, trackChar('ice'), isRoad)
  for (let r = 26; r <= 34; r++) for (let c = 28; c <= 36; c++) p.set(c, r, trackChar('dirt'), isRoad)
  // The finish line across the bottom straight, and a boost pad a little after it.
  for (let r = 0; r <= 14; r++) p.set(BEGINNER_FINISH_COL, r, trackChar('finish'), isRoad)
  for (let r = 0; r <= 14; r++) p.set(30, r, trackChar('boost'), isRoad)
  return p.layer()
}

/** The beginner track with the Car, two Computer racers and the starter, ready to race. */
export function createBeginnerRace(): LevelDesign {
  return raceDesign({
    id: 'race_beginner',
    name: 'Beginner track',
    tiles: beginnerTrackTiles(),
    car: { col: 18, row: 8 },
    racers: [
      { col: 16, row: 10, costume: 0 },
      { col: 16, row: 6, costume: 1 },
    ],
    starter: { col: 20, row: 1 },
  })
}
