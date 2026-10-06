/**
 * Tiles in the core (step 6), written the way a kid would check them by watching:
 * "it lands on the ground tile", "it stops at the brick wall", "spikes are sensed but you walk through them".
 * Every play test is a tiny level run through the real runtime.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { BrickDef, CopyPlacement, Expr, LevelDesign, Script, Stmt, Target, TileLayer } from './contracts'
import { TILE_SIZE } from './contracts'
import { play } from './index'
import { DESIGN_LIMITS, instantiate, validateDesign } from './project'
import type { Runtime } from './runtime'
import { parse, serialize } from './save'

declare const process: { cwd: () => string; stderr: { write: (s: string) => void } }

const lit = (value: number | string): Expr => ({ kind: 'lit', value })
const stmt = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}, branches?: Stmt[][]): Stmt => ({
  opcode,
  fields,
  inputs,
  ...(branches ? { branches } : {}),
})
const block = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}): Expr => ({ kind: 'block', opcode, fields, inputs })

let scriptId = 0
const onFlag = (...body: Stmt[]): Script => ({ id: `s${scriptId++}`, hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body })
const whenBump = (side: string, brickName: string, ...body: Stmt[]): Script => ({
  id: `s${scriptId++}`,
  hat: { opcode: 'platformer_whenbump', fields: { SIDE: side, BRICK: brickName }, inputs: {} },
  body,
})
const inc = (id: string): Stmt => stmt('data_changevariableby', { VARIABLE: id }, { VALUE: lit(1) })
const gravityOn = stmt('platformer_setgravity', { GRAVITY: 'on' })
const setSpeed = (axis: 'x' | 'y', n: number) => stmt('platformer_setspeed', { AXIS: axis }, { SPEED: lit(n) })

function brick(id: string, name: string, w: number, h: number, scripts: Script[] = [], variables: BrickDef['program']['variables'] = []): BrickDef {
  return {
    id,
    name,
    costumes: [{ name: 'c', width: w, height: h, rotationCenterX: w / 2, rotationCenterY: h / 2 }],
    sounds: [],
    program: { scripts, procedures: [], variables, lists: [] },
  }
}

/** Rows are written top first, like the picture; the layer stores row 0 at the bottom. */
function tiles(...topFirst: string[]): TileLayer {
  return { cols: topFirst[0].length, rows: topFirst.length, data: [...topFirst].reverse() }
}

