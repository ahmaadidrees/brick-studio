/**
 * Grid bricks in the core (step 7), written the way a kid would check them by watching: "it lands on the ground",
 * "it stops at the wall", "the ? block hears the bump too". Replaces the step 6/6b tiles.test.ts: the engine has no
 * rule for any particular tile kind any more, so every cell here is an ordinary brick with its own scripts
 * (`set solid`, `when I bump`) and every play test runs through the real runtime.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { BrickDef, CopyPlacement, Expr, LevelDesign, Script, Stmt, Target, TileLayer } from './contracts'
import { TILE_SIZE, gridCopyId, parseGridCopyId } from './contracts'
import { play } from './index'
import { DESIGN_LIMITS, instantiate, validateDesign } from './project'
import type { Runtime } from './runtime'
import { parse, serialize } from './save'

declare const process: { cwd: () => string }

const lit = (value: number | string): Expr => ({ kind: 'lit', value })
const stmt = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}, branches?: Stmt[][]): Stmt => ({
  opcode,
  fields,
  inputs,
  ...(branches ? { branches } : {}),
})
const block = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}): Expr => ({ kind: 'block', opcode, fields, inputs })
const variable = (id: string): Expr => block('data_variable', { VARIABLE: id })

let scriptId = 0
const onFlag = (...body: Stmt[]): Script => ({ id: `s${scriptId++}`, hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body })
const whenBump = (side: string, brickName: string, ...body: Stmt[]): Script => ({
  id: `s${scriptId++}`,
  hat: { opcode: 'platformer_whenbump', fields: { SIDE: side, BRICK: brickName }, inputs: {} },
  body,
})
const whenClone = (...body: Stmt[]): Script => ({ id: `s${scriptId++}`, hat: { opcode: 'control_start_as_clone', fields: {}, inputs: {} }, body })
const whenReceive = (message: string, ...body: Stmt[]): Script => ({
  id: `s${scriptId++}`,
  hat: { opcode: 'event_whenbroadcastreceived', fields: { BROADCAST_OPTION: message }, inputs: {} },
  body,
})
const inc = (id: string): Stmt => stmt('data_changevariableby', { VARIABLE: id }, { VALUE: lit(1) })
const gravityOn = stmt('platformer_setgravity', { GRAVITY: 'on' })
const setSpeed = (axis: 'x' | 'y', n: number) => stmt('platformer_setspeed', { AXIS: axis }, { SPEED: lit(n) })
const solid = (mode: 'on' | 'off' | 'top' = 'on') => stmt('platformer_setsolid', { SOLID: mode })
const forever = (...body: Stmt[]) => stmt('control_forever', {}, {}, [body])
const ifThen = (cond: Expr, ...body: Stmt[]) => stmt('control_if', {}, { CONDITION: cond }, [body])
const touching = (name: string): Expr => block('sensing_touchingobject', { TOUCHINGOBJECTMENU: name })

const vars = (...ids: string[]): BrickDef['program']['variables'] => ids.map((id) => ({ id, name: id, value: 0 }))

function brick(id: string, name: string, w: number, h: number, scripts: Script[] = [], variables: BrickDef['program']['variables'] = [], costumeCount = 1): BrickDef {
  return {
    id,
    name,
    costumes: Array.from({ length: costumeCount }, (_, i) => ({ name: i === 0 ? 'c' : `c${i + 1}`, width: w, height: h, rotationCenterX: w / 2, rotationCenterY: h / 2 })),
    sounds: [],
    program: { scripts, procedures: [], variables, lists: [] },
  }
}

/** A grid brick: 16 x 16, one character, scripts of its own. */
function cell(char: string, name: string, scripts: Script[] = [], variables: BrickDef['program']['variables'] = [], opts: { autotile?: boolean; costumes?: number } = {}): BrickDef {
  const b = brick(`g_${char === '-' ? 'dash' : char}`, name, TILE_SIZE, TILE_SIZE, scripts, variables, opts.costumes ?? 1)
  b.grid = { char, ...(opts.autotile ? { autotile: true } : {}) }
  return b
}

const GROUND = cell('G', 'Ground', [onFlag(solid())])
const HARD = cell('H', 'Hard block', [onFlag(solid())])
const BRICKB = cell('B', 'Brick', [onFlag(solid())])
const SPIKES = cell('S', 'Spikes')
const LAVA = cell('L', 'Lava')
const ONEWAY = cell('-', 'One-way platform', [onFlag(solid('top'))])

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
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: vars('coins'), lists: [] } },
    bricks,
    copies,
    ...(layer ? { tiles: layer } : {}),
  }
}

const copyOf = (rt: Runtime, id: string): Target => rt.world.targets.find((t) => t.copyId === id && !t.isClone)!
const cellOf = (rt: Runtime, col: number, row: number): Target => copyOf(rt, gridCopyId(col, row))
const run = (rt: Runtime, ticks: number) => {
  for (let i = 0; i < ticks; i++) rt.step()
}
const num = (rt: Runtime, id: string, name: string) => copyOf(rt, id).variables[name] as number

/** A 20 x 20 faller; origin is the middle, so its bottom is y - 10. */
const faller = (extra: Script[] = [], v: BrickDef['program']['variables'] = []) => brick('f', 'Faller', 20, 20, [onFlag(gravityOn), ...extra], v)

// 30 columns x 8 rows (480 x 128 steps), ground along the bottom row (top face at y = 16).
const EMPTY = '.'.repeat(30)
const GROUND_ROW = 'G'.repeat(30)
const at = (ch: string, col: number) => EMPTY.slice(0, col) + ch + EMPTY.slice(col + 1)
/** The 20 x 20 body's x for column 5 (cells 80..96): its middle is x = 88. */
const X5 = 88

