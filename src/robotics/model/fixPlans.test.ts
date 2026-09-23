import { beforeAll, describe, expect, it } from 'vitest'
import type { BrickInstance } from '../../brick/types'
import { readiness } from '../drive/readiness'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { deriveCreations, type DeriveInput } from './creations'
import { ROVER_IDS, fixtureInput, roverBricks } from './fixtures'
import { orderFixSteps, otherSideSpot, planMotorToSide, planPutOnRobot, planWheelFix, previewProblem, wheelProblemText, type FixOutcome, type FixPlan, type FixStep } from './fixPlans'
import { looseWheelsByRobot, wheelSpins, wheelSummary } from './looseWheels'
import { deriveMechanisms } from './mechanism'
import { emptyRoboticsSection, type RoboticsSection } from './section'
import { socketRoomOf } from './socketRoom'

/**
 * Kid-UX lane W: a car built from separate parts, the way Leo (9) built his: a plate, wheels at
 * its corners, motors where they fit. The fix planners give the steps (every pose one the snapper
 * would give, standing on what is under it), or why not with what is in the way; applying the
 * steps to the bricks must leave the wheel on an axle in a motor, spinning.
 */
beforeAll(() => installRoboticsParts(true))

const M = ROBOTICS_PART_IDS
const at = (id: string, partId: string, x: number, y: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): BrickInstance => ({ id, partId, x, y, z, rotation, color: '#52636c' })
const robotSection = (anchor: string, name = 'Speedy'): RoboticsSection => ({ ...emptyRoboticsSection(), creations: [{ id: 'robot', name, anchorBrickIds: [anchor] }] })
const input = (bricks: BrickInstance[], section?: RoboticsSection): DeriveInput => fixtureInput(bricks, section)

let added = 0
/** The bricks once a plan's steps are done (in an order that works), as the studio would leave them. */
function apply(bricks: readonly BrickInstance[], plan: FixOutcome): BrickInstance[] {
  expect(plan.ok).toBe(true)
  const steps = orderFixSteps(input([...bricks]), (plan as FixPlan).steps)
  expect(steps).not.toBeNull()
  let next = [...bricks]
  steps!.forEach((step: FixStep) => {
    next = step.op === 'add' ? [...next, { id: `added-${(added += 1)}`, partId: step.partId, ...step.pose, color: '#000' }] : next.map((brick) => (brick.id === step.brickId ? { ...brick, ...step.pose } : brick))
  })
  return next
}

const spins = (bricks: BrickInstance[], wheelId: string) => wheelSpins(deriveMechanisms(bricks, input(bricks).partMap, 64)).find((wheel) => wheel.wheelId === wheelId)?.spins

/** Leo's start: the robot plate (the Buggy's 6 × 8) with a wheel standing on each corner. */
const plateWithCornerWheels = () => [
  at('plate', 'plate_6x8', 28, 0, 26),
  at('w-front-left', M.wheel, 28, 1, 26), at('w-front-right', M.wheel, 33, 1, 26),
  at('w-back-left', M.wheel, 28, 1, 31), at('w-back-right', M.wheel, 33, 1, 31),
]

