import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { readRoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { fixWheel, moveMotorToSide, putOnRobot, removePart, runNoteAction } from './fixes'

/**
 * The one-tap fixes through the real brick store (kid-UX lane W): each is carried out with the
 * studio's own placements and moves, so a new motor is plugged in and names its robot as any
 * motor does, and each is one Undo. The line then says what was done.
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})

const M = ROBOTICS_PART_IDS
const brick = () => useBrickStore.getState()
const robotics = () => useRoboticsStore.getState()
const section = () => readRoboticsSection(brick().documentMetadata.robotics)
const find = (id: string) => brick().bricks.find((candidate) => candidate.id === id)
const pose = (id: string) => { const b = find(id)!; return { x: b.x, y: b.y, z: b.z, rotation: b.rotation } }

function place(partId: string, x: number, y: number, z: number, rotation = 0) {
  const state = brick()
  state.choosePart(partId)
  for (let turn = 0; turn < rotation; turn += 1) brick().rotate()
  brick().setDraftPosition(x, y, z)
  expect(brick().placeDraft()).toBe(true)
  brick().cancelInteraction()
  return brick().bricks.at(-1)!.id
}

beforeEach(() => {
  robotics().resetSim()
  brick().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [] })
  useRoboticsStore.setState({ card: null, wiringNote: null, frameRequest: null })
  robotics().refreshModel()
})

describe('a wheel placed where it can\'t spin', () => {
  it('says so the moment it lands, with the fix on the line; one tap adds a motor and an axle, one Undo takes them away', () => {
    place('plate_6x8', 28, 0, 26)
    const wheel = place(M.wheel, 28, 1, 26)
    expect(robotics().wiringNote).toMatchObject({ text: "This wheel can't spin yet. It needs an axle in a motor.", brickId: wheel, action: { kind: 'fix-wheel', brickId: wheel, label: 'Add a motor for it' } })
    const depth = brick().undoStack.length
    runNoteAction(robotics().wiringNote!.action!)
    // The motor went on the plate's left side by the wheel, the axle in it, the wheel onto the axle's end.
    expect(pose(wheel)).toEqual({ x: 25, y: 0, z: 26, rotation: 0 })
    const motor = brick().bricks.find((candidate) => candidate.partId === M.motor)!
    expect({ x: motor.x, y: motor.y, z: motor.z, rotation: motor.rotation }).toEqual({ x: 28, y: 1, z: 26, rotation: 2 })
    expect(robotics().model.creations).toHaveLength(0)
    // The motor started a robot, as any first motor does: its card is open.
    expect(robotics().card?.placedBrickId).toBe(motor.id)
    expect(robotics().wiringNote).toMatchObject({ text: 'Added a motor and an axle. The wheel can spin now!', undoable: true, tone: 'done' })
    expect(brick().undoStack).toHaveLength(depth + 1)
    expect(brick().undoStack.at(-1)?.label).toBe('Add a motor for the wheel')
    brick().undo()
    expect(brick().bricks.map((candidate) => candidate.partId)).toEqual(['plate_6x8', M.wheel])
    expect(pose(wheel)).toEqual({ x: 28, y: 1, z: 26, rotation: 0 })
  })

  it('with a hub on the robot, the new motor is plugged in by the same tap; the part in hand stays in hand', () => {
    place('plate_6x8', 28, 0, 26)
    place(M.hub, 29, 1, 27)
    robotics().confirmCard('Speedy', false)
    brick().choosePart(M.wheel)
    brick().setDraftPosition(36, 0, 31)
    expect(brick().placeDraft()).toBe(true)
    const wheel = brick().bricks.at(-1)!.id
    // Still placing wheels: the brush stays loaded through the fix.
    expect(fixWheel(wheel).ok).toBe(true)
    expect(brick().draft?.partId).toBe(M.wheel)
    const motor = brick().bricks.find((candidate) => candidate.partId === M.motor)!
    expect(section().connections).toEqual([{ deviceId: motor.id, hubId: expect.any(String), port: 'A' }])
    expect(robotics().model.creations[0].wheels.find((candidate) => candidate.brickId === wheel)).toMatchObject({ onAxle: true, motorId: motor.id })
    brick().cancelInteraction()
  })

  it('with no room, says why and outlines what is in the way; nothing changes', () => {
    place('plate_4x6', 30, 0, 26)
    place(M.hub, 30, 1, 25)
    robotics().confirmCard('Speedy', false)
    const left = place(M.motor, 30, 1, 29, 2)
    const wheel = place(M.wheel, 33, 1, 29)
    const before = brick().bricks
    const outcome = fixWheel(wheel)
    expect(outcome.ok).toBe(false)
    expect(brick().bricks).toBe(before)
    expect(robotics().wiringNote).toMatchObject({ text: 'No room for a motor here. Try a bigger plate.', brickId: wheel, blockers: expect.arrayContaining([left]) })
  })

  it('Take it off removes it, one Undo', () => {
    place('plate_6x8', 28, 0, 26)
    const wheel = place(M.wheel, 28, 1, 26)
    expect(removePart(wheel)).toBe(true)
    expect(find(wheel)).toBeUndefined()
    brick().undo()
    expect(find(wheel)).toBeDefined()
  })
})

describe('a part beside the robot, a motor in the wrong place', () => {
  function speedy() {
    place('plate_6x8', 28, 0, 26)
    place(M.hub, 29, 1, 27)
    robotics().confirmCard('Speedy', false)
    return place(M.motor, 28, 1, 31, 2)
  }

  it('"This motor isn\'t on Speedy yet." and Put it on Speedy: across from its motor, plugged in, one Undo', () => {
    speedy()
    const stray = place(M.motor, 36, 0, 30)
    expect(robotics().wiringNote).toMatchObject({ text: "This motor isn't on Speedy yet.", action: { kind: 'put-on', label: 'Put it on Speedy' } })
    putOnRobot(stray, section().creations[0].id)
    expect(pose(stray)).toEqual({ x: 31, y: 1, z: 31, rotation: 0 })
    expect(section().connections.find((cable) => cable.deviceId === stray)?.port).toBe('B')
    expect(robotics().wiringNote?.text).toBe('Right motor is on Speedy now.')
    expect(brick().undoStack.at(-1)?.label).toBe('Put Right motor on Speedy')
    brick().undo()
    expect(pose(stray)).toEqual({ x: 36, y: 0, z: 30, rotation: 0 })
    expect(section().connections.some((cable) => cable.deviceId === stray)).toBe(false)
  })

  it('a seat dropped beside Speedy: "This seat isn\'t on Speedy yet." and Put it on top; it rides along after (Ava)', () => {
    speedy()
    const seat = place(M.seat, 30, 0, 23)
    expect(robotics().wiringNote).toMatchObject({ text: "This seat isn't on Speedy yet.", brickId: seat, action: { kind: 'put-on', label: 'Put it on top' } })
    runNoteAction(robotics().wiringNote!.action!)
    expect(find(seat)!.y).toBe(7)
    expect(robotics().model.creations[0].seats).toContain(seat)
    expect(robotics().wiringNote).toMatchObject({ text: 'The seat is on Speedy now.', tone: 'done', undoable: true })
    brick().undo()
    expect(pose(seat)).toEqual({ x: 30, y: 0, z: 23, rotation: 0 })
  })

  it('a light and a sensor beside Speedy say the same, with their one tap', () => {
    speedy()
    place(M.light, 33, 0, 23)
    expect(robotics().wiringNote).toMatchObject({ text: "This light isn't on Speedy yet.", action: { kind: 'put-on', label: 'Put it on top' } })
    place(M.distanceSensor, 36, 0, 27)
    expect(robotics().wiringNote).toMatchObject({ text: "This sensor isn't on Speedy yet.", action: { kind: 'put-on', label: 'Put it on Speedy' } })
  })

  it('a motor dropped in the middle of the plate: "Motors go on the sides…" and one tap moves it there', () => {
    place('plate_6x8', 28, 0, 26)
    const middle = place(M.motor, 29, 1, 29, 2)
    expect(robotics().wiringNote).toMatchObject({ text: 'Motors go on the sides so the wheels touch the ground.', action: { kind: 'motor-to-side', label: 'Move it to the side' } })
    moveMotorToSide(middle)
    expect(pose(middle)).toEqual({ x: 28, y: 1, z: 31, rotation: 2 })
    expect(robotics().wiringNote?.text).toBe('The motor is on the side now.')
  })

  it('a motor turned around at the edge: Turn it, and its name does not change when it turns', () => {
    speedy()
    const facingIn = place(M.motor, 31, 1, 31, 2)
    const nameOf = () => robotics().model.creations[0].motors.find((motor) => motor.brickId === facingIn)?.name
    expect(nameOf()).toBe('Right motor')
    expect(robotics().wiringNote).toMatchObject({ text: 'Turn Right motor around.', action: { kind: 'motor-to-side', label: 'Turn it' } })
    // The studio's own Rotate turns it; the name stays.
    brick().selectBrick(facingIn)
    for (let turn = 0; turn < 3; turn += 1) { brick().rotate(); expect(nameOf()).toBe('Right motor') }
    brick().undo(); brick().undo(); brick().undo()
    moveMotorToSide(facingIn)
    expect(pose(facingIn)).toEqual({ x: 31, y: 1, z: 31, rotation: 0 })
    expect(nameOf()).toBe('Right motor')
  })
})