// ---------------------------------------------------------------- cells are targets

describe('grid cells become targets on Play', () => {
  it('a cell is a painted-copy target at the cell centre, with copyId cell:col:row and the brick of its character', () => {
    const rt = play(level([GROUND, SPIKES], [], tiles('..S...', 'GG....')))
    const g = cellOf(rt, 1, 0)
    expect(g.brickId).toBe(GROUND.id)
    expect([g.x, g.y]).toEqual([1 * 16 + 8, 0 * 16 + 8])
    expect(g.copyId).toBe('cell:1:0')
    expect(g.id).toBe('cell:1:0')
    expect(g.isClone).toBe(false)
    expect([g.direction, g.size, g.visible, g.costumeIndex]).toEqual([90, 100, true, 0])
    const s = cellOf(rt, 2, 1)
    expect(s.brickId).toBe(SPIKES.id)
    expect([s.x, s.y]).toEqual([2 * 16 + 8, 1 * 16 + 8])
    expect(parseGridCopyId(s.copyId!)).toEqual({ col: 2, row: 1 })
  })

  it('cells are placed from the level bounds, not from 0', () => {
    const d = level([GROUND], [], tiles('...', 'G..'))
    d.bounds = { left: -64, right: 416, bottom: -32, top: 328 }
    expect([cellOf(play(d), 0, 0).x, cellOf(play(d), 0, 0).y]).toEqual([-64 + 8, -32 + 8])
  })

  it('cells come before design.copies in world.targets (drawn behind them), row by row from the bottom, left to right', () => {
    const rt = play(level([GROUND, faller()], [{ id: 'f', brickId: 'f', x: 50, y: 50 }], tiles('G.G', 'GG.')))
    expect(rt.world.targets.map((t) => t.copyId)).toEqual(['cell:0:0', 'cell:1:0', 'cell:0:1', 'cell:2:1', 'f'])
  })

  it('autotile: costume 2 when the cell above holds the same character, else costume 1', () => {
    const grass = cell('G', 'Ground', [], [], { autotile: true, costumes: 2 })
    const plain = cell('H', 'Hard block', [], [], { costumes: 2 })
    const rt = play(level([grass, plain], [], tiles('G.H.', 'G.H.', 'GGHS'.replace('S', '.'), 'G.H.')))
    // Column 0, rows from the bottom 0..3: ground at rows 0, 1, 2, 3 (a column of four).
    expect([0, 1, 2, 3].map((r) => cellOf(rt, 0, r).costumeIndex)).toEqual([1, 1, 1, 0])
    // Column 1 has a lone ground cell at row 1 with a different cell (empty) above: costume 1.
    expect(cellOf(rt, 1, 1).costumeIndex).toBe(0)
    // Without autotile the second costume is never picked.
    expect([0, 1, 2, 3].map((r) => cellOf(rt, 2, r).costumeIndex)).toEqual([0, 0, 0, 0])
  })

  it('autotile ignores a different brick above, and a one-costume brick', () => {
    const grass = cell('G', 'Ground', [], [], { autotile: true, costumes: 2 })
    const one = cell('B', 'Brick', [], [], { autotile: true, costumes: 1 })
    const rt = play(level([grass, one, HARD], [], tiles('H.B', 'G.B')))
    expect(cellOf(rt, 0, 0).costumeIndex).toBe(0) // a hard block above
    expect(cellOf(rt, 2, 0).costumeIndex).toBe(0) // only one costume
  })

  it('every cell starts with the brick\'s variable defaults, its own copy, and no knobs', () => {
    const q = cell('Q', '? block', [], [{ id: 'used', name: 'used', value: 0 }, { id: 'tag', name: 'tag', value: 'hi', showInBuild: true }])
    const rt = play(level([q], [], tiles('QQ')))
    const a = cellOf(rt, 0, 0)
    const b = cellOf(rt, 1, 0)
    expect(a.variables).toEqual({ used: 0, tag: 'hi' })
    a.variables.used = 9
    expect(b.variables.used).toBe(0)
  })

  it('instantiate leaves the design alone and still copies it into world.tiles', () => {
    const d = level([GROUND], [], tiles('..', 'G.'))
    const before = JSON.stringify(d)
    const w = instantiate(d)
    expect(JSON.stringify(d)).toBe(before)
    expect(w.tiles).toEqual(d.tiles)
    expect(w.tiles).not.toBe(d.tiles)
    expect(instantiate(level([faller()], [])).tiles).toBeUndefined()
  })

  it('a character with no grid brick is skipped instead of throwing', () => {
    expect(instantiate(level([GROUND], [], tiles('GX'))).targets.map((t) => t.id)).toEqual(['cell:0:0'])
  })
})

// ---------------------------------------------------------------- solid cells

