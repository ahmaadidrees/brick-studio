import RAPIER from '@dimforge/rapier3d-compat'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { STUD } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import { ROVER_IDS, fixtureDocument } from '../model/fixtures'
import { readRoboticsSection, type RoboticsSection } from '../model/section'
import { axisAngleQuat } from '../model/vec'
import { installRoboticsParts } from '../parts/install'
import { createProgram } from '../program/programs'
import { starterFor } from '../program/starters'
import { useHiddenBrickIds } from '../scene/hiddenBricks'
import type { RapierModule } from '../sim/colliders'
import { computeModel } from '../state/roboticsStore'
import { CURB_PROP_IDS, plateHalfWidth } from './plateCurb'
import { RIDE_CREATION_ID, SEAT_ID, seatedRoverBricks, seatedRoverSection, towerRoverBricks } from './rideFixtures'
import { BACK_TO_START, RIDER_STANDING_Y, rideLimit, yawOf } from './rideModel'
import { RIDE_REQUEST_SECONDS, requestRide } from './rideRequest'
import {
  BUILD_CHANGED, DISMOUNT_MIN_SECONDS, advanceRides, bringBackRide, liveRide, rideAvatarFrame, rideCameraTarget, resetExploreRideForTests, seatOf, useExploreRideStore, type RideEnvironment,
} from './rideStore'

/**
 * The ride state machine through the real brick store and a real run controller: walk up,
 * ride, drive with the keys, hop off, leave. The scene is replaced by `advanceRides` with a
 * fixed frame and a placement finder that accepts the first point it is offered.
 */
beforeAll(async () => {
  await RAPIER.init()
  installRoboticsParts(true)
})

const FRAME = 1 / 60
const ride = () => useExploreRideStore.getState()
const documentText = () => JSON.stringify(useBrickStore.getState().getDocumentSnapshot())
const offered: { x: number; z: number }[][] = []
const environment = (touchMove = { x: 0, z: 0 }): RideEnvironment => ({
  touchMove,
  findPlacement: (points) => { offered.push(points); return { x: points[0].x, y: RIDER_STANDING_Y, z: points[0].z } },
})
const frames = (seconds: number, env = environment()) => { for (let index = 0; index < Math.round(seconds / FRAME); index += 1) advanceRides(FRAME, env) }
const body = (x: number, y: number, z: number) => ({ translation: () => ({ x, y, z }), handle: 7 })
/** Where the character stands against the rover's back (its motors end at z = 34 studs), about 4.5 studs from the seat. */
const BEHIND_ROVER = body(-0.3, RIDER_STANDING_Y, (34.5 - 32) * STUD)

function load(section: RoboticsSection = seatedRoverSection(), bricks = seatedRoverBricks()) {
  expect(useBrickStore.getState().restoreDocument(fixtureDocument(bricks, section)).ok).toBe(true)
  useBrickStore.setState({ undoStack: [], redoStack: [], mode: 'explore' })
}

function walkUpAndRide() {
  ride().enter(RAPIER as unknown as RapierModule)
  rideAvatarFrame(BEHIND_ROVER)
  expect(ride().nearestId).toBe(RIDE_CREATION_ID)
  expect(ride().ride()).toBe(true)
}

beforeEach(() => {
  resetExploreRideForTests()
  offered.length = 0
})
afterEach(() => resetExploreRideForTests())

