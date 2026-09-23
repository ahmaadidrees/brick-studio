import { describe, expect, it } from 'vitest'
import { STUD } from '../../brick/parts'
import { deriveCreations, type DerivedCreation } from '../model/creations'
import { GATE_IDS, ROVER_IDS, fixtureInput, gateBricks } from '../model/fixtures'
import { disconnect } from '../model/control'
import { emptyRoboticsSection, type RoboticsSection } from '../model/section'
import { axisAngleQuat } from '../model/vec'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { createProgram } from '../program/programs'
import { starterFor } from '../program/starters'
import { isControllerTrigger } from '../program/types'
import { RIDE_CREATION_ID, SEAT_ID, seatedRoverBricks, seatedRoverSection } from './rideFixtures'
import {
  HOP_OFF_RINGS_STUDS, RIDE_REACH_STUDS, RIDE_SIDE_REACH_STUDS, RIDER_STANDING_Y, SEAT_PAN_HEIGHT, chooseRideProgram, footprintDistance, footprintInWorld, hopOffPoints, localFootprint, rideCandidates, rideReach,
  rideProgramKey, ridePrompt, riderPosition, rideStatus, seatInWorld, seatMountAtBuild, seatReach, yawOf, type RidePromptInput,
} from './rideModel'

// Installed at load: some describe blocks derive the build while they are collected.
installRoboticsParts(true)

const derive = (bricks = seatedRoverBricks(), section: RoboticsSection = seatedRoverSection()) => {
  const input = fixtureInput(bricks, section)
  return { input, creations: deriveCreations(input), section }
}
const rover = (section: RoboticsSection = seatedRoverSection()): DerivedCreation => derive(seatedRoverBricks(), section).creations[0]

function withStarter(section: RoboticsSection, starterId: 'joystick-drive' | 'stop-before-wall', name?: string): RoboticsSection {
  const creation = rover(section)
  const result = createProgram(section, creation, starterFor(creation, starterId)!, { name })
  if (!result.ok) throw new Error(result.reason)
  return result.section
}

describe('which creations can be ridden', () => {
  it('a saved creation with a seat, a drive pair and a plugged drive motor is rideable', () => {
    const { creations, section } = derive()
    expect(creations[0].seats).toEqual([SEAT_ID])
    expect(creations[0].drivePair).not.toBeNull()
    const [candidate] = rideCandidates(creations, section)
    expect(candidate).toMatchObject({ creationId: RIDE_CREATION_ID, name: 'Mars buggy', status: 'rideable', seatIds: [SEAT_ID], program: { source: 'starter', name: 'Joystick drive' } })
  })

  it('a creation without a seat is not a candidate at all', () => {
    const bricks = seatedRoverBricks().filter((brick) => brick.id !== SEAT_ID)
    const { creations, section } = derive(bricks)
    expect(rideCandidates(creations, section)).toEqual([])
  })

  it('says why a seat cannot be ridden: no drive pair, or no drive motor plugged in', () => {
    // A gate with a seat on its sill: a hinge motor, no drive pair.
    const gate = [...gateBricks(), { id: 'gate-seat', partId: ROBOTICS_PART_IDS.seat, x: 24, y: 1, z: 25, rotation: 0 as const, color: '#3e83d7' }]
    const gateSection = { ...emptyRoboticsSection(), creations: [{ id: 'gate', name: 'Castle gate', anchorBrickIds: [GATE_IDS.hinge] }], connections: [{ deviceId: GATE_IDS.hinge, hubId: GATE_IDS.hub, port: 'A' as const }] }
    const gateCreations = deriveCreations(fixtureInput(gate, gateSection))
    expect(gateCreations[0].seats).toEqual(['gate-seat'])
    expect(rideCandidates(gateCreations, gateSection)[0]).toMatchObject({ status: 'no-drive-pair', program: null })

    let unplugged = seatedRoverSection()
    unplugged = disconnect(disconnect(unplugged, ROVER_IDS.leftMotor), ROVER_IDS.rightMotor)
    expect(rideStatus(rover(unplugged))).toBe('unplugged')
    // One drive motor unplugged still rides (it turns in circles: one of the five failures, not a refusal).
    expect(rideStatus(rover(disconnect(seatedRoverSection(), ROVER_IDS.leftMotor)))).toBe('rideable')
  })
})

