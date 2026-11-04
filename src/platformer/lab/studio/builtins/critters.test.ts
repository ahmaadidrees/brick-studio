/**
 * Spiky, Flyer and Shellbug (parity bucket B): the classic critters as bricks. Their numbers are measured on the classic
 * engine (platformer-core world.ts, driven through its test harness) and on the Hackable bricks, side by side.
 */
import { describe, expect, it } from 'vitest'
import { SUB } from '@brick-studio/platformer-core/engine/constants'
import { harness } from '@brick-studio/platformer-core/engine/testHarness'
import { EK, ES } from '@brick-studio/platformer-core/engine/world'
import type { LevelDesign, Target } from '../../core/contracts'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { createHeroTestDesign, FLOOR_TOP } from '../hero/heroLevel'
import { HERO_BRICK_ID } from '../hero/heroBrick'
import { createStarterProject } from '../starter'
import { drawerEntries, extraEntryId } from '../builder/catalog'
import { FLYER_BRICK_ID, SHELLBUG_BRICK_ID, SPIKY_BRICK_ID, createFlyerBrick, createShellbugBrick, createSpikyBrick, SHELL_WAKE_TICKS } from './critters'

type Made = ReturnType<typeof createSpikyBrick>
const CRITTER_Y = FLOOR_TOP + 8

/** The Hero's flat test level with one critter; the Hero far to the left unless placed. */
function level(made: Made, at: { x: number; y: number }, hero?: { x: number; y: number }): LevelDesign {
  const d = createHeroTestDesign()
  return {
    ...d,
    bricks: [...d.bricks, made.brick],
    copies: [...d.copies.map((c) => (c.brickId === HERO_BRICK_ID && hero ? { ...c, ...hero } : c)), { id: 'critter', brickId: made.brick.id, x: at.x, y: at.y }],
  }
}

const target = (rt: ReturnType<typeof play>, copyId: string): Target => rt.world.targets.find((t) => t.copyId === copyId && !t.isClone)!
const heroOf = (rt: ReturnType<typeof play>): Target => rt.world.targets.find((t) => t.brickId === HERO_BRICK_ID && !t.isClone)!
const messages = (rt: ReturnType<typeof play>, ticks: number): string[] => {
  const heard: string[] = []
  rt.onBroadcast((m) => heard.push(m))
  for (let k = 0; k < ticks; k++) rt.step()
  return heard
}

/** Classic: one critter of `ch` alone on a floor; returns the harness and the entity. */
function classic(ch: string) {
  const rows = ['........................................', '........................................', '..........' + ch + '.............................', '########################################']
  rows[2] = '@' + rows[2]!.slice(1)
  const h = harness(rows)
  return { h, e: () => h.world.entities.find((x) => x.kind !== EK.PLATFORM)! }
}

describe('the three critters are valid bricks', () => {
  it('compile and play in a level, and the drawer offers them under Critters', () => {
    for (const make of [createSpikyBrick, createFlyerBrick, createShellbugBrick]) expect(validateDesign(level(make(), { x: 300, y: CRITTER_Y }))).toEqual([])
    const entries = drawerEntries(createStarterProject().design.bricks)
    for (const [id, name] of [[SHELLBUG_BRICK_ID, 'Shellbug'], [FLYER_BRICK_ID, 'Flyer'], [SPIKY_BRICK_ID, 'Spiky']]) {
      expect(entries.find((e) => e.id === extraEntryId(id!))).toMatchObject({ name, category: 'critters' })
    }
    // The starter's own bricks keep their places: the new ones come after them.
    expect(entries.filter((e) => e.category === 'critters').map((e) => e.name)).toEqual(['Walker', 'Shellbug', 'Flyer', 'Spiky'])
    expect(entries.findIndex((e) => e.name === 'Goal')).toBeLessThan(entries.findIndex((e) => e.name === 'Moving platform'))
  })
})