describe('the ride state machine', () => {
  it('enter: every saved creation with a seat is a candidate; walking near its seat selects it', () => {
    load()
    ride().enter(RAPIER as unknown as RapierModule)
    expect(ride()).toMatchObject({ active: true, phase: 'walking', riding: null, liveIds: [] })
    expect(ride().candidates).toMatchObject([{ creationId: RIDE_CREATION_ID, status: 'rideable', seatIds: [SEAT_ID] }])
    expect(rideAvatarFrame(body(20, RIDER_STANDING_Y, 20))).toBeNull()
    expect(ride().nearestId).toBeNull()
    expect(rideAvatarFrame(BEHIND_ROVER)).toBeNull()
    expect(ride().nearestId).toBe(RIDE_CREATION_ID)
    // Standing on a roof far above the seat is not near it.
    rideAvatarFrame(body(-0.3, 12, (34.5 - 32) * STUD))
    expect(ride().nearestId).toBeNull()
  })

  it('ride → drive with the keys → hop off beside it → it stays where it stopped → leave: back where it was built', () => {
    load()
    const before = documentText()
    const hidden = renderHook(() => useHiddenBrickIds())
    walkUpAndRide()
    const live = liveRide(RIDE_CREATION_ID)!
    expect(ride()).toMatchObject({ phase: 'riding', riding: RIDE_CREATION_ID, liveIds: [RIDE_CREATION_ID], nearestId: null })
    expect(live.program).toMatchObject({ source: 'starter', name: 'Joystick drive' })
    expect(live.controller.space).toBe('myWorld')
    // The studio hides its static copy of the creation's bricks (every one of them), nothing else.
    hidden.rerender()
    expect([...(hidden.result.current ?? [])].sort()).toEqual([...live.creation.brickIds].sort())

    // The character sits on the seat, facing the rover's forward.
    const seated = rideAvatarFrame(BEHIND_ROVER)!
    expect(seated.mode).toBe('seat')
    expect(seated.position.y).toBeCloseTo(seatOf(live).point.y + RIDER_STANDING_Y, 6)
    expect(seated.facingYaw).toBeCloseTo(Math.PI, 3)

    // Up drives forward (-Z); nothing moves without a key (the program reads the keys, nothing drives by itself).
    const start = seatOf(live).point
    frames(0.5)
    expect(Math.hypot(seatOf(live).point.x - start.x, seatOf(live).point.z - start.z)).toBeLessThan(0.05)
    ride().setRideKey('up', true)
    frames(1)
    ride().setRideKey('up', false)
    const driven = seatOf(live).point
    expect(start.z - driven.z).toBeGreaterThan(2)
    expect(Math.abs(driven.x - start.x)).toBeLessThan(0.3)
    // Left turns it in place (left side back, right side forward).
    frames(0.5)
    const yawBefore = seatOf(live).facingYaw
    ride().setRideKey('left', true)
    frames(1)
    ride().setRideKey('left', false)
    const turned = Math.atan2(Math.sin(seatOf(live).facingYaw - yawBefore), Math.cos(seatOf(live).facingYaw - yawBefore))
    expect(Math.abs(turned)).toBeGreaterThan(0.5)
    // The seat follows the creation: the rider is carried along.
    const carried = rideAvatarFrame(BEHIND_ROVER)!
    expect(carried.position.z).toBeCloseTo(seatOf(live).point.z, 6)

    // Hop off: the program stops, every motor brakes, the rider waits on the seat until it stops.
    ride().hopOff()
    expect(ride().phase).toBe('dismounting')
    expect(live.controller.phase).toBe('stopped')
    expect(rideAvatarFrame(BEHIND_ROVER)?.mode).toBe('seat')
    frames(DISMOUNT_MIN_SECONDS + 1)
    expect(ride()).toMatchObject({ phase: 'walking', riding: null, liveIds: [RIDE_CREATION_ID] })
    expect(offered.length).toBe(1)
    const placed = rideAvatarFrame(BEHIND_ROVER)!
    expect(placed.mode).toBe('place')
    expect(placed.position).toEqual({ x: offered[0][0].x, y: RIDER_STANDING_Y, z: offered[0][0].z })
    // It faces the creation it just left, and is put down once.
    const center = { x: offered[0][0].x, z: offered[0][0].z }
    expect(Math.abs(Math.atan2(Math.sin(placed.facingYaw - yawOf({ x: seatOf(live).point.x - center.x, z: seatOf(live).point.z - center.z })), 1))).toBeLessThan(1)
    expect(rideAvatarFrame(body(placed.position.x, placed.position.y, placed.position.z))).toBeNull()

    // Parked where it stopped for the rest of the visit: still live, braked, and it settles.
    const parked = seatOf(live).point
    frames(2)
    expect(liveRide(RIDE_CREATION_ID)).toBe(live)
    expect(live.frozen).toBe(true)
    expect(Math.hypot(seatOf(live).point.x - parked.x, seatOf(live).point.z - parked.z)).toBeLessThan(0.1)
    expect(Math.hypot(parked.x - start.x, parked.z - start.z)).toBeGreaterThan(2)
    // Near it again: it can be ridden again from where it stands.
    expect(ride().nearestId).toBe(RIDE_CREATION_ID)

    // Nothing a ride does reaches the document or its history.
    expect(documentText()).toBe(before)
    expect(useBrickStore.getState().undoStack).toHaveLength(0)

    // Leave Explore: every creation is disposed (back to its authored pose), nothing hidden.
    act(() => ride().leave())
    hidden.rerender()
    expect(hidden.result.current).toBeNull()
    expect(ride()).toMatchObject({ active: false, liveIds: [], riding: null, phase: 'walking', candidates: [] })
    expect(liveRide(RIDE_CREATION_ID)).toBeNull()
    expect(live.controller.mechanics.disposed).toBe(true)
    expect(documentText()).toBe(before)
    hidden.unmount()
  })

  it('a seat on a tall tower: beside the robot on the ground the Ride card comes up and stays until she walks away; riding puts her on the seat up there', () => {
    load(seatedRoverSection(), towerRoverBricks())
    ride().enter(RAPIER as unknown as RapierModule)
    // One stud outside the right wheel, on the ground, about four units below the seat.
    const beside = (studs: number) => body((37 + studs - 32) * STUD, RIDER_STANDING_Y, (29 - 32) * STUD)
    expect(rideAvatarFrame(beside(1))).toBeNull()
    expect(ride().nearestId).toBe(RIDE_CREATION_ID)
    // Stepping about and out to four studs keeps it; five and a half studs out, it goes.
    rideAvatarFrame(beside(4))
    expect(ride().nearestId).toBe(RIDE_CREATION_ID)
    rideAvatarFrame(beside(5.5))
    expect(ride().nearestId).toBeNull()
    rideAvatarFrame(beside(4))
    expect(ride().nearestId).toBeNull()
    rideAvatarFrame(beside(2))
    expect(ride().nearestId).toBe(RIDE_CREATION_ID)
    expect(ride().pressRideKey()).toBe(true)
    const live = liveRide(RIDE_CREATION_ID)!
    const seated = rideAvatarFrame(beside(2))!
    expect(seated.mode).toBe('seat')
    expect(seated.position.y).toBeCloseTo(seatOf(live).point.y + RIDER_STANDING_Y, 6)
    expect(seated.position.y).toBeGreaterThan(4)
  })

  it('while riding, the camera frames the robot: its middle, halfway from its base to the rider’s head; walking, her head', () => {
    load(seatedRoverSection(), towerRoverBricks())
    ride().enter(RAPIER as unknown as RapierModule)
    expect(rideCameraTarget()).toBeNull()
    rideAvatarFrame(body((37 + 1 - 32) * STUD, RIDER_STANDING_Y, (29 - 32) * STUD))
    expect(ride().ride()).toBe(true)
    const live = liveRide(RIDE_CREATION_ID)!
    const target = rideCameraTarget()!
    const head = seatOf(live).point.y + RIDER_STANDING_Y + 0.52
    expect(target.y).toBeGreaterThan(1.5)
    expect(target.y).toBeLessThan(head - 1.5)
    ride().setRideKey('up', true)
    frames(1)
    // It follows the robot as it drives.
    const moved = rideCameraTarget()!
    expect(target.z - moved.z).toBeGreaterThan(2)
    ride().setRideKey('up', false)
    ride().hopOff()
    frames(1.5)
    expect(rideCameraTarget()).toBeNull()
  })

  it('Ride it in Explore: a ride asked for from Build seats her on the first frame in Explore, the camera behind her', () => {
    load()
    useBrickStore.setState({ touchYaw: 0.3 })
    requestRide(RIDE_CREATION_ID)
    ride().enter(RAPIER as unknown as RapierModule)
    // Wherever she spawned, far from the robot.
    const far = body(12, RIDER_STANDING_Y, 12)
    const seated = rideAvatarFrame(far)!
    expect(ride()).toMatchObject({ phase: 'riding', riding: RIDE_CREATION_ID })
    const live = liveRide(RIDE_CREATION_ID)!
    expect(seated.mode).toBe('seat')
    expect(seated.position.y).toBeCloseTo(seatOf(live).point.y + RIDER_STANDING_Y, 6)
    expect(useBrickStore.getState().touchYaw).toBeCloseTo(seatOf(live).facingYaw, 6)
    // Taken once: hopping off and walking does not ride again by itself.
    ride().hopOff()
    frames(1.5)
    expect(rideAvatarFrame(far)?.mode).toBe('place')
    expect(rideAvatarFrame(far)).toBeNull()
    expect(ride().phase).toBe('walking')
  })

  it('a request that is never taken goes stale, and leaving Explore drops it', () => {
    load()
    requestRide(RIDE_CREATION_ID, Date.now() - (RIDE_REQUEST_SECONDS + 1) * 1000)
    ride().enter(RAPIER as unknown as RapierModule)
    expect(rideAvatarFrame(body(12, RIDER_STANDING_Y, 12))).toBeNull()
    expect(ride().phase).toBe('walking')
    requestRide(RIDE_CREATION_ID)
    ride().leave()
    ride().enter(RAPIER as unknown as RapierModule)
    expect(rideAvatarFrame(body(12, RIDER_STANDING_Y, 12))).toBeNull()
    expect(ride().phase).toBe('walking')
  })

  it('rides again from where it was parked, with a fresh program run', () => {
    load()
    walkUpAndRide()
    const live = liveRide(RIDE_CREATION_ID)!
    ride().setRideKey('up', true)
    frames(0.8)
    ride().setRideKey('up', false)
    ride().hopOff()
    frames(1.5)
    const parked = seatOf(live).point
    expect(rideAvatarFrame(BEHIND_ROVER)?.mode).toBe('place')
    rideAvatarFrame(body(parked.x + 3 * STUD, RIDER_STANDING_Y, parked.z))
    expect(ride().nearestId).toBe(RIDE_CREATION_ID)
    expect(ride().ride()).toBe(true)
    expect(liveRide(RIDE_CREATION_ID)).toBe(live)
    expect(live.controller.phase).toBe('running')
    expect(live.frozen).toBe(false)
    expect(Math.hypot(seatOf(live).point.x - parked.x, seatOf(live).point.z - parked.z)).toBeLessThan(0.05)
  })

  it('runs the creation’s own controller program when it has one (never the starter), and the touch stick drives it', () => {
    let section = seatedRoverSection()
    load(section)
    const creation = computeModel(useBrickStore.getState()).creations[0]
    const created = createProgram(section, creation, starterFor(creation, 'joystick-drive')!, { name: 'My driving' })
    if (!created.ok) throw new Error(created.reason)
    section = created.section
    load(section)
    walkUpAndRide()
    const live = liveRide(RIDE_CREATION_ID)!
    expect(live.program).toMatchObject({ source: 'saved', name: 'My driving', programId: section.programs[0].id })
    const start = seatOf(live).point
    frames(1, environment({ x: 0, z: 1 }))
    expect(start.z - seatOf(live).point.z).toBeGreaterThan(2)
  })

  it('an edit of the construction while riding sends every creation back and puts the rider down beside it', () => {
    load()
    walkUpAndRide()
    ride().setRideKey('up', true)
    frames(0.6)
    const live = liveRide(RIDE_CREATION_ID)!
    // Undo in Explore, say: the construction changes under the ride.
    act(() => { useBrickStore.getState().restoreDocument(fixtureDocument(seatedRoverBricks().map((brick) => (brick.id === ROVER_IDS.sensor ? { ...brick, color: '#ffffff' } : brick)), seatedRoverSection())) })
    expect(live.controller.mechanics.disposed).toBe(true)
    expect(ride()).toMatchObject({ liveIds: [], phase: 'dismounting' })
    expect(ride().notice?.text).toBe(BUILD_CHANGED)
    frames(DISMOUNT_MIN_SECONDS + 0.05)
    expect(ride().phase).toBe('walking')
    // Beside the creation where it was built (it is no longer live).
    const [firstPoint] = offered[0]
    expect(firstPoint.x).toBeLessThan((25 - 32) * STUD)
  })

  it('the curb keeps a ride on the plate: driven at the edge flat out, it bumps and stops, and the rider stays on', () => {
    load()
    walkUpAndRide()
    const live = liveRide(RIDE_CREATION_ID)!
    // The ride's world has the curb just outside the plate's edge, the same walls the scene draws.
    expect(live.controller.props.map((prop) => prop.id)).toEqual([...CURB_PROP_IDS])
    const startY = seatOf(live).point.y
    ride().setRideKey('up', true)
    // Forward is -Z; the rover's nose is about 26 studs from the edge: 3 s to get there, then 7 s pushing.
    let nearest = 0
    for (let second = 0; second < 10; second += 1) {
      frames(1)
      nearest = Math.min(nearest, seatOf(live).point.z)
      expect(ride()).toMatchObject({ phase: 'riding', riding: RIDE_CREATION_ID, notice: null })
      expect(liveRide(RIDE_CREATION_ID)).toBe(live)
    }
    expect(live.controller.mechanics.disposed).toBe(false)
    const footprint = live.controller.poses().get(live.seatBodyId)!
    const velocity = live.controller.mechanics.bodyVelocity(live.seatBodyId)!
    // Up against the curb: its front at the plate's edge, the seat about 6 studs in (the seat sits 3 studs behind the nose).
    expect(nearest).toBeLessThan(-plateHalfWidth(64) + 8 * STUD)
    expect(nearest).toBeGreaterThan(-plateHalfWidth(64))
    // Stopped, still on its wheels at the height it drove at (it did not climb the curb or tip), still braked by nothing: keys held.
    expect(Math.hypot(velocity.x, velocity.z)).toBeLessThan(0.3)
    expect(Math.abs(seatOf(live).point.y - startY)).toBeLessThan(0.1)
    expect(footprint.rotation.w ** 2 + footprint.rotation.y ** 2).toBeGreaterThan(0.95)
    // The rider is still on the seat.
    const seated = rideAvatarFrame(BEHIND_ROVER)!
    expect(seated.mode).toBe('seat')
    expect(seated.position.z).toBeCloseTo(seatOf(live).point.z, 6)
    // Backing away works: the keys still drive it.
    ride().setRideKey('up', false)
    ride().setRideKey('down', true)
    const against = seatOf(live).point.z
    frames(1)
    expect(seatOf(live).point.z - against).toBeGreaterThan(2)
  })

  it('a ride that still gets past the curb goes back to the start with its rider on board, and the keys still drive', () => {
    load()
    const before = documentText()
    walkUpAndRide()
    const first = liveRide(RIDE_CREATION_ID)!
    const built = seatOf(first).point
    // Stand in for a robot that got over the curb: the limit on this live ride is pulled in to where it is driving.
    ;(first as { plateSize: number }).plateSize = 16
    expect(rideLimit(16)).toBeLessThan(plateHalfWidth(64) - 8 * STUD)
    ride().setRideKey('up', true)
    let back = null as ReturnType<typeof liveRide>
    for (let frame = 0; frame < 5 * 60 && !back; frame += 1) {
      advanceRides(FRAME, environment())
      const now = liveRide(RIDE_CREATION_ID)
      if (now && now !== first) back = now
    }
    expect(back).not.toBeNull()
    const second = back!
    // The same robot, rebuilt where it was built: a new generation, the old run gone, the same program.
    expect(first.controller.mechanics.disposed).toBe(true)
    expect(second.generation).toBeGreaterThan(first.generation)
    expect(second.plateSize).toBe(64)
    expect(second.program).toMatchObject({ source: 'starter', name: 'Joystick drive' })
    expect(second.controller.phase).toBe('running')
    expect(second.controller.props.map((prop) => prop.id)).toEqual([...CURB_PROP_IDS])
    // The rider was never put down: still riding, still on the seat, which is back at the start.
    expect(ride()).toMatchObject({ phase: 'riding', riding: RIDE_CREATION_ID, liveIds: [RIDE_CREATION_ID], programStopped: false })
    expect(ride().notice?.text).toBe(BACK_TO_START)
    expect(offered).toHaveLength(0)
    const seated = rideAvatarFrame(BEHIND_ROVER)!
    expect(seated.mode).toBe('seat')
    expect(Math.hypot(seated.position.x - built.x, seated.position.z - built.z)).toBeLessThan(0.05)
    // Up is still held: it drives on from the start without a new key press.
    const restart = seatOf(second).point
    frames(1)
    expect(restart.z - seatOf(second).point.z).toBeGreaterThan(2)
    expect(ride().phase).toBe('riding')
    // Nothing reached the document.
    expect(documentText()).toBe(before)
  })

  it('a ride lying on its side goes back to the start after 1.5 s (rider on board); a moment’s lean does not', () => {
    load()
    walkUpAndRide()
    const first = liveRide(RIDE_CREATION_ID)!
    // Stand in for a robot that rolled over: the seat body's pose, as the ride reads it, is turned onto its side.
    const poses = first.controller.poses
    let lean = 0
    ;(first.controller as { poses: typeof poses }).poses = () => {
      const all = poses()
      const seatPose = all.get(first.seatBodyId)
      if (seatPose && lean) all.set(first.seatBodyId, { ...seatPose, rotation: axisAngleQuat({ x: 0, y: 0, z: 1 }, lean) })
      return all
    }
    lean = Math.PI / 2
    frames(1)
    lean = 0
    frames(0.5)
    expect(liveRide(RIDE_CREATION_ID)).toBe(first)
    lean = Math.PI / 2
    frames(1.4)
    expect(liveRide(RIDE_CREATION_ID)).toBe(first)
    frames(0.2)
    const second = liveRide(RIDE_CREATION_ID)!
    expect(second).not.toBe(first)
    expect(second.generation).toBeGreaterThan(first.generation)
    expect(ride()).toMatchObject({ phase: 'riding', riding: RIDE_CREATION_ID })
    expect(ride().notice?.text).toBe(BACK_TO_START)
    expect(rideAvatarFrame(BEHIND_ROVER)?.mode).toBe('seat')
  })

  it('after going back to the start: hop off, walk up, ride again, and it drives again', () => {
    load()
    walkUpAndRide()
    ride().setRideKey('up', true)
    frames(0.5)
    expect(bringBackRide()).toBe(true)
    const second = liveRide(RIDE_CREATION_ID)!
    frames(0.5)
    ride().setRideKey('up', false)
    expect(ride().notice?.text).toBe(BACK_TO_START)
    ride().hopOff()
    // The line was about the ride: it does not follow the rider onto the ground.
    expect(ride().notice).toBeNull()
    frames(1.5)
    expect(ride()).toMatchObject({ phase: 'walking', riding: null, liveIds: [RIDE_CREATION_ID] })
    const parked = seatOf(second).point
    rideAvatarFrame(body(parked.x + 3 * STUD, RIDER_STANDING_Y, parked.z))
    rideAvatarFrame(body(parked.x + 3 * STUD, RIDER_STANDING_Y, parked.z))
    expect(ride().nearestId).toBe(RIDE_CREATION_ID)
    expect(ride().ride()).toBe(true)
    expect(liveRide(RIDE_CREATION_ID)).toBe(second)
    ride().setRideKey('up', true)
    frames(1)
    expect(parked.z - seatOf(second).point.z).toBeGreaterThan(2)
    // Walking, the dev hook does nothing.
    ride().hopOff()
    frames(1.5)
    expect(bringBackRide()).toBe(false)
  })

  it('two rovers: the nearer seat is the one offered; one parked and one ridden are both live', () => {
    // A second rover 20 studs to the right, its own ids, its own hub and wiring.
    const shifted = seatedRoverBricks().map((brick) => ({ ...brick, id: `b-${brick.id}`, x: brick.x + 20 }))
    const second = { id: 'rover-b', name: 'Moon buggy', anchorBrickIds: [`b-${ROVER_IDS.hub}`] }
    const wiring = seatedRoverSection().connections.map((cable) => ({ ...cable, deviceId: `b-${cable.deviceId}`, hubId: `b-${cable.hubId}` }))
    const section = seatedRoverSection({ creations: [...seatedRoverSection().creations, second], connections: [...seatedRoverSection().connections, ...wiring] })
    load(section, [...seatedRoverBricks(), ...shifted])
    const before = documentText()
    ride().enter(RAPIER as unknown as RapierModule)
    expect(ride().candidates.map((candidate) => [candidate.name, candidate.status])).toEqual([['Mars buggy', 'rideable'], ['Moon buggy', 'rideable']])
    rideAvatarFrame(body(-0.3 + 20 * STUD, RIDER_STANDING_Y, (34.5 - 32) * STUD))
    expect(ride().nearestId).toBe('rover-b')
    expect(ride().ride()).toBe(true)
    ride().hopOff()
    frames(1.5)
    rideAvatarFrame(BEHIND_ROVER)
    rideAvatarFrame(BEHIND_ROVER)
    expect(ride().nearestId).toBe(RIDE_CREATION_ID)
    expect(ride().ride()).toBe(true)
    expect(ride().liveIds).toEqual(['rover-b', RIDE_CREATION_ID])
    expect(liveRide('rover-b')!.controller.phase).toBe('stopped')
    expect(liveRide(RIDE_CREATION_ID)!.controller.phase).toBe('running')
    expect(documentText()).toBe(before)
  })

  it('in a live room riding is unavailable, and E does nothing', () => {
    load()
    ride().setLiveRoom(true)
    ride().enter(RAPIER as unknown as RapierModule)
    rideAvatarFrame(BEHIND_ROVER)
    expect(ride().nearestId).toBe(RIDE_CREATION_ID)
    expect(ride().ride()).toBe(false)
    expect(ride().pressRideKey()).toBe(true)
    expect(ride()).toMatchObject({ phase: 'walking', liveIds: [] })
  })

  it('without a plugged drive motor the seat says why and cannot be ridden', () => {
    load(seatedRoverSection({ connections: [] }))
    ride().enter(RAPIER as unknown as RapierModule)
    rideAvatarFrame(BEHIND_ROVER)
    expect(ride().candidates[0].status).toBe('unplugged')
    expect(ride().ride()).toBe(false)
    expect(ride().liveIds).toEqual([])
    expect(readRoboticsSection(useBrickStore.getState().documentMetadata.robotics).connections).toEqual([])
  })
})
