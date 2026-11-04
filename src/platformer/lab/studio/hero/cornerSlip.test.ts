/**
 * The ceiling corner nudge (parity bucket B, 2026-11-04; deferred from bucket A). The classic Hero (platformer-core
 * player.ts `rise`, feel.cornerNudge 4 px) slides around the corner of a block it jumps into when the block overlaps
 * it by 4 px or less, and stops under it otherwise. The Hackable Hero does it with "slip past a corner up to (corner
 * slip) steps" in its "move and collide". Both are driven the same way here: stand with the head under a block's
 * corner, overlapping it by k, and jump.
 */
import { describe, expect, it } from 'vitest'
import { SUB } from '@brick-studio/platformer-core/engine/constants'
import { harness } from '@brick-studio/platformer-core/engine/testHarness'
import type { BrickDef, LevelDesign, Target } from '../../core/contracts'
import { compileWorkspace } from '../../core/editor/compile'
import { play } from '../../core/index'
import { costumeFromImage, imageFromRows } from '../pixels'
import { createHeroTestDesign, FLOOR_TOP, HERO_STAND_Y } from './heroLevel'
import { createHeroBrick, HERO_BRICK_ID } from './heroBrick'
import { workspaceFingerprint, EARLIER_HERO_FINGERPRINTS, upgradeUntouchedHero } from '../remix'
import { createStarterProject } from '../starter'
import beforeCornerSlip from './__fixtures__/hero-before-corner-nudge.json'

/** Rows (top to bottom) of the classic level: floor, the start, and one hard block two tiles over the floor. */
const COLS = 20
const BLOCK_COL = 8
function classicRows(): string[] {
  const rows = Array.from({ length: 12 }, () => '.'.repeat(COLS).split(''))
  rows[11] = '#'.repeat(COLS).split('')
  rows[10]![2] = '@'
  // Floor is row 11 (top y 176); the block's bottom is 2 tiles above the floor top: row 8 (y 128..144).
  rows[8]![BLOCK_COL] = 'X'
  return rows.map((r) => r.join(''))
}

interface Outcome {
  /** Got its head above the block's bottom: it slid past instead of stopping. */
  passed: boolean
  /** How far it moved sideways while it rose (it jumps straight up, so only a slide moves it). */
  shift: number
}

/** The classic Hero: its box's right edge `k` px into the block's left side, standing, then a held jump. */
function classic(k: number): Outcome {
  const h = harness(classicRows())
  const blockLeft = BLOCK_COL * 16
  h.p.x = (blockLeft - 12 + k) * SUB
  for (let i = 0; i < 10; i++) h.step()
  const x0 = h.p.x
  let top = Infinity
  for (let i = 0; i < 40; i++) {
    h.step({ jump: true, jumpPressed: i === 0 })
    top = Math.min(top, h.p.y)
  }
  return { passed: top / SUB < 144, shift: (h.p.x - x0) / SUB }
}

function solidBlock(): BrickDef {
  const workspace = { blocks: { blocks: [{ type: 'event_whenflagclicked', id: 'b_flag', next: { block: { type: 'platformer_setsolid', id: 'b_solid', fields: { SOLID: 'on' } } } }] } }
  const art = costumeFromImage('Block', imageFromRows(Array.from({ length: 16 }, () => 'S'.repeat(16)), { S: '#64748b' }), { x: 8, y: 8 })
  return { id: 'brick_block', name: 'Block', costumes: [art], sounds: [], program: compileWorkspace(workspace).program }
}

