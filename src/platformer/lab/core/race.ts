/**
 * Racing extension (docs/qa/hackable-modes R1): five blocks that are "built in, like touching", plus the lap counting
 * that runs in `afterTick`. Everything a car does (gas, grip, bouncing off barriers) is the car's own blocks; this file
 * only answers questions about the track.
 *
 *   ground under me            the grid brick painted under my centre ("Grass" where nothing is painted)
 *   direction along the track  which way the road goes from here, as a direction to point in
 *   laps done                  laps I have finished
 *   when I finish a lap        a hat on the racer that just finished one
 *   my place                   1 for the racer furthest round the race
 *
 * Laps are the race kit's (packages/platformer-core/src/engine/laps.ts), moved to grid bricks: from the finish line's
 * arrow side we follow the road all the way round back to the line, numbering every cell by how far round it is.
 * Three hidden gates sit a quarter, half and three quarters of the way, and a lap counts when you cross the line the
 * arrow's way after passing all three, so turning round at the line or cutting across the infield never counts.
 *
 * What is road: any painted cell that is not the finish line and whose brick never says `solid [on]` (a Barrier).
 * The finish line is the grid brick with `grid.finish` (its direction). Grass is the empty background, never road.
 *
 * Who is a racer: every brick that moves itself (`move me with [my own blocks]`), except grid cells. Their laps and
 * places are kept here; the brick's own code decides how many laps win.
 *
 * No trigonometry except detmath's, no clock, no randomness: a replay lands on the same laps.
 */
import { TILE_SIZE, parseGridCopyId, type BrickDef, type LapState, type PrimitiveCtx, type PrimitiveTable, type RuntimeApi, type Stmt, type Target, type TileLayer, type World } from './contracts'
import { atan2Deg } from './detmath'

// ------------------------------------------------------------------------------------------------ the loop

export type RaceLoopProblem = 'no-finish' | 'no-loop' | 'finish-gap'

export type RaceLoop =
  | { ok: true; dist: Int32Array; length: number; cols: number; rows: number; finish: Uint8Array; dir: number }
  | { ok: false; reason: RaceLoopProblem }

/** Why laps don't count, in the kid's words (the race kit's own lines). */
export const RACE_LOOP_REASON_TEXT: Record<RaceLoopProblem, string> = {
  'no-finish': 'Add a finish line so laps can count',
  'no-loop': 'The road doesn’t loop back to the finish line',
  'finish-gap': 'The finish line has to go all the way across the road',
}

/** Shorter than this, the "loop" is really traffic leaking round the end of a finish line that misses part of the road. */
const MIN_LOOP = 24

/** Grid steps (col, row), row up, for a Scratch direction that is a multiple of 90. */
const stepOf = (direction: number): [number, number] => {
  const d = ((Math.round(direction / 90) % 4) + 4) % 4
  return ([[0, 1], [1, 0], [0, -1], [-1, 0]] as const)[d] as [number, number]
}
const STEPS4: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]

/** Does any of this brick's code make it solid? Then racers can't drive through it, and it is not road. */
export function brickIsWall(brick: Pick<BrickDef, 'program'>): boolean {
  const walk = (stmts: Stmt[]): boolean =>
    stmts.some((s) => (s.opcode === 'platformer_setsolid' && s.fields.SOLID !== 'off') || (s.branches ?? []).some(walk))
  return brick.program.scripts.some((s) => walk(s.body)) || brick.program.procedures.some((p) => walk(p.body))
}

/**
 * Number the road from the finish line round to itself. Works on the saved design (for the Build chip) and on a
 * running world alike: both have the tiles and the bricks.
 */
export function computeRaceLoop(tiles: TileLayer | undefined, bricks: Iterable<BrickDef>): RaceLoop {
  if (!tiles) return { ok: false, reason: 'no-finish' }
  const road = new Set<string>()
  const finishChars = new Set<string>()
  let dir = 90
  for (const brick of bricks) {
    if (!brick.grid) continue
    if (brick.grid.finish !== undefined) {
      if (finishChars.size === 0) dir = brick.grid.finish
      finishChars.add(brick.grid.char)
    } else if (!brickIsWall(brick)) road.add(brick.grid.char)
  }
  const { cols: w, rows: h } = tiles
  const at = (c: number, r: number): string => tiles.data[r]?.[c] ?? '.'
  const finish = new Uint8Array(w * h)
  const finishCells: number[] = []
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!finishChars.has(at(c, r))) continue
      finish[r * w + c] = 1
      finishCells.push(r * w + c)
    }
  }
  if (!finishCells.length) return { ok: false, reason: 'no-finish' }
  const [dc, dr] = stepOf(dir)
  const dist = new Int32Array(w * h).fill(-1)
  const onPath = (c: number, r: number): boolean => road.has(at(c, r))
  const queue: number[] = []
  for (const i of finishCells) {
    const c = (i % w) + dc, r = Math.floor(i / w) + dr
    if (c < 0 || r < 0 || c >= w || r >= h) continue
    const j = r * w + c
    if (onPath(c, r) && dist[j] < 0) {
      dist[j] = 1
      queue.push(j)
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], c = i % w, r = Math.floor(i / w)
    for (const [ac, ar] of STEPS4) {
      const nc = c + ac, nr = r + ar
      if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue
      const j = nr * w + nc
      if (dist[j] >= 0 || !onPath(nc, nr)) continue
      dist[j] = dist[i] + 1
      queue.push(j)
    }
  }
  let length = Infinity
  for (const i of finishCells) {
    const c = (i % w) - dc, r = Math.floor(i / w) - dr
    if (c < 0 || r < 0 || c >= w || r >= h) continue
    const d = dist[r * w + c]
    if (d > 0) length = Math.min(length, d + 1)
  }
  if (!Number.isFinite(length)) return { ok: false, reason: 'no-loop' }
  if (length < MIN_LOOP) return { ok: false, reason: 'finish-gap' }
  return { ok: true, dist, length, cols: w, rows: h, finish, dir }
}

