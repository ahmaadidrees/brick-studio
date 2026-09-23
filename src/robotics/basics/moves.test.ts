import { beforeAll, describe, expect, it } from 'vitest'
import type { BrickInstance } from '../../brick/types'
import { installRoboticsParts } from '../parts/install'
import { kidNudge, kidRefusal } from './moves'
import { REFUSAL_TEXT } from './support'

beforeAll(() => installRoboticsParts(true))

const at = (id: string, partId: string, x: number, y: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): BrickInstance => ({ id, partId, x, y, z, rotation, color: '#fff' })
const plate = at('plate', 'plate_6x8', 28, 0, 26)
const hub = at('hub', 'robo_hub', 29, 1, 27)
const robot = [plate, hub]

describe('arrows and Raise/Lower never leave a part in the air', () => {
  it('an arrow off the plate edge drops the motor to the ground; back again it steps up onto the plate', () => {
    // On the plate's right edge (it overhangs one stud); one more stud and nothing is under it.
    const motor = at('m', 'robo_motor', 33, 1, 31)
    const off = kidNudge([motor], robot, 1, 0, 0)
    expect(off).toEqual({ ok: true, offset: [1, -1, 0] })
    const onGround = { ...motor, x: 34, y: 0 }
    expect(kidNudge([onGround], robot, -1, 0, 0)).toEqual({ ok: true, offset: [-1, 1, 0] })
  })

  it('Leo: a motor floating at height 6 beside the robot, nudged left, settles instead of refusing', () => {
    const floating = at('m', 'robo_motor', 33, 6, 32)
    const result = kidNudge([floating], robot, -1, 0, 0)
    expect(result?.ok).toBe(true)
    if (result?.ok) expect(floating.y + result.offset[1]).toBe(1)
  })

  it('an arrow into something taller says what is in the way', () => {
    const motor = at('m', 'robo_motor', 26, 1, 27)
    const result = kidNudge([motor], robot, 1, 0, 0)
    expect(result).toEqual({ ok: false, text: REFUSAL_TEXT.inTheWay, ids: ['hub'] })
    expect(kidNudge([at('m', 'robo_motor', 61, 0, 10)], robot, 1, 0, 0)).toEqual({ ok: false, text: REFUSAL_TEXT.offPlate, ids: [] })
  })

  it('Raise has nothing to sit on up there; Lower is already as low as it goes, and shows what it sits on', () => {
    const motor = at('m', 'robo_motor', 31, 1, 31)
    expect(kidNudge([motor], robot, 0, 1, 0)).toEqual({ ok: false, text: REFUSAL_TEXT.cannotFloat, ids: [] })
    expect(kidNudge([motor], robot, 0, -1, 0)).toEqual({ ok: false, text: REFUSAL_TEXT.cannotGoLower, ids: ['plate'] })
  })

  it('Lower brings a floating part down onto what is under it; Raise hops onto a bridge over it', () => {
    expect(kidNudge([at('m', 'robo_motor', 31, 6, 31)], robot, 0, -1, 0)).toEqual({ ok: true, offset: [0, -5, 0] })
    const bridge = [at('l', 'pillar_1x1', 10, 0, 10), at('r', 'pillar_1x1', 13, 0, 10), at('top', 'plate_2x4', 10, 9, 10, 1)]
    expect(kidNudge([at('p', 'brick_1x1', 12, 0, 10)], bridge, 0, 1, 0)).toEqual({ ok: true, offset: [0, 10, 0] })
  })

  it('a whole robot moves as one and settles as one', () => {
    const buggy = [plate, hub, at('m', 'robo_motor', 28, 1, 31, 2)]
    const result = kidNudge(buggy, [], 1, 0, 0)
    expect(result).toEqual({ ok: true, offset: [1, 0, 0] })
  })

  it('a lone axle or wheel keeps the studio nudge (it hangs on what it connects to)', () => {
    expect(kidNudge([at('w', 'robo_wheel', 25, 0, 31)], robot, -1, 0, 0)).toBeNull()
    expect(kidNudge([at('a', 'robo_axle_short', 26, 0, 32)], robot, 0, 1, 0)).toBeNull()
  })

  it('a refused placement names the reason and the bricks in the way', () => {
    expect(kidRefusal([at('d', 'brick_2x2', 30, 1, 28)], robot)).toEqual({ text: REFUSAL_TEXT.inTheWay, ids: ['hub'] })
    expect(kidRefusal([at('d', 'brick_2x2', 63, 0, 28)], robot)).toEqual({ text: REFUSAL_TEXT.offPlate, ids: [] })
  })
})
