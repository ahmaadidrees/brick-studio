import { describe, expect, it } from 'vitest'
import { play } from '../core/index'
import { targetBounds } from '../core/geometry'
import { createStarterProject, STARTER_CHAR } from './starter'
import { validateDesign } from '../core/project'
import { compileWorkspace } from '../core/editor/compile'
import type { BrickDef, LevelDesign, VariableDecl } from '../core/contracts'
import { Bitmap } from '../../render/art/bitmap'
import { bounceTile, brickTile, hardTile, lavaTile, questionTile, spikesTile, usedTile } from '../../render/art/tiles'
import { readLabel } from './code/layers'
import { Blocks } from './blockBuilder'
import { GRID_BRICK_KEYS, LEGACY_TILE_BRICKS, createBlockBrick, gridBrickTemplate, type GridBrickKey } from './gridBricks'
import { costumeFromImage } from './pixels'
import { createHeroCostume } from './hero/heroBrick'

type Json = Record<string, unknown>
const tops = (ws: unknown): Json[] => ((ws as { blocks: { blocks: Json[] } }).blocks.blocks ?? []) as Json[]
const opcodes = (node: unknown, out = new Map<string, Json>()): Map<string, Json> => {
  if (Array.isArray(node)) node.forEach((n) => opcodes(n, out))
  else if (node && typeof node === 'object') {
    const rec = node as Json
    if (typeof rec.type === 'string') out.set(rec.type, (rec.fields as Json) ?? {})
    Object.values(rec).forEach((v) => opcodes(v, out))
  }
  return out
}
const allIds = (node: unknown, out: string[] = []): string[] => {
  if (Array.isArray(node)) node.forEach((n) => allIds(n, out))
  else if (node && typeof node === 'object') {
    const rec = node as Json
    if (typeof rec.type === 'string' && typeof rec.id === 'string') out.push(rec.id)
    Object.values(rec).forEach((v) => allIds(v, out))
  }
  return out
}
const proccodes = (ws: unknown, type: 'procedures_definition' | 'procedures_call'): string[] => {
  const found: string[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    const rec = node as Json
    if (rec.type === type) found.push(((rec.extraState as Json).proccode as string) ?? '')
    Object.values(rec).forEach(walk)
  }
  walk(ws)
  return found
}
const asBrick = (key: GridBrickKey): BrickDef => ({ id: `brick_${key}`, ...gridBrickTemplate(key).brick })
const bitmapUrl = (b: Bitmap): string => costumeFromImage('x', { width: b.w, height: b.h, data: b.data }).asset!

