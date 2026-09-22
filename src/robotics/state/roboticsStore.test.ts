import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { readRoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsWatcher, useRoboticsStore } from './roboticsStore'

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

beforeEach(() => {
  useRoboticsStore.getState().resetSim()
  useBrickStore.getState().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [] })
  useRoboticsStore.setState({ card: null, wiringNote: null })
  useRoboticsStore.getState().refreshModel()
})

describe('placing devices', () => {
  it('the first device on non-creation bricks opens the card; Not now keeps the creation', () => {
    place('plate_6x8', 28, 0, 26)
    expect(useRoboticsStore.getState().card).toBeNull()
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    const card = useRoboticsStore.getState().card
    expect(card?.creationId).toBeNull()
    expect(card?.anchorBrickIds).toHaveLength(2)
    expect(card?.suggestedName).toBe('Creation')
    useRoboticsStore.getState().confirmCard('', false)
    expect(useRoboticsStore.getState().card).toBeNull()
    expect(section().creations).toHaveLength(1)
    expect(section().creations[0].name).toBe('Creation')
    expect(useRoboticsStore.getState().model.creations[0].brickIds).toHaveLength(2)
  })

  it('assisted wiring connects a motor to the first free port with an undoable line, and never a hub to itself', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    expect(useRoboticsStore.getState().wiringNote).toBeNull()
    useRoboticsStore.getState().confirmCard('Buggy', false)
    const motor = place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    expect(useRoboticsStore.getState().wiringNote).toMatchObject({ text: 'Left motor connected to port A', undoable: true })
    expect(section().connections).toEqual([{ deviceId: motor, hubId: expect.any(String), port: 'A' }])
    // The card reopened for the existing creation.
    expect(useRoboticsStore.getState().card?.creationId).toBe(section().creations[0].id)
    // Undo removes the cable and only the cable; the motor stays.
    useRoboticsStore.getState().undoWiring()
    expect(section().connections).toEqual([])
    expect(useBrickStore.getState().bricks.some((brick) => brick.id === motor)).toBe(true)
    // A second undo takes the motor away with it.
    useBrickStore.getState().undo()
    expect(useBrickStore.getState().bricks.some((brick) => brick.id === motor)).toBe(false)
  })

  it('a device placed with no hub is placed unpowered and told so', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    expect(useRoboticsStore.getState().wiringNote).toMatchObject({ text: 'Left motor placed unpowered · add a hub to plug it in', undoable: false })
    expect(section().connections).toEqual([])
  })

  it('a hub arriving powers the parts already waiting for it', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    useRoboticsStore.getState().confirmCard('Buggy', false)
    place(ROBOTICS_PART_IDS.motor, 31, 1, 31, 0)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    expect(useRoboticsStore.getState().wiringNote?.text).toBe('Left motor connected to port A · Right motor connected to port B')
    expect(section().connections.map((connection) => connection.port)).toEqual(['A', 'B'])
  })

  it('a full hub refuses the fifth device with the ports line', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    useRoboticsStore.getState().confirmCard('Post', false)
    place(ROBOTICS_PART_IDS.light, 28, 1, 26)
    place(ROBOTICS_PART_IDS.light, 28, 1, 27)
    place(ROBOTICS_PART_IDS.light, 28, 1, 28)
    place(ROBOTICS_PART_IDS.light, 28, 1, 29)
    place(ROBOTICS_PART_IDS.light, 28, 1, 30)
    expect(useRoboticsStore.getState().wiringNote?.text).toBe('Ports A–D are full. Unplug something to plug in Light')
    expect(section().connections).toHaveLength(4)
  })

  it('undo and redo of a placement do not re-run assisted wiring', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    useRoboticsStore.getState().confirmCard('Buggy', false)
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    expect(section().connections).toHaveLength(1)
    useBrickStore.getState().undo() // the cable
    useBrickStore.getState().undo() // the motor
    useRoboticsStore.setState({ wiringNote: null })
    useBrickStore.getState().redo() // the motor returns, unpowered, without a new line
    expect(useBrickStore.getState().bricks).toHaveLength(3)
    expect(section().connections).toHaveLength(0)
    expect(useRoboticsStore.getState().wiringNote).toBeNull()
  })

  it('the robotics section rides with the document snapshot and a blank build drops it', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    useRoboticsStore.getState().confirmCard('Buggy', false)
    const snapshot = useBrickStore.getState().getDocumentSnapshot()
    expect(snapshot.robotics).toMatchObject({ version: 1, creations: [{ name: 'Buggy' }] })
    useBrickStore.getState().newBuild()
    expect(useBrickStore.getState().getDocumentSnapshot().robotics).toBeUndefined()
    useBrickStore.getState().undo()
    expect(useBrickStore.getState().getDocumentSnapshot().robotics).toMatchObject({ creations: [{ name: 'Buggy' }] })
  })
})
