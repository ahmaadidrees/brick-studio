import { beforeAll, describe, expect, it } from 'vitest'
import { createPartMap } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { ROVER_IDS, roverBricks } from './fixtures'
import { deriveMechanisms } from './mechanism'
import { snapDraftToConnector } from './snap'

/**
 * Connector snapping produces exactly the poses the rover fixture uses, so a part
 * snapped by the pointer is one the mechanism reader recognises as connected.
 */
let partMap: ReturnType<typeof createPartMap>
beforeAll(() => {
  installRoboticsParts(true)
  partMap = createPartMap([])
})

const plateSize = 64
const byId = (bricks: BrickInstance[], id: string) => bricks.find((brick) => brick.id === id)!
const snap = (bricks: BrickInstance[], partId: string, hitId: string, hitPoint = { x: 0, y: 0, z: 0 }) =>
  snapDraftToConnector({ draft: { partId }, hitBrick: byId(bricks, hitId), hitPoint, bricks, partMap, plateSize })

describe('an axle', () => {
  it('snaps into a motor socket, wherever on the motor the pointer is', () => {
    const bricks = roverBricks().filter((brick) => brick.id !== ROVER_IDS.leftAxle && brick.id !== ROVER_IDS.leftWheel)
    const expected = byId(roverBricks(), ROVER_IDS.leftAxle)
    expect(snap(bricks, ROBOTICS_PART_IDS.axleShort, ROVER_IDS.leftMotor)).toEqual({ x: expected.x, y: expected.y, z: expected.z, rotation: expected.rotation })
    expect(snap(bricks, ROBOTICS_PART_IDS.axleShort, ROVER_IDS.leftMotor, { x: 9, y: 9, z: 9 })).toEqual({ x: expected.x, y: expected.y, z: expected.z, rotation: expected.rotation })
    // The pose is what the reader recognises: the axle is in the socket.
    const placed = [...bricks, { ...expected, id: 'new-axle' }]
    expect(deriveMechanisms(placed, partMap, plateSize).motorById.get(ROVER_IDS.leftMotor)?.axleId).toBe('new-axle')
  })

  it('snaps into the mirrored motor (socket facing +X) too, and a long axle reaches further out', () => {
    const bricks = roverBricks().filter((brick) => brick.id !== ROVER_IDS.rightAxle && brick.id !== ROVER_IDS.rightWheel)
    const expected = byId(roverBricks(), ROVER_IDS.rightAxle)
    expect(snap(bricks, ROBOTICS_PART_IDS.axleShort, ROVER_IDS.rightMotor)).toEqual({ x: expected.x, y: expected.y, z: expected.z, rotation: expected.rotation })
    expect(snap(bricks, ROBOTICS_PART_IDS.axleLong, ROVER_IDS.rightMotor)).toEqual({ x: expected.x, y: expected.y, z: expected.z, rotation: 0 })
  })

  it('lies along Z for a motor turned a quarter turn', () => {
    const bricks: BrickInstance[] = [
      { id: 'plate', partId: 'plate_6x8', x: 28, y: 0, z: 26, rotation: 0, color: '#3e83d7' },
      { id: 'motor', partId: ROBOTICS_PART_IDS.motor, x: 29, y: 1, z: 27, rotation: 1, color: '#52636c' },
    ]
    const pose = snap(bricks, ROBOTICS_PART_IDS.axleShort, 'motor')
    expect(pose).not.toBeNull()
    expect(pose!.rotation).toBe(1)
    const placed = [...bricks, { ...pose!, id: 'axle', partId: ROBOTICS_PART_IDS.axleShort, color: '#000' }]
    expect(deriveMechanisms(placed, partMap, plateSize).motorById.get('motor')?.axleId).toBe('axle')
  })

  it('does not snap into an occupied socket, and never answers for a motor on the ground (the axle would go below the plate)', () => {
    expect(snap(roverBricks(), ROBOTICS_PART_IDS.axleShort, ROVER_IDS.leftMotor)).toBeNull()
    const grounded: BrickInstance[] = [{ id: 'motor', partId: ROBOTICS_PART_IDS.motor, x: 30, y: 0, z: 30, rotation: 0, color: '#52636c' }]
    expect(snap(grounded, ROBOTICS_PART_IDS.axleShort, 'motor')).toBeNull()
  })

  it('never goes through the hole of a loose wheel: a wheel on an axle with no motor cannot spin (kid-UX lane W)', () => {
    const wheel: BrickInstance = { id: 'wheel', partId: ROBOTICS_PART_IDS.wheel, x: 30, y: 0, z: 30, rotation: 0, color: '#1f2a33' }
    const mechanisms = deriveMechanisms([wheel], partMap, plateSize)
    const link = mechanisms.wheelById.get('wheel')!
    expect(snap([wheel], ROBOTICS_PART_IDS.axleShort, 'wheel', { x: link.center.x + 1, y: link.center.y, z: link.center.z })).toBeNull()
    expect(snap([wheel], ROBOTICS_PART_IDS.axleShort, 'wheel', { x: link.center.x - 1, y: link.center.y, z: link.center.z })).toBeNull()
  })
})