describe('a wheel that can\'t spin: the one-tap fix', () => {
  it('a wheel on a bare plate\'s corner gets a motor on the long side by it, an axle, and moves onto the axle (Leo)', () => {
    const bricks = plateWithCornerWheels()
    const plan = planWheelFix(input(bricks), 'w-front-left')
    expect(plan).toMatchObject({ ok: true, label: 'Add a motor for it', undoLabel: 'Add a motor for the wheel', done: 'Added a motor and an axle. The wheel can spin now!' })
    expect((plan as FixPlan).steps).toEqual([
      { op: 'add', partId: M.motor, pose: { x: 28, y: 1, z: 26, rotation: 2 } },
      { op: 'add', partId: M.axleShort, pose: { x: 26, y: 0, z: 27, rotation: 0 } },
      { op: 'move', brickId: 'w-front-left', pose: { x: 25, y: 0, z: 26, rotation: 0 } },
    ])
    // The wheel stood where its motor goes: it moves before the motor is put there.
    const order = orderFixSteps(input(bricks), (plan as FixPlan).steps)!.map((step) => (step.op === 'add' ? step.partId : step.brickId))
    expect(order.indexOf('w-front-left')).toBeLessThan(order.indexOf(M.motor))
    const after = apply(bricks, plan)
    expect(spins(after, 'w-front-left')).toBe(true)
    // It stands on the ground, not in the air: the wheel's and the axle's bottoms are on the baseplate, the motor on the plate.
    expect(Object.fromEntries(after.filter((brick) => brick.id.startsWith('added-') || brick.id === 'w-front-left').map((brick) => [brick.partId, brick.y]))).toEqual({ [M.wheel]: 0, [M.motor]: 1, [M.axleShort]: 0 })
  })

  it('all four corner wheels, fixed one after another, make a four-wheel car that drives', () => {
    let bricks = plateWithCornerWheels()
    for (const id of ['w-front-left', 'w-front-right', 'w-back-left', 'w-back-right']) bricks = apply(bricks, planWheelFix(input(bricks), id))
    for (const id of ['w-front-left', 'w-front-right', 'w-back-left', 'w-back-right']) expect(spins(bricks, id)).toBe(true)
    // A hub on top of the front motors, every motor plugged in: it can drive, four wheels on four motors.
    bricks = [...bricks, at('hub', M.hub, 29, 7, 26)]
    const motors = bricks.filter((brick) => brick.partId === M.motor).map((brick) => brick.id)
    const section: RoboticsSection = { ...robotSection('plate'), connections: motors.map((deviceId, index) => ({ deviceId, hubId: 'hub', port: (['A', 'B', 'C', 'D'] as const)[index] })) }
    const [car] = deriveCreations(input(bricks, section))
    expect(car.motors.map((motor) => motor.name).sort()).toEqual(['Back left motor', 'Back right motor', 'Front left motor', 'Front right motor'])
    expect(readiness(car)).toEqual({ kind: 'drive', ready: true, reason: null })
  })

  it('a motor already waiting on that side is used first: an axle in it and the wheel on the axle', () => {
    const bricks = [...plateWithCornerWheels().filter((brick) => brick.id !== 'w-front-left'), at('left', M.motor, 28, 1, 26, 2)]
    const plan = planWheelFix(input(bricks), 'w-back-left')
    expect(plan).toMatchObject({ ok: true, label: 'Put it on Left motor' })
    expect((plan as FixPlan).steps.map((step) => step.op)).toEqual(['add', 'move'])
    expect(spins(apply(bricks, plan), 'w-back-left')).toBe(true)
  })

  it('a wheel beside a free axle end goes onto it; the line says it is not on the axle yet', () => {
    const bricks = roverBricks({ leftWheelOff: true })
    const mechanisms = deriveMechanisms(bricks, input(bricks).partMap, 64)
    expect(wheelProblemText(mechanisms, ROVER_IDS.leftWheel, 2 * 0.62)).toBe("This wheel isn't on the axle yet.")
    const plan = planWheelFix(input(bricks), ROVER_IDS.leftWheel)
    expect(plan).toMatchObject({ ok: true, label: "Put it on Left motor's axle", steps: [{ op: 'move', brickId: ROVER_IDS.leftWheel, pose: { x: 25, y: 0, z: 31, rotation: 0 } }] })
  })

  it('never across the robot: a wheel on the left is not put on a right motor\'s axle', () => {
    const bricks = [...roverBricks().filter((brick) => ![ROVER_IDS.leftMotor, ROVER_IDS.leftAxle, ROVER_IDS.leftWheel, ROVER_IDS.rightWheel].includes(brick.id as never)), at('stray', M.wheel, 26, 0, 31)]
    const plan = planWheelFix(input(bricks), 'stray')
    // The right axle's end is free, but it is on the other side: a new motor on the left instead.
    expect(plan).toMatchObject({ ok: true, label: 'Add a motor for it' })
    expect((plan as FixPlan).steps[0]).toMatchObject({ op: 'add', partId: M.motor, pose: { x: 28, rotation: 2 } })
  })

  it('no room for a motor (Leo\'s 4 × 6 plate with a hub and a motor): says why and what is in the way', () => {
    const bricks = [at('plate', 'plate_4x6', 30, 0, 26), at('hub', M.hub, 30, 1, 25), at('left', M.motor, 30, 1, 29, 2), at('wheel', M.wheel, 33, 1, 29)]
    const plan = planWheelFix(input(bricks), 'wheel')
    expect(plan).toMatchObject({ ok: false, reason: 'no-room', text: 'No room for a motor here. Try a bigger plate.' })
    expect(plan.ok ? [] : plan.blockers.length).toBeGreaterThan(0)
    expect(plan.ok ? null : plan.ghost?.partId).toBe(M.motor)
  })

  it('no plate near: motors go on a plate', () => {
    expect(planWheelFix(input([at('wheel', M.wheel, 10, 0, 10)]), 'wheel')).toMatchObject({ ok: false, reason: 'no-plate', text: 'Motors go on a plate. Put a plate down first.' })
  })

  it('a wheel that spins has nothing to fix', () => {
    expect(planWheelFix(input(roverBricks()), ROVER_IDS.leftWheel)).toMatchObject({ ok: false, reason: 'nothing' })
  })
})