describe('the program a ride runs', () => {
  it('no programs: a Joystick drive program compiled on the fly, never saved', () => {
    const section = seatedRoverSection()
    const choice = chooseRideProgram(section, rover(section))!
    expect(choice).toMatchObject({ source: 'starter', name: 'Joystick drive', programId: null })
    expect(choice.ir.scripts.some((script) => isControllerTrigger(script.trigger))).toBe(true)
    expect(section.programs).toEqual([])
  })

  it('an active program without a controller script is passed over for the starter', () => {
    const section = withStarter(seatedRoverSection(), 'stop-before-wall')
    expect(section.programs).toHaveLength(1)
    expect(chooseRideProgram(section, rover(section))).toMatchObject({ source: 'starter', programId: null })
  })

  it('the active program when it reads the joystick', () => {
    const section = withStarter(seatedRoverSection(), 'joystick-drive', 'My driving')
    const choice = chooseRideProgram(section, rover(section))!
    expect(choice).toMatchObject({ source: 'saved', name: 'My driving', programId: section.programs[0].id })
  })

  it('another saved controller program of the creation before a fresh starter', () => {
    // Made in this order, the stop-before-wall program is the active one (the last made).
    const section = withStarter(withStarter(seatedRoverSection(), 'joystick-drive', 'Slow driving'), 'stop-before-wall')
    const active = section.creations[0].activeProgramId
    expect(section.programs.find((program) => program.id === active)?.starter).toBe('stop-before-wall')
    expect(chooseRideProgram(section, rover(section))).toMatchObject({ source: 'saved', name: 'Slow driving' })
  })

  it('a controller program that does not compile is skipped and named', () => {
    const section = withStarter(seatedRoverSection(), 'joystick-drive', 'Broken')
    const broken = { ...section, programs: [{ ...section.programs[0], workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'robo_when_joystick_moves', id: 'hat', x: 0, y: 0, next: { block: { type: 'robo_wait', id: 'wait', inputs: { SECONDS: { shadow: { type: 'robo_number', id: 'n', fields: { NUM: 1 } } } } } } }] } } }] }
    const choice = chooseRideProgram(broken, rover(broken))!
    expect(choice.source).toBe('starter')
    expect(choice.skipped).toEqual(['Broken'])
  })

  it('no drive pair: nothing to ride with', () => {
    const creation = { ...rover(), drivePair: null }
    expect(chooseRideProgram(seatedRoverSection(), creation)).toBeNull()
  })
})

describe('keys while riding', () => {
  it('the Explore movement keys follow the keyboard setting; Space is space', () => {
    for (const [key, expected] of [['w', 'up'], ['ArrowUp', 'up'], ['s', 'down'], ['ArrowDown', 'down'], ['a', 'left'], ['ArrowLeft', 'left'], ['d', 'right'], ['ArrowRight', 'right'], [' ', 'space'], ['e', null], ['Shift', null]] as const) {
      expect(rideProgramKey({ key }, 'standard')).toBe(expected)
    }
    expect(rideProgramKey({ key: 'ArrowUp' }, 'arrow-camera')).toBeNull()
    expect(rideProgramKey({ key: 'w' }, 'arrow-camera')).toBe('up')
    expect(rideProgramKey({ key: 'w' }, 'wasd-camera')).toBeNull()
    expect(rideProgramKey({ key: 'ArrowLeft' }, 'wasd-camera')).toBe('left')
    expect(rideProgramKey({ key: 'Unidentified', code: 'Space' })).toBe('space')
  })
})

