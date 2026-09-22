import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { disconnect } from '../model/control'
import { readRoboticsSection, writeRoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { ROBOTICS_PART_COLORS, ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsWatcher, simBehaviorKey, useRoboticsStore } from './roboticsStore'

/**
 * The watcher and the card through the real brick store: placements go through
 * choosePart → setDraftPosition → placeDraft exactly as the scene does, so the
 * `placeFeedback` nonce fires and the robotics store reacts as it would in the app.
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})

function place(partId: string, x: number, y: number, z: number, rotation = 0) {
  const state = useBrickStore.getState()
  state.choosePart(partId)
  for (let turn = 0; turn < rotation; turn += 1) state.rotate()
  state.setDraftPosition(x, y, z)
  expect(state.placeDraft()).toBe(true)
  useBrickStore.getState().cancelInteraction()
  const bricks = useBrickStore.getState().bricks
  return bricks[bricks.length - 1].id
}

const section = () => readRoboticsSection(useBrickStore.getState().documentMetadata.robotics)
const topLabel = () => useBrickStore.getState().undoStack.at(-1)?.label
const robotics = () => useRoboticsStore.getState()

/** A named creation (plate + hub) with one motor wired to port A by assisted wiring. */
function buggyWithMotor() {
  place('plate_6x8', 28, 0, 26)
  place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
  robotics().confirmCard('Buggy', false)
  const motor = place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
  expect(section().connections).toEqual([{ deviceId: motor, hubId: expect.any(String), port: 'A' }])
  return { motor, id: section().creations[0].id }
}

beforeEach(() => {
  useRoboticsStore.getState().resetSim()
  useBrickStore.getState().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [] })
  useRoboticsStore.setState({ card: null, wiringNote: null, frameRequest: null })
  useRoboticsStore.getState().refreshModel()
})

