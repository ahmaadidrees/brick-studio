import { describe, expect, it } from 'vitest'
import { TILE_CHAR, TILE_SIZE, type BrickDef } from '../core/contracts'
import { instantiate, validateDesign } from '../core/project'
import { compileWorkspace } from '../core/editor/compile'
import {
  createStarterProject,
  createStarterTiles,
  GROUND_TOP,
  STARTER_COINS,
  STARTER_COLS,
  STARTER_GAP_COLS,
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
    it('uses only allowed tile characters', () => {
      const allowed = new Set(['.', ...Object.values(TILE_CHAR)])
      for (const row of tiles.data) for (const ch of row) expect(allowed.has(ch)).toBe(true)
    })
  })

  describe('scripts are labelled and built from My Blocks', () => {
    it('every top script has a one-line label: a Blockly block comment on its hat or definition', () => {
      const p = project()
      for (const [id, ws] of Object.entries(p.workspaces)) {
        const tops = topBlocks(ws)
        expect(tops.length, id).toBeGreaterThan(0)
        for (const t of tops) {
          const text = ((t.icons as Json | undefined)?.comment as Json | undefined)?.text
          expect(typeof text, `${id}: ${String(t.type)}`).toBe('string')
          expect((text as string).length, `${id}: ${String(t.type)}`).toBeGreaterThan(0)
          expect(((t.icons as Json).comment as Json).pinned).toBe(false)
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

    it('Hero keeps its program and gains handlers for boing, stomped, hero hurt and touching tile [spikes]', () => {
      const hero = brickOf(project(), 'brick_hero')
      const received = hero.program.scripts.filter((s) => s.hat.opcode === 'event_whenbroadcastreceived').map((s) => s.hat.fields.BROADCAST_OPTION)
      expect(received).toEqual(['boing', 'stomped', 'hero hurt'])
      const ops = walkOpcodes(project().workspaces.brick_hero)
      expect(ops.get('platformer_touchingtile')).toEqual({ TILE: 'spikes' })
      // its own feel scripts are all still there
      const names = hero.program.procedures.map((x) => x.proccode)
      expect(names).toEqual(['read keys', 'feel the wall', 'walk', 'run meter', 'jump', 'fall', 'hit a wall'])
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
  it.todo('Hero lands on the ground tile: after 20 ticks its box bottom is exactly 16 and onGround is true on each of the next 30 ticks (center y 24)')
  it.todo('Hero is stopped by the hard block at column 6: walking right from x 60... the Hero box is a plain solid bump, its box right edge rests at x 96 (the block spans 96..112)')
  it.todo('Walker (speed 4, copy_walker_fast) turns at a tile wall: it walks left to the hard block at column 6 and stops with center x exactly 119 (box left 112), then walks right to the block at column 15 and stops at center x 233 (box right 240); vx takes only the values -4 and 4 after the first turn, y stays 24')
  it.todo('Walker (speed 2, copy_walker_slow) turns between columns 31 and 39: center x stays within 519..617 (box between 512 and 624), vx is only -2 or 2')
  it.todo('Walker knobs: after 15 ticks the speed 4 Walker moves exactly 4 steps per tick and the speed 2 Walker exactly 2')
  it.todo('spikes send the Hero to the start: set copy_hero to x 736, y 100 and run; within 4 ticks of touching the spikes (box bottom below y 16) it is at x 60, y 24 with x speed 0')
  it.todo('the gap is just a drop: the Hero dropped at x 344 (col 21) lands on the level floor, box bottom 0, onGround true, and can jump out (peak 62)')
  it.todo('the spring launches: put the Hero on the Spring (x 776, y 24); within 3 ticks "boing" is broadcast and the Hero y speed is 14 (before its own gravity of 1.5 per tick), so it rises more than 62 above its start')
  it.todo('a stomped Walker disappears: Hero above it (y > Walker y + 6) touching: stomped is broadcast, the Walker is hidden and the Hero y speed is 8')
  it.todo('a Walker hurts the Hero from the side: Hero level with the Walker touching it: hero hurt is broadcast and the Hero is at x 60, y 24 two ticks later')
  it.todo('the coin counts: put the Hero on Coin 1 (x 208, y 80); within 3 ticks Coin 1 is hidden, Stage variable coins is exactly 1 and Coins 2 to 5 are still visible')
  it.todo('the Goal ends the level: put the Hero on the Goal (x 920, y 32); "course clear" is broadcast, the Goal says "Course clear!" and every script stops (stop all)')
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