describe('gridBrickTemplate: the eight standard grid bricks', () => {
  it('has the eight keys in Bricks panel order and a template for each', () => {
    expect([...GRID_BRICK_KEYS]).toEqual(['ground', 'hard', 'spikes', 'lava', 'semi', 'brick', 'qblock', 'bounce'])
    for (const key of GRID_BRICK_KEYS) {
      const t = gridBrickTemplate(key)
      expect(t.key, key).toBe(key)
      expect(['terrain', 'blocks'], key).toContain(t.category)
      expect(t.hint!.length, key).toBeGreaterThan(0)
    }
    expect(GRID_BRICK_KEYS.filter((k) => gridBrickTemplate(k).category === 'blocks')).toEqual(['brick', 'qblock', 'bounce'])
  })

  it('names and grid chars: Ground G (autotile), Hard block H, Spikes S, Lava L, One-way platform -, Brick B, ? block Q, Bounce block O', () => {
    const got = GRID_BRICK_KEYS.map((k) => {
      const b = gridBrickTemplate(k).brick
      return [b.name, b.grid]
    })
    expect(got).toEqual([
      ['Ground', { char: 'G', autotile: true }],
      ['Hard block', { char: 'H' }],
      ['Spikes', { char: 'S' }],
      ['Lava', { char: 'L' }],
      ['One-way platform', { char: '-' }],
      ['Brick', { char: 'B' }],
      ['? block', { char: 'Q' }],
      ['Bounce block', { char: 'O' }],
    ])
  })

  it('each char is the key LEGACY_TILE_BRICKS maps the old tile character to (U maps to the ? block)', () => {
    for (const key of GRID_BRICK_KEYS) expect(LEGACY_TILE_BRICKS[gridBrickTemplate(key).brick.grid!.char], key).toBe(key)
    expect(LEGACY_TILE_BRICKS.U).toBe('qblock')
    expect(new Set(GRID_BRICK_KEYS.map((k) => gridBrickTemplate(k).brick.grid!.char)).size).toBe(8)
  })

  it('every call is a fresh, independent copy', () => {
    const a = gridBrickTemplate('qblock')
    const b = gridBrickTemplate('qblock')
    expect(a).not.toBe(b)
    expect(a.brick.costumes).not.toBe(b.brick.costumes)
    expect(a.workspace).not.toBe(b.workspace)
    expect(a.brick.program).toEqual(b.brick.program)
  })

  it('has no limit, no sounds and no id yet', () => {
    for (const key of GRID_BRICK_KEYS) {
      const b = gridBrickTemplate(key).brick as Record<string, unknown>
      expect(b.limit, key).toBeUndefined()
      expect(b.id, key).toBeUndefined()
      expect(b.sounds, key).toEqual([])
    }
  })

  describe('costumes', () => {
    it('are 16 x 16 pixel costumes with a PNG asset, a mask and an opaque box', () => {
      for (const key of GRID_BRICK_KEYS) {
        for (const c of gridBrickTemplate(key).brick.costumes) {
          expect([c.width, c.height], `${key}/${c.name}`).toEqual([16, 16])
          expect(c.asset, `${key}/${c.name}`).toMatch(/^data:image\/png;base64,/)
          expect([c.mask!.width, c.mask!.height, c.mask!.data.length], `${key}/${c.name}`).toEqual([16, 16, 256])
          expect(c.mask!.data.some((v) => v === 1), `${key}/${c.name}`).toBe(true)
          expect([c.rotationCenterX, c.rotationCenterY], `${key}/${c.name}`).toEqual([8, 8])
          expect(c.opaque!.right, `${key}/${c.name}`).toBeLessThanOrEqual(16)
        }
      }
    })

    it('are the Brickgineers tile art itself (render/art/tiles.ts): Hard, Spikes, Brick, ?, used and bounce match pixel for pixel', () => {
      const costume = (key: GridBrickKey, i: number) => gridBrickTemplate(key).brick.costumes[i]!.asset
      expect(costume('hard', 0)).toBe(bitmapUrl(hardTile()))
      expect(costume('spikes', 0)).toBe(bitmapUrl(spikesTile()))
      expect(costume('brick', 0)).toBe(bitmapUrl(brickTile()))
      expect(costume('qblock', 0)).toBe(bitmapUrl(questionTile(0)))
      expect(costume('qblock', 1)).toBe(bitmapUrl(usedTile()))
      expect(costume('bounce', 0)).toBe(bitmapUrl(bounceTile()))
      expect(costume('lava', 0)).toBe(bitmapUrl(lavaTile(0, true)))
    })

    it('Ground: costume 1 is the grass top (opaque from row 0, studs), costume 2 is dirt (a different picture)', () => {
      const [grass, dirt] = gridBrickTemplate('ground').brick.costumes
      expect([grass!.name, dirt!.name]).toEqual(['Grass', 'Dirt'])
      expect(grass!.asset).not.toBe(dirt!.asset)
      // Studs only have two solid 4-pixel bumps in the top row; dirt has a full opaque top row.
      const row0 = (c: typeof grass) => c!.mask!.data.slice(0, 16).reduce<number>((n, v) => n + v, 0)
      expect(row0(grass)).toBeLessThan(16)
      expect(row0(dirt)).toBe(16)
    })

    it('? block has costumes ?, used and coin; Lava has four bubbling frames; Bounce has bounce and squashed; One-way plate is top-aligned', () => {
      expect(gridBrickTemplate('qblock').brick.costumes.map((c) => c.name)).toEqual(['?', 'used', 'coin'])
      expect(gridBrickTemplate('lava').brick.costumes.map((c) => c.name)).toEqual(['Lava 1', 'Lava 2', 'Lava 3', 'Lava 4'])
      expect(new Set(gridBrickTemplate('lava').brick.costumes.map((c) => c.asset)).size).toBe(4)
      const [bounce, squashed] = gridBrickTemplate('bounce').brick.costumes
      expect([bounce!.name, squashed!.name]).toEqual(['bounce', 'squashed'])
      expect(bounce!.opaque!.top).toBe(0)
      expect(squashed!.opaque!.top).toBe(3)
      expect(squashed!.opaque!.bottom).toBe(16)
      const plate = gridBrickTemplate('semi').brick.costumes[0]!
      expect([plate.opaque!.top, plate.opaque!.bottom]).toEqual([0, 8])
    })
  })

  describe('workspaces and scripts', () => {
    it('every workspace compiles with zero diagnostics and stores the program it compiles to', () => {
      for (const key of GRID_BRICK_KEYS) {
        const t = gridBrickTemplate(key)
        const result = compileWorkspace(t.workspace as never, { variables: t.brick.program.variables })
        expect(result.diagnostics, key).toEqual([])
        expect(result.program.scripts.length, key).toBe(t.brick.program.scripts.length)
        expect(result.program.procedures.map((p) => p.proccode), key).toEqual(t.brick.program.procedures.map((p) => p.proccode))
      }
    })

    it('every top script has a one-line label, block ids never repeat, every My Block called is defined and every definition is called', () => {
      for (const key of GRID_BRICK_KEYS) {
        const ws = gridBrickTemplate(key).workspace
        expect(tops(ws).length, key).toBeGreaterThan(0)
        for (const t of tops(ws)) expect(readLabel(t.data as string | undefined).length, `${key}: ${String(t.type)}`).toBeGreaterThan(0)
        const ids = allIds(ws)
        expect(new Set(ids).size, key).toBe(ids.length)
        expect([...new Set(proccodes(ws, 'procedures_call'))].sort(), key).toEqual(proccodes(ws, 'procedures_definition').sort())
      }
    })

    it('Ground, Hard block and Bounce block start with "when flag clicked, set solid [on]"; the One-way platform sets solid [top] (only on top)', () => {
      for (const key of ['ground', 'hard', 'spikes', 'qblock', 'bounce'] as const) {
        const first = asBrick(key).program.scripts[0]!
        expect(first.hat.opcode, key).toBe('event_whenflagclicked')
        expect(first.body[0], key).toMatchObject({ opcode: 'platformer_setsolid', fields: { SOLID: 'on' } })
      }
      expect(asBrick('semi').program.scripts).toHaveLength(1)
      expect(asBrick('semi').program.scripts[0]!.body.map((b) => [b.opcode, b.fields])).toEqual([['platformer_setsolid', { SOLID: 'top' }]])
      expect(asBrick('ground').program.scripts).toHaveLength(1)
      expect(asBrick('hard').program.scripts).toHaveLength(1)
    })

    it('Spikes: solid, and "when I bump [any] of [Hero] -> broadcast hero hurt"', () => {
      const bump = asBrick('spikes').program.scripts.find((s) => s.hat.opcode === 'platformer_whenbump')!
      expect(bump.hat.fields).toEqual({ SIDE: '_any_', BRICK: 'Hero' })
      expect(JSON.stringify(bump.body)).toContain('hero hurt')
      expect(bump.body[0]!.opcode).toBe('event_broadcast')
    })

    it('Lava: not solid, a forever loop that animates and hurts the Hero if touching it (checked every tick, no wait)', () => {
      const lava = asBrick('lava')
      expect(JSON.stringify(gridBrickTemplate('lava').workspace)).not.toContain('platformer_setsolid')
      expect(lava.program.scripts.map((s) => s.hat.opcode)).toEqual(['event_whenflagclicked'])
      expect(lava.program.procedures.map((p) => p.proccode)).toEqual(['bubble', 'burn the Hero'])
      const ops = opcodes(gridBrickTemplate('lava').workspace)
      expect(ops.get('sensing_touchingobject')).toEqual({ TOUCHINGOBJECTMENU: 'Hero' })
      expect(ops.has('control_wait')).toBe(false)
      expect(JSON.stringify(gridBrickTemplate('lava').workspace)).toContain('hero hurt')
    })

    it('Brick: bump [top] of [Hero] -> hop (up 4 in two steps, back down), then returns to its own height', () => {
      const brick = asBrick('brick')
      const bump = brick.program.scripts.find((s) => s.hat.opcode === 'platformer_whenbump')!
      expect(bump.hat.fields).toEqual({ SIDE: 'top', BRICK: 'Hero' })
      expect(brick.program.procedures.map((p) => p.proccode)).toEqual(['hop'])
      const text = JSON.stringify(gridBrickTemplate('brick').workspace)
      expect(text).toContain('"DY"')
      expect(text).toContain('motion_sety')
    })

    it('? block: bump [top] of [Hero] -> give a coin; the clone does costume coin, solid off, rise, delete this clone; coins is the global', () => {
      const q = asBrick('qblock')
      const bump = q.program.scripts.find((s) => s.hat.opcode === 'platformer_whenbump')!
      expect(bump.hat.fields).toEqual({ SIDE: 'top', BRICK: 'Hero' })
      expect(q.program.scripts.map((s) => s.hat.opcode)).toEqual(['event_whenflagclicked', 'platformer_whenbump', 'control_start_as_clone'])
      expect(q.program.procedures.map((p) => p.proccode)).toEqual(['give a coin', 'rise and vanish'])
      const ops = opcodes(gridBrickTemplate('qblock').workspace)
      expect(ops.get('control_create_clone_of')).toEqual({ CLONE_OPTION: '_myself_' })
      expect(ops.get('data_changevariableby')).toEqual({ VARIABLE: 'coins' })
      expect(ops.has('control_delete_this_clone')).toBe(true)
      expect(q.program.variables).toEqual([{ id: 'qblock_used', name: 'used', value: 0 }])
      const text = JSON.stringify(gridBrickTemplate('qblock').workspace)
      expect(text).toContain('"COSTUME":"used"')
      expect(text).toContain('"COSTUME":"coin"')
      expect(text).toContain('"SOLID":"off"')
    })

    it('Bounce block: bump [bottom] of [Hero] -> broadcast bounce and squash', () => {
      const b = asBrick('bounce')
      const bump = b.program.scripts.find((s) => s.hat.opcode === 'platformer_whenbump')!
      expect(bump.hat.fields).toEqual({ SIDE: 'bottom', BRICK: 'Hero' })
      expect(bump.body[0]).toMatchObject({ opcode: 'event_broadcast' })
      expect(JSON.stringify(bump.body[0])).toContain('bounce')
      expect(b.program.procedures.map((p) => p.proccode)).toEqual(['squash'])
    })

    it('uses only real Scratch blocks and the existing Platformer blocks', () => {
      const known = new Set([
        'event_whenflagclicked', 'event_whenbroadcastreceived', 'event_broadcast', 'platformer_whenbump', 'platformer_setsolid',
        'control_start_as_clone', 'control_create_clone_of', 'control_delete_this_clone', 'control_forever', 'control_if',
        'control_repeat', 'control_wait', 'sensing_touchingobject', 'looks_switchcostumeto', 'looks_nextcostume',
        'data_variable', 'data_setvariableto', 'data_changevariableby', 'motion_changeyby', 'motion_sety', 'motion_yposition',
        'operator_equals', 'operator_mod', 'procedures_definition', 'procedures_call', 'math_number', 'text',
      ])
      for (const key of GRID_BRICK_KEYS) expect([...opcodes(gridBrickTemplate(key).workspace).keys()].filter((o) => !known.has(o)), key).toEqual([])
    })
  })

  it('a level holding all eight bricks and a tiles layer of their chars validates', () => {
    const bricks = GRID_BRICK_KEYS.map(asBrick)
    const design: LevelDesign = {
      id: 'grid_test', name: 'Grid test', seed: 1, bounds: { left: 0, right: 160, bottom: 0, top: 160 },
      stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [{ id: 'coins', name: 'coins', value: 0 }], lists: [] } },
      bricks, copies: [], tiles: { cols: 10, rows: 3, data: ['..........', '.GHSL-BQO.', 'GGGGGGGGGG'] },
    }
    expect(validateDesign(design)).toEqual([])
  })
})

