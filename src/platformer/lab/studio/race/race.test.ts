import { describe, expect, it } from 'vitest'
import { computeLoop } from '@brick-studio/platformer-core/engine/laps'
import { RT } from '@brick-studio/platformer-core/engine/raceTiles'
import { play, type Runtime } from '../../core/index'
import { TILE_SIZE, type BrickDef, type LevelDesign, type Target, type TileLayer } from '../../core/contracts'
import { compileWorkspace } from '../../core/editor/compile'
import { validateDesign } from '../../core/project'
import { RACE_LOOP_REASON_TEXT, brickIsWall, computeRaceLoop, raceLapState } from '../../core/race'
import { Blocks } from '../blockBuilder'
import { BEGINNER_FINISH_COL, TrackPainter, beginnerTrackTiles, createTrackBrick, raceDesign, trackChar, TRACK_BRICK_KEYS } from './raceTrack'

const bricks = () => TRACK_BRICK_KEYS.map(createTrackBrick)
const R = trackChar('road'), F = trackChar('finish'), X = trackChar('barrier')

/** A rectangular ring road `width` cells wide inside a cols x rows grid, finish line across the bottom at `finishCol`. */
function ring(cols = 40, rows = 24, width = 4, finishCol = 12): TrackPainter {
  const p = new TrackPainter(cols, rows)
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) if (r <= width || r >= rows - 1 - width || c <= width || c >= cols - 1 - width) p.set(c, r, R)
  for (let r = 1; r <= width; r++) p.set(finishCol, r, F)
  return p
}

// ----------------------------------------------------------------------------------------------- the loop

describe('laps on grid-brick tracks: does the road loop?', () => {
  it('the beginner track loops', () => {
    const loop = computeRaceLoop(beginnerTrackTiles(), bricks())
    expect(loop.ok).toBe(true)
    if (loop.ok) expect(loop.length).toBeGreaterThan(100)
  })

  it('numbers the road exactly as the race kit numbers the same track (laps.ts)', () => {
    const tiles = beginnerTrackTiles()
    const toRt: Record<string, number> = { '.': RT.GRASS, R: RT.ROAD, D: RT.DIRT, I: RT.ICE, X: RT.BARRIER, B: RT.BOOST_R, F: RT.FINISH }
    // The race kit's rows grow downwards: its row y is our row (rows - 1 - y).
    const old = new Uint8Array(tiles.cols * tiles.rows)
    for (let y = 0; y < tiles.rows; y++) for (let x = 0; x < tiles.cols; x++) old[y * tiles.cols + x] = toRt[tiles.data[tiles.rows - 1 - y][x]]
    const theirs = computeLoop({ tiles: old, width: tiles.cols, height: tiles.rows, race: { laps: 3, finishDir: 0, startDir: 0 } } as never)
    const ours = computeRaceLoop(tiles, bricks())
    expect(theirs.ok && ours.ok).toBe(true)
    if (!theirs.ok || !ours.ok) return
    expect(ours.length).toBe(theirs.length)
    for (let y = 0; y < tiles.rows; y++) for (let x = 0; x < tiles.cols; x++) expect(ours.dist[(tiles.rows - 1 - y) * tiles.cols + x]).toBe(theirs.dist[y * tiles.cols + x])
  })

  it('no finish line: "Add a finish line"', () => {
    const p = ring()
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) if (p.get(c, r) === F) p.set(c, r, R)
    const loop = computeRaceLoop(p.layer(), bricks())
    expect(loop).toEqual({ ok: false, reason: 'no-finish' })
    expect(RACE_LOOP_REASON_TEXT['no-finish']).toBe('Add a finish line so laps can count')
  })

  it('a barrier right across the road: "The road doesn\'t loop"', () => {
    const p = ring()
    for (let r = 1; r <= 4; r++) p.set(25, r, X)
    expect(computeRaceLoop(p.layer(), bricks())).toEqual({ ok: false, reason: 'no-loop' })
    expect(RACE_LOOP_REASON_TEXT['no-loop']).toBe('The road doesn’t loop back to the finish line')
  })

  it('a finish line that misses part of the road: "The finish line has to go all the way across"', () => {
    const p = ring()
    p.set(12, 4, R)
    expect(computeRaceLoop(p.layer(), bricks())).toEqual({ ok: false, reason: 'finish-gap' })
  })

  it('a kid\'s own ground brick across the road keeps the loop; a kid\'s own solid brick breaks it', () => {
    const flag = (solid: boolean) => {
      const b = new Blocks('kid')
      if (solid) b.flag('solid', [b.setSolid('on')])
      return compileWorkspace(b.workspace()).program
    }
    const mud: BrickDef = { id: 'brick_mud', name: 'Mud', costumes: [], sounds: [], program: flag(false), grid: { char: 'M' } }
    const wall: BrickDef = { id: 'brick_wall', name: 'Wall', costumes: [], sounds: [], program: flag(true), grid: { char: 'W' } }
    expect(brickIsWall(wall)).toBe(true)
    expect(brickIsWall(mud)).toBe(false)
    const across = (ch: string) => {
      const p = ring()
      for (let r = 1; r <= 4; r++) p.set(25, r, ch)
      return computeRaceLoop(p.layer(), [...bricks(), mud, wall])
    }
    expect(across('M').ok).toBe(true)
    expect(across('W')).toEqual({ ok: false, reason: 'no-loop' })
  })

  it('a finish line that points the other way numbers the road the other way round', () => {
    const p = ring()
    const left = { ...createTrackBrick('finish'), grid: { char: F, finish: -90 } }
    const tiles = p.layer()
    const right = computeRaceLoop(tiles, bricks())
    const backwards = computeRaceLoop(tiles, [...bricks().filter((b) => b.grid?.char !== F), left])
    expect(right.ok && backwards.ok).toBe(true)
    if (!right.ok || !backwards.ok) return
    // The cell just right of the line is 1 one way round and most of a lap the other.
    const i = 2 * tiles.cols + 13
    expect(right.dist[i]).toBe(1)
    expect(backwards.dist[i]).toBeGreaterThan(right.length * 0.75)
    expect(backwards.dist[2 * tiles.cols + 11]).toBe(1)
  })

  it('the finish direction is a grid brick setting, and only right, up, down and left are allowed', () => {
    const design = raceDesign({ id: 'r', name: 'r', tiles: ring().layer() })
    expect(validateDesign(design)).toEqual([])
    const bad = { ...design, bricks: design.bricks.map((b) => (b.grid?.char === F ? { ...b, grid: { char: F, finish: 45 } } : b)) }
    expect(validateDesign(bad)).toEqual([expect.objectContaining({ path: expect.stringMatching(/grid\.finish$/), code: 'bad-value' })])
  })
})

