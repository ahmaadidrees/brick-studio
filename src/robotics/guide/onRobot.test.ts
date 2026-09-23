import { beforeAll, describe, expect, it } from 'vitest'
import type { BrickInstance } from '../../brick/types'
import { deriveCreations } from '../model/creations'
import { ROVER_IDS, fixtureInput, roverBricks } from '../model/fixtures'
import { emptyRoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { attachSpot, onARobot } from './onRobot'

beforeAll(() => installRoboticsParts(true))

/**
 * Where an idea's part goes on its robot (lane P): the highest free spot where it rests on the
 * robot's own bricks and joins it, nearest the middle first; nowhere when the top is full.
 */
const R = ROVER_IDS
const brick = (id: string, partId: string, x: number, y: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): BrickInstance => ({ id, partId, x, y, z, rotation, color: '#e7473c' })
const inputOf = (bricks: BrickInstance[]) => fixtureInput(bricks, { ...emptyRoboticsSection(), creations: [{ id: 'robot', name: 'Buggy', anchorBrickIds: [R.hub] }] })
const seat = { partId: ROBOTICS_PART_IDS.seat, rotation: 0 as const, color: '#3e83d7' }

describe('attachSpot', () => {
  it('a seat on a Buggy: on the hub’s top (the highest, most middle spot), and there it joins the robot', () => {
    const input = inputOf(roverBricks())
    const spot = attachSpot(input, 'robot', seat)!
    expect(spot).not.toBeNull()
    // The hub (4 × 4 at 29,1,27, six plates tall) is the robot's top: the seat stands on it.
    expect(spot.y).toBe(7)
    expect(spot.x).toBeGreaterThanOrEqual(29)
    expect(spot.x + 2).toBeLessThanOrEqual(33)
    const placed = brick('seat', seat.partId, spot.x, spot.y, spot.z)
    expect(deriveCreations(inputOf([...roverBricks(), placed]))[0].seats).toEqual(['seat'])
  })

  it('with a tower of bricks on the hub, the seat goes on the tower’s top (the highest free spot)', () => {
    const tower = [brick('t1', 'brick_2x2', 30, 7, 28), brick('t2', 'brick_2x2', 30, 10, 28), brick('t3', 'brick_2x2', 30, 13, 28)]
    const spot = attachSpot(inputOf([...roverBricks(), ...tower]), 'robot', seat)!
    // On top of the third brick (y 13, three plates tall), over its 2 × 2 top.
    expect(spot.y).toBe(16)
    expect(spot.x < 32 && spot.x + 2 > 30 && spot.z < 30 && spot.z + 2 > 28).toBe(true)
  })

  it('a light goes on the top too; a part with no room anywhere on the robot has no spot', () => {
    const light = { partId: ROBOTICS_PART_IDS.light, rotation: 0 as const, color: '#e7473c' }
    expect(attachSpot(inputOf(roverBricks()), 'robot', light)?.y).toBe(7)
    expect(attachSpot(inputOf(roverBricks()), 'nobody', light)).toBeNull()
  })

  it('onARobot: a brick studded to a robot is on it; one on the ground beside it is not', () => {
    const on = brick('on', 'brick_2x2', 29, 7, 27)
    const off = brick('off', 'brick_2x2', 10, 0, 10)
    const input = inputOf([...roverBricks(), on, off])
    expect(onARobot(input, 'on')).toBe(true)
    expect(onARobot(input, 'off')).toBe(false)
  })
})
