import { beforeAll, describe, expect, it } from 'vitest'
import { PLATE_HEIGHT, STUD, createPartMap } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { deriveCreations } from './creations'
import { ROVER_IDS, fixtureInput, roverBricks } from './fixtures'
import { GAP_TEXT, gapMarkers } from './nearMiss'
import { BARE_GROUND_TEXT, motorsOnBareGround, placementAdvice } from './placementAdvice'
import { emptyRoboticsSection, type RoboticsSection } from './section'

/**
 * A near miss never looks right, and a device that landed where it cannot work says so
 * (docs/robotics/KID-UX.md §S): which parts get a red gap marker, and the one line a
 * student reads after placing a device beside a robot or a motor on the bare ground.
 */
let partMap: ReturnType<typeof createPartMap>
beforeAll(() => {
  installRoboticsParts(true)
  partMap = createPartMap([])
})

const plateSize = 64
const world = (x: number, y: number, z: number) => ({ x: (x - plateSize / 2) * STUD, y: y * PLATE_HEIGHT, z: (z - plateSize / 2) * STUD })
const brick = (id: string, partId: string, x: number, y: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): BrickInstance => ({ id, partId, x, y, z, rotation, color: '#52636c' })
const gaps = (bricks: BrickInstance[]) => gapMarkers(bricks, partMap, plateSize)

describe('gap markers (near misses)', () => {
  it('a finished rover has none', () => {
    expect(gaps(roverBricks())).toEqual([])
  })

  it('a wheel a stud off its axle end gets one, from its hole to the end', () => {
    const [marker, ...rest] = gaps(roverBricks({ leftWheelOff: true }))
    expect(rest).toEqual([])
    expect(marker).toMatchObject({ key: `wheel:${ROVER_IDS.leftWheel}`, kind: 'wheel-axle', brickId: ROVER_IDS.leftWheel, targetId: ROVER_IDS.leftAxle, text: GAP_TEXT.wheel })
    expect(marker.at.x).toBeCloseTo(world(25, 4, 32.5).x)
    expect(marker.to.x).toBeCloseTo(world(26, 4, 32.5).x)
    expect(marker.at.y).toBeCloseTo(world(0, 4, 0).y)
  })

  it('an axle on the ground in front of a motor on the ground looks inserted but is not: the motor is one plate too low', () => {
    // The lead's reproduction: the rod points into the ring, one plate above the socket.
    const bricks = [brick('motor', ROBOTICS_PART_IDS.motor, 30, 0, 30), brick('axle', ROBOTICS_PART_IDS.axleShort, 33, 0, 31)]
    const [marker, ...rest] = gaps(bricks)
    expect(rest).toEqual([])
    expect(marker).toMatchObject({ kind: 'axle-socket', brickId: 'axle', targetId: 'motor', text: GAP_TEXT.motorTooLow })
    expect(marker.at.y - marker.to.y).toBeCloseTo(PLATE_HEIGHT)
  })

  it('an axle a stud short of a socket on a plate gets one that says to push it in', () => {
    const bricks = [...roverBricks().filter((candidate) => candidate.id !== ROVER_IDS.leftAxle && candidate.id !== ROVER_IDS.leftWheel), brick('short', ROBOTICS_PART_IDS.axleShort, 25, 0, 32)]
    expect(gaps(bricks)).toMatchObject([{ kind: 'axle-socket', brickId: 'short', targetId: ROVER_IDS.leftMotor, text: GAP_TEXT.axle }])
  })

  it('a part well away from any connector, or one pointing away, gets none', () => {
    const bare = roverBricks().filter((candidate) => candidate.id !== ROVER_IDS.leftAxle && candidate.id !== ROVER_IDS.leftWheel)
    expect(gaps([...bare, brick('far', ROBOTICS_PART_IDS.axleShort, 22, 0, 32)])).toEqual([])
    expect(gaps([...bare, brick('across', ROBOTICS_PART_IDS.axleShort, 26, 0, 35, 1)])).toEqual([])
    expect(gaps([...roverBricks().filter((candidate) => candidate.id !== ROVER_IDS.leftWheel), brick('far-wheel', ROBOTICS_PART_IDS.wheel, 21, 0, 31)])).toEqual([])
  })

  it('goes away once the part is fixed', () => {
    const off = roverBricks({ leftWheelOff: true })
    expect(gaps(off)).toHaveLength(1)
    const fixed = off.map((candidate) => (candidate.id === ROVER_IDS.leftWheel ? { ...candidate, x: 25 } : candidate))
    expect(gaps(fixed)).toEqual([])
  })
})

