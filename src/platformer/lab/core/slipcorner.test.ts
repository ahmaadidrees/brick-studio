/**
 * "slip past a corner up to (n) steps" (parity bucket B): the classic Hero's head corner nudge (platformer-core
 * player.ts `rise`, feel.cornerNudge 4 px) as a general Platformer block. A brick moving itself up into the corner of a
 * solid that overlaps it by n steps or less steps aside and finishes the move; anything more, a level wall, or a move
 * that would hit something else afterwards changes nothing.
 */
import { describe, expect, it } from 'vitest'
import type { BrickDef, Expr, LevelDesign, Script, Stmt, Target } from './contracts'
import { play } from './index'
import { validateDesign } from './project'

const lit = (value: number | string): Expr => ({ kind: 'lit', value })
const blk = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}): Expr => ({ kind: 'block', opcode, fields, inputs })
const stmt = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}, branches?: Stmt[][]): Stmt => ({ opcode, fields, inputs, ...(branches ? { branches } : {}) })
const ifThen = (cond: Expr, then: Stmt[]) => stmt('control_if', {}, { CONDITION: cond }, [then])
let sid = 0
const hat = (opcode: Script['hat']['opcode'], body: Stmt[], fields: Record<string, string> = {}): Script => ({ id: `s${sid++}`, hat: { opcode, fields, inputs: {} }, body })
const box = (id: string, name: string, w: number, h: number, scripts: Script[], variables: BrickDef['program']['variables'] = []): BrickDef => ({
  id, name, costumes: [{ name: 'c', width: w, height: h, rotationCenterX: w / 2, rotationCenterY: h / 2 }], sounds: [], program: { scripts, procedures: [], variables, lists: [] },
})

/**
 * A 12 x 14 mover that moves itself by (dx, dy) once, on the first tick, then slips if `slip` is set. It counts its bumps
 * ("tell what I hit" runs only when it still hit something) in `bumps`.
 */
function mover(axis: 'x' | 'y', by: number, slip: number | null): BrickDef {
  return box('m', 'Mover', 12, 14, [
    hat('event_whenflagclicked', [
      stmt('platformer_setmover', { MOVER: 'self' }),
      stmt('platformer_moveuntilhit', { AXIS: axis }, { DISTANCE: lit(by) }),
      ...(slip === null ? [] : [stmt('platformer_slipcorner', {}, { STEPS: lit(slip) })]),
      ifThen(blk('platformer_hitsomething'), [stmt('platformer_tellhit'), stmt('data_setvariableto', { VARIABLE: 'm_hit' }, { VALUE: lit(1) })]),
    ]),
  ], [{ id: 'm_hit', name: 'hit', value: 0 }])
}

const solid = (id: string, w: number, h: number) => box(id, `Solid ${id}`, w, h, [hat('event_whenflagclicked', [stmt('platformer_setsolid', { SOLID: 'on' })])])

function level(m: BrickDef, at: { x: number; y: number }, solids: Array<{ id: string; x: number; y: number; w?: number; h?: number }>): LevelDesign {
  return {
    id: 'lvl', name: 'Slip', seed: 1, bounds: { left: 0, right: 480, bottom: 0, top: 360 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks: [m, ...solids.map((s) => solid(s.id, s.w ?? 16, s.h ?? 16))],
    copies: [{ id: 'cm', brickId: 'm', x: at.x, y: at.y }, ...solids.map((s) => ({ id: `c_${s.id}`, brickId: s.id, x: s.x, y: s.y }))],
  }
}

/** Mover at x 100 (box 94..106), y 100 (box 93..107). A 16 x 16 block whose box starts `overlap` steps inside its right side, above it. */
function rise(overlap: number, slip: number | null, extra: Array<{ id: string; x: number; y: number }> = []) {
  // The block's left edge is at 106 - overlap; its centre 8 further. Its bottom is at 120 (centre 128).
  const design = level(mover('y', 20, slip), { x: 100, y: 100 }, [{ id: 'a', x: 106 - overlap + 8, y: 128 }, ...extra])
  expect(validateDesign(design)).toEqual([])
  const rt = play(design)
  rt.step()
  const m = rt.world.targets.find((t) => t.copyId === 'cm') as Target
  return { x: m.x, y: m.y, hit: m.variables.m_hit }
}

describe('slip past a corner', () => {
  it('without the block, moving up into a corner stops flush under it', () => {
    expect(rise(3, null)).toEqual({ x: 100, y: 113, hit: 1 })
  })

  it('a corner overlapping 1 to 4 steps: slides aside by the overlap and finishes the move, no bump', () => {
    for (const overlap of [1, 2, 3, 4]) expect(rise(overlap, 4), `overlap ${overlap}`).toEqual({ x: 100 - overlap, y: 120, hit: 0 })
  })

  it('more overlap than allowed: stops as before', () => {
    expect(rise(5, 4)).toEqual({ x: 100, y: 113, hit: 1 })
    expect(rise(3, 2)).toEqual({ x: 100, y: 113, hit: 1 })
    expect(rise(3, 0)).toEqual({ x: 100, y: 113, hit: 1 })
  })

  it('a corner on the left side slides right', () => {
    const design = level(mover('y', 20, 4), { x: 100, y: 100 }, [{ id: 'a', x: 94 + 2 - 8, y: 128 }])
    const rt = play(design)
    rt.step()
    const m = rt.world.targets.find((t) => t.copyId === 'cm') as Target
    expect([m.x, m.y, m.variables.m_hit]).toEqual([102, 120, 0])
  })

  it('both corners solid (a ceiling): no slip', () => {
    // A second block just left of the first: sliding left runs into it.
    expect(rise(3, 4, [{ id: 'b', x: 106 - 3 + 8 - 16, y: 128 }])).toEqual({ x: 100, y: 113, hit: 1 })
  })

  it('the rest of the move hitting something else: no slip', () => {
    // A block 4 steps higher, over where the slip would go: the rest of the move runs into it.
    expect(rise(3, 4, [{ id: 'b', x: 97 - 8, y: 124 + 8 }])).toEqual({ x: 100, y: 113, hit: 1 })
  })

  it('a level wall is never slipped past', () => {
    const design = level(mover('x', -20, 4), { x: 10, y: 100 }, [])
    const rt = play(design)
    rt.step()
    const m = rt.world.targets.find((t) => t.copyId === 'cm') as Target
    expect([m.x, m.variables.m_hit]).toEqual([6, 1])
  })

  it('sideways it steps up and over a low ledge (the same block, across the other axis)', () => {
    // Moving right into a block whose top is 3 steps above the mover's bottom (93): it steps up 3 and goes on.
    const design = level(mover('x', 20, 4), { x: 100, y: 100 }, [{ id: 'a', x: 106 + 4 + 8, y: 96 - 8 }])
    const rt = play(design)
    rt.step()
    const m = rt.world.targets.find((t) => t.copyId === 'cm') as Target
    expect([m.x, m.y, m.variables.m_hit]).toEqual([120, 103, 0])
  })

  it('the same every run (no randomness, no clock)', () => {
    const a = rise(2, 4)
    const b = rise(2, 4)
    expect(a).toEqual(b)
  })
})