describe('solid cells act like solid bricks', () => {
  it('lands on a ground cell at exactly its top, stays with onGround true for 30 ticks', () => {
    const rt = play(level([GROUND, faller()], [{ id: 'f', brickId: 'f', x: 100, y: 100 }], tiles(EMPTY, EMPTY, GROUND_ROW)))
    const f = copyOf(rt, 'f')
    run(rt, 40)
    expect(f.y).toBe(TILE_SIZE + 10)
    for (let i = 0; i < 30; i++) {
      rt.step()
      expect(f.y).toBe(26)
      expect(f.body!.onGround).toBe(true)
      expect(f.body!.vy).toBe(0)
    }
  })

  it('walks off a ledge where the ground stops and falls to the floor of the level', () => {
    const half = 'G'.repeat(10) + '.'.repeat(20)
    const walker = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', 4))])
    const rt = play(level([GROUND, walker], [{ id: 'f', brickId: 'f', x: 100, y: 26 }], tiles(EMPTY, EMPTY, half)))
    const f = copyOf(rt, 'f')
    run(rt, 10)
    expect(f.body!.onGround).toBe(true)
    run(rt, 50)
    expect(f.x).toBe(340)
    expect(f.y).toBe(10)
  })

  const wallRows = [EMPTY, 'B'.padStart(11, '.').padEnd(30, '.'), 'B'.padStart(11, '.').padEnd(30, '.'), GROUND_ROW]
  it('stops at a wall of cells with no gap and no overlap', () => {
    const walker = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', 5))])
    const rt = play(level([GROUND, BRICKB, walker], [{ id: 'f', brickId: 'f', x: 60, y: 26 }], tiles(...wallRows)))
    const f = copyOf(rt, 'f')
    run(rt, 60)
    expect(f.x + 10).toBe(160)
    expect(f.body!.vx).toBe(0)
  })

  it('walking left stops against the wall\'s right face', () => {
    const walker = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', -5))])
    const rt = play(level([GROUND, BRICKB, walker], [{ id: 'f', brickId: 'f', x: 300, y: 26 }], tiles(...wallRows)))
    run(rt, 80)
    expect(copyOf(rt, 'f').x - 10).toBe(176)
  })

  it('walking along a floor of cells never snags on the seams between them', () => {
    const walker = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', 7))])
    const rt = play(level([GROUND, walker], [{ id: 'f', brickId: 'f', x: 20, y: 26 }], tiles(EMPTY, EMPTY, GROUND_ROW)))
    const f = copyOf(rt, 'f')
    run(rt, 50)
    expect(f.x).toBe(20 + 7 * 50 > 470 ? 470 : 20 + 7 * 50)
    expect(f.y).toBe(26)
  })

  it('head-bumps a ceiling of cells: vy becomes 0 and it falls back down', () => {
    const ceiling = 'BBBBB' + '.'.repeat(25)
    const jumper = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('y', 12))])
    const rt = play(level([GROUND, BRICKB, jumper], [{ id: 'f', brickId: 'f', x: 40, y: 26 }], tiles(EMPTY, ceiling, EMPTY, EMPTY, GROUND_ROW)))
    const f = copyOf(rt, 'f')
    let top = 0
    let sawZero = false
    for (let i = 0; i < 40; i++) {
      rt.step()
      top = Math.max(top, f.y)
      if (f.y + 10 === 48 && f.body!.vy === 0) sawZero = true
    }
    expect(top).toBe(38)
    expect(sawZero).toBe(true)
    expect(f.y).toBe(26)
  })

  it('solid is a script, not a kind: a brick without set solid lets bodies through (spikes, lava), solid ones stop them', () => {
    for (const [b, stops] of [[GROUND, true], [BRICKB, true], [HARD, true], [SPIKES, false], [LAVA, false]] as const) {
      const row = b.grid!.char.repeat(30)
      const rt = play(level([b, faller()], [{ id: 'f', brickId: 'f', x: 100, y: 100 }], tiles(EMPTY, EMPTY, EMPTY, row)))
      run(rt, 40)
      expect(copyOf(rt, 'f').y, b.name).toBe(stops ? 26 : 10)
    }
  })

  it('a cell can turn its solid off and on again with its own script', () => {
    const blink = cell('B', 'Blinker', [onFlag(solid(), stmt('control_wait', {}, { DURATION: lit(1) }), solid('off'))])
    const rt = play(level([blink, faller()], [{ id: 'f', brickId: 'f', x: 100, y: 100 }], tiles(EMPTY, EMPTY, EMPTY, 'B'.repeat(30))))
    run(rt, 20)
    expect(copyOf(rt, 'f').y).toBe(26) // resting on the solid cells
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBe(10) // they turned off after a second: it fell through to the level floor
  })

  it('a thin row of cells is not tunnelled by a fast faller', () => {
    const rt = play(level([GROUND, faller()], [{ id: 'f', brickId: 'f', x: 100, y: 340 }], tiles(EMPTY, EMPTY, GROUND_ROW, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY)))
    run(rt, 80)
    expect(copyOf(rt, 'f').y).toBe(106)
  })

  it('a body that starts inside a solid cell is not stuck: it can walk out sideways (a neighbouring cell it was never inside of still blocks)', () => {
    const walker = brick('f', 'Faller', 20, 20, [onFlag(setSpeed('x', 3))])
    // One cell: the body's box (x -2..18) starts overlapping it, so it is not blocked by the cell it is inside of.
    const rt = play(level([GROUND, walker], [{ id: 'f', brickId: 'f', x: 8, y: 8 }], tiles(EMPTY, 'G' + '.'.repeat(29))))
    run(rt, 10)
    expect(copyOf(rt, 'f').x).toBe(38)
  })

  it('past the last painted column there is nothing: a body walks on', () => {
    const rt = play(level([GROUND, brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', 10))])], [{ id: 'f', brickId: 'f', x: 380, y: 26 }], tiles(EMPTY, 'G'.repeat(10))))
    run(rt, 5)
    expect(copyOf(rt, 'f').x).toBe(430)
    expect(copyOf(rt, 'f').body!.onGround).toBe(false)
  })

  it('ordinary painted copies are solid the same way, including one that moves (a moving platform)', () => {
    const plat = brick('p', 'Platform', 60, 10, [onFlag(solid(), setSpeed('x', 2))])
    const rt = play(level([plat, faller()], [{ id: 'p', brickId: 'p', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 120 }]))
    run(rt, 15)
    const f = copyOf(rt, 'f')
    expect(f.y).toBe(50 + 5 + 10) // on top of the platform (its live box, not where it started)
    expect(f.body!.onGround).toBe(true)
    run(rt, 40) // the platform slides out from under it (it does not carry the body) and it falls to the floor
    expect(f.y).toBe(10)
    expect(copyOf(rt, 'p').x).toBe(100 + 2 * 55)
  })

  it('a hidden cell is not solid', () => {
    const ghost = cell('B', 'Ghost', [onFlag(solid(), stmt('looks_hide'))])
    const rt = play(level([ghost, faller()], [{ id: 'f', brickId: 'f', x: 100, y: 100 }], tiles(EMPTY, EMPTY, EMPTY, 'B'.repeat(30))))
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBe(10)
  })
})

// ---------------------------------------------------------------- sensing replaces touching tile

describe('touching [Spikes]? replaces the old touching tile block', () => {
  const touchVars = [{ id: 'on', name: 'on', value: 'unset' }]
  /** Ground cells under everything, a spike at col 5 (x 80 to 96) standing on the ground. */
  const row = '.....S' + '.'.repeat(24)
  const layer = tiles(EMPTY, EMPTY, row, GROUND_ROW)
  const check = (name: string) => stmt('data_setvariableto', { VARIABLE: 'on' }, { VALUE: touching(name) })
  const probe = (x: number, name = 'Spikes', l: TileLayer | null = layer) => {
    const b = brick('p', 'Probe', 10, 10, [onFlag(check(name))], touchVars)
    const rt = play(level([GROUND, SPIKES, b], [{ id: 'p', brickId: 'p', x, y: 21 }], l ?? undefined))
    rt.step()
    return copyOf(rt, 'p').variables.on
  }

  it('is true when the box is on a spike cell, and false beside it', () => {
    expect(probe(88)).toBe(true)
    expect(probe(40)).toBe(false)
    expect(probe(130)).toBe(false)
  })

  it('a box that only touches the spike\'s side face is not touching it', () => {
    expect(probe(75)).toBe(false)
    expect(probe(76)).toBe(true)
  })

  it('asks about one brick at a time: standing on ground is not touching ground, but a box into it is', () => {
    expect(probe(40, 'Ground')).toBe(false)
    const b = brick('p', 'Probe', 10, 10, [onFlag(check('Ground'))], touchVars)
    const rt = play(level([GROUND, b], [{ id: 'p', brickId: 'p', x: 40, y: 20 }], layer))
    rt.step()
    expect(copyOf(rt, 'p').variables.on).toBe(true)
  })

  it('is false in a level with no cells', () => {
    expect(probe(88, 'Spikes', null)).toBe(false)
  })

  it('walking through spikes (not solid) is true while inside, then false after', () => {
    const walker = brick('w', 'Walker', 10, 10, [onFlag(gravityOn, setSpeed('x', 4), forever(ifThen(touching('Spikes'), inc('hits')), setSpeed('x', 4)))], vars('hits'))
    const rt = play(level([GROUND, SPIKES, walker], [{ id: 'w', brickId: 'w', x: 20, y: 21 }], layer))
    run(rt, 60)
    const t = copyOf(rt, 'w')
    expect(t.x).toBeGreaterThan(96 + 5)
    expect(t.variables.hits).toBeGreaterThan(0)
    expect(t.variables.hits).toBeLessThanOrEqual(7)
  })

  it('lava that is not solid is sensed from inside: a body falls through it and counts the touches', () => {
    const f = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, forever(ifThen(touching('Lava'), inc('hits'))))], vars('hits'))
    const rt = play(level([GROUND, LAVA, f], [{ id: 'f', brickId: 'f', x: X5, y: 80 }], tiles(EMPTY, EMPTY, at('L', 5), GROUND_ROW)))
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBe(26)
    expect(num(rt, 'f', 'hits')).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------- bump hats

describe('bump hats', () => {
  const counters = vars('groundTop', 'anyTop', 'groundLeft', 'brickBottom', 'edgeTop', 'plateTop', 'anyAny')

  it('landing on a cell fires BRICK Ground and _any_ once per tick, not _edge_ and not another brick\'s name', () => {
    const scripts = [
      whenBump('top', 'Ground', inc('groundTop')),
      whenBump('top', '_any_', inc('anyTop')),
      whenBump('top', '_edge_', inc('edgeTop')),
      whenBump('top', 'Plate', inc('plateTop')),
      whenBump('_any_', 'Ground', inc('anyAny')),
    ]
    const plate = brick('pl', 'Plate', 10, 4, [])
    const rt = play(level([GROUND, plate, faller(scripts, counters)], [{ id: 'f', brickId: 'f', x: 100, y: 60 }], tiles(EMPTY, EMPTY, GROUND_ROW)))
    run(rt, 20)
    expect(copyOf(rt, 'f').y).toBe(26)
    const start = num(rt, 'f', 'groundTop')
    expect(start).toBeGreaterThan(0)
    run(rt, 10)
    expect(num(rt, 'f', 'groundTop') - start).toBe(10)
    expect(num(rt, 'f', 'anyTop')).toBe(num(rt, 'f', 'groundTop'))
    expect(num(rt, 'f', 'anyAny')).toBe(num(rt, 'f', 'groundTop'))
    expect(num(rt, 'f', 'edgeTop')).toBe(0)
    expect(num(rt, 'f', 'plateTop')).toBe(0)
  })

  it('running into a wall of cells fires when I bump [left] of [Brick]', () => {
    const walker = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', 5)), whenBump('left', 'Brick', inc('groundLeft'))], counters)
    const rt = play(level([GROUND, BRICKB, walker], [{ id: 'f', brickId: 'f', x: 60, y: 26 }], tiles(EMPTY, at('B', 10), GROUND_ROW)))
    run(rt, 40)
    expect(num(rt, 'f', 'groundLeft')).toBeGreaterThan(0)
  })

  it('bumping a ceiling of cells fires bottom of Brick', () => {
    const jumper = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('y', 12)), whenBump('bottom', 'Brick', inc('brickBottom'))], counters)
    const rt = play(level([GROUND, BRICKB, jumper], [{ id: 'f', brickId: 'f', x: 40, y: 26 }], tiles(EMPTY, 'B'.repeat(30), EMPTY, EMPTY, GROUND_ROW)))
    run(rt, 20)
    expect(num(rt, 'f', 'brickBottom')).toBeGreaterThan(0)
  })

  it('the level floor still reports _edge_ and nothing else', () => {
    const rt = play(level([GROUND, faller([whenBump('top', '_edge_', inc('edgeTop')), whenBump('top', 'Ground', inc('groundTop'))], counters)], [{ id: 'f', brickId: 'f', x: 100, y: 60 }]))
    run(rt, 30)
    expect(num(rt, 'f', 'edgeTop')).toBeGreaterThan(0)
    expect(num(rt, 'f', 'groundTop')).toBe(0)
  })

  it('both sides hear it: the Hero jumps into a ? block from below, the Hero gets bump [bottom] of [? block] and the block gets bump [top] of [Faller]', () => {
    const q = cell('Q', '? block', [onFlag(solid()), whenBump('top', 'Faller', inc('hits')), whenBump('bottom', 'Faller', inc('wrong'))], vars('hits', 'wrong'))
    const hero = faller([whenBump('bottom', '? block', inc('hits'))], vars('hits'))
    hero.program.scripts.push(onFlag(setSpeed('y', 12)))
    const rt = play(level([GROUND, q, hero], [{ id: 'f', brickId: 'f', x: X5, y: 26 }], tiles(EMPTY, EMPTY, EMPTY, at('Q', 5), EMPTY, EMPTY, GROUND_ROW)))
    run(rt, 5)
    expect(num(rt, 'f', 'hits')).toBe(1)
    expect(cellOf(rt, 5, 3).variables.hits).toBe(1)
    expect(cellOf(rt, 5, 3).variables.wrong).toBe(0)
  })

  it('landing on a Bounce-like block: the block gets bump [bottom] of [Faller] (the mover\'s side that touched)', () => {
    const bounce = cell('O', 'Bounce block', [onFlag(solid()), whenBump('bottom', 'Faller', inc('hits'))], vars('hits'))
    const rt = play(level([bounce, faller()], [{ id: 'f', brickId: 'f', x: X5, y: 80 }], tiles(EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, at('O', 5))))
    run(rt, 20)
    expect(cellOf(rt, 5, 0).variables.hits).toBeGreaterThan(0)
  })

  it('a wall bump is two-sided too: the mover\'s right side touched the wall cell, so the cell hears [right] of [Faller]', () => {
    const wall = cell('B', 'Brick', [onFlag(solid()), whenBump('right', 'Faller', inc('hits')), whenBump('left', 'Faller', inc('wrong'))], vars('hits', 'wrong'))
    const walker = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('x', 5))])
    const rt = play(level([GROUND, wall, walker], [{ id: 'f', brickId: 'f', x: 60, y: 26 }], tiles(EMPTY, at('B', 10), GROUND_ROW)))
    run(rt, 40)
    expect(cellOf(rt, 10, 1).variables.hits).toBeGreaterThan(0)
    expect(cellOf(rt, 10, 1).variables.wrong).toBe(0)
  })

  it('a body spanning three cells bumps only the one under its centre', () => {
    const g = cell('G', 'Ground', [onFlag(solid()), whenBump('_any_', '_any_', inc('hits'))], vars('hits'))
    const rt = play(level([g, faller()], [{ id: 'f', brickId: 'f', x: X5, y: 60 }], tiles(EMPTY, EMPTY, GROUND_ROW)))
    run(rt, 20)
    // The body spans x 78..98: cells 4 (64-80), 5 (80-96) and 6 (96-112) overlap by 2, 16 and 2.
    expect(cellOf(rt, 4, 0).variables.hits).toBe(0)
    expect(cellOf(rt, 5, 0).variables.hits).toBeGreaterThan(0)
    expect(cellOf(rt, 6, 0).variables.hits).toBe(0)
  })

  it('equal overlap breaks the tie the same way every run: the earlier cell wins', () => {
    const g = cell('G', 'Ground', [onFlag(solid()), whenBump('_any_', '_any_', inc('hits'))], vars('hits'))
    const hits = () => {
      const rt = play(level([g, faller()], [{ id: 'f', brickId: 'f', x: 96, y: 60 }], tiles(EMPTY, EMPTY, GROUND_ROW)))
      run(rt, 20)
      return [cellOf(rt, 5, 0).variables.hits, cellOf(rt, 6, 0).variables.hits]
    }
    expect(hits()[0]).toBeGreaterThan(0)
    expect(hits()[1]).toBe(0)
    expect(hits()).toEqual(hits())
  })
})