describe('a wheel', () => {
  it('snaps onto the free end of the axle under the pointer', () => {
    const bricks = roverBricks().filter((brick) => brick.id !== ROVER_IDS.leftWheel)
    const expected = byId(roverBricks(), ROVER_IDS.leftWheel)
    expect(snap(bricks, ROBOTICS_PART_IDS.wheel, ROVER_IDS.leftAxle)).toEqual({ x: expected.x, y: expected.y, z: expected.z, rotation: expected.rotation })
    const placed = [...bricks, { ...expected, id: 'new-wheel' }]
    expect(deriveMechanisms(placed, partMap, plateSize).wheelById.get('new-wheel')?.axleId).toBe(ROVER_IDS.leftAxle)
  })

  it('snaps onto the axle in the motor under the pointer', () => {
    const bricks = roverBricks().filter((brick) => brick.id !== ROVER_IDS.rightWheel)
    const expected = byId(roverBricks(), ROVER_IDS.rightWheel)
    expect(snap(bricks, ROBOTICS_PART_IDS.wheel, ROVER_IDS.rightMotor)).toEqual({ x: expected.x, y: expected.y, z: expected.z, rotation: expected.rotation })
  })

  it('has nowhere to go on an axle whose ends are taken, or on a motor with no axle', () => {
    expect(snap(roverBricks(), ROBOTICS_PART_IDS.wheel, ROVER_IDS.leftAxle)).toBeNull()
    const bare = roverBricks().filter((brick) => brick.id !== ROVER_IDS.leftAxle && brick.id !== ROVER_IDS.leftWheel)
    expect(snap(bare, ROBOTICS_PART_IDS.wheel, ROVER_IDS.leftMotor)).toBeNull()
  })

  it('picks the free end nearest the pointer on a loose axle', () => {
    const axle: BrickInstance = { id: 'axle', partId: ROBOTICS_PART_IDS.axleLong, x: 30, y: 0, z: 30, rotation: 0, color: '#000' }
    const link = deriveMechanisms([axle], partMap, plateSize).axleById.get('axle')!
    const near0 = snap([axle], ROBOTICS_PART_IDS.wheel, 'axle', link.ends[0].point)
    const near1 = snap([axle], ROBOTICS_PART_IDS.wheel, 'axle', link.ends[1].point)
    expect(near0).toEqual({ x: 29, y: 0, z: 29, rotation: 0 })
    expect(near1).toEqual({ x: 34, y: 0, z: 29, rotation: 0 })
  })
})

describe('anything else', () => {
  it('a stock brick or a hub never snaps; an axle over a robot with every socket full has nowhere to go', () => {
    const bricks = roverBricks()
    expect(snap(bricks, 'brick_2x4', ROVER_IDS.leftMotor)).toBeNull()
    expect(snap(bricks, ROBOTICS_PART_IDS.hub, ROVER_IDS.plate, { x: -1.2, y: 0.18, z: -0.6 })).toBeNull()
    expect(snap(bricks, ROBOTICS_PART_IDS.axleShort, ROVER_IDS.hub)).toBeNull()
    expect(snap(bricks, ROBOTICS_PART_IDS.axleShort, ROVER_IDS.plate)).toBeNull()
  })

  it('a motor over a full robot has no room on its plate, so it does not snap from the ground either', () => {
    // Over the left axle (a part that cannot carry it), next to the finished rover: every edge spot is taken.
    expect(snap(roverBricks(), ROBOTICS_PART_IDS.motor, ROVER_IDS.leftAxle)).toBeNull()
  })
})
