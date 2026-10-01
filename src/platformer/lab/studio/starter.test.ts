import { describe, expect, it } from 'vitest'
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

  it('has Ground, Platform, Jumper, Walker and Coin with pixel-art costumes', () => {
    const project = createStarterProject()
    expect(project.design.bricks.map((b) => b.name)).toEqual(['Ground', 'Platform', 'Jumper', 'Walker', 'Coin'])
    expect(project.design.bounds).toEqual({ left: 0, right: 960, bottom: 0, top: 360 })
    for (const brick of project.design.bricks) {
      expect(brick.costumes.length).toBeGreaterThan(0)
      expect(brick.costumes[0]!.asset).toMatch(/^data:image\/png;base64,/)
    }
    expect(brickOf(project, 'brick_ground').costumes[0]).toMatchObject({ width: 128, height: 16 })
    expect(brickOf(project, 'brick_platform').costumes[0]).toMatchObject({ width: 64, height: 16 })
    expect(brickOf(project, 'brick_jumper').costumes[0]).toMatchObject({ width: 16, height: 16 })
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
    const jumper = opcodes('brick_jumper')
    expect(jumper.get('platformer_setgravity')).toEqual({ GRAVITY: 'on' })
    expect(jumper.get('platformer_setspeed')).toBeDefined()
    expect(jumper.has('platformer_onground')).toBe(true)
    expect(jumper.get('sensing_keypressed')).toBeDefined()
    const walker = opcodes('brick_walker')
    expect(walker.get('platformer_setgravity')).toEqual({ GRAVITY: 'on' })
    expect(walker.get('platformer_whenbump')).toEqual({ SIDE: 'right', BRICK: '_any_' })
    expect(opcodes('brick_coin').get('sensing_touchingobject')).toEqual({ TOUCHINGOBJECTMENU: 'Jumper' })
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
    expect(walker.program.variables.find((v) => v.id === 'speed')).toMatchObject({ name: 'speed', showInBuild: true })
    const copies = project.design.copies.filter((c) => c.brickId === 'brick_walker')
    expect(copies.map((c) => c.knobs)).toEqual([{ speed: 2 }, { speed: 4 }])
    const world = instantiate(project.design)
    const speeds = world.targets.filter((t) => t.brickId === 'brick_walker').map((t) => t.variables.speed)
    expect(speeds.sort()).toEqual([2, 4])
  })

  it('lays the level out inside the bounds, with the Jumper above the Ground', () => {
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
    const jumper = copies.find((c) => c.brickId === 'brick_jumper')!
    expect(jumper.y - 8).toBeGreaterThan(GROUND_TOP)
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
  it.todo('Jumper lands on the Ground: starting at y 40, within 10 ticks it rests at y = 24 (ground top 16 + 8), onGround stays true for 30 ticks')
  it.todo('Jumper walks: holding "right arrow" for 10 ticks moves it right by exactly 40 steps; releasing stops it the next tick')
  it.todo('Jumper jumps: with "space" pressed while resting on the Ground, y rises to a peak of 24 + 66 = 90 and returns to exactly y = 24')
  it.todo('Jumper stops at the left wall: holding "left arrow" it rests with its left edge at x = 0 (x = 8)')
  it.todo('Walker (speed 4, from x 150) turns around: it walks right, bumps the left face of the Platform block at x 300 (stops with right edge at x 268, x = 260), then walks left to the level wall and turns again; it never leaves y = 24')
  it.todo('Walker (speed 2, from x 560) moves exactly 2 steps per tick, and is slower than the speed 4 Walker over the same ticks')
  it.todo('Coin hides when touched: with the Jumper standing at the Coin (200, 80), that Coin is hidden after the next tick and the other Coins stay visible')
})