// ---------------------------------------------------------------- one-way

describe('solid [only on top]: one-way platforms', () => {
  const layer = () => tiles(EMPTY, EMPTY, EMPTY, EMPTY, at('-', 5), EMPTY, EMPTY, GROUND_ROW)

  it('jumps up through it from below, then lands on top of it with onGround true', () => {
    const jumper = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('y', 12)), whenBump('bottom', 'One-way platform', inc('under'))], vars('under'))
    const rt = play(level([GROUND, ONEWAY, jumper], [{ id: 'f', brickId: 'f', x: X5, y: 26 }], layer()))
    const f = copyOf(rt, 'f')
    let peak = 0
    for (let i = 0; i < 60; i++) {
      rt.step()
      peak = Math.max(peak, f.y)
    }
    expect(peak - 10).toBeGreaterThan(64)
    expect(f.y).toBe(64 + 10)
    expect(f.body!.onGround).toBe(true)
    expect(f.body!.vy).toBe(0)
  })

  it('rising through it fires no bump on either side; landing on it does: the mover top, the platform bottom', () => {
    const plat = cell('-', 'One-way platform', [onFlag(solid('top')), whenBump('_any_', 'Faller', inc('hits'))], vars('hits'))
    const jumper = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('y', 12)), whenBump('_any_', 'One-way platform', inc('hits'))], vars('hits'))
    const rt = play(level([GROUND, plat, jumper], [{ id: 'f', brickId: 'f', x: X5, y: 26 }], layer()))
    for (let i = 0; i < 6; i++) rt.step() // rising: through the cell, no hats
    expect(num(rt, 'f', 'hits')).toBe(0)
    expect(cellOf(rt, 5, 3).variables.hits).toBe(0)
    run(rt, 40)
    expect(num(rt, 'f', 'hits')).toBeGreaterThan(0)
    expect(cellOf(rt, 5, 3).variables.hits).toBeGreaterThan(0)
  })

  it('is not a wall: a body walking into it from the side passes through', () => {
    const walker = brick('f', 'Faller', 20, 20, [onFlag(setSpeed('x', 4))])
    const rt = play(level([GROUND, ONEWAY, walker], [{ id: 'f', brickId: 'f', x: 40, y: 58 }], layer()))
    run(rt, 30)
    expect(copyOf(rt, 'f').x).toBe(160)
  })

  it('stops a body falling onto it from above', () => {
    const rt = play(level([GROUND, ONEWAY, faller()], [{ id: 'f', brickId: 'f', x: X5, y: 120 }], layer()))
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBe(74)
  })

  it('a body already inside it (box straddling the top) is not caught: it falls through', () => {
    const rt = play(level([GROUND, ONEWAY, faller()], [{ id: 'f', brickId: 'f', x: X5, y: 62 }], layer()))
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBe(26)
  })

  it('set solid [on] after [only on top] makes it a full block again', () => {
    const flip = cell('-', 'Flipper', [onFlag(solid('top'), solid('on'))])
    const rt = play(level([GROUND, flip, brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('y', 12))])], [{ id: 'f', brickId: 'f', x: X5, y: 26 }], tiles(EMPTY, EMPTY, EMPTY, EMPTY, at('-', 5), EMPTY, EMPTY, GROUND_ROW)))
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBeLessThan(48 - 10 + 1) // never got above it
  })
})