describe('placing devices', () => {
  it('the first device on non-creation bricks opens the card and frames the component; Not now keeps the creation', () => {
    place('plate_6x8', 28, 0, 26)
    expect(robotics().card).toBeNull()
    expect(robotics().frameRequest).toBeNull()
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    const card = robotics().card
    expect(card?.creationId).toBeNull()
    expect(card?.anchorBrickIds).toHaveLength(2)
    expect(card?.suggestedName).toBe('Creation')
    expect(robotics().frameRequest?.brickIds).toEqual(card?.anchorBrickIds)
    robotics().confirmCard('', false)
    expect(robotics().card).toBeNull()
    expect(section().creations).toHaveLength(1)
    expect(section().creations[0].name).toBe('Creation')
    expect(robotics().model.creations[0].brickIds).toHaveLength(2)
  })

  it('assisted wiring connects a motor to the first free port with an undoable line, and never a hub to itself', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    expect(robotics().wiringNote).toBeNull()
    robotics().confirmCard('Buggy', false)
    const motor = place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    expect(robotics().wiringNote).toMatchObject({ text: 'Left motor connected to port A', undoable: true, added: [{ deviceId: motor, port: 'A' }] })
    expect(section().connections).toEqual([{ deviceId: motor, hubId: expect.any(String), port: 'A' }])
    // Undo removes the cable and only the cable; the motor stays.
    robotics().undoWiring()
    expect(section().connections).toEqual([])
    expect(useBrickStore.getState().bricks.some((brick) => brick.id === motor)).toBe(true)
    // It was a real history undo: Redo brings the cable back, and a second undo takes the motor away.
    expect(useBrickStore.getState().redoStack.at(-1)?.label).toBe('Connect Left motor connected to port A')
    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks.some((brick) => brick.id === motor)).toBe(false)
  })

  it('a device joining a saved creation does not reopen the card; the same write refreshes the anchors', () => {
    const { motor, id } = buggyWithMotor()
    expect(robotics().card).toBeNull()
    expect(robotics().wiringNote?.text).toBe('Left motor connected to port A')
    expect(section().creations[0].id).toBe(id)
    expect(section().creations[0].anchorBrickIds).toContain(motor)
    // One history entry for the placement, one for the wiring: nothing else was recorded.
    expect(useBrickStore.getState().undoStack.map((entry) => entry.label).slice(-2)).toEqual(['Place brick', 'Connect Left motor connected to port A'])
  })

  it('a device placed with no hub is placed unpowered and told so', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    expect(robotics().wiringNote).toMatchObject({ text: 'Left motor placed unpowered · add a hub to plug it in', undoable: false })
    expect(section().connections).toEqual([])
  })

  it('a hub arriving powers the parts already waiting for it', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    robotics().confirmCard('Buggy', false)
    place(ROBOTICS_PART_IDS.motor, 31, 1, 31, 0)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    expect(robotics().wiringNote?.text).toBe('Left motor connected to port A · Right motor connected to port B')
    expect(section().connections.map((connection) => connection.port)).toEqual(['A', 'B'])
  })

  it('a full hub refuses the fifth device with the ports line', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    robotics().confirmCard('Post', false)
    place(ROBOTICS_PART_IDS.light, 28, 1, 26)
    place(ROBOTICS_PART_IDS.light, 28, 1, 27)
    place(ROBOTICS_PART_IDS.light, 28, 1, 28)
    place(ROBOTICS_PART_IDS.light, 28, 1, 29)
    place(ROBOTICS_PART_IDS.light, 28, 1, 30)
    expect(robotics().wiringNote?.text).toBe('Ports A–D are full. Unplug something to plug in Light')
    expect(section().connections).toHaveLength(4)
  })

  it('undo and redo of a placement do not re-run assisted wiring', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    robotics().confirmCard('Buggy', false)
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    expect(section().connections).toHaveLength(1)
    useBrickStore.getState().undo() // the cable
    useBrickStore.getState().undo() // the motor
    useRoboticsStore.setState({ wiringNote: null })
    useBrickStore.getState().redo() // the motor returns, unpowered, without a new line
    expect(useBrickStore.getState().bricks).toHaveLength(3)
    expect(section().connections).toHaveLength(0)
    expect(robotics().wiringNote).toBeNull()
  })

  it('the robotics section rides with the document snapshot and a blank build drops it', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    robotics().confirmCard('Buggy', false)
    const snapshot = useBrickStore.getState().getDocumentSnapshot()
    expect(snapshot.robotics).toMatchObject({ version: 1, creations: [{ name: 'Buggy' }] })
    useBrickStore.getState().newBuild()
    expect(useBrickStore.getState().getDocumentSnapshot().robotics).toBeUndefined()
    useBrickStore.getState().undo()
    expect(useBrickStore.getState().getDocumentSnapshot().robotics).toMatchObject({ creations: [{ name: 'Buggy' }] })
  })

  it('choosing a robotics part arms it in its own colour and leaves the brush alone', () => {
    const brush = useBrickStore.getState().activeColor
    useBrickStore.getState().choosePart(ROBOTICS_PART_IDS.wheel)
    expect(useBrickStore.getState().draft?.color).toBe(ROBOTICS_PART_COLORS.wheel)
    expect(useBrickStore.getState().activeColor).toBe(brush)
    useBrickStore.getState().choosePart(ROBOTICS_PART_IDS.hub)
    expect(useBrickStore.getState().draft?.color).toBe(ROBOTICS_PART_COLORS.hub)
    useBrickStore.getState().choosePart('brick_2x4')
    expect(useBrickStore.getState().draft?.color).toBe(brush)
    useBrickStore.getState().cancelInteraction()
  })
})

describe('wiring Undo is precise', () => {
  it('after another edit was recorded, Undo unplugs exactly the cables the line added and keeps that edit', () => {
    const { motor, id } = buggyWithMotor()
    robotics().renameCreation(id, 'Rover')
    expect(topLabel()).toBe('Rename creation')
    robotics().undoWiring()
    expect(section().connections.some((connection) => connection.deviceId === motor)).toBe(false)
    expect(useBrickStore.getState().bricks.some((brick) => brick.id === motor)).toBe(true)
    expect(section().creations[0].name).toBe('Rover')
    expect(topLabel()).toBe('Unplug Left motor')
    expect(robotics().wiringNote).toBeNull()
    // The unplug is an ordinary edit: Undo brings the cable back.
    useBrickStore.getState().undo()
    expect(section().connections.some((connection) => connection.deviceId === motor)).toBe(true)
  })

  it('after the creation card confirms on top of the wiring, Undo still removes only the cable', () => {
    const { motor, id } = buggyWithMotor()
    robotics().openCardFor(id)
    robotics().confirmCard('Mars buggy', false)
    expect(topLabel()).toBe('Rename creation')
    robotics().undoWiring()
    expect(section().connections).toEqual([])
    expect(useBrickStore.getState().bricks.some((brick) => brick.id === motor)).toBe(true)
    expect(section().creations[0].name).toBe('Mars buggy')
  })

  it('does nothing when the cable is already gone, and never pops an unrelated entry', () => {
    const { motor } = buggyWithMotor()
    useBrickStore.getState().setRoboticsSection(writeRoboticsSection(disconnect(section(), motor)), 'Unplug motor')
    const depth = useBrickStore.getState().undoStack.length
    robotics().undoWiring()
    expect(useBrickStore.getState().undoStack).toHaveLength(depth)
    expect(section().connections).toEqual([])
  })
})