// -----------------------------------------------------------------------------------------------------------------
// The scripts really run. The engine lane (cells as targets, reciprocal bumps) is not merged here, so each brick is
// placed as an ordinary painted copy and its bump hat is swapped for `when I receive [poke]`: that tests everything
// the brick does once the bump arrives, not the arrival. The two-sided bump itself is tested on the starter level further down.
// -----------------------------------------------------------------------------------------------------------------

const heroStandIn = (): BrickDef => ({ id: 'brick_hero', name: 'Hero', costumes: [createHeroCostume()], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } })

/** The brick with every bump hat replaced by `when I receive poke`. */
const pokeable = (key: GridBrickKey): BrickDef => {
  const brick = asBrick(key)
  return {
    ...brick,
    program: {
      ...brick.program,
      scripts: brick.program.scripts.map((s) => (s.hat.opcode === 'platformer_whenbump' ? { ...s, hat: { opcode: 'event_whenbroadcastreceived', fields: { BROADCAST_OPTION: 'poke' }, inputs: {} } } : s)),
    },
  }
}

/** A Stage that counts coins and counts every broadcast of hero hurt and bounce into globals. */
const counterStage = (): BrickDef => {
  const b = new Blocks('stage')
  b.receive('hurt', 'hero hurt', [b.change('hurts', 1)])
  b.receive('bounce', 'bounce', [b.change('bounces', 1)])
  const variables: VariableDecl[] = [
    { id: 'coins', name: 'coins', value: 0 },
    { id: 'hurts', name: 'hurts', value: 0 },
    { id: 'bounces', name: 'bounces', value: 0 },
  ]
  const ws = b.workspace(variables.map(({ id, name }) => ({ id, name })))
  return { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: compileWorkspace(ws, { variables }).program }
}