// ---------------------------------------------------------------- ? block, brick, bounce built only from scripts

describe('? block, brick and bounce blocks run on their own scripts', () => {
  // A ? block in row 3 (y 48 to 64) above the ground. A 20-tall body on the ground has its top at 36.
  const qLayer = () => tiles(EMPTY, EMPTY, EMPTY, EMPTY, at('Q', 5), EMPTY, EMPTY, GROUND_ROW)
  const qBlock = () =>
    cell(
      'Q',
      '? block',
      [
        onFlag(solid()),
        whenBump(
          'top',
          'Faller',
          ifThen(
            block('operator_equals', {}, { OPERAND1: variable('used'), OPERAND2: lit(0) }),
            stmt('data_setvariableto', { VARIABLE: 'used' }, { VALUE: lit(1) }),
            stmt('looks_switchcostumeto', {}, { COSTUME: lit('used') }),
            inc('coins'),
            stmt('control_create_clone_of', {}, { CLONE_OPTION: lit('_myself_') }),
          ),
        ),
        whenClone(solid('off'), setSpeed('y', 8), stmt('control_wait', {}, { DURATION: lit(0.5) }), stmt('control_delete_this_clone')),
      ],
      [{ id: 'used', name: 'used', value: 0 }],
      { costumes: 2 },
    )
  qBlock().costumes[1].name = 'used'
  const mkQ = () => {
    const q = qBlock()
    q.costumes[1].name = 'used'
    return q
  }
  const hitter = () => brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('y', 12))])

  it('hit from below it turns into its used costume once, pays one coin, and the saved design is unchanged', () => {
    const d = level([GROUND, mkQ(), hitter()], [{ id: 'f', brickId: 'f', x: X5, y: 26 }], qLayer())
    const before = JSON.stringify(d)
    const rt = play(d)
    run(rt, 60)
    const q = cellOf(rt, 5, 3)
    expect(q.costumeIndex).toBe(1)
    expect(q.variables.used).toBe(1)
    expect(rt.world.stage.variables.coins).toBe(1)
    expect(JSON.stringify(d)).toBe(before)
  })

  it('a second hit gives nothing, and the coin clone is deleted', () => {
    const hop = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, forever(ifThen(block('platformer_onground'), setSpeed('y', 12))))])
    const rt = play(level([GROUND, mkQ(), hop], [{ id: 'f', brickId: 'f', x: X5, y: 26 }], qLayer()))
    run(rt, 120)
    expect(rt.world.stage.variables.coins).toBe(1)
    expect(rt.world.targets.filter((t) => t.isClone)).toEqual([])
    expect(copyOf(rt, 'f').y).toBeLessThan(48 - 10 + 1) // a used block is still solid: never got above it
  })

  it('is a plain solid from above', () => {
    const rt = play(level([GROUND, mkQ(), faller()], [{ id: 'f', brickId: 'f', x: X5, y: 120 }], qLayer()))
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBe(64 + 10)
    expect(cellOf(rt, 5, 3).variables.used).toBe(0)
  })

  it('a brick cell bumped from below stays where it is', () => {
    const f = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, setSpeed('y', 12)), whenBump('bottom', 'Brick', inc('hits'))], vars('hits'))
    const rt = play(level([GROUND, BRICKB, f], [{ id: 'f', brickId: 'f', x: X5, y: 26 }], tiles(EMPTY, EMPTY, EMPTY, EMPTY, at('B', 5), EMPTY, EMPTY, GROUND_ROW)))
    run(rt, 60)
    expect(num(rt, 'f', 'hits')).toBe(1)
    expect([cellOf(rt, 5, 3).x, cellOf(rt, 5, 3).y]).toEqual([88, 56])
  })

  describe('a bounce block: the Hero\'s own `when I receive bounce` does the launch', () => {
    const BOUNCE_LOW = 6.5
    const BOUNCE_HIGH = 11
    const bounceBrick = () => cell('O', 'Bounce block', [onFlag(solid()), whenBump('bottom', 'Faller', stmt('event_broadcast', {}, { BROADCAST_INPUT: lit('bounce') }))])
    const dropper = () =>
      brick(
        'f',
        'Faller',
        20,
        20,
        [
          onFlag(gravityOn),
          whenReceive(
            'bounce',
            stmt('control_if_else', {}, { CONDITION: block('sensing_keypressed', { KEY_OPTION: 'space' }) }, [[setSpeed('y', BOUNCE_HIGH)], [setSpeed('y', BOUNCE_LOW)]]),
          ),
        ],
      )
    const layer = () => tiles(EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, at('O', 5))
    /** Fall until the tick the Hero is launched; return its y speed after that tick (the launch speed minus one tick of gravity). */
    const launchSpeed = (rt: Runtime): number => {
      const f = copyOf(rt, 'f')
      for (let i = 0; i < 60; i++) {
        rt.step()
        if (f.body!.vy > 0) return f.body!.vy
      }
      return NaN
    }

    it('landing launches at 6.5, holding space launches at 11 (read after the tick\'s gravity: 5.5 and 10)', () => {
      expect(launchSpeed(play(level([bounceBrick(), dropper()], [{ id: 'f', brickId: 'f', x: X5, y: 80 }], layer())))).toBe(BOUNCE_LOW - 1)
      const rt = play(level([bounceBrick(), dropper()], [{ id: 'f', brickId: 'f', x: X5, y: 80 }], layer()))
      rt.pressKey('space')
      expect(launchSpeed(rt)).toBe(BOUNCE_HIGH - 1)
    })

    it('the low bounce rises 18 steps above the landing height; the high one rises 55', () => {
      const peakAfterLanding = (hold: boolean) => {
        const rt = play(level([bounceBrick(), dropper()], [{ id: 'f', brickId: 'f', x: X5, y: 80 }], layer()))
        if (hold) rt.pressKey('space')
        const f = copyOf(rt, 'f')
        let landed = NaN
        let peak = 0
        for (let i = 0; i < 60; i++) {
          const before = f.y
          rt.step()
          if (Number.isNaN(landed) && f.body!.vy > 0) landed = before
          if (!Number.isNaN(landed)) peak = Math.max(peak, f.y)
          if (!Number.isNaN(landed) && f.body!.vy < 0) break
        }
        return peak - landed
      }
      expect(peakAfterLanding(false)).toBe(18)
      expect(peakAfterLanding(true)).toBe(55)
    })
  })
})