function level(bricks: BrickDef[], copies: CopyPlacement[], layer?: TileLayer): LevelDesign {
  return {
    id: 'lvl',
    name: 'Test',
    seed: 1,
    bounds: { left: 0, right: 480, bottom: 0, top: 360 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks,
    copies,
    ...(layer ? { tiles: layer } : {}),
  }
}

const copyOf = (rt: Runtime, id: string): Target => rt.world.targets.find((t) => t.copyId === id && !t.isClone)!
const run = (rt: Runtime, ticks: number) => {
  for (let i = 0; i < ticks; i++) rt.step()
}

/** A 20 x 20 faller; origin is the middle, so its bottom is y - 10. */
const faller = (extra: Script[] = [], vars: BrickDef['program']['variables'] = []) => brick('f', 'Faller', 20, 20, [onFlag(gravityOn), ...extra], vars)

// 30 columns x 8 rows (480 x 128 steps), ground along the bottom row (top face at y = 16).
const FLOOR = '.'.repeat(30)
const GROUND = 'G'.repeat(30)

describe('tiles are copied into the world', () => {
  it('Play copies design.tiles into the world, and later edits to the design do not change the running world', () => {
    const layer = tiles(FLOOR, GROUND)
    const d = level([faller()], [], layer)
    const rt = play(d)
    expect(rt.world.tiles).toEqual(layer)
    expect(rt.world.tiles).not.toBe(d.tiles)
    d.tiles!.data[0] = '.'.repeat(30)
    expect(rt.world.tiles!.data[0]).toBe(GROUND)
  })

  it('a level without tiles has no tiles in the world', () => {
    expect(instantiate(level([faller()], [])).tiles).toBeUndefined()
  })
})

describe('solid tiles act like solid bricks', () => {
  it('lands on a ground tile at exactly its top, stays with onGround true for 30 ticks', () => {
    const rt = play(level([faller()], [{ id: 'f', brickId: 'f', x: 100, y: 100 }], tiles(FLOOR, FLOOR, GROUND)))
    const f = copyOf(rt, 'f')
    run(rt, 40)
    // Ground is row 0 (bottom), top face at y = 16; the faller's box bottom is 10 below its origin.
    expect(f.y).toBe(TILE_SIZE + 10)
    for (let i = 0; i < 30; i++) {
      rt.step()
      expect(f.y).toBe(26)
      expect(f.body!.onGround).toBe(true)
      expect(f.body!.vy).toBe(0)
    }
  })

  it('walks off a ledge where the tiles stop and falls to the floor of the level', () => {
    // Ground only in the left half (cols 0..9, right edge x = 160).
    const half = 'G'.repeat(10) + '.'.repeat(20)
    const walker = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', 4))])
    const rt = play(level([walker], [{ id: 'f', brickId: 'f', x: 100, y: 26 }], tiles(FLOOR, FLOOR, half)))
    const f = copyOf(rt, 'f')
    run(rt, 10)
    expect(f.body!.onGround).toBe(true)
    run(rt, 50)
    expect(f.x).toBe(340)
    expect(f.y).toBe(10)
  })

  it('stops at a brick-tile wall with no gap and no overlap', () => {
    // A column of brick tiles at col 10 (x from 160 to 176), two high above the ground.
    const rows = [FLOOR, 'B'.padStart(11, '.').padEnd(30, '.'), 'B'.padStart(11, '.').padEnd(30, '.'), GROUND]
    const walker = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', 5))])
    const rt = play(level([walker], [{ id: 'f', brickId: 'f', x: 60, y: 26 }], tiles(...rows)))
    const f = copyOf(rt, 'f')
    // rows listed top first: ground is row 0; the brick column is rows 1 and 2 (y 16 to 48).
    run(rt, 60)
    expect(f.x + 10).toBe(160) // right face touches the wall's left face
    expect(f.body!.vx).toBe(0)
  })

  it('walking left stops against a wall tile on its right face', () => {
    const rows = [FLOOR, 'B'.padStart(11, '.').padEnd(30, '.'), 'B'.padStart(11, '.').padEnd(30, '.'), GROUND]
    const walker = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', -5))])
    const rt = play(level([walker], [{ id: 'f', brickId: 'f', x: 300, y: 26 }], tiles(...rows)))
    const f = copyOf(rt, 'f')
    run(rt, 80)
    expect(f.x - 10).toBe(176)
  })

  it('head-bumps a tile ceiling: vy becomes 0 and it falls back down', () => {
    // Ceiling brick row at row 3 (bottom face at y = 48). Faller on the ground jumps at 12.
    const ceiling = '.'.repeat(30).replace(/^.{5}/, 'BBBBB').replace(/^(.{5}).{0}/, '$1')
    const jumper = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, stmt('platformer_setspeed', { AXIS: 'y' }, { SPEED: lit(12) }))])
    const rt = play(level([jumper], [{ id: 'f', brickId: 'f', x: 40, y: 26 }], tiles(FLOOR, ceiling, FLOOR, FLOOR, GROUND)))
    const f = copyOf(rt, 'f')
    let top = 0
    let sawZero = false
    for (let i = 0; i < 40; i++) {
      rt.step()
      top = Math.max(top, f.y)
      if (f.y + 10 === 48 && f.body!.vy === 0) sawZero = true
    }
    expect(top).toBe(38) // box top (y + 10) touches the ceiling's bottom face at 48
    expect(sawZero).toBe(true)
    expect(f.y).toBe(26) // back on the ground
  })

  it('all four solid kinds stop a faller, and spikes and lava do not', () => {
    for (const [ch, solid] of [['G', true], ['B', true], ['H', true], ['Q', true], ['S', false], ['L', false]] as const) {
      const row = ch.repeat(30)
      const rt = play(level([faller()], [{ id: 'f', brickId: 'f', x: 100, y: 100 }], tiles(FLOOR, FLOOR, FLOOR, row)))
      const f = copyOf(rt, 'f')
      run(rt, 40)
      // Solid: rests on the row at y = 26. Not solid: falls through to the level floor at y = 10.
      expect(f.y, ch).toBe(solid ? 26 : 10)
    }
  })

  it('a thin tile row is not tunnelled by a fast faller', () => {
    // Tile row high up at row 5 (top at y = 96). Faller starts at y = 350 and reaches maxFall.
    const rt = play(level([faller()], [{ id: 'f', brickId: 'f', x: 100, y: 340 }], tiles(FLOOR, FLOOR, 'G'.repeat(30), FLOOR, FLOOR, FLOOR, FLOOR, FLOOR)))
    run(rt, 80)
    // 8 rows, the ground row listed third from the top is row 5; its top face is y = 96.
    expect(copyOf(rt, 'f').y).toBe(106)
  })

  it('a body that starts inside a solid tile is not stuck: it can walk out sideways', () => {
    const walker = brick('f', 'Faller', 20, 20, [onFlag(setSpeed('x', 3))])
    const rt = play(level([walker], [{ id: 'f', brickId: 'f', x: 8, y: 8 }], tiles(FLOOR, GROUND)))
    run(rt, 10)
    expect(copyOf(rt, 'f').x).toBe(38)
  })

  it('tiles outside the grid are empty: a body walks past the last column', () => {
    const rt = play(level([brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', 10))])], [{ id: 'f', brickId: 'f', x: 380, y: 26 }], tiles(FLOOR, 'G'.repeat(10))))
    run(rt, 5)
    expect(copyOf(rt, 'f').x).toBe(430)
    expect(copyOf(rt, 'f').body!.onGround).toBe(false)
  })
})

describe('touching tile [kind]?', () => {
  const touchVars: BrickDef['program']['variables'] = [{ id: 'on', name: 'on', value: 'unset' }]
  const check = (kind: string) =>
    stmt('data_setvariableto', { VARIABLE: 'on' }, { VALUE: block('platformer_touchingtile', { TILE: kind }) })
  /** Ground tiles under everything, a spike at col 5 (x 80 to 96) standing on the ground. */
  const row = '.....S' + '.'.repeat(24)
  const layer = tiles(FLOOR, FLOOR, row, GROUND)

  const probe = (x: number, kind = 'spikes') => {
    const b = brick('p', 'Probe', 10, 10, [onFlag(check(kind))], touchVars)
    const rt = play(level([b], [{ id: 'p', brickId: 'p', x, y: 21 }], layer)) // box y 16 to 26: standing on the ground, level with the spike
    rt.step()
    return copyOf(rt, 'p').variables.on
  }

  it('is true when the box is on a spike, and false beside it', () => {
    expect(probe(88)).toBe(true)
    expect(probe(40)).toBe(false)
    expect(probe(130)).toBe(false)
  })

  it('a box that only touches the spike\'s side face is not touching it', () => {
    // Spike spans x 80 to 96. A 10-wide box centered at 75 has its right face at exactly 80.
    expect(probe(75)).toBe(false)
    expect(probe(76)).toBe(true)
  })

  it('asks about one kind at a time: standing on ground is not touching spikes, but a box into the ground is touching ground', () => {
    expect(probe(40, 'ground')).toBe(false) // box bottom is exactly the ground's top face
    const b = brick('p', 'Probe', 10, 10, [onFlag(check('ground'))], touchVars)
    const rt = play(level([b], [{ id: 'p', brickId: 'p', x: 40, y: 20 }], layer))
    rt.step()
    expect(copyOf(rt, 'p').variables.on).toBe(true)
  })

  it('is false in a level with no tiles, for the stage, and for an unknown kind', () => {
    const b = brick('p', 'Probe', 10, 10, [onFlag(check('spikes'))], touchVars)
    const rt = play(level([b], [{ id: 'p', brickId: 'p', x: 88, y: 21 }]))
    rt.step()
    expect(copyOf(rt, 'p').variables.on).toBe(false)
    expect(probe(88, 'lava')).toBe(false)
    expect(probe(88, 'nonsense')).toBe(false)
  })

  it('walking through spikes (not solid) makes it true while inside, then false after', () => {
    const vars: BrickDef['program']['variables'] = [{ id: 'hits', name: 'hits', value: 0 }]
    const walker = brick('w', 'Walker', 10, 10, [onFlag(gravityOn, setSpeed('x', 4), stmt('control_forever', {}, {}, [[stmt('control_if', {}, { CONDITION: block('platformer_touchingtile', { TILE: 'spikes' }) }, [[inc('hits')]]), setSpeed('x', 4)]]))], vars)
    const rt = play(level([walker], [{ id: 'w', brickId: 'w', x: 20, y: 21 }], layer))
    run(rt, 60)
    const t = copyOf(rt, 'w')
    expect(t.x).toBeGreaterThan(96 + 5)
    expect(t.variables.hits).toBeGreaterThan(0)
    expect(t.variables.hits).toBeLessThanOrEqual(7)
  })
})

describe('bump hats for tiles', () => {
  const counters: BrickDef['program']['variables'] = ['tilesTop', 'anyTop', 'tilesLeft', 'tilesBottom', 'edgeTop', 'plateTop', 'tilesAny'].map((id) => ({ id, name: id, value: 0 }))

  it('landing on a tile fires BRICK _tiles_ and _any_ once per tick, not _edge_ and not a brick name', () => {
    const scripts = [
      whenBump('top', '_tiles_', inc('tilesTop')),
      whenBump('top', '_any_', inc('anyTop')),
      whenBump('top', '_edge_', inc('edgeTop')),
      whenBump('top', 'Plate', inc('plateTop')),
      whenBump('_any_', '_tiles_', inc('tilesAny')),
    ]
    const plate = brick('pl', 'Plate', 10, 4, [])
    const rt = play(level([plate, faller(scripts, counters)], [{ id: 'f', brickId: 'f', x: 100, y: 60 }], tiles(FLOOR, FLOOR, GROUND)))
    run(rt, 20)
    const landedAt = 26
    expect(copyOf(rt, 'f').y).toBe(landedAt)
    const before = copyOf(rt, 'f').variables as Record<string, number>
    const startTop = before.tilesTop
    expect(startTop).toBeGreaterThan(0)
    run(rt, 10)
    const after = copyOf(rt, 'f').variables as Record<string, number>
    // Resting bumps top once per tick: 10 more ticks, exactly 10 more hat runs.
    expect(after.tilesTop - startTop).toBe(10)
    expect(after.anyTop).toBe(after.tilesTop)
    expect(after.tilesAny).toBe(after.tilesTop)
    expect(after.edgeTop).toBe(0)
    expect(after.plateTop).toBe(0)
  })

  it('running into a brick-tile wall fires when I bump left of tiles', () => {
    const rows = [FLOOR, 'B'.padStart(11, '.').padEnd(30, '.'), GROUND]
    const walker = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', 5)), whenBump('left', '_tiles_', inc('tilesLeft'))], counters)
    const rt = play(level([walker], [{ id: 'f', brickId: 'f', x: 60, y: 26 }], tiles(...rows)))
    run(rt, 40)
    expect(copyOf(rt, 'f').variables.tilesLeft).toBeGreaterThan(0)
    expect(copyOf(rt, 'f').variables.tilesTop).toBe(0)
  })

  it('bumping a tile ceiling fires bottom of tiles', () => {
    const jumper = brick(
      'f',
      'Faller',
      20,
      20,
      [onFlag(gravityOn, setSpeed('y', 12)), whenBump('bottom', '_tiles_', inc('tilesBottom'))],
      counters,
    )
    const rt = play(level([jumper], [{ id: 'f', brickId: 'f', x: 40, y: 26 }], tiles(FLOOR, 'B'.repeat(30), FLOOR, FLOOR, GROUND)))
    run(rt, 20)
    expect(copyOf(rt, 'f').variables.tilesBottom).toBeGreaterThan(0)
  })

  it('the level floor still reports _edge_, not _tiles_', () => {
    const rt = play(level([faller([whenBump('top', '_edge_', inc('edgeTop')), whenBump('top', '_tiles_', inc('tilesTop'))], counters)], [{ id: 'f', brickId: 'f', x: 100, y: 60 }], tiles(FLOOR, FLOOR)))
    run(rt, 30)
    expect(copyOf(rt, 'f').variables.edgeTop).toBeGreaterThan(0)
    expect(copyOf(rt, 'f').variables.tilesTop).toBe(0)
  })
})

describe('tiles are validated', () => {
  const ok = tiles(FLOOR, 'GBHQSL'.padEnd(30, '.'))

  it('well-formed tiles pass, with and without rows of every kind', () => {
    expect(validateDesign(level([], [], ok))).toEqual([])
    expect(validateDesign(level([], []))).toEqual([])
  })

  it('rejects wrong row count, wrong row length, unknown characters and non-string rows', () => {
    const base = (t: unknown) => validateDesign({ ...level([], []), tiles: t as TileLayer })
    expect(base({ cols: 30, rows: 3, data: [GROUND] }).length).toBeGreaterThan(0)
    expect(base({ cols: 30, rows: 1, data: ['G'.repeat(29)] }).length).toBeGreaterThan(0)
    expect(base({ cols: 30, rows: 1, data: ['X'.repeat(30)] }).length).toBeGreaterThan(0)
    expect(base({ cols: 30, rows: 1, data: [5] }).length).toBeGreaterThan(0)
    expect(base({ cols: 30, rows: 1 }).length).toBeGreaterThan(0)
    expect(base(null).length).toBeGreaterThan(0)
    expect(base('nope').length).toBeGreaterThan(0)
    expect(base({ cols: 1.5, rows: 1, data: ['G'] }).length).toBeGreaterThan(0)
    expect(base({ cols: 0, rows: 1, data: [''] }).length).toBeGreaterThan(0)
  })

  it('caps the size at 400 columns and 60 rows, and allows exactly those', () => {
    const grid = (cols: number, rows: number): TileLayer => ({ cols, rows, data: Array.from({ length: rows }, () => '.'.repeat(cols)) })
    expect(DESIGN_LIMITS.maxTileCols).toBe(400)
    expect(DESIGN_LIMITS.maxTileRows).toBe(60)
    expect(validateDesign(level([], [], grid(400, 60)))).toEqual([])
    expect(validateDesign(level([], [], grid(401, 1))).map((p) => p.code)).toEqual(['limit'])
    expect(validateDesign(level([], [], grid(1, 61))).map((p) => p.code)).toEqual(['limit'])
  })
})

describe('tiles are saved', () => {
  const layer = tiles(FLOOR, '..BBQ..SSLL'.padEnd(30, '.'), GROUND)
  const envelope = (d: LevelDesign) => ({
    schemaVersion: 1,
    engineSemanticsVersion: 1,
    editorVersion: '13.3.0',
    pluginVersions: {},
    design: d,
  })

  it('round-trips through serialize and parse, and re-serializes byte-identically', () => {
    const text = serialize(envelope(level([faller()], [{ id: 'fc', brickId: 'f', x: 100, y: 100 }], layer)))
    const result = parse(text)
    if (!result.ok) throw new Error(JSON.stringify(result.problems))
    expect(result.save.design.tiles).toEqual(layer)
    expect(serialize(result.save)).toBe(text)
  })

  it('a save with malformed tiles is refused by parse', () => {
    const bad = serialize(envelope(level([], [], { cols: 30, rows: 1, data: ['Z'.repeat(30)] })))
    expect(parse(bad).ok).toBe(false)
  })

  it('an old save without tiles still loads, and plays with no tiles', () => {
    const raw = fs.readFileSync(`${process.cwd()}/src/platformer/lab/core/__fixtures__/minimal.json`, 'utf8')
    const result = parse(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.save.design.tiles).toBeUndefined()
    expect(instantiate(result.save.design).tiles).toBeUndefined()
  })
})

describe('tiles are fast and deterministic', () => {
  /** 50 x 20 = 1,000 cells, every one a tile, a rolling brick-and-ground landscape. */
  const dense = (): TileLayer => {
    const rows: string[] = []
    for (let r = 0; r < 20; r++) rows.push(Array.from({ length: 50 }, (_, c) => (r === 0 ? 'G' : (c + r) % 7 === 0 ? 'B' : (c * 3 + r) % 11 === 0 ? 'S' : (c + 2 * r) % 5 === 0 ? 'Q' : 'H')).join(''))
    return { cols: 50, rows: 20, data: rows }
  }
  const mover = (i: number) =>
    brick(`m${i}`, `M${i}`, 12, 12, [
      onFlag(gravityOn, setSpeed('x', (i % 2 === 0 ? 1 : -1) * (1 + (i % 5)))),
      whenBump('left', '_any_', setSpeed('x', -3)),
      whenBump('right', '_any_', setSpeed('x', 3)),
      whenBump('top', '_tiles_', setSpeed('y', 6 + (i % 4))),
    ])
  const bigLevel = () => {
    const bricks = Array.from({ length: 20 }, (_, i) => mover(i))
    const copies: CopyPlacement[] = bricks.map((b, i) => ({ id: `c${i}`, brickId: b.id, x: 40 + i * 35, y: 340 }))
    const d = level(bricks, copies, dense())
    d.bounds = { left: 0, right: 800, bottom: 0, top: 360 }
    return d
  }
  const positions = (rt: Runtime) => rt.world.targets.map((t) => [t.x, t.y, t.body?.vx, t.body?.vy, t.body?.onGround])

  it('1,000 tiles and 20 bodies run 300 ticks in under a second', () => {
    const rt = play(bigLevel())
    expect(rt.world.tiles!.cols * rt.world.tiles!.rows).toBe(1000)
    expect(rt.world.targets.length).toBe(20)
    const start = performance.now()
    run(rt, 300)
    const ms = performance.now() - start
    process.stderr.write(`tiles perf: 1000 tiles + 20 bodies x 300 ticks = ${ms.toFixed(1)} ms\n`)
    expect(ms).toBeLessThan(1000)
  })

  it('the same level replays identically over 300 ticks', () => {
    const a = play(bigLevel())
    const b = play(bigLevel())
    const trace: unknown[] = []
    const traceB: unknown[] = []
    for (let i = 0; i < 300; i++) {
      a.step()
      b.step()
      if (i % 25 === 0) {
        trace.push(positions(a))
        traceB.push(positions(b))
      }
    }
    expect(positions(a)).toEqual(positions(b))
    expect(trace).toEqual(traceB)
  })
})