describe('Spiky', () => {
  it('walks at the classic speed: 0.5 px a frame is 30 a second, 1 step a tick', () => {
    const c = classic('s')
    for (let f = 0; f < 10; f++) c.h.step()
    const x0 = c.e().x
    for (let f = 0; f < 60; f++) c.h.step()
    const classicPerSecond = Math.abs(c.e().x - x0) / SUB
    const rt = play(level(createSpikyBrick(), { x: 600, y: CRITTER_Y }))
    for (let k = 0; k < 5; k++) rt.step()
    const x1 = target(rt, 'critter').x
    for (let k = 0; k < 30; k++) rt.step()
    expect(Math.abs(target(rt, 'critter').x - x1)).toBe(classicPerSecond)
    expect(target(rt, 'critter').x).toBeLessThan(x1)
  })

  it('can\'t be stomped: landing on it hurts the Hero', () => {
    const rt = play(level(createSpikyBrick(), { x: 300, y: CRITTER_Y }, { x: 300, y: 80 }))
    const heard = messages(rt, 20)
    expect(heard).toContain('hero hurt')
    expect(heard).not.toContain('stomped')
    expect(target(rt, 'critter').visible).toBe(true)
  })
})

describe('Flyer', () => {
  it('bobs exactly like the classic Flyer: 25 either side of home, 160 frames (80 ticks) a bob, tick for frame', () => {
    const c = classic('f')
    const y0 = c.e().y
    const classicUp: number[] = []
    for (let f = 1; f <= 400; f++) {
      c.h.step()
      if (f % 2 === 0) classicUp.push(-(c.e().y - y0) / SUB)
    }
    const rt = play(level(createFlyerBrick(), { x: 300, y: 120 }))
    const fly = target(rt, 'critter')
    const ours: number[] = []
    for (let k = 0; k < 200; k++) {
      rt.step()
      ours.push(fly.y - 120)
    }
    expect(Math.max(...classicUp)).toBe(25)
    expect(Math.min(...classicUp)).toBe(-25)
    // Tick k lands where the classic Flyer is after frame 2k: the same numbers, exactly.
    // (Classic says -0 at home on the way down; 0 and -0 are the same height.)
    expect(ours).toEqual(classicUp.map((v) => v + 0))
  })

  it('stomped: loses its wings, drops to the floor and walks; stomped again, it is gone', () => {
    const rt = play(level(createFlyerBrick(), { x: 300, y: 40 }, { x: 300, y: 100 }))
    const heard = messages(rt, 12)
    expect(heard).toContain('stomped')
    const fly = target(rt, 'critter')
    expect(fly.variables[`${FLYER_BRICK_ID}_wings`]).toBe(0)
    for (let k = 0; k < 30; k++) rt.step()
    expect(fly.y).toBe(CRITTER_Y)
    expect(fly.body?.onGround).toBe(true)
    const x = fly.x
    for (let k = 0; k < 10; k++) rt.step()
    expect(fly.x).not.toBe(x)
  })
})

