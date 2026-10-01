import { describe, expect, it } from 'vitest'
import { play } from '../core/index'
import { targetBounds } from '../core/geometry'
import { instantiate, validateDesign } from '../core/project'
import { compileWorkspace } from '../core/editor/compile'
import { isHatOpcode } from '../core/editor/definitions'
import {
  createStarterProject,
  GROUND_TOP,
  STARTER_COINS,
  STARTER_GROUND_XS,
  STARTER_PLATFORMS,
} from './starter'
import { STAGE_ID } from './store'

const brickOf = (project: ReturnType<typeof createStarterProject>, id: string) => {
  const brick = project.design.bricks.find((b) => b.id === id)
  expect(brick, `brick ${id}`).toBeDefined()
  return brick!
}

describe('Starter platformer level (starter.ts)', () => {
  it('validates with validateDesign with zero problems', () => {
    expect(validateDesign(createStarterProject().design)).toEqual([])
  })

  it('compiles every starter workspace with no error diagnostics', () => {
    const project = createStarterProject()
    for (const [brickId, workspace] of Object.entries(project.workspaces)) {
      const brick = brickId === STAGE_ID ? project.design.stage : brickOf(project, brickId)
      const result = compileWorkspace(workspace, { variables: brick.program.variables, lists: brick.program.lists })
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
      // Before the editor lane registers the platformer_whenbump hat, the compiler reports it as a
      // disconnected block (a warning). Nothing else may warn.
      const unexpected = result.diagnostics.filter((d) => !(d.code === 'block.disconnected' && !isHatOpcode('platformer_whenbump')))
      expect(unexpected).toEqual([])
    }
  })

  it('has Ground, Platform, Hero, Walker and Coin with pixel-art costumes', () => {
    const project = createStarterProject()
    expect(project.design.bricks.map((b) => b.name)).toEqual(['Ground', 'Platform', 'Hero', 'Walker', 'Coin'])
    expect(project.design.bounds).toEqual({ left: 0, right: 960, bottom: 0, top: 360 })
    for (const brick of project.design.bricks) {
      expect(brick.costumes.length).toBeGreaterThan(0)
      expect(brick.costumes[0]!.asset).toMatch(/^data:image\/png;base64,/)
    }
    expect(brickOf(project, 'brick_ground').costumes[0]).toMatchObject({ width: 128, height: 16 })
    expect(brickOf(project, 'brick_platform').costumes[0]).toMatchObject({ width: 64, height: 16 })
    expect(brickOf(project, 'brick_hero').costumes.length).toBeGreaterThan(0)
  })

  it('uses the Platformer blocks as real workspace JSON (opcodes and fields from the block table)', () => {
    const project = createStarterProject()
    const opcodes = (id: string) => {
      const found = new Map<string, Record<string, unknown>>()
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk)
        if (!node || typeof node !== 'object') return
        const rec = node as Record<string, unknown>
        if (typeof rec.type === 'string') found.set(rec.type, (rec.fields as Record<string, unknown>) ?? {})
        Object.values(rec).forEach(walk)
      }
      walk(project.workspaces[id])
      return found
    }
    expect(opcodes('brick_ground').get('platformer_setsolid')).toEqual({ SOLID: 'on' })
    expect(opcodes('brick_platform').get('platformer_setsolid')).toEqual({ SOLID: 'on' })
    // The Hero does its own y-speed math, so it turns platformer gravity off (studio/hero, STEP5.md).
    const hero = opcodes('brick_hero')
    expect(hero.get('platformer_setgravity')).toEqual({ GRAVITY: 'off' })
    expect(hero.get('platformer_setspeed')).toBeDefined()
    expect(hero.has('platformer_onground')).toBe(true)
    expect(hero.get('sensing_keypressed')).toBeDefined()
    const walker = opcodes('brick_walker')
    expect(walker.get('platformer_setgravity')).toEqual({ GRAVITY: 'on' })
    expect(walker.get('platformer_whenbump')).toEqual({ SIDE: 'right', BRICK: '_any_' })
    expect(opcodes('brick_coin').get('sensing_touchingobject')).toEqual({ TOUCHINGOBJECTMENU: 'Hero' })
    // Scratch blocks keep their Scratch names: no Platformer block stands in for move/touching.
    expect(opcodes('brick_coin').has('platformer_touching')).toBe(false)
  })

  it('compiles the Walker bump hats once the editor registers them', () => {
    const walker = brickOf(createStarterProject(), 'brick_walker')
    const hats = walker.program.scripts.map((s) => s.hat.opcode)
    expect(hats).toContain('event_whenflagclicked')
    if (isHatOpcode('platformer_whenbump')) {
      expect(walker.program.scripts.filter((s) => s.hat.opcode === 'platformer_whenbump').map((s) => s.hat.fields)).toEqual([
        { SIDE: 'left', BRICK: '_any_' },
        { SIDE: 'right', BRICK: '_any_' },
      ])
    }
  })

  it('paints the Walker twice with different speed knob values', () => {
    const project = createStarterProject()
    const walker = brickOf(project, 'brick_walker')
    expect(walker.program.variables.find((v) => v.id === 'walker_speed')).toMatchObject({ name: 'speed', showInBuild: true })
    const copies = project.design.copies.filter((c) => c.brickId === 'brick_walker')
    expect(copies.map((c) => c.knobs)).toEqual([{ walker_speed: 2 }, { walker_speed: 4 }])
    const world = instantiate(project.design)
    const speeds = world.targets.filter((t) => t.brickId === 'brick_walker').map((t) => t.variables.walker_speed)
    expect(speeds.sort()).toEqual([2, 4])
  })

  it('lays the level out inside the bounds, with the Hero above the Ground', () => {
    const project = createStarterProject()
    const { copies, bounds } = project.design
    for (const copy of copies) {
      expect(copy.x).toBeGreaterThanOrEqual(bounds.left)
      expect(copy.x).toBeLessThanOrEqual(bounds.right)
      expect(copy.y).toBeGreaterThanOrEqual(bounds.bottom)
      expect(copy.y).toBeLessThanOrEqual(bounds.top)
    }
    // Ground tiles are 128 wide and cover x = 0..960 with no gap.
    const spans = STARTER_GROUND_XS.map((x) => [x - 64, x + 64]).sort((a, b) => a[0]! - b[0]!)
    expect(spans[0]![0]).toBe(0)
    expect(spans[spans.length - 1]![1]).toBe(960)
    for (let i = 1; i < spans.length; i++) expect(spans[i]![0]).toBeLessThanOrEqual(spans[i - 1]![1]!)
    const hero = copies.find((c) => c.id === 'copy_hero')!
    expect(hero.y - 8).toBeGreaterThan(GROUND_TOP)
    expect(copies.filter((c) => c.brickId === 'brick_coin')).toHaveLength(STARTER_COINS.length)
    // Each raised platform top is at most 48 above the last, so a jump (about 66 high) reaches it.
    const tops = STARTER_PLATFORMS.slice(0, 4).map((p) => p.y + 8)
    expect(tops).toEqual([64, 112, 160, 112])
  })

  it('instantiates into a valid World', () => {
    const world = instantiate(createStarterProject().design)
    expect(world.targets.filter((t) => t.brickId === 'brick_ground')).toHaveLength(8)
    expect(world.targets.filter((t) => t.brickId === 'brick_platform')).toHaveLength(6)
    expect(world.targets.filter((t) => t.brickId === 'brick_coin')).toHaveLength(5)
  })

  // Play expectations for the integrator. Turn these into real tests once the physics lane is merged:
  // play(createStarterProject().design, ...) with the green flag, then step N ticks.
  const run = () => {
    const d = createStarterProject().design
    const rt = play(d)
    const of = (copyId: string) => rt.world.targets.find((t) => t.copyId === copyId)!
    return { rt, of }
  }

  it('Hero lands on the Ground: its box bottom rests exactly on the ground top, onGround stays true for 30 ticks', () => {
    const { rt, of } = run()
    for (let i = 0; i < 20; i++) rt.step()
    const h = of('copy_hero')
    for (let i = 0; i < 30; i++) {
      rt.step()
      expect([targetBounds(rt.world, h)!.bottom, h.body?.onGround]).toEqual([GROUND_TOP, true])
    }
  })

  it('Hero walks with momentum: speeds up while "right arrow" is held, then slides to a stop after release', () => {
    const { rt, of } = run()
    for (let i = 0; i < 20; i++) rt.step()
    const h = of('copy_hero')
    const x0 = h.x
    rt.pressKey('right arrow')
    rt.step()
    const firstTick = h.x - x0
    for (let i = 0; i < 29; i++) rt.step()
    const lastTick = h.body!.vx
    expect(firstTick).toBeLessThan(lastTick)
    rt.releaseKey('right arrow')
    rt.step()
    const released = h.x
    for (let i = 0; i < 30; i++) rt.step()
    expect(h.x).toBeGreaterThan(released)
    const stopped = h.x
    rt.step()
    expect(h.x).toBe(stopped)
  })

  it('Hero jumps like the main game: holding "space" from standing peaks exactly 62 above the ground (FEEL.md), then lands', () => {
    const { rt, of } = run()
    for (let i = 0; i < 20; i++) rt.step()
    const h = of('copy_hero')
    const y0 = h.y
    rt.pressKey('space')
    let peak = y0
    for (let i = 0; i < 40; i++) {
      rt.step()
      peak = Math.max(peak, h.y)
    }
    rt.releaseKey('space')
    for (let i = 0; i < 20; i++) rt.step()
    expect(peak - y0).toBe(62)
    expect([h.y, h.body?.onGround]).toEqual([y0, true])
  })

  it('Hero stops at the left wall: holding "left arrow" its visible left edge rests exactly at x 0', () => {
    const { rt, of } = run()
    rt.pressKey('left arrow')
    for (let i = 0; i < 150; i++) rt.step()
    expect(targetBounds(rt.world, of('copy_hero'))!.left).toBe(0)
  })

  it('Walkers turn around when they bump something and never leave y 24', () => {
    const { rt, of } = run()
    const fast = of('copy_walker_fast')
    const slow = of('copy_walker_slow')
    const fastSigns = new Set<number>()
    const slowSigns = new Set<number>()
    for (let i = 0; i < 400; i++) {
      rt.step()
      if (i > 10) {
        expect([fast.y, slow.y]).toEqual([24, 24])
        // A bump zeroes vx; the bump hat sets the new speed on the next tick (STEP3.md step 7), so skip that tick.
        if (fast.body!.vx !== 0) fastSigns.add(Math.sign(fast.body!.vx))
        if (slow.body!.vx !== 0) slowSigns.add(Math.sign(slow.body!.vx))
      }
    }
    expect([...fastSigns].sort()).toEqual([-1, 1])
    expect([...slowSigns].sort()).toEqual([-1, 1])
  })

  it('Walker knobs: the speed 2 Walker moves exactly 2 steps per tick, the speed 4 Walker exactly 4', () => {
    const { rt, of } = run()
    for (let i = 0; i < 15; i++) rt.step()
    const fast = of('copy_walker_fast')
    const slow = of('copy_walker_slow')
    const [f0, s0] = [fast.x, slow.x]
    rt.step()
    expect([Math.abs(fast.x - f0), Math.abs(slow.x - s0)]).toEqual([4, 2])
  })

  it('Coin hides when the Hero touches it; the other Coins stay visible', () => {
    const { rt, of } = run()
    for (let i = 0; i < 15; i++) rt.step()
    const j = of('copy_hero')
    const coin = of('copy_coin_1')
    j.x = coin.x
    j.y = coin.y
    j.body!.gravity = false
    rt.step()
    rt.step()
    expect(coin.visible).toBe(false)
    expect(['copy_coin_2', 'copy_coin_3', 'copy_coin_4', 'copy_coin_5'].map((id) => of(id).visible)).toEqual([true, true, true, true])
  })
})
