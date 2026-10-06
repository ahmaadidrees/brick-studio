import { describe, expect, it } from 'vitest'
import { targetBounds } from '../core/geometry'
import { play } from '../core/index'
import { readLabel } from './code/layers'
import { TILE_CHAR, TILE_SIZE, type BrickDef } from '../core/contracts'
import { instantiate, validateDesign } from '../core/project'
import { compileWorkspace } from '../core/editor/compile'
import {
  createStarterProject,
  createStarterTiles,
  GROUND_TOP,
  STARTER_COINS,
  STARTER_BOUNCE,
  STARTER_COLS,
  STARTER_GAP_COLS,
  STARTER_ONE_WAY,
  STARTER_PIT_COLS,
  STARTER_PLATFORMS,
  STARTER_ROWS,
  STARTER_WALKERS,
  STARTER_WALLS,
} from './starter'
import { BRICK_TEMPLATES } from './templates'
import { STAGE_ID } from './store'

const project = () => createStarterProject()
const brickOf = (p: ReturnType<typeof createStarterProject>, id: string): BrickDef => {
  const brick = p.design.bricks.find((b) => b.id === id)
  expect(brick, `brick ${id}`).toBeDefined()
  return brick!
}

type Json = Record<string, unknown>
const topBlocks = (ws: unknown): Json[] => ((ws as { blocks: { blocks: Json[] } }).blocks.blocks ?? []) as Json[]
const walkOpcodes = (node: unknown, out = new Map<string, Json>()): Map<string, Json> => {
  if (Array.isArray(node)) node.forEach((n) => walkOpcodes(n, out))
  else if (node && typeof node === 'object') {
    const rec = node as Json
    if (typeof rec.type === 'string') out.set(rec.type, (rec.fields as Json) ?? {})
    Object.values(rec).forEach((v) => walkOpcodes(v, out))
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

describe('Starter level (starter.ts)', () => {
  it('validates with validateDesign with zero problems', () => {
    expect(validateDesign(project().design)).toEqual([])
  })

  it('compiles every starter workspace with zero diagnostics (platformer_touchingtile is not warned about, the compiler has no unknown-opcode check)', () => {
    const p = project()
    for (const [brickId, workspace] of Object.entries(p.workspaces)) {
      const brick = brickId === STAGE_ID ? p.design.stage : brickOf(p, brickId)
      const result = compileWorkspace(workspace, { variables: brick.program.variables, lists: brick.program.lists })
      expect(result.diagnostics, brickId).toEqual([])
    }
  })

  it('stores the same program that its workspace compiles to', () => {
    const p = project()
    for (const brick of p.design.bricks) {
      const result = compileWorkspace(p.workspaces[brick.id], { variables: brick.program.variables })
      expect(result.program.scripts.length, brick.name).toBe(brick.program.scripts.length)
      expect(result.program.procedures.map((x) => x.proccode), brick.name).toEqual(brick.program.procedures.map((x) => x.proccode))
    }
  })

  it('has Hero, Walker, Coin, Spring and Goal with pixel-art costumes (and no Ground or Platform bricks)', () => {
    const p = project()
    expect(p.design.bricks.map((b) => b.name)).toEqual(['Hero', 'Walker', 'Coin', 'Spring', 'Goal'])
    expect(p.design.bounds).toEqual({ left: 0, right: 960, bottom: 0, top: 360 })
    for (const brick of p.design.bricks) {
      expect(brick.costumes.length).toBeGreaterThan(0)
      expect(brick.costumes[0]!.asset).toMatch(/^data:image\/png;base64,/)
    }
    expect(brickOf(p, 'brick_spring').costumes[0]).toMatchObject({ width: 16, height: 12 })
    expect(brickOf(p, 'brick_goal').costumes[0]).toMatchObject({ width: 16, height: 32 })
  })

  describe('tiles', () => {
    const tiles = createStarterTiles()
    const at = (col: number, row: number) => tiles.data[row]![col]
    it('is 60 columns by 22 rows, row 0 at the bottom, every row 60 characters', () => {
      expect([tiles.cols, tiles.rows, tiles.data.length]).toEqual([STARTER_COLS, STARTER_ROWS, STARTER_ROWS])
      expect(tiles.data.every((r) => r.length === STARTER_COLS)).toBe(true)
      expect(project().design.tiles).toEqual(tiles)
    })
    it('has a ground row 0 with a 3-tile gap (cols 20-22) and a 3-tile spike pit (cols 44-46)', () => {
      expect(GROUND_TOP).toBe(TILE_SIZE)
      for (let c = 0; c < STARTER_COLS; c++) {
        const expected = STARTER_GAP_COLS.includes(c) ? '.' : STARTER_PIT_COLS.includes(c) ? TILE_CHAR.spikes : TILE_CHAR.ground
        expect(at(c, 0), `col ${c}`).toBe(expected)
      }
    })
    it('has five floating platforms at tops 64, 112, 160, 112 and 80, each a brick/? block mix', () => {
      expect(STARTER_PLATFORMS.map((p) => (p.row + 1) * TILE_SIZE)).toEqual([64, 112, 160, 112, 80])
      for (const p of STARTER_PLATFORMS) {
        expect(tiles.data[p.row]!.slice(p.col, p.col + p.tiles.length)).toBe(p.tiles)
        expect(p.tiles).toMatch(/^[BQ]+$/)
      }
      // each of the first four tops is at most 48 above the last, so a jump (about 62 high) reaches it
      const tops = STARTER_PLATFORMS.slice(0, 4).map((p) => (p.row + 1) * TILE_SIZE)
      expect(tops[0]! - GROUND_TOP).toBe(48)
    })
    it('has four hard blocks on the ground, two on each side of a Walker', () => {
      expect(STARTER_WALLS.map((w) => [w.col, w.row])).toEqual([[6, 1], [15, 1], [31, 1], [39, 1]])
      for (const w of STARTER_WALLS) expect(at(w.col, w.row)).toBe(TILE_CHAR.hard)
      // every Walker starts strictly between its two walls
      const [fast, slow] = STARTER_WALKERS
      expect([fast!.x > 6 * 16 + 16 && fast!.x < 15 * 16, slow!.x > 31 * 16 + 16 && slow!.x < 39 * 16]).toEqual([true, true])
    })
    it('has a one-way platform (cols 33-36, row 3, top 64) and a bounce block (col 18, row 1), using TILE_CHAR - and O', () => {
      expect([TILE_CHAR.semi, TILE_CHAR.bounce]).toEqual(['-', 'O'])
      expect(tiles.data[STARTER_ONE_WAY.row]!.slice(STARTER_ONE_WAY.col, STARTER_ONE_WAY.col + STARTER_ONE_WAY.length)).toBe('----')
      expect((STARTER_ONE_WAY.row + 1) * TILE_SIZE).toBe(64)
      expect(at(STARTER_BOUNCE.col, STARTER_BOUNCE.row)).toBe('O')
      // The bounce block stands on the ground (row 0 is ground there) and outside both Walkers' lanes.
      expect(at(STARTER_BOUNCE.col, 0)).toBe(TILE_CHAR.ground)
      const [fast] = STARTER_WALKERS
      expect(STARTER_BOUNCE.col * TILE_SIZE).toBeGreaterThan(fast!.x + 64)
      // Nothing else is painted in the one-way platform's row or the bounce block's neighbours.
      expect(tiles.data[STARTER_ONE_WAY.row]!.replace(/[-.]|[BQ]/g, '')).toBe('')
    })
    it('uses only allowed tile characters', () => {
      const allowed = new Set(['.', ...Object.values(TILE_CHAR)])
      for (const row of tiles.data) for (const ch of row) expect(allowed.has(ch)).toBe(true)
    })
  })

  describe('scripts are labelled and built from My Blocks', () => {
    it('every top script has a one-line label in the editor format (block data "label:<text>")', () => {
      const p = project()
      for (const [id, ws] of Object.entries(p.workspaces)) {
        const tops = topBlocks(ws)
        expect(tops.length, id).toBeGreaterThan(0)
        for (const t of tops) {
          const text = readLabel(t.data as string | undefined)
          expect(text.length, `${id}: ${String(t.type)}`).toBeGreaterThan(0)
        }
      }
    })

    it('every My Block called has a definition, and every definition is called', () => {
      const p = project()
      for (const [id, ws] of Object.entries(p.workspaces)) {
        const defs = proccodes(ws, 'procedures_definition').sort()
        const calls = [...new Set(proccodes(ws, 'procedures_call'))].sort()
        if (id === 'brick_hero') expect(calls.every((c) => defs.includes(c)), id).toBe(true)
        else expect(calls, id).toEqual(defs)
      }
    })

    it('Walker: flag + two bump hats, My Blocks walk at / turn around / check for stomp', () => {
      const walker = brickOf(project(), 'brick_walker')
      expect(walker.program.scripts.map((s) => s.hat.opcode)).toEqual(['event_whenflagclicked', 'platformer_whenbump', 'platformer_whenbump'])
      expect(walker.program.scripts.filter((s) => s.hat.opcode === 'platformer_whenbump').map((s) => s.hat.fields)).toEqual([
        { SIDE: 'left', BRICK: '_any_' },
        { SIDE: 'right', BRICK: '_any_' },
      ])
      const procs = walker.program.procedures
      expect(procs.map((x) => x.proccode)).toEqual(['walk at %s', 'turn around', 'check for stomp'])
      expect(procs[0]!.argumentNames).toEqual(['speed'])
      const ws = project().workspaces.brick_walker
      const ops = walkOpcodes(ws)
      expect(ops.get('platformer_setgravity')).toEqual({ GRAVITY: 'on' })
      expect(ops.has('platformer_setspeed')).toBe(true)
      expect(ops.get('sensing_touchingobject')).toEqual({ TOUCHINGOBJECTMENU: 'Hero' })
      expect(ops.get('sensing_of')).toEqual({ PROPERTY: 'y position', OBJECT: 'Hero' })
    })

    it('Coin has spin and check for Hero; Spring has launch the Hero; Goal has check for the Hero', () => {
      const p = project()
      expect(brickOf(p, 'brick_coin').program.procedures.map((x) => x.proccode)).toEqual(['spin', 'check for Hero'])
      expect(brickOf(p, 'brick_spring').program.procedures.map((x) => x.proccode)).toEqual(['launch the Hero'])
      expect(brickOf(p, 'brick_goal').program.procedures.map((x) => x.proccode)).toEqual(['check for the Hero'])
      expect(walkOpcodes(p.workspaces.brick_goal).get('control_stop')).toEqual({ STOP_OPTION: 'all' })
    })

    it('Hero keeps its program and gains handlers for boing, stomped, hero hurt, spikes, lava and ? blocks', () => {
      const hero = brickOf(project(), 'brick_hero')
      const received = hero.program.scripts.filter((s) => s.hat.opcode === 'event_whenbroadcastreceived').map((s) => s.hat.fields.BROADCAST_OPTION)
      expect(received).toEqual(['boing', 'stomped', 'hero hurt'])
      const ops = walkOpcodes(project().workspaces.brick_hero)
      expect(JSON.stringify(project().workspaces.brick_hero)).toContain('"TILE":"spikes"')
      expect(JSON.stringify(project().workspaces.brick_hero)).toContain('"TILE":"lava"')
      expect(ops.has('platformer_touchingtile')).toBe(true)
      // when I bump [bottom] of [tile:qblock] -> change coins by 1 (a labelled script)
      const qbump = hero.program.scripts.find((x) => x.hat.opcode === 'platformer_whenbump' && x.hat.fields.BRICK === 'tile:qblock')!
      expect(qbump.hat.fields).toEqual({ SIDE: 'bottom', BRICK: 'tile:qblock' })
      expect(qbump.body.map((b) => [b.opcode, b.fields.VARIABLE])).toEqual([['data_changevariableby', 'coins']])
      const qTop = topBlocks(project().workspaces.brick_hero).find((t) => (t.fields as Json | undefined)?.BRICK === 'tile:qblock')!
      expect(readLabel(qTop.data as string)).toMatch(/\? block/)
      // its own feel scripts are all still there
      const names = hero.program.procedures.map((x) => x.proccode)
      expect(names).toEqual(['read keys', 'feel the wall', 'walk', 'run meter', 'jump', 'fall', 'hit a wall'])
    })

    it('only the Hero and the Goal are one per level (limit 1)', () => {
      const p = project()
      expect(p.design.bricks.map((b) => [b.name, b.limit])).toEqual([['Hero', 1], ['Walker', undefined], ['Coin', undefined], ['Spring', undefined], ['Goal', 1]])
      expect(p.design.copies.filter((c) => c.brickId === 'brick_hero')).toHaveLength(1)
      expect(p.design.copies.filter((c) => c.brickId === 'brick_goal')).toHaveLength(1)
    })

    it('has no backdrop costume, so the stage draws the Brickgineers sky', () => {
      expect(project().design.stage.costumes).toEqual([])
    })

    it('Stage counts coins when a Coin says coin collected', () => {
      const stage = project().design.stage
      expect(stage.program.variables).toEqual([{ id: 'coins', name: 'coins', value: 0 }])
      expect(stage.program.scripts.map((s) => [s.hat.opcode, s.hat.fields.BROADCAST_OPTION])).toEqual([
        ['event_whenflagclicked', undefined],
        ['event_whenbroadcastreceived', 'coin collected'],
      ])
    })
  })

  it('paints the Walker twice with different speed knob values', () => {
    const p = project()
    const walker = brickOf(p, 'brick_walker')
    expect(walker.program.variables.find((v) => v.id === 'brick_walker_speed')).toMatchObject({ name: 'speed', showInBuild: true })
    const copies = p.design.copies.filter((c) => c.brickId === 'brick_walker')
    expect(copies.map((c) => c.knobs)).toEqual([{ brick_walker_speed: 4 }, { brick_walker_speed: 2 }])
    const speeds = instantiate(p.design).targets.filter((t) => t.brickId === 'brick_walker').map((t) => t.variables.brick_walker_speed)
    expect(speeds.sort()).toEqual([2, 4])
  })

  it('lays the level out inside the bounds, with the Hero above the ground', () => {
    const { copies, bounds } = project().design
    for (const copy of copies) {
      expect(copy.x).toBeGreaterThanOrEqual(bounds.left)
      expect(copy.x).toBeLessThanOrEqual(bounds.right)
      expect(copy.y).toBeGreaterThanOrEqual(bounds.bottom)
      expect(copy.y).toBeLessThanOrEqual(bounds.top)
    }
    const hero = copies.find((c) => c.id === 'copy_hero')!
    expect([hero.x, hero.y]).toEqual([60, 40])
    expect(hero.y - 8).toBeGreaterThan(GROUND_TOP)
    expect(copies.filter((c) => c.brickId === 'brick_coin')).toHaveLength(STARTER_COINS.length)
    expect(copies.find((c) => c.id === 'copy_spring')).toMatchObject({ x: 776, y: 22 })
    expect(copies.find((c) => c.id === 'copy_goal')).toMatchObject({ x: 920, y: 32 })
  })

  it('instantiates into a valid World', () => {
    const world = instantiate(project().design)
    expect(world.targets.filter((t) => t.brickId === 'brick_coin')).toHaveLength(5)
    expect(world.targets.filter((t) => t.brickId === 'brick_walker')).toHaveLength(2)
  })

  // ---------------------------------------------------------------------------------------------------------------
  // Play expectations for the integrator. Turn these into real tests once the tiles lane is merged:
  //   const rt = play(createStarterProject().design); rt.step() N times; read rt.world.targets by copyId.
  // Numbers below follow from the layout above (tile row r spans y r*16..r*16+16, col c spans x c*16..c*16+16;
  // the Walker's opaque box is 14 wide x 15 tall and its costume center is 7 from either edge; the Hero's box is 12 x 14).
  // ---------------------------------------------------------------------------------------------------------------
  // Play tests (step 6 integration: tiles physics merged). Numbers measured headlessly and checked against the lane's predictions.
  const fresh = () => {
    const rt = play(createStarterProject().design)
    const of = (id: string) => rt.world.targets.find((t) => t.copyId === id)!
    const run = (n: number) => { for (let i = 0; i < n; i++) rt.step() }
    return { rt, of, run }
  }

  it('Hero lands on the ground tile: box bottom exactly 16 and on ground for 30 ticks', () => {
    const { rt, of, run } = fresh()
    run(20)
    const h = of('copy_hero')
    for (let i = 0; i < 30; i++) {
      run(1)
      expect([targetBounds(rt.world, h)!.bottom, h.body?.onGround]).toEqual([16, true])
    }
  })

  it('Hero is stopped by the hard block at column 6: box right edge rests at x 96', () => {
    const { rt, of, run } = fresh()
    run(20)
    rt.pressKey('right arrow')
    run(90)
    expect(targetBounds(rt.world, of('copy_hero'))!.right).toBe(96)
  })

  it('Walkers turn at tile walls and keep their knob speeds', () => {
    const { rt, of, run } = fresh()
    const fast = of('copy_walker_fast'), slow = of('copy_walker_slow')
    let minF = Infinity, maxF = -Infinity, minS = Infinity, maxS = -Infinity
    const vF = new Set<number>(), vS = new Set<number>()
    run(20)
    for (let i = 0; i < 600; i++) {
      run(1)
      minF = Math.min(minF, fast.x); maxF = Math.max(maxF, fast.x); minS = Math.min(minS, slow.x); maxS = Math.max(maxS, slow.x)
      vF.add(fast.body!.vx); vS.add(slow.body!.vx)
      expect([fast.y, slow.y]).toEqual([24, 24])
    }
    expect([minF, maxF, minS, maxS]).toEqual([119, 233, 519, 617])
    // 0 appears for the one tick between a bump and the turn-around script (STEP3.md step 7).
    expect([...vF].sort((a, b) => a - b)).toEqual([-4, 0, 4])
    expect([...vS].sort((a, b) => a - b)).toEqual([-2, 0, 2])
  })

  it('spikes send the Hero back to the start', () => {
    const { of, run } = fresh()
    run(20)
    const h = of('copy_hero')
    h.x = 736; h.y = 100
    run(20)
    expect([h.x, h.y]).toEqual([60, 24])
  })

  it('lava sends the Hero back to the start, like spikes', () => {
    const design = createStarterProject().design
    // paint one lava tile in mid-air at col 10, row 5 (x 160..176, y 80..96)
    const tiles = design.tiles!
    const data = tiles.data.slice()
    data[5] = data[5]!.slice(0, 10) + TILE_CHAR.lava + data[5]!.slice(11)
    const rt = play({ ...design, tiles: { ...tiles, data } })
    const h = rt.world.targets.find((t) => t.copyId === 'copy_hero')!
    for (let i = 0; i < 20; i++) rt.step()
    h.x = 168; h.y = 88
    for (let i = 0; i < 20; i++) rt.step()
    expect([h.x, h.y]).toEqual([60, 24])
  })

  // The three below need the tiles lane's step 6b physics (one-way, ? block hit, bounce). The integrator flips them.
  // Layout: one-way platform cols 33-36 row 3 (x 528..592, top y 64); ? blocks at the platforms listed above; bounce block col 18 row 1.
  it('one-way platform: the Hero jumps up through it, then lands on top (box bottom 64, on ground)', () => {
    const rt = play(createStarterProject().design)
    const h = rt.world.targets.find((t) => t.copyId === 'copy_hero')!
    for (let i = 0; i < 20; i++) rt.step()
    h.x = 560; h.y = 24
    rt.pressKey('space')
    let highest = 0
    for (let i = 0; i < 40; i++) { rt.step(); highest = Math.max(highest, targetBounds(rt.world, h)!.bottom) }
    rt.releaseKey('space')
    for (let i = 0; i < 20; i++) rt.step()
    expect(highest).toBeGreaterThan(64)
    expect([targetBounds(rt.world, h)!.bottom, h.body!.onGround]).toEqual([64, true])
  })

  it('? block: hitting it from below turns it into a used block and counts one coin; hitting it again gives none', () => {
    const rt = play(createStarterProject().design)
    const h = rt.world.targets.find((t) => t.copyId === 'copy_hero')!
    const jump = () => { rt.pressKey('space'); for (let i = 0; i < 30; i++) rt.step(); rt.releaseKey('space'); for (let i = 0; i < 30; i++) rt.step() }
    for (let i = 0; i < 20; i++) rt.step()
    h.x = 200; h.y = 24
    jump()
    expect(rt.world.tiles!.data[3][12]).toBe('U')
    expect(Object.values(rt.world.stage.variables)).toEqual([1])
    jump()
    expect(Object.values(rt.world.stage.variables)).toEqual([1])
    expect(createStarterProject().design.tiles!.data[3][12]).toBe('Q') // the saved design is unchanged
  })

  it('bounce block: a Hero dropped onto it gets the low bounce (6.5 per tick, the old bounceLow) and keeps bouncing', () => {
    const rt = play(createStarterProject().design)
    const h = rt.world.targets.find((t) => t.copyId === 'copy_hero')!
    for (let i = 0; i < 20; i++) rt.step()
    h.x = 296; h.y = 120
    const launches: number[] = []
    let prev = h.body!.vy
    for (let i = 0; i < 60; i++) {
      rt.step()
      if (prev < 0 && h.body!.vy > 0) launches.push(h.body!.vy)
      prev = h.body!.vy
    }
    expect(launches.length).toBeGreaterThan(3)
    expect(new Set(launches)).toEqual(new Set([6.5]))
  })


  it('the Spring launches the Hero higher than its own best jump (62)', () => {
    const { rt, of, run } = fresh()
    run(20)
    const h = of('copy_hero'), spring = of('copy_spring')
    h.x = spring.x; h.y = spring.y + 4
    const y0 = h.y
    let peak = y0
    for (let i = 0; i < 40; i++) { run(1); peak = Math.max(peak, h.y) }
    expect(peak - y0).toBeGreaterThan(62)
    void rt
  })

  it('the coin counts once and only that coin hides', () => {
    const { rt, of, run } = fresh()
    run(20)
    const h = of('copy_hero'), c1 = of('copy_coin_1')
    h.x = c1.x; h.y = c1.y
    run(4)
    expect(c1.visible).toBe(false)
    expect(Object.values(rt.world.stage.variables)).toContain(1)
    expect(['copy_coin_2', 'copy_coin_3', 'copy_coin_4', 'copy_coin_5'].map((id) => of(id).visible)).toEqual([true, true, true, true])
  })

  it('landing on a Walker squishes it; walking into one sends the Hero to the start', () => {
    {
      const { of, run } = fresh()
      run(20)
      const h = of('copy_hero'), w = of('copy_walker_slow')
      h.x = w.x; h.y = w.y + 10; h.body!.vy = -2
      run(4)
      expect(w.visible).toBe(false)
    }
    {
      const { of, run } = fresh()
      run(20)
      const h = of('copy_hero'), w = of('copy_walker_slow')
      h.x = w.x + 6; h.y = w.y
      run(4)
      expect([h.x, h.y, w.visible]).toEqual([60, 24, true])
    }
  })

  it('reaching the Goal stops every script (course clear)', () => {
    const { rt, of, run } = fresh()
    run(20)
    const h = of('copy_hero'), g = of('copy_goal')
    h.x = g.x; h.y = g.y
    run(6)
    expect(rt.threads().length).toBe(0)
  })
})

describe('Brick templates (templates.ts)', () => {
  it('offers Walker, Coin, Spring, Goal and Empty', () => {
    expect(BRICK_TEMPLATES.map((t) => t.label)).toEqual(['Walker', 'Coin', 'Spring', 'Goal', 'Empty'])
    expect(new Set(BRICK_TEMPLATES.map((t) => t.id)).size).toBe(5)
    for (const t of BRICK_TEMPLATES) expect(t.blurb.length).toBeGreaterThan(0)
  })

  for (const template of BRICK_TEMPLATES) {
    it(`${template.label}: make() gives a fresh valid brick that compiles with zero diagnostics`, () => {
      const { brick, workspace } = template.make('brick_new_1', 'Pip')
      expect([brick.id, brick.name]).toEqual(['brick_new_1', 'Pip'])
      expect(brick.costumes[0]!.asset).toMatch(/^data:image\/png;base64,/)
      const result = compileWorkspace(workspace, { variables: brick.program.variables })
      expect(result.diagnostics).toEqual([])
      expect(result.program.scripts.length).toBe(brick.program.scripts.length)
      // dropping the brick into a level is valid
      const p = createStarterProject()
      const design = { ...p.design, bricks: [...p.design.bricks, brick], copies: [...p.design.copies, { id: 'copy_new', brickId: brick.id, x: 100, y: 100 }] }
      expect(validateDesign(design)).toEqual([])
      // two calls give two independent bricks
      const again = template.make('brick_new_2', 'Pop')
      expect(again.brick).not.toBe(brick)
      expect(again.workspace).not.toBe(workspace)
    })
  }

  it('Walker and Empty differ: Walker has labelled scripts and a speed knob, Empty has none', () => {
    const walker = BRICK_TEMPLATES[0]!.make('w', 'W').brick
    const empty = BRICK_TEMPLATES[4]!.make('e', 'E').brick
    expect(walker.program.scripts).toHaveLength(3)
    expect(walker.program.variables.find((v) => v.id === 'w_speed')?.showInBuild).toBe(true)
    expect(empty.program.scripts).toHaveLength(0)
  })
})