describe('Shellbug', () => {
  it('classic numbers: a kicked shell slides 3 px a frame; a resting shell wakes after 510 frames', () => {
    const c = classic('k')
    for (let f = 0; f < 5; f++) c.h.step()
    const e = c.e()
    e.state = ES.SLIDING
    e.dir = 1
    const x0 = e.x
    c.h.step()
    expect((e.x - x0) / SUB).toBe(3)
    e.state = ES.SHELL
    e.timer = 0
    let frames = 0
    while (e.state === ES.SHELL && frames < 1000) {
      c.h.step()
      frames++
    }
    expect(frames).toBe(510)
    expect(SHELL_WAKE_TICKS * 2).toBe(510)
  })

  function stompedShell() {
    // The Hero drops onto the Shellbug, then is put out of the way so it doesn't land on the shell again (that kicks it).
    const rt = play(level(createShellbugBrick(), { x: 300, y: CRITTER_Y }, { x: 300, y: 70 }))
    const heard: string[] = []
    rt.onBroadcast((m) => heard.push(m))
    for (let k = 0; k < 30 && !heard.includes('stomped'); k++) rt.step()
    rt.step()
    heroOf(rt).x = 100
    return { rt, heard, bug: target(rt, 'critter') }
  }

  it('stomped: the Hero bounces and the Shellbug hides in its shell and stops', () => {
    const { heard, bug } = stompedShell()
    expect(heard).toContain('stomped')
    expect(heard).not.toContain('hero hurt')
    expect(bug.variables[`${SHELLBUG_BRICK_ID}_state`]).toBe(1)
    expect(bug.body?.vx).toBe(0)
    expect(bug.costumeIndex).toBe(2)
  })

  it('touched from the side, the shell slides away at 6 steps a tick (classic 3 px a frame), without hurting the Hero', () => {
    const { rt, bug } = stompedShell()
    for (let k = 0; k < 40; k++) rt.step()
    const hero = heroOf(rt)
    // Walk into the shell from the left.
    hero.x = bug.x - 14
    hero.y = CRITTER_Y
    rt.pressKey('right arrow')
    const heard = messages(rt, 8)
    rt.releaseKey('right arrow')
    expect(heard).not.toContain('hero hurt')
    expect(bug.variables[`${SHELLBUG_BRICK_ID}_state`]).toBe(2)
    const x0 = bug.x
    rt.step()
    expect(bug.x - x0).toBe(6)
  })

  it('a sliding shell hurts the Hero it runs into, and a resting one wakes up and walks after 255 ticks', () => {
    const { rt, bug } = stompedShell()
    const hero = heroOf(rt)
    for (let k = 0; k < 40; k++) rt.step()
    // Kick it right, then put the Hero in its way.
    hero.x = bug.x - 14
    rt.pressKey('right arrow')
    for (let k = 0; k < 3; k++) rt.step()
    rt.releaseKey('right arrow')
    for (let k = 0; k < 10; k++) rt.step()
    hero.x = bug.x + 40
    hero.y = CRITTER_Y
    expect(messages(rt, 15)).toContain('hero hurt')

    const rest = stompedShell()
    let ticks = 0
    while (rest.bug.variables[`${SHELLBUG_BRICK_ID}_state`] === 1 && ticks < 400) {
      rest.rt.step()
      ticks++
    }
    // Awake 255 ticks of resting after it hid (the first resting tick is the one it hid on, give or take one).
    expect(Math.abs(ticks - SHELL_WAKE_TICKS)).toBeLessThanOrEqual(2)
    const x = rest.bug.x
    for (let k = 0; k < 10; k++) rest.rt.step()
    expect(rest.bug.x).not.toBe(x)
  })

  it('the same every run', () => {
    const run = () => {
      const { rt } = stompedShell()
      for (let k = 0; k < 100; k++) rt.step()
      return rt.world.targets.map((t) => [t.id, t.x, t.y, t.costumeIndex])
    }
    expect(run()).toEqual(run())
  })
})

describe('costumes stand on one line', () => {
  it('every costume of a critter has its lowest painted row 8 steps below the brick\'s y, so changing costume never sinks it', () => {
    for (const make of [createSpikyBrick, createFlyerBrick, createShellbugBrick]) {
      for (const c of make().brick.costumes) expect(c.opaque!.bottom - c.rotationCenterY, `${make().brick.name} ${c.name}`).toBe(8)
    }
  })

  it('a Shellbug that wakes from its shell on the ground stays on the ground', () => {
    const rt = play(level(createShellbugBrick(), { x: 300, y: CRITTER_Y }, { x: 300, y: 70 }))
    const bug = target(rt, 'critter')
    for (let k = 0; k < 30 && bug.variables[`${SHELLBUG_BRICK_ID}_state`] !== 1; k++) rt.step()
    rt.step()
    heroOf(rt).x = 100
    expect(bug.variables[`${SHELLBUG_BRICK_ID}_state`]).toBe(1)
    for (let k = 0; k < SHELL_WAKE_TICKS + 40; k++) rt.step()
    expect(bug.variables[`${SHELLBUG_BRICK_ID}_state`]).toBe(0)
    expect(bug.y).toBe(CRITTER_Y)
  })
})
