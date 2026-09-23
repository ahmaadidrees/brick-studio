import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { selectionDraftIsValid, selectionDrafts, useBrickStore } from '../../brick/store'
import { readiness } from '../drive/readiness'
import { readRoboticsSection, writeRoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { armKit, installKitWatcher, useKitStore } from './kitPlacement'
import { kitById, type KitId } from './kits'
import { kitBetweenTwoRobots, kitUnderAnOverhang } from './kitTestFixtures'

/**
 * Kits through the real stores, the way the studio drives them: the drawer arms the kit, the
 * scene moves the ghost with `setDraftPosition` and a click (or Enter, or the Place button)
 * calls `placeDraft`. The robotics watcher is installed first, as the panel installs it in
 * the app, so it sees every kit placement the way it sees any other.
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
  installKitWatcher()
})

beforeEach(() => {
  useRoboticsStore.getState().resetSim()
  useBrickStore.getState().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [], viewTarget: { x: 32, z: 32 }, brickBudget: 1000, toast: null })
  useRoboticsStore.setState({ card: null, wiringNote: null, frameRequest: null })
  useRoboticsStore.getState().refreshModel()
  useKitStore.setState({ armed: null })
})

const brickState = () => useBrickStore.getState()
const section = () => readRoboticsSection(brickState().documentMetadata.robotics)
const robots = () => useRoboticsStore.getState().model.creations
const snapshot = () => JSON.stringify(brickState().getDocumentSnapshot())

/** Arms the kit, moves its ghost so the base plate's corner is at x, z, and places it with one click. */
function placeKit(kitId: KitId, x: number, z: number) {
  expect(armKit(kitId)).toBe(true)
  brickState().setDraftPosition(x, 0, z)
  expect(brickState().placeDraft()).toBe(true)
  return brickState().bricks.slice(-kitById(kitId).bricks.length).map((brick) => brick.id)
}

describe('arming a kit', () => {
  it('shows the whole kit as one ghost where the camera looks, named for the command strip', () => {
    expect(armKit('buggy')).toBe(true)
    const state = brickState()
    expect(state.movingSelection).toMatchObject({ duplicate: true, name: 'Buggy' })
    expect(state.movingSelection?.originals).toHaveLength(9)
    expect(state.activePartId).toBeNull()
    expect(state.draft).toMatchObject({ partId: 'plate_6x8', y: 0 })
    expect(selectionDrafts(state)).toHaveLength(9)
    expect(selectionDraftIsValid(state)).toBe(true)
    // Centred on the view target: the Buggy is 12 studs wide and 8 deep.
    expect(Math.min(...selectionDrafts(state).map((draft) => draft.x))).toBe(26)
    expect(useKitStore.getState().armed?.kitId).toBe('buggy')
    expect(state.toast).toBe('Click the plate where your Buggy goes.')
  })

  it('the ghost follows the pointer like any brick and always stands on the ground', () => {
    armKit('gate')
    brickState().setDraftPosition(10, 0, 12)
    expect(brickState().draft).toMatchObject({ x: 10, y: 0, z: 12 })
    // The pointer over a tall brick lifts a ghost onto it; a kit drops back down.
    brickState().setDraftPosition(11, 9, 12)
    expect(brickState().draft).toMatchObject({ x: 11, y: 0, z: 12 })
    brickState().nudge(0, 1, 0)
    expect(brickState().draft?.y).toBe(0)
    brickState().nudge(1, 0, 0)
    expect(brickState().draft).toMatchObject({ x: 12, y: 0, z: 12 })
  })

  it('shows blocked where it would overlap, and a blocked click places nothing', () => {
    placeKit('buggy', 29, 28)
    const before = snapshot()
    armKit('buggy')
    brickState().setDraftPosition(31, 0, 28)
    expect(selectionDraftIsValid(brickState())).toBe(false)
    expect(brickState().placeDraft()).toBe(false)
    expect(snapshot()).toBe(before)
    expect(useKitStore.getState().armed?.kitId).toBe('buggy')
  })

  it('starts on free ground when the middle of the view is taken', () => {
    placeKit('buggy', 29, 28)
    armKit('signal-light')
    expect(selectionDraftIsValid(brickState())).toBe(true)
  })

  it('a world with no room for the kit says so and arms nothing', () => {
    useBrickStore.setState({ brickBudget: 5 })
    expect(armKit('buggy')).toBe(false)
    expect(brickState().movingSelection).toBeNull()
    expect(brickState().toast).toBe('There is no room for a Buggy in this world. Delete some bricks first.')
    expect(useKitStore.getState().armed).toBeNull()
  })

  it('putting it away (Cancel, another part, Explore) places nothing and forgets the kit', () => {
    armKit('buggy')
    brickState().cancelInteraction()
    expect(useKitStore.getState().armed).toBeNull()
    expect(brickState().draft).toBeNull()
    armKit('buggy')
    brickState().choosePart('brick_2x2')
    expect(useKitStore.getState().armed).toBeNull()
    expect(brickState().placeDraft()).toBe(true)
    expect(section().creations).toEqual([])
    armKit('gate')
    brickState().setMode('explore')
    expect(useKitStore.getState().armed).toBeNull()
    expect(brickState().bricks).toHaveLength(1)
  })
})

describe('placing a kit', () => {
  it('one click makes a ready robot: named, every device plugged in, no card, focused and framed', () => {
    const ids = placeKit('buggy', 29, 28)
    expect(brickState().bricks).toHaveLength(9)
    const [robot] = robots()
    expect(robot.name).toBe('Buggy')
    expect(robot.brickIds).toEqual(ids)
    expect(section().connections.map((cable) => cable.port)).toEqual(['A', 'B', 'C'])
    expect(robot.motors.every((motor) => motor.plugged) && robot.sensors.every((sensor) => sensor.plugged)).toBe(true)
    expect(readiness(robot)).toEqual({ kind: 'drive', ready: true, reason: null })
    expect(useRoboticsStore.getState().card).toBeNull()
    expect(useRoboticsStore.getState().wiringNote).toBeNull()
    // Framed with ground around it: three studs out from the kit's footprint on every side.
    const frame = useRoboticsStore.getState().frameRequest
    expect(frame?.brickIds).toEqual(robot.brickIds)
    expect(frame?.points).toHaveLength(4)
    expect(Math.min(...frame!.points!.map((point) => point.x))).toBeCloseTo((26 - 3 - 32) * 0.62)
    expect(Math.max(...frame!.points!.map((point) => point.z))).toBeCloseTo((36 + 3 - 32) * 0.62)
    // Nothing stays picked (lane P): the next click picks one part; the panel shows the new robot anyway.
    expect(brickState().selectedIds).toEqual([])
    expect(brickState().selectedId).toBeNull()
    expect(brickState().draft).toBeNull()
    expect(useKitStore.getState().armed).toBeNull()
    expect(brickState().toast).toBe('Buggy is ready to drive!')
    expect(brickState().undoStack.map((entry) => entry.label)).toEqual(['Add Buggy'])
  })

  it('one Undo takes the whole kit away (bricks, robot and cables); Redo brings it back', () => {
    const empty = snapshot()
    placeKit('buggy', 29, 28)
    const placed = snapshot()
    brickState().undo()
    expect(snapshot()).toBe(empty)
    expect(brickState().bricks).toEqual([])
    expect(section().creations).toEqual([])
    expect(section().connections).toEqual([])
    expect(robots()).toEqual([])
    expect(brickState().toast).toBe('Undid: Add Buggy.')
    brickState().redo()
    expect(snapshot()).toBe(placed)
    expect(robots()[0].name).toBe('Buggy')
  })

  it('Undo after a second kit takes only that kit', () => {
    placeKit('buggy', 10, 10)
    const one = snapshot()
    placeKit('gate', 40, 40)
    brickState().undo()
    expect(snapshot()).toBe(one)
    expect(robots().map((robot) => robot.name)).toEqual(['Buggy'])
  })

  it('the next Buggy is Buggy 2, a robot of its own', () => {
    const first = placeKit('buggy', 10, 10)
    const second = placeKit('buggy', 40, 40)
    expect(robots().map((robot) => robot.name)).toEqual(['Buggy', 'Buggy 2'])
    expect(robots()[0].brickIds).toEqual(first)
    expect(robots()[1].brickIds).toEqual(second)
    expect(section().connections).toHaveLength(6)
    expect(robots().every((robot) => readiness(robot).ready)).toBe(true)
    expect(brickState().toast).toBe('Buggy 2 is ready to drive!')
  })

  it('Gate, Signal light and Robot base arrive ready too', () => {
    placeKit('gate', 6, 6)
    expect(brickState().toast).toBe('Gate is ready. Try it!')
    placeKit('signal-light', 30, 6)
    expect(brickState().toast).toBe('Signal light is ready. Try it!')
    placeKit('robot-base', 6, 40)
    expect(brickState().toast).toBe('My robot is ready for your parts!')
    const [gate, signal, base] = robots()
    expect(gate).toMatchObject({ name: 'Gate', kind: 'gate' })
    expect(gate.hinges[0]).toMatchObject({ locked: false, plugged: true })
    expect(readiness(gate)).toEqual({ kind: 'try', ready: true, reason: null })
    expect(signal).toMatchObject({ name: 'Signal light', kind: 'signal' })
    expect(readiness(signal)).toEqual({ kind: 'try', ready: true, reason: null })
    expect(base.name).toBe('My robot')
    expect(base.hubs).toHaveLength(1)
    expect(brickState().undoStack.map((entry) => entry.label)).toEqual(['Add Gate', 'Add Signal light', 'Add My robot'])
  })

  it('a brush colour picked while the kit is armed paints the kit, and it is still a ready robot', () => {
    armKit('buggy')
    brickState().setActiveColor('#ef8d32')
    expect(useKitStore.getState().armed?.kitId).toBe('buggy')
    brickState().setDraftPosition(29, 0, 28)
    brickState().placeDraft()
    expect(brickState().bricks.every((brick) => brick.color === '#ef8d32')).toBe(true)
    expect(readiness(robots()[0]).ready).toBe(true)
  })

  it('nothing stays picked; picked all again (a box around it), Rotate turns the whole robot and it still drives', () => {
    placeKit('buggy', 29, 28)
    expect(brickState().selectedIds).toEqual([])
    brickState().selectBricks(robots()[0].brickIds)
    brickState().rotate()
    expect(brickState().undoStack.at(-1)?.label).toBe('Rotate 9 bricks')
    const [robot] = robots()
    expect(robot.brickIds).toHaveLength(9)
    expect(readiness(robot)).toEqual({ kind: 'drive', ready: true, reason: null })
  })

  it('in manual wiring, the kit still comes plugged in', () => {
    brickState().setRoboticsSection(writeRoboticsSection({ ...section(), settings: { wiring: 'manual' } }), 'Manual wiring')
    useBrickStore.setState({ undoStack: [] })
    placeKit('buggy', 29, 28)
    expect(readiness(robots()[0]).ready).toBe(true)
    expect(section().settings.wiring).toBe('manual')
  })

  it('a motor the student adds later to a kit robot joins it, plugged in, with no card', () => {
    // The Buggy's left motor stands five studs back on its plate, turned to face out.
    placeKit('robot-base', 29, 28)
    brickState().choosePart(ROBOTICS_PART_IDS.motor)
    for (let turn = 0; turn < 2; turn += 1) brickState().rotate()
    brickState().setDraftPosition(29, 1, 33)
    expect(brickState().placeDraft()).toBe(true)
    expect(useRoboticsStore.getState().card).toBeNull()
    expect(robots()).toHaveLength(1)
    expect(robots()[0].motors[0]).toMatchObject({ plugged: true, port: { port: 'A' } })
  })
})

describe('a kit built onto a saved robot', () => {
  it('joins it, in one Undo, with no card', () => {
    const { existing, section: saved, base } = kitUnderAnOverhang()
    useBrickStore.setState({ bricks: existing })
    brickState().setRoboticsSection(writeRoboticsSection(saved), 'Saved')
    useBrickStore.setState({ undoStack: [] })
    useRoboticsStore.getState().refreshModel()
    const before = snapshot()
    placeKit('robot-base', base[0].x, base[0].z)
    expect(section().creations.map((creation) => creation.name)).toEqual(['Signal light'])
    expect(robots()[0].brickIds).toEqual(expect.arrayContaining(brickState().bricks.slice(-2).map((brick) => brick.id)))
    expect(useRoboticsStore.getState().card).toBeNull()
    expect(brickState().toast).toBe('The Robot base is part of Signal light now.')
    expect(brickState().undoStack.map((entry) => entry.label)).toEqual(['Add a Robot base to Signal light'])
    brickState().undo()
    expect(snapshot()).toBe(before)
  })

  it('touching two robots, the join card asks what to call them, and one Undo still takes the kit away', () => {
    const { existing, section: saved, base } = kitBetweenTwoRobots()
    useBrickStore.setState({ bricks: existing })
    brickState().setRoboticsSection(writeRoboticsSection(saved), 'Saved')
    useBrickStore.setState({ undoStack: [] })
    useRoboticsStore.getState().refreshModel()
    const before = snapshot()
    placeKit('robot-base', base[0].x, base[0].z)
    expect(useRoboticsStore.getState().card?.joining?.names).toEqual(['Arm A', 'Arm B'])
    expect(section().creations.map((creation) => creation.name)).toEqual(['Arm A', 'Arm B'])
    expect(brickState().toast).toBe('The Robot base joins Arm A and Arm B.')
    expect(brickState().undoStack.map((entry) => entry.label)).toEqual(['Add a Robot base'])
    brickState().undo()
    expect(snapshot()).toBe(before)
  })
})