// ---------------------------------------------------------------- validation, save

describe('grid bricks are validated', () => {
  const ok = () => level([GROUND, SPIKES], [], tiles(EMPTY, 'GS'.padEnd(30, '.')))
  const codes = (d: LevelDesign) => validateDesign(d)

  it('a well-formed grid passes, with and without cells', () => {
    expect(codes(ok())).toEqual([])
    expect(codes(level([GROUND], []))).toEqual([])
    expect(codes(level([], [], tiles('....')))).toEqual([])
  })

  it('every non-"." character must belong to a grid brick', () => {
    const d = level([GROUND], [], tiles('GX'.padEnd(30, '.')))
    expect(codes(d).map((p) => p.path)).toEqual(['tiles.data[0]'])
    expect(codes(level([], [], tiles('G'))).length).toBeGreaterThan(0) // no grid bricks at all
  })

  it('grid.char is exactly one character, not ".", and unique', () => {
    const bad = (char: string, others: BrickDef[] = []) => {
      const b = cell('G', 'Ground')
      b.grid = { char }
      return codes(level([b, ...others], []))
    }
    expect(bad('')).toHaveLength(1)
    expect(bad('GG')).toHaveLength(1)
    expect(bad('.')).toHaveLength(1)
    expect(bad(' ')).toHaveLength(1)
    expect(bad('\u0007')).toHaveLength(1)
    const clash = bad('H', [HARD])
    expect(clash.map((p) => p.code)).toEqual(['duplicate-id'])
    expect(clash[0].path).toBe('bricks[1].grid.char')
    const typed = cell('G', 'Ground')
    ;(typed.grid as { autotile?: unknown }).autotile = 'yes'
    expect(codes(level([typed], [])).map((p) => p.path)).toEqual(['bricks[0].grid.autotile'])
  })

  it('a grid brick has no limit', () => {
    const b = cell('G', 'Ground')
    b.limit = 1
    expect(codes(level([b], [])).map((p) => p.path)).toEqual(['bricks[0].limit'])
  })

  it('rejects wrong row count, wrong row length and non-string rows, as before', () => {
    const base = (t: unknown) => validateDesign({ ...level([GROUND], []), tiles: t as TileLayer })
    expect(base({ cols: 30, rows: 3, data: [GROUND_ROW] }).length).toBeGreaterThan(0)
    expect(base({ cols: 30, rows: 1, data: ['G'.repeat(29)] }).length).toBeGreaterThan(0)
    expect(base({ cols: 30, rows: 1, data: [5] }).length).toBeGreaterThan(0)
    expect(base({ cols: 30, rows: 1 }).length).toBeGreaterThan(0)
    expect(base(null).length).toBeGreaterThan(0)
    expect(base({ cols: 1.5, rows: 1, data: ['G'] }).length).toBeGreaterThan(0)
  })

  it('caps the size at 400 columns and 60 rows, and the filled cells at maxGridCells', () => {
    const grid = (cols: number, rows: number, ch = '.'): TileLayer => ({ cols, rows, data: Array.from({ length: rows }, () => ch.repeat(cols)) })
    expect(DESIGN_LIMITS.maxTileCols).toBe(400)
    expect(DESIGN_LIMITS.maxTileRows).toBe(60)
    expect(validateDesign(level([], [], grid(400, 60)))).toEqual([])
    expect(validateDesign(level([], [], grid(401, 1))).map((p) => p.code)).toEqual(['limit'])
    expect(validateDesign(level([], [], grid(1, 61))).map((p) => p.code)).toEqual(['limit'])
    expect(DESIGN_LIMITS.maxGridCells).toBeGreaterThanOrEqual(4000)
    const full = (n: number): TileLayer => {
      const rows = Math.ceil(n / 400)
      const data = Array.from({ length: rows }, (_, r) => 'G'.repeat(r < rows - 1 ? 400 : n - 400 * (rows - 1)).padEnd(400, '.'))
      return { cols: 400, rows, data }
    }
    expect(validateDesign(level([GROUND], [], full(DESIGN_LIMITS.maxGridCells)))).toEqual([])
    expect(validateDesign(level([GROUND], [], full(DESIGN_LIMITS.maxGridCells + 1))).map((p) => p.code)).toEqual(['limit'])
  })
})