/** The Hackable Hero the same way: block bottom 32 steps over the floor, the Hero's box right edge `k` into it. */
function hackable(k: number, design: LevelDesign = createHeroTestDesign()): Outcome {
  const blockLeft = 200
  const bottom = FLOOR_TOP + 32
  const d: LevelDesign = {
    ...design,
    bricks: [...design.bricks, solidBlock()],
    copies: [
      ...design.copies.map((c) => (c.brickId === HERO_BRICK_ID ? { ...c, x: blockLeft - 6 + k, y: HERO_STAND_Y } : c)),
      { id: 'copy_block', brickId: 'brick_block', x: blockLeft + 8, y: bottom + 8 },
    ],
  }
  const rt = play(d)
  const hero = (): Target => rt.world.targets.find((t) => t.brickId === HERO_BRICK_ID && !t.isClone)!
  for (let i = 0; i < 5; i++) rt.step()
  const x0 = hero().x
  let top = -Infinity
  rt.pressKey('space')
  for (let i = 0; i < 20; i++) {
    rt.step()
    // The opaque box is 12 x 14, bottom aligned in the 16 x 16 costume: its top is 6 above y.
    top = Math.max(top, hero().y + 6)
  }
  return { passed: top > bottom, shift: hero().x - x0 }
}

describe('ceiling corner nudge, classic vs Hackable', () => {
  it('the classic Hero slides past 1 to 4 px of corner, and stops under 5 or more', () => {
    for (const k of [1, 2, 3, 4]) expect(classic(k), `classic ${k}`).toEqual({ passed: true, shift: -k })
    for (const k of [5, 6, 8]) expect(classic(k), `classic ${k}`).toEqual({ passed: false, shift: 0 })
  })

  it('the Hackable Hero does the same, step for pixel', () => {
    for (const k of [1, 2, 3, 4, 5, 6, 8]) expect(hackable(k), `overlap ${k}`).toEqual(classic(k))
  })

  it('the corner slip slider is the classic 4, and 0 turns the slide off', () => {
    const hero = createHeroBrick().brick
    expect(hero.program.variables.find((v) => v.id === 'corner_slip')).toMatchObject({ name: 'corner slip', value: 4 })
    const design = createHeroTestDesign()
    const off: LevelDesign = {
      ...design,
      bricks: design.bricks.map((b) => (b.id === HERO_BRICK_ID ? { ...b, program: { ...b.program, variables: b.program.variables.map((v) => (v.id === 'corner_slip' ? { ...v, value: 0 } : v)) } } : b)),
    }
    expect(hackable(2, off)).toEqual({ passed: false, shift: 0 })
  })
})

describe('saves from before the corner slip', () => {
  it('the Hero shipped with parity bucket A has a known fingerprint, and upgrades when untouched', () => {
    expect(workspaceFingerprint(beforeCornerSlip.workspace)).toBe('c4c19cce')
    expect(EARLIER_HERO_FINGERPRINTS).toContain('c4c19cce')
    const project = createStarterProject()
    project.workspaces.brick_hero = structuredClone(beforeCornerSlip.workspace)
    const hero = project.design.bricks.find((b) => b.id === HERO_BRICK_ID)!
    hero.program = structuredClone(beforeCornerSlip.program) as unknown as typeof hero.program
    hero.program.variables.find((v) => v.id === 'walk_top')!.value = 5
    const up = upgradeUntouchedHero(project)
    expect(up.workspaces.brick_hero).toEqual(createStarterProject().workspaces.brick_hero)
    const upHero = up.design.bricks.find((b) => b.id === HERO_BRICK_ID)!
    expect(upHero.program.variables.find((v) => v.id === 'walk_top')!.value).toBe(5)
    expect(upHero.program.variables.find((v) => v.id === 'corner_slip')!.value).toBe(4)
  })

  it('a Hero the kid changed keeps its blocks (and no slip)', () => {
    const project = createStarterProject()
    const ws = structuredClone(beforeCornerSlip.workspace) as { blocks: { blocks: unknown[] } }
    ws.blocks.blocks = ws.blocks.blocks.slice(1)
    project.workspaces.brick_hero = ws
    expect(upgradeUntouchedHero(project).workspaces.brick_hero).toBe(ws)
  })
})