// ----------------------------------------------------------------------------------------------- following racers round

/** A racer we move by hand, that writes what the Racing blocks say into its own variables every tick. */
function probeBrick(): BrickDef {
  const b = new Blocks('probe')
  b.flag('race', [b.blk('platformer_setmover', { fields: { MOVER: 'self' } })])
  b.script('read', b.blk('platformer_everytick'), [
    b.set('ground', { block: b.blk('race_groundunder') }),
    b.set('along', { block: b.blk('race_trackdirection') }),
    b.set('laps', { block: b.blk('race_lapsdone') }),
    b.set('place', { block: b.blk('race_myplace') }),
  ])
  b.script('lap', b.blk('race_whenlap'), [b.change('heard', 1)])
  const variables = ['ground', 'along', 'laps', 'place', 'heard'].map((id) => ({ id, name: id, value: 0 }))
  return { id: 'brick_probe', name: 'Probe', costumes: [], sounds: [], program: compileWorkspace(b.workspace(variables), { variables }).program }
}

function probeRace(tiles: TileLayer, probes: number): { runtime: Runtime; probes: Target[] } {
  const design: LevelDesign = raceDesign({ id: 'probe', name: 'probe', tiles })
  design.bricks.push(probeBrick())
  design.copies = Array.from({ length: probes }, (_, i) => ({ id: `probe_${i}`, brickId: 'brick_probe', x: 8, y: 8 }))
  const runtime = play(design)
  runtime.step()
  return { runtime, probes: runtime.world.targets.filter((t) => t.brickId === 'brick_probe') }
}

/** Centres of the ring's middle lane, anticlockwise from (c0, 2) along the bottom, one cell per step. */
function ringPath(cols = 40, rows = 24, lane = 2): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const lo = lane, hiC = cols - 1 - lane, hiR = rows - 1 - lane
  for (let c = lo; c < hiC; c++) out.push([c, lo])
  for (let r = lo; r < hiR; r++) out.push([hiC, r])
  for (let c = hiC; c > lo; c--) out.push([c, hiR])
  for (let r = hiR; r > lo; r--) out.push([lo, r])
  return out
}
const put = (t: Target, [c, r]: [number, number]) => {
  t.x = c * TILE_SIZE + TILE_SIZE / 2
  t.y = r * TILE_SIZE + TILE_SIZE / 2
}

