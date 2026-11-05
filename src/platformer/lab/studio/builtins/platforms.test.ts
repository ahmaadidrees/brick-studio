/**
 * Moving platform and Up-down platform (parity bucket B): classic lifts as bricks. They glide 80 steps and back at 2 a
 * tick (classic 5 tiles at 1 px a frame), the Hero and Walkers standing on them go along, and they reach a level only
 * when a kid picks them in the drawer.
 */
import { describe, expect, it } from 'vitest'
import { SUB } from '@brick-studio/platformer-core/engine/constants'
import { harness } from '@brick-studio/platformer-core/engine/testHarness'
import type { LevelDesign, Target } from '../../core/contracts'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { deterministicStringify } from '../../core/save'
import { HERO_BRICK_ID } from '../hero/heroBrick'
import { createStarterProject, createWalkerBrick } from '../starter'
import { StudioStore } from '../store'
import { drawerEntries, extraEntryId, brickEntryId, categoryForBrick } from '../builder/catalog'
import { canResetBrick, compileBrickEdit, catalogOriginal, restoreBrickOriginal } from '../remix'
import { LIFT_BRICK_ID, PLATFORM_BRICK_ID, PLATFORM_DISTANCE, PLATFORM_SPEED, createMovingPlatformBrick, createUpDownPlatformBrick } from './platforms'
import { freshExtra } from './extras'
import { exportProjectJson, importProjectJson } from '../persist/projectIo'

/** The starter level with a platform added at (x, y), the Hero standing on it, and nothing else in the way. */
function onPlatform(axis: 'x' | 'y', at = { x: 400, y: 200 }): LevelDesign {
  const project = createStarterProject()
  const made = axis === 'x' ? createMovingPlatformBrick() : createUpDownPlatformBrick()
  const d = project.design
  return {
    ...d,
    bricks: [...d.bricks, made.brick],
    copies: [
      ...d.copies.filter((c) => c.brickId !== 'brick_walker').map((c) => (c.brickId === HERO_BRICK_ID ? { ...c, x: at.x, y: at.y + 4 + 8 + 2 } : c)),
      { id: 'copy_lift', brickId: made.brick.id, x: at.x, y: at.y },
    ],
  }
}

const find = (rt: ReturnType<typeof play>, pred: (t: Target) => boolean) => rt.world.targets.find((t) => !t.isClone && pred(t))!