/** Which hidden gate (0..3) a distance round the loop is in. */
const gateOf = (length: number, d: number): number => Math.min(3, Math.floor((d * 4) / length))
const ALL_GATES = 0b1110

/**
 * One loop per set of bricks and grid. Copies of a world (a rewind, a keyframe) share both, so they share the loop; an
 * edit replaces `world.bricks` or `world.tiles` with new objects, so the loop is worked out again.
 */
const loops = new WeakMap<World['bricks'], { tiles: World['tiles']; loop: RaceLoop }>()
export function raceLoopOf(world: World): RaceLoop {
  const known = loops.get(world.bricks)
  if (known && known.tiles === world.tiles) return known.loop
  const loop = computeRaceLoop(world.tiles, Object.values(world.bricks))
  loops.set(world.bricks, { tiles: world.tiles, loop })
  return loop
}

/** The grid cell (col, row) under a point, or null outside the grid. */
function cellAt(world: World, x: number, y: number): [number, number] | null {
  const tiles = world.tiles
  if (!tiles) return null
  const c = Math.floor((x - world.bounds.left) / TILE_SIZE), r = Math.floor((y - world.bounds.bottom) / TILE_SIZE)
  return c < 0 || r < 0 || c >= tiles.cols || r >= tiles.rows ? null : [c, r]
}

// ------------------------------------------------------------------------------------------------ laps and places

export type { LapState }

const lapsOf = (t: Target): LapState => (t.lap ??= { lap: 0, gates: 0, d: 0, onFinish: false, lapTicks: [] })

/** A racer's laps so far (for tests and the Stage's lap counter). */
export const raceLapState = (t: Target): LapState | undefined => t.lap

/** Bricks that move themselves are racers; painted grid cells never are. */
export const isRacer = (t: Target): boolean => !t.isStage && t.visible && !!t.body?.selfMove && !(t.copyId && parseGridCopyId(t.copyId) && !t.isClone)

/** Follow a racer to where it is now. True when it just finished a lap. */
function followRacer(s: LapState, loop: Extract<RaceLoop, { ok: true }>, cell: [number, number] | null, tick: number): boolean {
  if (!cell) return false
  const i = cell[1] * loop.cols + cell[0]
  const d = loop.dist[i]
  let lapped = false
  if (d > 0) {
    // Just crossed the line the arrow's way, with every gate passed.
    if (s.onFinish && d <= 3 && (s.gates & ALL_GATES) === ALL_GATES) {
      s.gates = 0
      s.lap++
      s.lapTicks.push(tick)
      lapped = true
    }
    s.d = d
    s.gates |= 1 << gateOf(loop.length, d)
  }
  s.onFinish = loop.finish[i] === 1
  return lapped
}

/** How far round the race a racer is: laps, then distance (a racer still behind the line counts as behind it). */
function progress(s: LapState, length: number): number {
  const behindLine = !(s.gates & 2) && s.d > length / 2
  return s.lap * length + (behindLine ? s.d - length : s.d)
}

/** Count laps for every racer, after the tick's scripts have moved them. Lap hats run on the next tick. */
export function raceStep(runtime: RuntimeApi): void {
  const world = runtime.world
  const loop = raceLoopOf(world)
  if (!loop.ok) return
  for (const t of world.targets) {
    if (!isRacer(t)) continue
    if (followRacer(lapsOf(t), loop, cellAt(world, t.x, t.y), world.tick)) runtime.startHats('race_whenlap', { target: t })
  }
}

/** 1 for the racer furthest round, then 2, ... Equal progress keeps world order. 0 when laps can't count. */
function placeOf(world: World, me: Target): number {
  const loop = raceLoopOf(world)
  if (!loop.ok || !isRacer(me)) return 0
  const mine = progress(lapsOf(me), loop.length)
  let place = 1
  for (const t of world.targets) {
    if (t === me || !isRacer(t)) continue
    const theirs = progress(lapsOf(t), loop.length)
    if (theirs > mine || (theirs === mine && world.targets.indexOf(t) < world.targets.indexOf(me))) place++
  }
  return place
}