describe('laps on grid-brick tracks: counting', () => {
  const path = ringPath()
  /** Path index of the cell just behind the finish line (col 11), so the first crossing is the start, as on a grid. */
  const startAt = path.findIndex(([c, r]) => c === 9 && r === 2)

  it('crossing the line at the start is not a lap; going all the way round is, and "when I finish a lap" runs', () => {
    const { runtime, probes } = probeRace(ring().layer(), 1)
    const p = probes[0]
    for (let k = 0; k <= path.length + 5; k++) {
      put(p, path[(startAt + k) % path.length])
      runtime.step()
    }
    runtime.step()
    expect(raceLapState(p)?.lap).toBe(1)
    expect(p.variables.laps).toBe(1)
    expect(p.variables.heard).toBe(1)
  })

  it('turning round at the line, or cutting across the infield, never counts', () => {
    const { runtime, probes } = probeRace(ring().layer(), 1)
    const p = probes[0]
    // Over the line and back, three times.
    for (let n = 0; n < 3; n++) {
      for (const k of [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0]) {
        put(p, path[(startAt + k) % path.length])
        runtime.step()
      }
    }
    // A quarter round, then straight across the middle back to the line.
    for (let k = 0; k < path.length / 4; k++) {
      put(p, path[(startAt + k) % path.length])
      runtime.step()
    }
    for (let k = -3; k <= 3; k++) {
      put(p, [12 + k, 2])
      runtime.step()
    }
    runtime.step()
    expect(raceLapState(p)?.lap).toBe(0)
    expect(p.variables.heard).toBe(0)
  })

  it('my place: 1 for whoever is furthest round, and laps count before distance', () => {
    const { runtime, probes } = probeRace(ring().layer(), 3)
    const [a, b, c] = probes
    // a goes all the way round and a little further; b goes halfway; c stays behind the line.
    for (let k = 0; k <= path.length + 10; k++) {
      put(a, path[(startAt + k) % path.length])
      put(b, path[(startAt + Math.min(k, Math.floor(path.length / 2))) % path.length])
      put(c, path[startAt])
      runtime.step()
    }
    runtime.step()
    expect([a, b, c].map((t) => t.variables.place)).toEqual([1, 2, 3])
    expect([a, b, c].map((t) => t.variables.laps)).toEqual([1, 0, 0])
  })
})

// ----------------------------------------------------------------------------------------------- the other blocks

describe('Racing blocks: ground under me and direction along the track', () => {
  it('ground under me names the grid brick under my middle, and Grass where nothing is painted or off the grid', () => {
    const { runtime, probes } = probeRace(ring().layer(), 1)
    const p = probes[0]
    const groundAt = (c: number, r: number) => {
      put(p, [c, r])
      runtime.step()
      return p.variables.ground
    }
    expect(groundAt(5, 2)).toBe('Road')
    expect(groundAt(12, 2)).toBe('Finish line')
    expect(groundAt(20, 12)).toBe('Grass')
    expect(groundAt(0, 0)).toBe('Grass')
    p.x = -500
    runtime.step()
    expect(p.variables.ground).toBe('Grass')
  })

  it('a kid\'s own grid brick is named by its own name', () => {
    const tiles = ring().layer()
    const design = raceDesign({ id: 'mud', name: 'mud', tiles: { ...tiles, data: tiles.data.map((row, r) => (r === 2 ? row.slice(0, 5) + 'M' + row.slice(6) : row)) } })
    design.bricks.push({ id: 'brick_mud', name: 'Mud puddle', costumes: [], sounds: [], program: compileWorkspace({ blocks: { blocks: [] } }).program, grid: { char: 'M' } })
    design.bricks.push(probeBrick())
    design.copies = [{ id: 'probe_0', brickId: 'brick_probe', x: 5 * 16 + 8, y: 2 * 16 + 8 }]
    const runtime = play(design)
    runtime.step()
    runtime.step()
    expect(runtime.world.targets.find((t) => t.brickId === 'brick_probe')!.variables.ground).toBe('Mud puddle')
  })

  it('direction along the track points round the lap: right along the bottom, up the right side, left along the top, down the left', () => {
    const { runtime, probes } = probeRace(ring().layer(), 1)
    const p = probes[0]
    const along = (c: number, r: number) => {
      put(p, [c, r])
      runtime.step()
      return p.variables.along as number
    }
    const near = (got: number, want: number) => expect(Math.abs(((got - want + 540) % 360) - 180), `${got} vs ${want}`).toBeLessThan(20)
    near(along(20, 2), 90)
    near(along(37, 12), 0)
    near(along(20, 21), -90)
    near(along(2, 12), 180)
    // On the finish line it still knows; just off the road it points back to the road ahead.
    near(along(12, 3), 90)
    const off = along(20, 7)
    expect(off).toBeGreaterThan(90)
    expect(off).toBeLessThan(180)
  })

  it('on a track that doesn\'t lap, direction along the track is where I already point, and laps and place are 0', () => {
    const p0 = ring()
    for (let r = 1; r <= 4; r++) p0.set(25, r, X)
    const { runtime, probes } = probeRace(p0.layer(), 1)
    const p = probes[0]
    p.direction = 45
    put(p, [5, 2])
    runtime.step()
    expect(p.variables.along).toBe(45)
    expect(p.variables.laps).toBe(0)
    expect(p.variables.place).toBe(0)
  })

  it('painted cells are never racers, even when their brick moves itself', () => {
    const { runtime } = probeRace(ring().layer(), 1)
    expect(runtime.world.targets.filter((t) => raceLapState(t)).every((t) => t.brickId === 'brick_probe')).toBe(true)
  })
})

it('the beginner track\'s finish line goes right across the bottom straight', () => {
  const tiles = beginnerTrackTiles()
  // The bottom half of the column, between the barriers.
  const column = tiles.data.slice(0, tiles.rows / 2).map((row) => row[BEGINNER_FINISH_COL]).filter((ch) => ch !== '.' && ch !== X)
  expect(column.length).toBeGreaterThan(4)
  expect(column.every((ch) => ch === F)).toBe(true)
})