describe('the platforms glide like the classic lifts', () => {
  it('both are valid bricks that compile without problems', () => {
    expect(validateDesign(onPlatform('x'))).toEqual([])
    expect(validateDesign(onPlatform('y'))).toEqual([])
  })

  it('classic: a lift goes 5 tiles and back at 1 px a frame, 80 frames each way', () => {
    const h = harness(['....................', '....................', '..@.................', '..p.................', '....................', '####################'])
    const lift = h.world.entities.find((e) => e.kind === 5)!
    const xs: number[] = []
    for (let f = 0; f < 320; f++) {
      h.step()
      xs.push(lift.x / SUB)
    }
    const span = Math.max(...xs) - Math.min(...xs)
    expect(span).toBe(80)
    // It turns every 80 frames: the far end is reached 80 frames after the near one.
    const far = xs.indexOf(Math.max(...xs))
    const near = xs.indexOf(Math.min(...xs))
    expect(Math.abs(far - near)).toBe(80)
  })

  it('Hackable: the same span and turn, in ticks (2 steps a tick, 40 ticks each way)', () => {
    const rt = play(onPlatform('x'))
    const lift = find(rt, (t) => t.copyId === 'copy_lift')
    const xs: number[] = []
    for (let k = 0; k < 160; k++) {
      rt.step()
      xs.push(lift.x)
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBe(PLATFORM_DISTANCE)
    expect(Math.abs(xs.indexOf(Math.max(...xs)) - xs.indexOf(Math.min(...xs)))).toBe(PLATFORM_DISTANCE / PLATFORM_SPEED)
    // Classic lifts placed with the editor start left.
    expect(xs[5]).toBeLessThan(400)
  })

  it('the classic Hero rides a lift: it moves exactly as the lift does', () => {
    const h = harness(['....................', '....................', '...@................', '...p................', '....................', '####################'])
    const lift = h.world.entities.find((e) => e.kind === 5)!
    for (let f = 0; f < 30; f++) h.step()
    expect(h.p.riding).toBe(lift.id)
    const gap = h.p.x - lift.x
    for (let f = 0; f < 200; f++) {
      h.step()
      expect(h.p.x - lift.x).toBe(gap)
    }
  })

  it('the Hackable Hero rides it the same: same distance to the platform every tick, standing on it', () => {
    const rt = play(onPlatform('x'))
    const lift = find(rt, (t) => t.copyId === 'copy_lift')
    const hero = find(rt, (t) => t.brickId === HERO_BRICK_ID)
    for (let k = 0; k < 15; k++) rt.step()
    expect(hero.body?.onGround).toBe(true)
    const gap = hero.x - lift.x
    let travelled = 0
    for (let k = 0; k < 100; k++) {
      const before = lift.x
      rt.step()
      travelled += Math.abs(lift.x - before)
      expect(hero.x - lift.x, `tick ${k}`).toBeCloseTo(gap, 9)
      expect(hero.body?.onGround, `tick ${k}`).toBe(true)
    }
    expect(travelled).toBe(200)
  })

  it('up and down: the Hero stays standing on top all the way', () => {
    const rt = play(onPlatform('y'))
    const lift = find(rt, (t) => t.copyId === 'copy_lift')
    const hero = find(rt, (t) => t.brickId === HERO_BRICK_ID)
    for (let k = 0; k < 15; k++) rt.step()
    const ys: number[] = []
    for (let k = 0; k < 100; k++) {
      rt.step()
      ys.push(lift.y)
      // Box bottom (y - 8) on the lift's top (y + 4).
      expect(hero.y - 8, `tick ${k}`).toBeCloseTo(lift.y + 4, 9)
      expect(hero.body?.onGround, `tick ${k}`).toBe(true)
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBe(PLATFORM_DISTANCE)
  })

  it('the Hero can jump off an up-down platform and land back on it', () => {
    const rt = play(onPlatform('y'))
    const lift = find(rt, (t) => t.copyId === 'copy_lift')
    const hero = find(rt, (t) => t.brickId === HERO_BRICK_ID)
    for (let k = 0; k < 15; k++) rt.step()
    rt.pressKey('space')
    let rise = 0
    for (let k = 0; k < 6; k++) {
      rt.step()
      rise = Math.max(rise, hero.y - 8 - (lift.y + 4))
    }
    rt.releaseKey('space')
    expect(rise).toBeGreaterThan(20)
    expect(hero.body?.onGround).toBe(false)
    for (let k = 0; k < 40; k++) rt.step()
    expect(hero.y - 8).toBeCloseTo(lift.y + 4, 9)
    expect(hero.body?.onGround).toBe(true)
  })

  it('a Walker standing on it goes along too', () => {
    const d = onPlatform('x')
    const walker = createWalkerBrick('brick_walker', 'Walker', 0)
    const design: LevelDesign = { ...d, bricks: d.bricks.map((b) => (b.id === 'brick_walker' ? walker.brick : b)), copies: [...d.copies.filter((c) => c.brickId !== HERO_BRICK_ID), { id: 'w', brickId: 'brick_walker', x: 410, y: 200 + 4 + 8 }] }
    const rt = play(design)
    const lift = find(rt, (t) => t.copyId === 'copy_lift')
    const w = find(rt, (t) => t.copyId === 'w')
    for (let k = 0; k < 5; k++) rt.step()
    const gap = w.x - lift.x
    for (let k = 0; k < 60; k++) {
      rt.step()
      expect(w.x - lift.x, `tick ${k}`).toBeCloseTo(gap, 9)
    }
  })

  it('the same every run', () => {
    const run = () => {
      const rt = play(onPlatform('y'))
      for (let k = 0; k < 90; k++) rt.step()
      return rt.world.targets.map((t) => [t.id, t.x, t.y])
    }
    expect(run()).toEqual(run())
  })
})

describe('the drawer offers them before the level has them', () => {
  it('Blocks lists Moving platform and Up-down platform as offers, with their hints', () => {
    const entries = drawerEntries(createStarterProject().design.bricks)
    expect(entries.find((e) => e.id === extraEntryId(PLATFORM_BRICK_ID))).toMatchObject({ name: 'Moving platform', category: 'blocks', brick: undefined })
    expect(entries.find((e) => e.id === extraEntryId(LIFT_BRICK_ID))).toMatchObject({ name: 'Up-down platform', category: 'blocks', brick: undefined })
  })

  it('picking one adds it under its catalog id, armed; then the drawer shows that brick', () => {
    const store = new StudioStore(createStarterProject())
    expect(store.addCatalogBrick(PLATFORM_BRICK_ID)).toBe(PLATFORM_BRICK_ID)
    const s = store.getState()
    expect(s.brushBrickId).toBe(PLATFORM_BRICK_ID)
    const brick = s.project.design.bricks.find((b) => b.id === PLATFORM_BRICK_ID)!
    expect(brick.name).toBe('Moving platform')
    expect(categoryForBrick(brick)).toBe('blocks')
    const entries = drawerEntries(s.project.design.bricks)
    expect(entries.find((e) => e.id === brickEntryId(PLATFORM_BRICK_ID))?.brick?.id).toBe(PLATFORM_BRICK_ID)
    expect(entries.some((e) => e.id === extraEntryId(PLATFORM_BRICK_ID))).toBe(false)
    // Picking it again only arms it: still one brick.
    store.addCatalogBrick(PLATFORM_BRICK_ID)
    expect(store.getState().project.design.bricks.filter((b) => b.id === PLATFORM_BRICK_ID)).toHaveLength(1)
  })

  it('it is a built-in brick: untouched it resets to nothing; changed blocks make it "My Moving platform"; Back to the original works', () => {
    const project = createStarterProject()
    const fresh = freshExtra(PLATFORM_BRICK_ID)!
    project.design.bricks.push(fresh.brick)
    project.workspaces[PLATFORM_BRICK_ID] = fresh.workspace
    expect(catalogOriginal(fresh.brick)?.brick.name).toBe('Moving platform')
    expect(canResetBrick(project, PLATFORM_BRICK_ID)).toBe(false)
    const ws = structuredClone(fresh.workspace) as { blocks: { blocks: unknown[] } }
    ws.blocks.blocks = ws.blocks.blocks.slice(1)
    const { project: edited, remixed } = compileBrickEdit(project, PLATFORM_BRICK_ID, ws)
    expect(remixed).toBe('My Moving platform')
    expect(canResetBrick(edited, PLATFORM_BRICK_ID)).toBe(true)
    const back = restoreBrickOriginal(edited, PLATFORM_BRICK_ID)
    expect(back.design.bricks.find((b) => b.id === PLATFORM_BRICK_ID)?.name).toBe('Moving platform')
  })

  it('a project with one saves to a file and opens the same, and plays the same', () => {
    const store = new StudioStore(createStarterProject())
    store.addCatalogBrick(LIFT_BRICK_ID)
    store.addCopy(LIFT_BRICK_ID, 400, 200)
    const project = store.getState().project
    const opened = importProjectJson(exportProjectJson(project))
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(deterministicStringify(opened.project.design)).toBe(deterministicStringify(project.design))
    const a = play(project.design)
    const b = play(opened.project.design)
    for (let k = 0; k < 60; k++) {
      a.step()
      b.step()
    }
    expect(b.world.targets.map((t) => [t.x, t.y])).toEqual(a.world.targets.map((t) => [t.x, t.y]))
  })
})