describe('loose wheels: which robot they belong with, and the line', () => {
  it('the order the wheels were placed in never matters: a wheel placed before another took the axle end is not "nearly on" it', () => {
    // Leo: wheels on the old plate first, the car's own wheels last. Before, the early wheels named an axle end the later ones took.
    const loose = [at('old-1', M.wheel, 10, 0, 31), at('old-2', M.wheel, 12, 0, 31)]
    const bricks = [...loose, ...roverBricks()]
    const mechanisms = deriveMechanisms(bricks, input(bricks).partMap, 64)
    expect(mechanisms.wheelById.get('old-1')?.nearest).toBeNull()
    const [rover] = deriveCreations(input(bricks, robotSection(ROVER_IDS.hub)))
    expect(rover.wheels.map((wheel) => wheel.brickId).sort()).toEqual([ROVER_IDS.leftWheel, ROVER_IDS.rightWheel].sort())
    expect(rover.lines.parts).toBe('1 hub, 2 motors, 2 wheels, 2 axles, 1 distance sensor')
  })

  it('wheels on the robot\'s plate or within four studs of it are its loose wheels; far ones belong to no robot', () => {
    const bricks = [...roverBricks(), at('on-plate', M.wheel, 33, 1, 26), at('beside', M.wheel, 38, 0, 26), at('far', M.wheel, 50, 0, 50)]
    const creations = deriveCreations(input(bricks, robotSection(ROVER_IDS.hub)))
    expect(looseWheelsByRobot(input(bricks), creations).get('robot')).toEqual(['on-plate', 'beside'])
  })

  it('says how many spin and how many don\'t, and that loose ones stay behind when it drives', () => {
    expect(wheelSummary(2, [{ onAxle: false }, { onAxle: false }, { onAxle: false }])).toBe("2 wheels spin. 3 wheels aren't on an axle.")
    expect(wheelSummary(2, [{ onAxle: false }, { onAxle: false }, { onAxle: false }], true)).toBe("2 wheels spin. 3 wheels aren't on an axle. They stay here when you drive.")
    expect(wheelSummary(1, [{ onAxle: false }], true)).toBe("1 wheel spins. 1 wheel isn't on an axle. It stays here when you drive.")
    expect(wheelSummary(0, [{ onAxle: true }])).toBe("1 wheel can't spin yet.")
  })
})