describe('the simulation and the document', () => {
  it('Reset cancels a start still in flight', async () => {
    const { id } = buggyWithMotor()
    const pending = robotics().startSim(id)
    expect(robotics().simLoading).toBe(true)
    robotics().resetSim()
    expect(robotics().simLoading).toBe(false)
    await pending
    expect(robotics().sim).toBeNull()
    expect(robotics().simLoading).toBe(false)
  })

  it('a construction edit cancels a start still in flight', async () => {
    const { id } = buggyWithMotor()
    const pending = robotics().startSim(id)
    place('brick_1x1', 28, 1, 26)
    await pending
    expect(robotics().sim).toBeNull()
    expect(robotics().simLoading).toBe(false)
  })

  it('a newer start supersedes an older one: exactly one simulation is published and loading clears', async () => {
    const { id } = buggyWithMotor()
    const first = robotics().startSim(id)
    const second = robotics().startSim(id)
    await Promise.all([first, second])
    const sim = robotics().sim
    expect(sim).not.toBeNull()
    expect(sim!.mechanics.disposed).toBe(false)
    expect(robotics().simLoading).toBe(false)
    robotics().resetSim()
    expect(sim!.mechanics.disposed).toBe(true)
  })

  it('a cable edit during a run retires it; a rename does not', async () => {
    const { id, motor } = buggyWithMotor()
    await robotics().startSim(id)
    const sim = robotics().sim!
    robotics().nudgeMotor(motor, 0.4)
    robotics().renameCreation(id, 'Rover')
    expect(robotics().sim).toBe(sim)
    useBrickStore.getState().setRoboticsSection(writeRoboticsSection({ ...section(), devices: { [motor]: { name: 'Wheel motor' } } }), 'Rename device')
    expect(robotics().sim).toBe(sim)
    useBrickStore.getState().setRoboticsSection(writeRoboticsSection(disconnect(section(), motor)), 'Unplug motor')
    expect(robotics().sim).toBeNull()
    expect(sim.mechanics.disposed).toBe(true)
  })

  it('switching the run space stops and discards the run before the edit lands', async () => {
    const { id } = buggyWithMotor()
    await robotics().startSim(id)
    expect(robotics().sim).not.toBeNull()
    robotics().setTestSpace(id, 'myWorld')
    expect(robotics().sim).toBeNull()
    expect(section().creations[0].testSpace).toBe('myWorld')
  })

  it('the behaviour key covers cables, membership, run space and the plate but not names', () => {
    buggyWithMotor()
    const before = simBehaviorKey(useBrickStore.getState())
    robotics().renameCreation(section().creations[0].id, 'Rover')
    expect(simBehaviorKey(useBrickStore.getState())).toBe(before)
    robotics().setTestSpace(section().creations[0].id, 'myWorld')
    expect(simBehaviorKey(useBrickStore.getState())).not.toBe(before)
  })

  it('a run never writes the document', async () => {
    const { id } = buggyWithMotor()
    const before = JSON.stringify(useBrickStore.getState().getDocumentSnapshot())
    const depth = useBrickStore.getState().undoStack.length
    await robotics().startSim(id)
    robotics().driveForward(id, 0.4)
    for (let frame = 0; frame < 30; frame += 1) robotics().sim!.mechanics.step(1 / 60)
    robotics().resetSim()
    expect(JSON.stringify(useBrickStore.getState().getDocumentSnapshot())).toBe(before)
    expect(useBrickStore.getState().undoStack).toHaveLength(depth)
  })
})
