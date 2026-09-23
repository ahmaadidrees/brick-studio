import { describe, expect, it } from 'vitest'
import { PLATE_HEIGHT, STUD } from '../../brick/parts'
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
import { CURB, CURB_PROP_IDS, isCurbProp, plateCurb, plateHalfWidth } from './plateCurb'
import { RIDE_CREATION_ID, SEAT_ID, seatedRoverBricks, seatedRoverSection } from './rideFixtures'
import {
  BACK_TO_START, FALLEN_Y, HOP_OFF_RINGS_STUDS, PAST_CURB_STUDS, RIDE_REACH_STUDS, RIDE_SIDE_REACH_STUDS, RIDE_WORDS, RIDER_STANDING_Y, SEAT_PAN_HEIGHT, TIPPED_SECONDS, chooseRideProgram, footprintDistance, footprintInWorld,
  hopOffPoints, isTipped, localFootprint, rideCandidates, rideLimit, rideReach, rideProgramKey, ridePrompt, riderPosition, rideStatus, rideTrouble, seatInWorld, seatMountAtBuild, seatReach, yawOf, type RidePromptInput,
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

describe('the curb and going back to the start', () => {
  it('four walls just outside the plate, meeting at the corners, as tall as the Test plate’s fence', () => {
    for (const plateSize of [64, 96, 128]) {
      const walls = plateCurb(plateSize)
      const half = plateHalfWidth(plateSize)
      const thick = CURB.thicknessStuds * STUD
      expect(walls.map((wall) => wall.id)).toEqual([...CURB_PROP_IDS])
      expect(walls.every(isCurbProp)).toBe(true)
      for (const wall of walls) {
        if (wall.kind !== 'wall') throw new Error('a curb is walls')
        const box = { x0: wall.center.x - wall.size.x / 2, x1: wall.center.x + wall.size.x / 2, z0: wall.center.z - wall.size.z / 2, z1: wall.center.z + wall.size.z / 2 }
        // Every wall stands on the ground and is 4 plates tall…
        expect(wall.center.y - wall.size.y / 2).toBeCloseTo(0, 9)
        expect(wall.size.y).toBeCloseTo(4 * PLATE_HEIGHT, 9)
        // …outside the plate (it never covers a stud of it)…
        const outside = box.x0 >= half - 1e-9 || box.x1 <= -half + 1e-9 || box.z0 >= half - 1e-9 || box.z1 <= -half + 1e-9
        expect(outside).toBe(true)
        // …and hugging its edge.
        const gap = Math.min(Math.abs(box.x0 - half), Math.abs(box.x1 + half), Math.abs(box.z0 - half), Math.abs(box.z1 + half))
        expect(gap).toBeLessThan(1e-9)
        expect(Math.min(wall.size.x, wall.size.z)).toBeCloseTo(thick, 9)
      }
      // The ±Z walls run the full width plus both corners, so there is no gap at a corner.
      const [zMax, , xMin] = walls
      if (zMax.kind !== 'wall' || xMin.kind !== 'wall') throw new Error('a curb is walls')
      expect(zMax.size.x / 2).toBeCloseTo(half + thick, 9)
      expect(xMin.size.z / 2).toBeCloseTo(half, 9)
    }
  })

  it('a ride goes back only when it got past the curb, fell, or lay tipped over long enough', () => {
    const limit = rideLimit(64)
    expect(limit).toBeCloseTo(plateHalfWidth(64) + (CURB.thicknessStuds + PAST_CURB_STUDS) * STUD, 9)
    const seat = (x: number, y: number, z: number) => ({ x, y, z })
    // Anywhere on the plate, up to and against the curb: fine.
    expect(rideTrouble(seat(0, 1.5, 0), 64, 0)).toBeNull()
    expect(rideTrouble(seat(plateHalfWidth(64) - 0.2, 1.5, -plateHalfWidth(64) + 0.2), 64, 0)).toBeNull()
    // Crossing the plate's edge by two studs is not a reason any more (that threw riders off).
    expect(rideTrouble(seat(0, 1.5, -(plateHalfWidth(64) + 2 * STUD * 0.99)), 64, 0)).toBeNull()
    // Past the curb's outside by more than a stud, on any side; or fallen; or tipped for 1.5 s.
    expect(rideTrouble(seat(limit + 0.01, 1.5, 0), 64, 0)).toBe('past-the-curb')
    expect(rideTrouble(seat(0, 1.5, -limit - 0.01), 64, 0)).toBe('past-the-curb')
    expect(rideTrouble(seat(0, FALLEN_Y - 0.01, 0), 64, 0)).toBe('fell')
    expect(rideTrouble(seat(0, 1.5, 0), 64, TIPPED_SECONDS - 0.01)).toBeNull()
    expect(rideTrouble(seat(0, 1.5, 0), 64, TIPPED_SECONDS)).toBe('tipped')
    // A bigger plate has its curb further out.
    expect(rideTrouble(seat(limit + 0.5, 1.5, 0), 96, 0)).toBeNull()
  })

  it('tipped: leaning more than about 70° (on its side or upside down), not a slope', () => {
    expect(isTipped({ x: 0, y: 0, z: 0, w: 1 })).toBe(false)
    expect(isTipped(axisAngleQuat({ x: 1, y: 0, z: 0 }, (40 * Math.PI) / 180))).toBe(false)
    expect(isTipped(axisAngleQuat({ x: 0, y: 0, z: 1 }, (75 * Math.PI) / 180))).toBe(true)
    expect(isTipped(axisAngleQuat({ x: 1, y: 0, z: 0 }, Math.PI))).toBe(true)
  })
})

describe('the ride card (kid words)', () => {
  const base: RidePromptInput = { active: true, liveRoom: false, riding: null, dismounting: false, near: null, notice: null }
  const near = { creationId: 'rover', name: 'Buggy', status: 'rideable' as const, seatIds: [SEAT_ID], program: { source: 'starter' as const, name: 'Joystick drive' } }
  const riding = { name: 'Buggy', program: { source: 'starter' as const, name: 'Joystick drive' }, stopped: false }
  const words = (prompt: ReturnType<typeof ridePrompt>) => [prompt?.label, prompt?.detail, prompt?.code].filter(Boolean).join(' · ')

  it('near a robot: its name, Press E to ride, Ride; its own code named only when the student wrote it', () => {
    expect(ridePrompt(base)).toBeNull()
    expect(ridePrompt({ ...base, active: false, near })).toBeNull()
    expect(ridePrompt({ ...base, near })).toEqual({ state: 'ride', label: 'Buggy', detail: null, code: null, action: { key: 'E', phrase: 'ride Buggy', button: 'Ride' } })
    expect(ridePrompt({ ...base, near: { ...near, program: { source: 'saved', name: 'My driving' } } })?.detail).toBe('Drives with your code: My driving')
  })

  it('riding: which keys drive (the keyboard setting, or the stick on touch), Hop off; never “Joystick drive program (not saved)”', () => {
    expect(ridePrompt({ ...base, riding })).toEqual({ state: 'riding', label: 'Riding Buggy', detail: 'Drive with the arrow keys or WASD.', code: null, action: { key: 'E', phrase: 'hop off', button: 'Hop off' } })
    expect(ridePrompt({ ...base, riding, keys: 'arrow-camera' })?.detail).toBe('Drive with the WASD keys.')
    expect(ridePrompt({ ...base, riding, keys: 'wasd-camera' })?.detail).toBe('Drive with the arrow keys.')
    expect(ridePrompt({ ...base, riding, touch: true })?.detail).toBe('Drive with the stick.')
    expect(ridePrompt({ ...base, riding: { ...riding, program: { source: 'saved', name: 'My driving' } } })).toMatchObject({ detail: 'Drive with the arrow keys or WASD.', code: 'Using your code: My driving' })
    expect(ridePrompt({ ...base, riding, dismounting: true })).toMatchObject({ label: 'Hopping off Buggy…', action: null })
    expect(ridePrompt({ ...base, riding: { ...riding, stopped: true } })?.detail).toBe('Your code stopped. Hop off and fix it in Code.')
    // “Back to the start!” takes the line for a while; the rider is still riding.
    expect(ridePrompt({ ...base, riding, notice: BACK_TO_START })).toMatchObject({ state: 'riding', label: 'Riding Buggy', detail: 'Back to the start!', action: { button: 'Hop off' } })
  })

  it('says what to do instead of offering Ride', () => {
    expect(ridePrompt({ ...base, near: { ...near, status: 'no-drive-pair', program: null } })).toMatchObject({ state: 'blocked', action: null, detail: 'Add a motor on each side to drive it.' })
    expect(ridePrompt({ ...base, near: { ...near, status: 'unplugged', program: null } })).toMatchObject({ state: 'blocked', action: null, detail: 'Plug its motors into the hub to ride it.' })
    expect(ridePrompt({ ...base, liveRoom: true, near })).toMatchObject({ state: 'blocked', action: null, detail: 'Riding is off in a shared world for now.' })
  })

  it('a notice takes the detail line for a while', () => {
    expect(ridePrompt({ ...base, notice: 'The build changed, so robots went back to the start.' })).toMatchObject({ state: 'notice', action: null })
    expect(ridePrompt({ ...base, near, notice: 'The build changed, so robots went back to the start.' })).toMatchObject({ state: 'ride', detail: 'The build changed, so robots went back to the start.' })
  })

  it('short lines in the copy guide’s words: no program jargon, nothing longer than about ten words', () => {
    const prompts = [
      ridePrompt({ ...base, near }), ridePrompt({ ...base, riding }), ridePrompt({ ...base, riding, touch: true }), ridePrompt({ ...base, riding: { ...riding, stopped: true } }),
      ridePrompt({ ...base, near: { ...near, status: 'no-drive-pair', program: null } }), ridePrompt({ ...base, near: { ...near, status: 'unplugged', program: null } }), ridePrompt({ ...base, liveRoom: true, near }),
    ]
    for (const prompt of prompts) {
      const text = words(prompt)
      expect(text).not.toMatch(/program|not saved|Joystick drive|creation|reads WASD|drive pair/i)
      for (const line of [prompt?.detail, prompt?.code]) if (line) expect(line.split(/\s+/).length).toBeLessThanOrEqual(10)
    }
    expect(Object.values(RIDE_WORDS.driveKeys).every((line) => line.startsWith('Drive with'))).toBe(true)
  })
})