describe('the other side', () => {
  const plateAndHub = () => [at('plate', 'plate_6x8', 28, 0, 26), at('hub', M.hub, 29, 1, 27)]

  it('is the first motor mirrored across the plate, turned to face out over the other edge', () => {
    const bricks = [...plateAndHub(), at('left', M.motor, 28, 1, 31, 2)]
    expect(otherSideSpot(input(bricks), { brickIds: ['plate', 'hub', 'left'] })).toMatchObject({ motorId: 'left', pose: { x: 31, y: 1, z: 31, rotation: 0 }, free: true, mirrored: true })
  })

  it('with the mirror spot taken, the nearest spot on that side with room; with none, what is in the way', () => {
    const bricks = [at('plate', 'plate_4x6', 30, 0, 26), at('hub', M.hub, 30, 1, 25), at('left', M.motor, 30, 1, 29, 2)]
    expect(otherSideSpot(input(bricks), { brickIds: ['plate', 'hub', 'left'] })).toMatchObject({ free: false, pose: { x: 31, y: 1, z: 29, rotation: 0 }, blockers: ['left'] })
  })

  it('none for a motor that is not at a side facing out', () => {
    expect(otherSideSpot(input([...plateAndHub().slice(0, 1), at('middle', M.motor, 29, 1, 28, 2)]), { brickIds: ['plate', 'middle'] })).toBeNull()
  })
})

describe('a part beside the robot, and a motor in the wrong place', () => {
  const buggy = () => [at('plate', 'plate_6x8', 28, 0, 26), at('hub', M.hub, 29, 1, 27), at('left', M.motor, 28, 1, 31, 2)]

  it('a motor beside the robot goes on across from its motor; a sensor goes on its plate', () => {
    const bricks = [...buggy(), at('stray', M.motor, 36, 0, 30), at('eyes', M.distanceSensor, 30, 0, 22)]
    expect(planPutOnRobot(input(bricks), { name: 'Speedy', brickIds: ['plate', 'hub', 'left'] }, 'stray')).toMatchObject({ ok: true, label: 'Put it on Speedy', done: 'Right motor is on Speedy now.', steps: [{ op: 'move', brickId: 'stray', pose: { x: 31, y: 1, z: 31, rotation: 0 } }] })
    expect(planPutOnRobot(input(bricks), { name: 'Speedy', brickIds: ['plate', 'hub', 'left'] }, 'eyes')).toMatchObject({ ok: true, steps: [{ op: 'move', pose: { x: 30, y: 1, z: 26, rotation: 0 } }] })
  })

  it('a motor in the middle of the plate moves to the side (an end of it, leaving the middle for the hub)', () => {
    const bricks = [at('plate', 'plate_6x8', 28, 0, 26), at('middle', M.motor, 29, 1, 29, 2)]
    expect(socketRoomOf(bricks[1], bricks, input(bricks).partMap, 64)).toBe('covered')
    const plan = planMotorToSide(input(bricks), 'middle', { brickIds: ['plate', 'middle'] })
    expect(plan).toMatchObject({ ok: true, label: 'Move it to the side', steps: [{ op: 'move', brickId: 'middle', pose: { x: 28, y: 1, z: 31, rotation: 2 } }] })
  })

  it('a motor turned around at an edge, or facing the back of the plate, turns (Sam)', () => {
    const around = [at('plate', 'plate_6x8', 28, 0, 26), at('in', M.motor, 28, 1, 31, 0)]
    expect(socketRoomOf(around[1], around, input(around).partMap, 64)).toBe('facing-in')
    expect(planMotorToSide(input(around), 'in', { brickIds: ['plate', 'in'] })).toMatchObject({ ok: true, label: 'Turn it', steps: [{ op: 'move', pose: { x: 28, y: 1, z: 31, rotation: 2 } }] })
    const back = [at('plate', 'plate_6x8', 28, 0, 26), at('hub', M.hub, 29, 1, 27), at('back', M.motor, 30, 1, 31, 3)]
    const [robot] = deriveCreations(input(back, robotSection('plate')))
    expect(robot.motors[0]).toMatchObject({ name: 'Back motor', socketRoom: 'open', crossways: true })
    expect(readiness(robot).reason).toBe('Turn Back motor to face the side.')
    expect(planMotorToSide(input(back), 'back', robot)).toMatchObject({ ok: true, label: 'Turn it', steps: [{ op: 'move', pose: { x: 31, y: 1, z: 31, rotation: 0 } }] })
  })

  it('a motor on top of the hub can never turn a wheel on the ground: it moves down to a side of the plate (Sam)', () => {
    const bricks = [at('plate', 'plate_6x8', 28, 0, 26), at('hub', M.hub, 29, 1, 27), at('left', M.motor, 28, 1, 31, 2), at('on-hub', M.motor, 29, 7, 27, 1)]
    const [robot] = deriveCreations(input(bricks, robotSection('plate')))
    expect(robot.motors.find((motor) => motor.brickId === 'on-hub')?.socketRoom).toBe('high')
    expect(readiness(robot).reason).toMatch(/^Move .* to the side of the plate\.$/)
    expect(planMotorToSide(input(bricks), 'on-hub', robot)).toMatchObject({ ok: true, label: 'Move it to the side', steps: [{ op: 'move', pose: { x: 31, y: 1, z: 31, rotation: 0 } }] })
  })
})