describe('grid levels are saved', () => {
  const layer = tiles(EMPTY, '..BBQ..SSLL'.padEnd(30, '.'), GROUND_ROW)
  const bricks = () => [GROUND, BRICKB, cell('Q', '? block', [onFlag(solid())]), SPIKES, LAVA, faller()]
  const envelope = (d: LevelDesign) => ({ schemaVersion: 1, engineSemanticsVersion: 1, editorVersion: '13.3.0', pluginVersions: {}, design: d })

  it('round-trips through serialize and parse (grid spec included), and re-serializes byte-identically', () => {
    const text = serialize(envelope(level(bricks(), [{ id: 'fc', brickId: 'f', x: 100, y: 100 }], layer)))
    const result = parse(text)
    if (!result.ok) throw new Error(JSON.stringify(result.problems))
    expect(result.save.design.tiles).toEqual(layer)
    expect(result.save.design.bricks.find((b) => b.id === GROUND.id)!.grid).toEqual({ char: 'G' })
    expect(serialize(result.save)).toBe(text)
  })

  it('a save whose tiles use a character no grid brick owns is refused by parse', () => {
    expect(parse(serialize(envelope(level([], [], { cols: 30, rows: 1, data: ['Z'.repeat(30)] })))).ok).toBe(false)
  })

  it('an old save without tiles still loads, and plays with no cells', () => {
    const raw = fs.readFileSync(`${process.cwd()}/src/platformer/lab/core/__fixtures__/minimal.json`, 'utf8')
    const result = parse(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.save.design.tiles).toBeUndefined()
    expect(instantiate(result.save.design).tiles).toBeUndefined()
  })

  it('playing never changes the saved design', () => {
    const d = level(bricks(), [{ id: 'f', brickId: 'f', x: X5, y: 26 }], tiles(EMPTY, EMPTY, EMPTY, EMPTY, at('Q', 5), EMPTY, EMPTY, GROUND_ROW))
    const before = serialize(envelope(d))
    run(play(d), 20)
    expect(serialize(envelope(d))).toBe(before)
  })
})

