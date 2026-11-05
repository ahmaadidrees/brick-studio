/**
 * A move that crosses two solids' faces in one tick stops at the first face it meets: moving up, the lowest bottom;
 * moving down, the highest top. Before parity bucket B (2026-11-04) the up/down sweep kept the farther face, so a fast
 * brick could end up inside the nearer solid. Left and right always met the nearer face.
 */
import { describe, expect, it } from 'vitest'
import type { BrickDef, Expr, LevelDesign, Script, Stmt, Target } from './contracts'
import { play } from './index'

const lit = (value: number): Expr => ({ kind: 'lit', value })
const stmt = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}): Stmt => ({ opcode, fields, inputs })
const flag = (body: Stmt[]): Script => ({ id: `s_${body.map((s) => s.opcode).join('_')}`, hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body })
const box = (id: string, w: number, h: number, body: Stmt[]): BrickDef => ({
  id, name: id, costumes: [{ name: 'c', width: w, height: h, rotationCenterX: w / 2, rotationCenterY: h / 2 }], sounds: [], program: { scripts: [flag(body)], procedures: [], variables: [], lists: [] },
})

/** A 12 x 14 mover at (100, 100) and two 16 x 16 solids at the given centres, both overlapping its column. */
function level(move: Stmt[], solids: Array<[number, number]>): LevelDesign {
  return {
    id: 'lvl', name: 'Sweep', seed: 1, bounds: { left: 0, right: 480, bottom: 0, top: 360 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks: [box('m', 12, 14, move), box('s', 16, 16, [stmt('platformer_setsolid', { SOLID: 'on' })])],
    copies: [{ id: 'cm', brickId: 'm', x: 100, y: 100 }, ...solids.map(([x, y], i) => ({ id: `s${i}`, brickId: 's', x, y }))],
  }
}

function after(design: LevelDesign): Target {
  const rt = play(design)
  rt.step()
  return rt.world.targets.find((t) => t.copyId === 'cm') as Target
}

// The mover's box is y 93..107. Bottoms at 120 (centre 128) and 124 (centre 132), in two columns that both overlap it.
const above: Array<[number, number]> = [[104, 132], [96, 128]]
// Tops at 80 (centre 72) and 76 (centre 68).
const below: Array<[number, number]> = [[104, 68], [96, 72]]

describe('up and down moves stop at the nearer face', () => {
  it('moving itself up 20: stops under the lower bottom (120)', () => {
    const m = after(level([stmt('platformer_setmover', { MOVER: 'self' }), stmt('platformer_moveuntilhit', { AXIS: 'y' }, { DISTANCE: lit(20) })], above))
    expect(m.y + 7).toBe(120)
  })

  it('moving itself down 20: lands on the higher top (80)', () => {
    const m = after(level([stmt('platformer_setmover', { MOVER: 'self' }), stmt('platformer_moveuntilhit', { AXIS: 'y' }, { DISTANCE: lit(-20) })], below))
    expect(m.y - 7).toBe(80)
  })

  it('moved by the engine (y speed), the same', () => {
    const up = after(level([stmt('platformer_setspeed', { AXIS: 'y' }, { SPEED: lit(20) })], above))
    expect(up.y + 7).toBe(120)
    const down = after(level([stmt('platformer_setspeed', { AXIS: 'y' }, { SPEED: lit(-20) })], below))
    expect(down.y - 7).toBe(80)
  })
})