describe('motor names stay put when a motor is turned (Sam)', () => {
  it('named by the side of the plate it stands on: turning it never renames it; in the middle it is "Middle motor"', () => {
    const named = (rotation: 0 | 1 | 2 | 3, x = 31) => deriveCreations(input([at('plate', 'plate_6x8', 28, 0, 26), at('m', M.motor, x, 1, 31, rotation)], robotSection('plate')))[0].motors[0].name
    expect([0, 1, 2, 3].map((rotation) => named(rotation as 0 | 1 | 2 | 3))).toEqual(['Right motor', 'Right motor', 'Right motor', 'Right motor'])
    expect(named(2, 28)).toBe('Left motor')
    expect(deriveCreations(input([at('plate', 'plate_6x8', 28, 0, 26), at('m', M.motor, 29, 1, 28, 0)], robotSection('plate')))[0].motors[0].name).toBe('Middle motor')
  })
})

describe('a red preview says why', () => {
  const buggy = () => [at('plate', 'plate_6x8', 28, 0, 26), at('hub', M.hub, 29, 1, 27), at('left', M.motor, 28, 1, 31, 2), at('old', 'plate_4x6', 20, 0, 30)]

  it('in the way: names nothing, outlines what is there', () => {
    expect(previewProblem(input(buggy()), { partId: M.wheel, x: 23, y: 0, z: 30, rotation: 0 }, null)).toEqual({ text: 'Something is in the way.', blockers: ['old'] })
  })

  it('a motor snapped to a side with no room: no room on the plate', () => {
    expect(previewProblem(input(buggy()), { partId: M.motor, x: 28, y: 1, z: 28, rotation: 2 }, null, 'plate-edge')).toEqual({ text: 'No room on the plate. Try a bigger plate.', blockers: ['hub'] })
  })

  it('a device sunk into a plate it should stand on: it needs to sit on the robot\'s plate', () => {
    expect(previewProblem(input(buggy()), { partId: M.distanceSensor, x: 30, y: 0, z: 26, rotation: 0 }, null)?.text).toBe("It needs to sit on the robot's plate.")
  })

  it('nothing to say where it fits, or for a part that is not a robot part', () => {
    expect(previewProblem(input(buggy()), { partId: M.wheel, x: 40, y: 0, z: 40, rotation: 0 }, null)).toBeNull()
    expect(previewProblem(input(buggy()), { partId: 'brick_2x2', x: 29, y: 1, z: 27, rotation: 0 }, null)).toBeNull()
  })
})
