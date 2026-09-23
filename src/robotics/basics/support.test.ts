import { beforeAll, describe, expect, it } from 'vitest'
import type { BrickInstance } from '../../brick/types'
import { installRoboticsParts } from '../parts/install'
import { REFUSAL_TEXT, blockersOf, handleOffset, isConnectorPart, isFloating, refusalText, restOffsets, restingFall, restingOnText, settlePieces } from './support'

beforeAll(() => installRoboticsParts(true))

const at = (id: string, partId: string, x: number, y: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): BrickInstance => ({ id, partId, x, y, z, rotation, color: '#fff' })
// A 6 × 8 plate at the corner (28, 26) with a 2 × 2 brick standing on it at (28, 27).
const plate = at('plate', 'plate_6x8', 28, 0, 26)
const brick2x2 = at('b22', 'brick_2x2', 28, 1, 27)
const build = [plate, brick2x2]

describe('parts sit on something', () => {
  it('a part over the plate rests on the plate; beside it, on the ground', () => {
    expect(restingFall([at('m', 'robo_motor', 30, 1, 30)], build)).toBe(0)
    // Leo's motor: at height 6 over nothing but the plate, it would fall 5 plates onto it.
    expect(restingFall([at('m', 'robo_motor', 30, 6, 30)], build)).toBe(5)
    expect(restingFall([at('m', 'robo_motor', 20, 6, 20)], build)).toBe(6)
    expect(isFloating([at('m', 'robo_motor', 30, 6, 30)], build)).toBe(true)
  })

  it('settles onto the highest top under any of its studs, never into it', () => {
    // Half over the 2 × 2 (top 4), half over the plate (top 1): it rests on the 2 × 2.
    const [settled] = settlePieces([at('p', 'plate_2x4', 29, 9, 27, 1)], build)
    expect(settled.y).toBe(4)
    // Aimed at the side of the 2 × 2 at height 2, a 1 × 1 beside it drops to the plate, not hanging at 2.
    expect(settlePieces([at('p', 'brick_1x1', 30, 2, 27)], build)[0].y).toBe(1)
  })

  it('a rigid group falls until its first piece lands', () => {
    const group = [at('a', 'brick_2x2', 28, 8, 27), at('b', 'brick_2x2', 40, 6, 40)]
    // The first piece meets the 2 × 2 top (4) after 4 plates; the second would need 6 to reach the ground.
    expect(restingFall(group, build)).toBe(4)
    expect(settlePieces(group, build).map((piece) => piece.y)).toEqual([4, 2])
  })

  it('a step up of one plate lets an arrow climb onto a plate but not onto a brick', () => {
    // From the ground beside the plate, pushed onto its edge.
    expect(settlePieces([at('m', 'brick_2x2', 27, 0, 30)], [plate], undefined, 1)[0].y).toBe(1)
    // Into the 2 × 2 (3 plates taller): it stays at the plate and overlaps, so it is in the way.
    const pushed = settlePieces([at('m', 'brick_1x1', 29, 1, 28)], build, undefined, 1)
    expect(pushed[0].y).toBe(1)
    expect(blockersOf(pushed, build).ids).toEqual(['b22'])
  })

  it('says what is in the way and when a part leaves the plate', () => {
    expect(blockersOf([at('m', 'brick_2x2', 29, 1, 28)], build)).toEqual({ offPlate: false, ids: ['b22'] })
    expect(blockersOf([at('m', 'brick_2x2', 63, 0, 10)], build, 64)).toEqual({ offPlate: true, ids: [] })
    expect(refusalText({ offPlate: true, ids: ['b22'] })).toBe(REFUSAL_TEXT.offPlate)
    expect(refusalText({ offPlate: false, ids: ['b22'] })).toBe(REFUSAL_TEXT.inTheWay)
    expect(refusalText({ offPlate: false, ids: [] })).toBeNull()
    for (const text of Object.values(REFUSAL_TEXT)) expect(text.split(/\s+/).length).toBeLessThanOrEqual(9)
  })

  it('finds the heights a part can sit at in its column', () => {
    // A 1 × 1 on the plate beside a 2 × 2 has nowhere else to sit in its own column.
    expect(restOffsets([at('p', 'brick_1x1', 31, 1, 28)], build)).toEqual([0])
    // Floating over the 2 × 2 at 9: it can come down to the 2 × 2's top (5 lower).
    expect(restOffsets([at('p', 'brick_1x1', 28, 9, 27)], build)).toEqual([-5])
    // Under a bridge (a plate at 6 on two pillars) it can sit on the ground or on the bridge.
    const bridge = [at('l', 'pillar_1x1', 10, 0, 10), at('r', 'pillar_1x1', 13, 0, 10), at('top', 'plate_2x4', 10, 9, 10, 1)]
    expect(restOffsets([at('p', 'brick_1x1', 12, 0, 10)], bridge)).toEqual([0, 10])
  })

  it('the height handle lands on the highest resting height at or below the pull', () => {
    expect(handleOffset(3, [0])).toBe(0)
    expect(handleOffset(12, [0, 10])).toBe(10)
    expect(handleOffset(-4, [-5, 0])).toBe(-5)
    expect(handleOffset(-9, [-5, 0])).toBe(-5)
    expect(handleOffset(2, [])).toBeNull()
  })

  it('names what a part rests on, for the top view', () => {
    expect(restingOnText([at('p', 'brick_1x1', 31, 1, 30)], build)).toBe('On the plate')
    expect(restingOnText([at('p', 'brick_1x1', 20, 0, 20)], build)).toBe('On the ground')
    expect(restingOnText([at('p', 'brick_1x1', 28, 4, 27)], build)).toBe('On a brick')
    expect(restingOnText([at('p', 'brick_1x1', 28, 9, 27)], build)).toBe('In the air')
    expect(restingOnText([at('p', 'brick_1x1', 30, 7, 30)], [...build, at('m', 'robo_motor', 30, 1, 30)])).toBe('On the motor')
  })

  it('axles and wheels are held by what they connect to', () => {
    expect(isConnectorPart('robo_axle_short')).toBe(true)
    expect(isConnectorPart('robo_wheel')).toBe(true)
    expect(isConnectorPart('robo_motor')).toBe(false)
    expect(isConnectorPart('brick_2x4')).toBe(false)
  })
})