const levelWith = (keys: GridBrickKey[], copies: Array<{ id: string; key: GridBrickKey | 'hero'; x: number; y: number }>): LevelDesign => ({
  id: 'run_test', name: 'Run test', seed: 7, bounds: { left: 0, right: 320, bottom: 0, top: 320 },
  stage: counterStage(),
  bricks: [heroStandIn(), ...keys.map(pokeable)],
  copies: copies.map((c) => ({ id: c.id, brickId: c.key === 'hero' ? 'brick_hero' : `brick_${c.key}`, x: c.x, y: c.y })),
})

const start = (design: LevelDesign) => {
  expect(validateDesign(design)).toEqual([])
  const rt = play(design)
  const of = (id: string) => rt.world.targets.find((t) => t.copyId === id && !t.isClone)!
  const run = (n: number) => { for (let i = 0; i < n; i++) rt.step() }
  const globals = () => rt.world.stage.variables
  return { rt, of, run, globals }
}

describe('the bricks run their own code (bump hat swapped for broadcast poke)', () => {
  it('Ground, Hard block, Spikes, ? block and Bounce block become solid when the level starts; the One-way platform takes the top option', () => {
    for (const key of ['ground', 'hard', 'spikes', 'qblock', 'bounce', 'semi'] as const) {
      const { of, run } = start(levelWith([key], [{ id: 'c', key, x: 100, y: 100 }]))
      run(2)
      expect(of('c').body?.solid, key).toBe(true)
    }
  })

  it('Lava is not solid', () => {
    const { of, run } = start(levelWith(['lava'], [{ id: 'c', key: 'lava', x: 100, y: 100 }]))
    run(3)
    expect(of('c').body?.solid ?? false).toBe(false)
  })

  it('? block: poke gives one coin, switches to used, and pops one coin clone that rises 30 steps as costume coin, is not solid, then is deleted', () => {
    const { rt, of, run, globals } = start(levelWith(['qblock'], [{ id: 'q', key: 'qblock', x: 100, y: 100 }]))
    run(2)
    expect(of('q').costumeIndex).toBe(0)
    rt.broadcast('poke')
    run(1)
    expect(globals().coins).toBe(1)
    expect(of('q').costumeIndex).toBe(1)
    run(1)
    const clones = () => rt.world.targets.filter((t) => t.isClone && t.brickId === 'brick_qblock')
    expect(clones()).toHaveLength(1)
    const clone = clones()[0]!
    let peak = clone.y
    for (let i = 0; i < 12; i++) { run(1); peak = Math.max(peak, clone.y) }
    expect(clone.costumeIndex).toBe(2)
    expect(clone.body?.solid ?? false).toBe(false)
    expect(peak - 100).toBe(30)
    expect(clones()).toHaveLength(0)
    // the block itself stayed put and stayed used
    expect([of('q').y, of('q').costumeIndex]).toEqual([100, 1])
  })

  it('? block: a second poke gives nothing (coins stays 1, no new clone, still used)', () => {
    const { rt, of, run, globals } = start(levelWith(['qblock'], [{ id: 'q', key: 'qblock', x: 100, y: 100 }]))
    run(2)
    rt.broadcast('poke')
    run(20)
    rt.broadcast('poke')
    run(20)
    expect(globals().coins).toBe(1)
    expect(rt.world.targets.filter((t) => t.brickId === 'brick_qblock')).toHaveLength(1)
    expect(of('q').costumeIndex).toBe(1)
  })

  it('? block: two pokes in the same tick still give exactly one coin (used is set before the coin)', () => {
    const { rt, run, globals } = start(levelWith(['qblock'], [{ id: 'q', key: 'qblock', x: 100, y: 100 }]))
    run(2)
    rt.broadcast('poke')
    rt.broadcast('poke')
    run(20)
    expect(globals().coins).toBe(1)
  })

  it('Brick: one poke shows the top of the hop (up 4) for a frame, then it comes back to exactly its own height', () => {
    const { rt, of, run } = start(levelWith(['brick'], [{ id: 'b', key: 'brick', x: 100, y: 100 }]))
    run(2)
    rt.broadcast('poke')
    let peak = 100
    for (let i = 0; i < 10; i++) { run(1); peak = Math.max(peak, of('b').y) }
    expect(peak).toBe(104)
    expect([of('b').x, of('b').y]).toEqual([100, 100])
  })

  it('Brick: poked again mid-hop, it still ends at exactly its own height', () => {
    const { rt, of, run } = start(levelWith(['brick'], [{ id: 'b', key: 'brick', x: 100, y: 100 }]))
    run(2)
    rt.broadcast('poke')
    for (let i = 0; i < 10; i++) { if (i === 1) rt.broadcast('poke'); run(1) }
    expect([of('b').x, of('b').y]).toEqual([100, 100])
  })

  it('Spikes: poke broadcasts hero hurt once', () => {
    const { rt, run, globals } = start(levelWith(['spikes'], [{ id: 's', key: 'spikes', x: 100, y: 100 }]))
    run(2)
    rt.broadcast('poke')
    run(3)
    expect(globals().hurts).toBe(1)
  })

  it('Bounce block: poke broadcasts bounce once, shows costume squashed, and springs back to bounce in a few ticks', () => {
    const { rt, of, run, globals } = start(levelWith(['bounce'], [{ id: 'o', key: 'bounce', x: 100, y: 100 }]))
    run(2)
    rt.broadcast('poke')
    run(1)
    expect(globals().bounces).toBe(1)
    expect(of('o').costumeIndex).toBe(1)
    run(8)
    expect(of('o').costumeIndex).toBe(0)
    expect(globals().bounces).toBe(1)
  })

  it('Lava: hurts a Hero standing in it every tick, hurts nothing when the Hero is away, and cycles its four costumes', () => {
    const near = start(levelWith(['lava'], [{ id: 'l', key: 'lava', x: 100, y: 100 }, { id: 'h', key: 'hero', x: 100, y: 100 }]))
    near.run(10)
    expect(near.globals().hurts as number).toBeGreaterThanOrEqual(8)
    const away = start(levelWith(['lava'], [{ id: 'l', key: 'lava', x: 100, y: 100 }, { id: 'h', key: 'hero', x: 250, y: 250 }]))
    const seen: number[] = [away.of('l').costumeIndex]
    for (let i = 0; i < 30; i++) { away.run(1); if (seen[seen.length - 1] !== away.of('l').costumeIndex) seen.push(away.of('l').costumeIndex) }
    expect(away.globals().hurts).toBe(0)
    expect(seen.slice(0, 6)).toEqual([0, 1, 2, 3, 0, 1])
  })
})