describe('placement advice', () => {
  /** Buggy: a plate and a hub, named. */
  const buggy = (): { bricks: BrickInstance[]; section: RoboticsSection } => ({
    bricks: [brick('plate', 'plate_6x8', 28, 0, 26), brick('hub', ROBOTICS_PART_IDS.hub, 29, 1, 27)],
    section: { ...emptyRoboticsSection(), creations: [{ id: 'buggy', name: 'Buggy', anchorBrickIds: ['plate', 'hub'] }] },
  })
  const adviceFor = (bricks: BrickInstance[], section: RoboticsSection, id: string) => {
    const input = fixtureInput(bricks, section)
    return placementAdvice(input, deriveCreations(input), id)
  }

  // Kid-UX lane W: "This motor isn't on Buggy yet." and a one-tap fix that puts it on, where it works.
  it('a motor on the ground beside Buggy names the robot and the one tap that puts it on its side', () => {
    const { bricks, section } = buggy()
    expect(adviceFor([...bricks, brick('motor', ROBOTICS_PART_IDS.motor, 35, 0, 30)], section, 'motor')).toMatchObject({
      kind: 'not-attached', brickId: 'motor', creationId: 'buggy', text: "This motor isn't on Buggy yet.", needsPlate: false,
      // The nearest spot on the plate's side with room for its axle: the right edge behind the hub, facing out.
      fix: { ok: true, label: 'Put it on Buggy', steps: [{ op: 'move', brickId: 'motor', pose: { x: 31, y: 1, z: 31, rotation: 0 } }] },
    })
  })

  it('with no room left on the plate it says so, and what would help', () => {
    // The finished rover: both side spots, the front and the back of its plate are taken.
    const section: RoboticsSection = { ...emptyRoboticsSection(), creations: [{ id: 'rover', name: 'Buggy', anchorBrickIds: [ROVER_IDS.plate, ROVER_IDS.hub] }] }
    const advice = adviceFor([...roverBricks(), brick('extra', ROBOTICS_PART_IDS.motor, 30, 0, 37)], section, 'extra')
    expect(advice?.text).toBe("This motor isn't on Buggy yet. There's no room for it on Buggy. Try a bigger plate.")
    expect(advice?.kind === 'not-attached' && advice.fix?.ok).toBe(false)
  })

  it('a sensor or a light beside it says the same, and goes on top; one on it says nothing', () => {
    const { bricks, section } = buggy()
    const eyes = adviceFor([...bricks, brick('eyes', ROBOTICS_PART_IDS.distanceSensor, 30, 0, 23)], section, 'eyes')
    expect(eyes).toMatchObject({ text: "This sensor isn't on Buggy yet.", fix: { ok: true, label: 'Put it on Buggy', steps: [{ op: 'move', brickId: 'eyes', pose: { x: 30, y: 1, z: 26, rotation: 0 } }] } })
    expect(adviceFor([...bricks, brick('lamp', ROBOTICS_PART_IDS.light, 30, 1, 32)], section, 'lamp')).toBeNull()
  })

  it('a seat beside it: "This seat isn\'t on Buggy yet." and Put it on top (Ava); a seat on it says nothing', () => {
    const { bricks, section } = buggy()
    expect(adviceFor([...bricks, brick('seat', ROBOTICS_PART_IDS.seat, 30, 0, 23)], section, 'seat')).toMatchObject({ kind: 'not-attached', text: "This seat isn't on Buggy yet.", fix: { ok: true, label: 'Put it on top', steps: [{ op: 'move', brickId: 'seat', pose: { y: 7 } }] } })
    expect(adviceFor([...bricks, brick('seat', ROBOTICS_PART_IDS.seat, 30, 7, 28)], section, 'seat')).toBeNull()
  })

  it('a motor on the bare ground with no robot near says why it cannot take a wheel', () => {
    const { bricks, section } = buggy()
    expect(adviceFor([...bricks, brick('motor', ROBOTICS_PART_IDS.motor, 10, 0, 10)], section, 'motor')).toEqual({ kind: 'bare-ground', brickId: 'motor', text: BARE_GROUND_TEXT })
    expect(BARE_GROUND_TEXT).toBe('Put motors on a plate so wheels reach the ground')
  })

  it('a device whose own bricks carry a hub is a robot of its own; a hub is never "not attached"', () => {
    const { bricks, section } = buggy()
    const ownRobot = [...bricks, brick('base', 'plate_2x4', 36, 0, 27), brick('hub2', ROBOTICS_PART_IDS.hub, 36, 1, 27, 1), brick('lamp', ROBOTICS_PART_IDS.light, 37, 7, 28)]
    expect(adviceFor(ownRobot, section, 'lamp')).toBeNull()
    expect(adviceFor([...bricks, brick('hub2', ROBOTICS_PART_IDS.hub, 35, 0, 27)], section, 'hub2')).toBeNull()
  })

  it('beside a robot with no plate: a motor needs a plate for both, anything else goes on top of it', () => {
    const section: RoboticsSection = { ...emptyRoboticsSection(), creations: [{ id: 'post', name: 'Post', anchorBrickIds: ['hub'] }] }
    const hub = brick('hub', ROBOTICS_PART_IDS.hub, 30, 0, 30)
    expect(adviceFor([hub, brick('motor', ROBOTICS_PART_IDS.motor, 35, 0, 30)], section, 'motor')).toMatchObject({ text: "This motor isn't on Post yet. Put them both on a plate.", fix: null, needsPlate: true })
    expect(adviceFor([hub, brick('lamp', ROBOTICS_PART_IDS.light, 35, 0, 30)], section, 'lamp')).toMatchObject({ text: "This light isn't on Post yet.", fix: { ok: true, steps: [{ op: 'move', brickId: 'lamp', pose: { x: 33, y: 6, z: 30 } }] } })
  })

  it('more than a few studs away it is not "beside" the robot', () => {
    const { bricks, section } = buggy()
    expect(adviceFor([...bricks, brick('lamp', ROBOTICS_PART_IDS.light, 40, 0, 30)], section, 'lamp')).toBeNull()
  })

  it('lists the motors standing on the bare ground', () => {
    const bricks = [...roverBricks(), brick('grounded', ROBOTICS_PART_IDS.motor, 10, 0, 10)]
    expect(motorsOnBareGround(bricks)).toEqual(['grounded'])
  })
})