describe('the seat', () => {
  const { input } = derive()
  const seatBrick = input.bricks.find((brick) => brick.id === SEAT_ID)!
  const mount = seatMountAtBuild(seatBrick, input.partMap[seatBrick.partId], input.plateSize)

  it('sits on the pan, facing the rover’s forward (-Z) at the built pose', () => {
    // Seat at x 30–31, z 28–29, on the hub (y 7 plates).
    expect(mount.point.x).toBeCloseTo((31 - 32) * STUD, 6)
    expect(mount.point.z).toBeCloseTo((29 - 32) * STUD, 6)
    expect(mount.point.y).toBeCloseTo(7 * 0.18 + SEAT_PAN_HEIGHT, 6)
    expect(mount.facing).toEqual({ x: 0, y: 0, z: -1 })
    const seat = seatInWorld(mount, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } })
    expect(seat.facingYaw).toBeCloseTo(Math.PI, 6)
    expect(riderPosition(seat).y).toBeCloseTo(mount.point.y + RIDER_STANDING_Y, 6)
  })

  it('moves and turns with the body that carries it', () => {
    const quarter = axisAngleQuat({ x: 0, y: 1, z: 0 }, Math.PI / 2)
    const seat = seatInWorld(mount, { position: { x: 1, y: 0.5, z: -2 }, rotation: quarter })
    // A quarter turn about +Y takes (x, z) to (z, -x).
    expect(seat.point.x).toBeCloseTo(1 + mount.point.z, 6)
    expect(seat.point.z).toBeCloseTo(-2 - mount.point.x, 6)
    expect(seat.point.y).toBeCloseTo(0.5 + mount.point.y, 6)
    expect(seat.facing.x).toBeCloseTo(-1, 6)
    expect(seat.facingYaw).toBeCloseTo(yawOf({ x: -1, z: 0 }), 6)
  })

  it('is near when the character stands within reach of its edge, level with it', () => {
    const seat = seatInWorld(mount, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } })
    const behind = { x: seat.point.x, y: RIDER_STANDING_Y, z: seat.point.z + mount.radius + 4 * STUD }
    expect(seatReach(behind, seat, mount)).toBeCloseTo(4, 6)
    expect(seatReach({ ...behind, z: seat.point.z + mount.radius + (RIDE_REACH_STUDS + 1) * STUD }, seat, mount)! > RIDE_REACH_STUDS).toBe(true)
    expect(seatReach({ ...behind, y: 20 }, seat, mount)).toBeNull()
  })
})

describe('near enough to ride', () => {
  it('beside a wide creation counts, even when its seat is further than the seat reach', () => {
    const { input, creations } = derive()
    const seatBrick = input.bricks.find((brick) => brick.id === SEAT_ID)!
    const mount = seatMountAtBuild(seatBrick, input.partMap[seatBrick.partId], input.plateSize)
    const identity = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }
    const seat = seatInWorld(mount, identity)
    const footprint = footprintInWorld(localFootprint(input.bricks, creations[0].brickIds, input.partMap, input.plateSize)!, identity)
    // One stud outside the left wheel, level with the seat: 5+ studs from the seat's edge, but beside the rover.
    const beside = { x: (25 - 1 - 32) * STUD, y: RIDER_STANDING_Y, z: seat.point.z }
    expect(seatReach(beside, seat, mount)!).toBeGreaterThan(RIDE_REACH_STUDS)
    expect(footprintDistance(beside, footprint)).toBeCloseTo(1, 6)
    expect(rideReach(beside, seat, mount, footprint)).toBeCloseTo(1, 6)
    // Further out on that side: neither rule holds.
    const away = { ...beside, x: (25 - RIDE_SIDE_REACH_STUDS - 1 - 32) * STUD }
    expect(rideReach(away, seat, mount, footprint)).toBeNull()
    // Inside the footprint the distance is 0.
    expect(footprintDistance({ x: seat.point.x, y: 0, z: seat.point.z }, footprint)).toBe(0)
  })
})