describe('Block (snaps to grid)', () => {
  it('is a solid grid brick with a kid-picked char (default 1), made of "when flag clicked -> set solid [on]" and an example bump [top] of [Hero]', () => {
    const made = createBlockBrick('Crate', 'K')
    expect(made.brick.name).toBe('Crate')
    expect(made.brick.grid).toEqual({ char: 'K' })
    expect(createBlockBrick('Crate').brick.grid).toEqual({ char: '1' })
    expect(made.brick.costumes).toHaveLength(1)
    const scripts = made.brick.program.scripts
    expect(scripts.map((s) => s.hat.opcode)).toEqual(['event_whenflagclicked', 'platformer_whenbump'])
    expect(scripts[0]!.body[0]).toMatchObject({ opcode: 'platformer_setsolid', fields: { SOLID: 'on' } })
    expect(scripts[1]!.hat.fields).toEqual({ SIDE: 'top', BRICK: 'Hero' })
    expect(compileWorkspace(made.workspace as never).diagnostics).toEqual([])
  })
})

// -----------------------------------------------------------------------------------------------------------------
// Needs the engine lane (cells as targets, set solid [top], reciprocal bumps). The integrator turns each into a test.
// Layout of the starter: ? block cell:12:3 at x 200, Brick cell:11:3 at x 184, One-way cells cols 33-36 row 3, Bounce cell:18:1.
// -----------------------------------------------------------------------------------------------------------------
describe('on the starter level, through the engine (cells are targets, bumps arrive on both sides)', () => {
  const fresh = (design: LevelDesign = createStarterProject().design) => {
    const rt = play(design)
    const of = (id: string) => rt.world.targets.find((t) => t.copyId === id && !t.isClone)!
    const run = (n: number) => { for (let i = 0; i < n; i++) rt.step() }
    run(20)
    // The Walkers patrol the ground under several of these spots and would hurt the Hero; take them out of these tests.
    rt.world.targets = rt.world.targets.filter((t) => t.brickId !== 'brick_walker')
    return { rt, of, run }
  }

  it('two-sided bump: the Hero jumping up into cell:12:3 gets bump [bottom] of [? block] and the ? block gets bump [top] of [Hero] (coins 1 after the jump)', () => {
    const design = createStarterProject().design
    const b = new Blocks('probe')
    b.bump('Hero heard it', 'bottom', [b.change('heard', 1)], '? block')
    const variables: VariableDecl[] = [{ id: 'heard', name: 'heard', value: 0 }]
    const probe = compileWorkspace(b.workspace([{ id: 'heard', name: 'heard' }]), { variables }).program.scripts
    const withProbe: LevelDesign = {
      ...design,
      stage: { ...design.stage, program: { ...design.stage.program, variables: [...design.stage.program.variables, ...variables] } },
      bricks: design.bricks.map((x) => (x.id === 'brick_hero' ? { ...x, program: { ...x.program, scripts: [...x.program.scripts, ...probe] } } : x)),
    }
    const { rt, of, run } = fresh(withProbe)
    const h = of('copy_hero')
    h.x = 200; h.y = 24
    run(2)
    rt.pressKey('space'); run(30); rt.releaseKey('space')
    expect(rt.world.stage.variables.heard).toBe(1) // the Hero's side
    expect([of('cell:12:3').costumeIndex, rt.world.stage.variables.coins]).toEqual([1, 1]) // the ? block's side (bump [top] of [Hero])
  })

  it('One-way platform with set solid [top]: body.oneWay is true, the Hero jumps up through cols 33-36 row 3 from x 560 and lands with box bottom 64, onGround', () => {
    const { rt, of, run } = fresh()
    for (let c = 33; c <= 36; c++) expect(of(`cell:${c}:3`).body).toMatchObject({ solid: true, oneWay: true })
    const h = of('copy_hero')
    h.x = 560; h.y = 24
    rt.pressKey('space')
    let highest = 0
    for (let i = 0; i < 40; i++) { run(1); highest = Math.max(highest, targetBounds(rt.world, h)!.bottom) }
    rt.releaseKey('space')
    expect(highest).toBeGreaterThan(64)
    run(20)
    expect([targetBounds(rt.world, h)!.bottom, h.body!.onGround]).toEqual([64, true])
  })

  it('Ground autotile: with a G cell above another G cell the lower cell starts on costumeIndex 1 (dirt); the top cell on 0 (grass)', () => {
    const design = createStarterProject().design
    const rows = design.tiles!.data.slice()
    rows[1] = rows[1]!.slice(0, 2) + STARTER_CHAR.ground + rows[1]!.slice(3)
    const { of } = fresh({ ...design, tiles: { ...design.tiles!, data: rows } })
    expect([of('cell:2:0').costumeIndex, of('cell:2:1').costumeIndex]).toEqual([1, 0])
    expect(of('cell:4:0').costumeIndex).toBe(0)
  })

  it('Bounce block, Hero landing from y 120 at x 296 with space held: the Hero launches at y speed 11 on every landing; with space released, 6.5', () => {
    for (const [held, vy] of [[true, 11], [false, 6.5]] as const) {
      const { rt, of, run } = fresh()
      const h = of('copy_hero')
      h.x = 296; h.y = 120
      if (held) rt.pressKey('space')
      const launches: number[] = []
      let prev = h.body!.vy, landed = false
      for (let i = 0; i < 80; i++) {
        run(1)
        if (h.body!.onGround) landed = true
        // Ignore the stale onGround jump on tick 0 when space is held. The bounce is the brick's code, one tick after the landing.
        if (landed && prev <= 0 && h.body!.vy > 0) launches.push(h.body!.vy)
        prev = h.body!.vy
      }
      expect(launches.length, String(held)).toBeGreaterThan(2)
      expect(new Set(launches), String(held)).toEqual(new Set([vy]))
    }
  })

  it('Spikes: the Hero walking into a Spikes cell from the side (any side) is back at the start [60, 24]', () => {
    const design = createStarterProject().design
    const rows = design.tiles!.data.slice()
    rows[1] = rows[1]!.slice(0, 10) + STARTER_CHAR.spikes + rows[1]!.slice(11)
    const { rt, of, run } = fresh({ ...design, tiles: { ...design.tiles!, data: rows } })
    const h = of('copy_hero')
    h.x = 120; h.y = 24
    run(2)
    rt.pressKey('right arrow')
    // Walk until the Hero is sent back (x jumps left of where it was); stop walking in that same tick.
    let sentBack = false
    for (let i = 0; i < 60 && !sentBack; i++) { const before = h.x; run(1); sentBack = h.x < before - 10 }
    rt.releaseKey('right arrow')
    expect(sentBack).toBe(true)
    expect([h.x, h.y]).toEqual([60, 24])
  })
})