// ---------------------------------------------------------------- determinism

describe('grid levels replay identically', () => {
  it('? block, bounce and one-way together over 300 ticks with the same key presses', () => {
    const l = () =>
      level(
        [
          GROUND,
          ONEWAY,
          cell('Q', '? block', [onFlag(solid()), whenBump('top', 'Faller', inc('coins'))]),
          cell('O', 'Bounce block', [onFlag(solid()), whenBump('bottom', 'Faller', stmt('event_broadcast', {}, { BROADCAST_INPUT: lit('bounce') }))]),
          brick(
            'f',
            'Faller',
            20,
            20,
            [
              onFlag(gravityOn, forever(ifThen(block('platformer_onground'), setSpeed('y', 12)))),
              whenReceive('bounce', setSpeed('y', 9)),
              whenBump('_any_', '_any_', inc('hits')),
            ],
            vars('hits'),
          ),
        ],
        [{ id: 'f', brickId: 'f', x: X5, y: 26 }],
        tiles(EMPTY, EMPTY, at('-', 5), EMPTY, at('Q', 5), at('O', 9), EMPTY, GROUND_ROW),
      )
    const trace = (): unknown[] => {
      const rt = play(l())
      const out: unknown[] = []
      for (let i = 0; i < 300; i++) {
        if (i === 100) rt.pressKey('space')
        if (i === 200) rt.releaseKey('space')
        rt.step()
        const t = copyOf(rt, 'f')
        out.push([t.x, t.y, t.body!.vx, t.body!.vy, t.variables.hits, rt.world.stage.variables.coins])
      }
      return out
    }
    expect(trace()).toEqual(trace())
  })
})