describe('hopping off', () => {
  it('beside the seat on the rider’s left first, clear of the creation’s footprint, then further rings', () => {
    const { input, creations } = derive()
    const local = localFootprint(input.bricks, creations[0].brickIds, input.partMap, input.plateSize)!
    // Wheels at x 25 and 36, plate z 26–34.
    expect(local.min.x).toBeCloseTo((25 - 32) * STUD, 6)
    expect(local.max.x).toBeCloseTo((37 - 32) * STUD, 6)
    const footprint = footprintInWorld(local, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } })
    const points = hopOffPoints(footprint, { x: 0, y: 0, z: -1 })
    expect(points).toHaveLength(8 * HOP_OFF_RINGS_STUDS.length)
    // Facing -Z, the rider's left is -X.
    expect(points[0].x).toBeLessThan(local.min.x)
    expect(points[0].z).toBeCloseTo(footprint.center.z, 6)
    expect(points[1].x).toBeGreaterThan(local.max.x)
    expect(points[2].z).toBeGreaterThan(local.max.z)
    expect(points[3].z).toBeLessThan(local.min.z)
    // Every point is outside the footprint by at least the capsule's radius.
    for (const point of points) {
      const outside = point.x < local.min.x - 0.18 || point.x > local.max.x + 0.18 || point.z < local.min.z - 0.18 || point.z > local.max.z + 0.18
      expect(outside).toBe(true)
    }
    // Ring two is further out than ring one on the same side.
    expect(points[8].x).toBeLessThan(points[0].x)
  })

  it('turns with the creation', () => {
    const local = { min: { x: -1, y: 0, z: -2 }, max: { x: 1, y: 1, z: 2 } }
    const quarter = axisAngleQuat({ x: 0, y: 1, z: 0 }, Math.PI / 2)
    const footprint = footprintInWorld(local, { position: { x: 5, y: 0, z: 5 }, rotation: quarter })
    expect(footprint.center.x).toBeCloseTo(5, 6)
    // After a quarter turn the long side runs along X: the left point (facing +X after the turn → left is -Z)… is 1 + clearance away.
    const [left] = hopOffPoints(footprint, { x: 1, y: 0, z: 0 })
    expect(left.x).toBeCloseTo(5, 6)
    expect(left.z).toBeLessThan(5 - 1)
    expect(left.z).toBeGreaterThan(5 - 2)
  })
})

describe('the prompt', () => {
  const base: RidePromptInput = { active: true, liveRoom: false, riding: null, dismounting: false, near: null, notice: null }
  const near = { creationId: 'rover', name: 'Mars buggy', status: 'rideable' as const, seatIds: [SEAT_ID], program: { source: 'starter' as const, name: 'Joystick drive' } }

  it('offers the ride near a rideable seat and says which program drives', () => {
    expect(ridePrompt(base)).toBeNull()
    expect(ridePrompt({ ...base, active: false, near })).toBeNull()
    expect(ridePrompt({ ...base, near })).toEqual({ state: 'ride', label: 'Mars buggy', detail: 'Drives with a new Joystick drive program (not saved)', action: { key: 'E', phrase: 'ride Mars buggy', button: 'Ride' } })
    expect(ridePrompt({ ...base, near: { ...near, program: { source: 'saved', name: 'My driving' } } })?.detail).toBe('Drives with your program “My driving”')
  })

  it('says why not instead of offering Ride', () => {
    expect(ridePrompt({ ...base, near: { ...near, status: 'no-drive-pair', program: null } })).toMatchObject({ state: 'blocked', action: null, detail: 'It has a seat but no drive motors. Choose two drive motors first.' })
    expect(ridePrompt({ ...base, near: { ...near, status: 'unplugged', program: null } })).toMatchObject({ state: 'blocked', action: null })
    expect(ridePrompt({ ...base, liveRoom: true, near })).toMatchObject({ state: 'blocked', action: null, detail: 'Riding isn’t available in a shared room yet.' })
  })

  it('while riding: hop off, and what reads the keys', () => {
    const riding = { name: 'Mars buggy', program: { source: 'starter' as const, name: 'Joystick drive' }, stopped: false }
    expect(ridePrompt({ ...base, riding })).toEqual({ state: 'riding', label: 'Riding Mars buggy', detail: 'A new Joystick drive program (not saved) reads WASD / arrows', action: { key: 'E', phrase: 'hop off', button: 'Hop off' } })
    expect(ridePrompt({ ...base, riding, dismounting: true })).toMatchObject({ label: 'Hopping off Mars buggy…', action: null })
    expect(ridePrompt({ ...base, riding: { ...riding, stopped: true } })?.detail).toBe('The program stopped. Hop off and fix it in Code.')
  })

  it('a notice takes the detail line for a while', () => {
    expect(ridePrompt({ ...base, notice: 'Mars buggy left the plate, so it went back to where you built it.' })).toMatchObject({ state: 'notice', action: null })
    expect(ridePrompt({ ...base, near, notice: 'Back where you built it.' })).toMatchObject({ state: 'ride', detail: 'Back where you built it.' })
  })
})