/**
 * A racer's place, the number its `my place` block reports (1 for the racer furthest round; 0 when laps can't count or
 * it isn't a racer). For screens that show the place without running a block (the Play HUD).
 */
export function racePlace(world: World, racer: Target): number {
  return placeOf(world, racer)
}

// ------------------------------------------------------------------------------------------------ direction along the track

/** "direction along the track" aims at the road 4 to 8 cells further round, within 7 cells: the race kit's autopilot. */
const AHEAD_MIN = 4
const AHEAD_MAX = 8
const LOOK = 7
/** Per loop, the point each cell aims at (grid steps from the grid's bottom-left), cached as the cars ask. */
const aims = new WeakMap<object, Map<number, [number, number] | null>>()

/** The middle of the road a little further round from this cell: the centre of every road cell 4 to 8 further on, nearby. */
function aimFrom(loop: Extract<RaceLoop, { ok: true }>, c: number, r: number, d: number): [number, number] | null {
  let cache = aims.get(loop)
  if (!cache) {
    cache = new Map()
    aims.set(loop, cache)
  }
  const key = r * loop.cols + c
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let sx = 0, sy = 0, n = 0
  for (let rr = Math.max(0, r - LOOK); rr <= Math.min(loop.rows - 1, r + LOOK); rr++) {
    for (let cc = Math.max(0, c - LOOK); cc <= Math.min(loop.cols - 1, c + LOOK); cc++) {
      const t = loop.dist[rr * loop.cols + cc]
      if (t <= 0) continue
      const ahead = (t - d + loop.length) % loop.length
      if (ahead < AHEAD_MIN || ahead > AHEAD_MAX) continue
      sx += cc + 0.5
      sy += rr + 0.5
      n++
    }
  }
  const aim: [number, number] | null = n ? [(sx / n) * TILE_SIZE, (sy / n) * TILE_SIZE] : null
  cache.set(key, aim)
  return aim
}

/** How far round the loop this cell is, or the nearest road cell's when it is off the road; the line counts as 0. */
function roadDistance(loop: Extract<RaceLoop, { ok: true }>, c: number, r: number): { c: number; r: number; d: number } | null {
  for (let ring = 0; ring <= 3; ring++) {
    for (let rr = r - ring; rr <= r + ring; rr++) {
      for (let cc = c - ring; cc <= c + ring; cc++) {
        if (Math.max(Math.abs(rr - r), Math.abs(cc - c)) !== ring) continue
        if (cc < 0 || rr < 0 || cc >= loop.cols || rr >= loop.rows) continue
        const i = rr * loop.cols + cc
        if (loop.finish[i] === 1) return { c: cc, r: rr, d: 0 }
        if (loop.dist[i] > 0) return { c: cc, r: rr, d: loop.dist[i] }
      }
    }
  }
  return null
}

function directionAlongTrack(ctx: PrimitiveCtx): number {
  const t = ctx.target
  const world = ctx.runtime.world
  const loop = raceLoopOf(world)
  if (!loop.ok) return t.direction
  const cell = cellAt(world, t.x, t.y)
  if (!cell) return t.direction
  const road = roadDistance(loop, cell[0], cell[1])
  if (!road) return t.direction
  const aim = aimFrom(loop, road.c, road.r, road.d)
  if (!aim) return t.direction
  const dx = world.bounds.left + aim[0] - t.x, dy = world.bounds.bottom + aim[1] - t.y
  if (dx === 0 && dy === 0) return t.direction
  // Scratch directions: 0 is up and 90 is right, so the angle is measured from +y towards +x.
  return atan2Deg(dx, dy)
}

// ------------------------------------------------------------------------------------------------ ground under me

/** Grid character -> brick name, per set of bricks (an edit replaces `world.bricks`). */
const groundNames = new WeakMap<World['bricks'], Map<string, string>>()

function groundUnder(ctx: PrimitiveCtx): string {
  const world = ctx.runtime.world
  const cell = cellAt(world, ctx.target.x, ctx.target.y)
  const ch = cell ? (world.tiles as TileLayer).data[cell[1]]?.[cell[0]] ?? '.' : '.'
  if (ch === '.') return 'Grass'
  let names = groundNames.get(world.bricks)
  if (!names) {
    names = new Map()
    for (const b of Object.values(world.bricks)) if (b.grid) names.set(b.grid.char, b.name)
    groundNames.set(world.bricks, names)
  }
  return names.get(ch) ?? 'Grass'
}

export const racePrimitives: PrimitiveTable = {
  race_groundunder: groundUnder,
  race_trackdirection: directionAlongTrack,
  race_lapsdone: (ctx) => (ctx.target.isStage ? 0 : ctx.target.lap?.lap ?? 0),
  race_myplace: (ctx) => placeOf(ctx.runtime.world, ctx.target),
}
