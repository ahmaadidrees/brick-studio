import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPartMap } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import { findSnap, snapDraftToConnector } from '../model/snap'
import { registerDraftSnapper, snapDraft } from '../scene/draftSnap'
import { disconnect } from '../model/control'
import { createProgram, setActiveProgram } from '../program/programs'
import { defaultStarterFor } from '../program/starters'
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
  it('the first device on non-creation bricks opens the card and frames the component; Keep building keeps the robot', () => {
    place('plate_6x8', 28, 0, 26)
    expect(robotics().card).toBeNull()
    expect(robotics().frameRequest).toBeNull()
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    const card = robotics().card
    expect(card?.creationId).toBeNull()
    expect(card?.anchorBrickIds).toHaveLength(2)
    expect(card?.suggestedName).toBe('Robot')
    expect(robotics().frameRequest?.brickIds).toEqual(card?.anchorBrickIds)
    robotics().confirmCard('', false)
    expect(robotics().card).toBeNull()
    expect(section().creations).toHaveLength(1)
    expect(section().creations[0].name).toBe('Robot')
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

  it('a device placed with no hub is told, in kid words, that it needs one', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    expect(robotics().wiringNote).toMatchObject({ text: 'Left motor needs a hub. Add a hub to plug it in.', undoable: false })
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
    expect(robotics().wiringNote?.text).toBe('The hub is full. Unplug something to plug in Light.')
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

describe('a motor on a hub (the Codex QA case)', () => {
  function motorOnHub(rotation: number) {
    place(ROBOTICS_PART_IDS.hub, 28, 0, 29)
    robotics().confirmCard('Post', false)
    return place(ROBOTICS_PART_IDS.motor, 29, 6, 30, rotation)
  }
  const snapAxleTo = (motorId: string) => {
    const state = useBrickStore.getState()
    state.choosePart(ROBOTICS_PART_IDS.axleShort)
    const motor = state.bricks.find((brick) => brick.id === motorId)!
    return snapDraft(useBrickStore.getState().draft!, motor, { x: 0, y: 0, z: 0 }, useBrickStore.getState().bricks, 64)
  }
  beforeAll(() => registerDraftSnapper((draft, hitBrick, hitPoint, bricks, plateSize) => snapDraftToConnector({ draft, hitBrick, hitPoint, bricks, partMap: createPartMap([]), plateSize })))
  afterAll(() => registerDraftSnapper(null))

  it('a motor on top of the hub takes no axle: its wheel could never touch the ground, and the hint says so (kid-UX lane W, Sam)', () => {
    const motor = motorOnHub(0)
    expect(snapAxleTo(motor)).toBeNull()
    const draft = useBrickStore.getState().draft!
    const bricks = useBrickStore.getState().bricks
    const outcome = findSnap({ draft, hitBrick: bricks.find((brick) => brick.id === motor)!, hitPoint: { x: 0, y: 0, z: 0 }, bricks, partMap: createPartMap([]), plateSize: 64 })
    expect(outcome).toMatchObject({ found: null, hint: { kind: 'motor-too-high', brickId: motor } })
    useBrickStore.getState().cancelInteraction()
    // The step says to move it down to a side of the plate (here there is no plate: it asks for one).
    expect(robotics().model.creations[0].motors[0].socketRoom).toBe('high')
  })

  it('with the socket facing into the hub, the snapped axle is refused and the refusal names the hub', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    robotics().confirmCard('Post', false)
    // A motor at the back of the plate, turned to face the far side: its socket looks straight into the hub.
    const motor = place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 1)
    const pose = snapAxleTo(motor)!
    expect(pose).toMatchObject({ y: 0, rotation: 1 })
    for (let turn = 0; turn < pose.rotation; turn += 1) useBrickStore.getState().rotate()
    useBrickStore.getState().setDraftPosition(pose.x, pose.y, pose.z)
    expect(useBrickStore.getState().placeDraft()).toBe(false)
    expect(useBrickStore.getState().toast).toBe("The axle can't go there. 6 × 8 Plate and Hub are in the way. Turn or move the motor so its socket faces open space.")
    useBrickStore.getState().cancelInteraction()
  })
})

describe('a device beside a robot, a motor on the bare ground (docs/robotics/KID-UX.md §S)', () => {
  beforeAll(() => registerDraftSnapper((draft, hitBrick, hitPoint, bricks, plateSize) => snapDraftToConnector({ draft, hitBrick, hitPoint, bricks, partMap: createPartMap([]), plateSize })))
  afterAll(() => registerDraftSnapper(null))

  it('a motor on the ground beside Buggy says which robot it is not on and how to attach it, and starts no second robot', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    robotics().confirmCard('Buggy', false)
    const motor = place(ROBOTICS_PART_IDS.motor, 35, 0, 30)
    // Kid-UX lane W: "This motor isn't on Buggy yet." with the one tap that puts it on.
    expect(robotics().wiringNote).toMatchObject({ text: "This motor isn't on Buggy yet.", undoable: false, brickId: motor, action: { kind: 'put-on', brickId: motor, creationId: section().creations[0].id, label: 'Put it on Buggy' } })
    expect(robotics().card).toBeNull()
    expect(section().creations).toHaveLength(1)
    expect(section().connections).toEqual([])
    // Moved onto the plate it joins Buggy and is plugged in, as any device does.
    useBrickStore.getState().selectBrick(motor)
    useBrickStore.getState().startMove()
    useBrickStore.getState().setDraftPosition(31, 1, 31)
    expect(useBrickStore.getState().placeDraft()).toBe(true)
    expect(robotics().wiringNote?.text).toBe('Right motor connected to port A')
  })

  it('the line goes away with the part it is about (Undo)', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    robotics().confirmCard('Buggy', false)
    place(ROBOTICS_PART_IDS.motor, 35, 0, 30)
    expect(robotics().wiringNote?.brickId).toBeDefined()
    useBrickStore.getState().undo()
    expect(robotics().wiringNote).toBeNull()
  })

  it('beside a robot whose card is still open, it names the robot the card is about', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    expect(robotics().card?.creationId).toBeNull()
    place(ROBOTICS_PART_IDS.motor, 35, 0, 30)
    expect(robotics().wiringNote).toMatchObject({ text: "This motor isn't on Robot yet.", action: { kind: 'put-on', creationId: 'candidate', label: 'Put it on Robot' } })
    expect(robotics().card?.anchorBrickIds).toHaveLength(2)
  })

  it('a motor on the bare ground with no robot near says why wheels cannot reach, where the student looks', () => {
    const motor = place(ROBOTICS_PART_IDS.motor, 10, 0, 10)
    expect(robotics().wiringNote).toMatchObject({ text: 'Put motors on a plate so wheels reach the ground', brickId: motor })
    expect(robotics().card?.anchorBrickIds).toEqual([motor])
  })

  it('a motor snapped onto a plate with both sides full is refused with what is in the way', () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    robotics().confirmCard('Buggy', false)
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    place(ROBOTICS_PART_IDS.motor, 31, 1, 31, 0)
    const state = useBrickStore.getState()
    state.choosePart(ROBOTICS_PART_IDS.motor)
    const plate = state.bricks.find((brick) => brick.partId === 'plate_6x8')!
    const pose = snapDraft(useBrickStore.getState().draft!, plate, { x: (28.5 - 32) * 0.62, y: 0.18, z: (29 - 32) * 0.62 }, useBrickStore.getState().bricks, 64)!
    expect(pose).toMatchObject({ x: 28, y: 1, z: 28, rotation: 2 })
    for (let turn = 0; turn < pose.rotation; turn += 1) useBrickStore.getState().rotate()
    useBrickStore.getState().setDraftPosition(pose.x, pose.y, pose.z)
    expect(useBrickStore.getState().placeDraft()).toBe(false)
    expect(useBrickStore.getState().toast).toBe('No room on the plate. Hub is in the way.')
    useBrickStore.getState().cancelInteraction()
  })
})

describe('the union card (contract §4)', () => {
  /** Two named creations on two plates side by side, each with a hub; Crane has a program. */
  function twoCreations() {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    robotics().confirmCard('Buggy', false)
    place('plate_6x8', 34, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 35, 1, 27)
    robotics().confirmCard('Crane', false)
    const crane = robotics().model.creations.find((creation) => creation.name === 'Crane')!
    const created = createProgram(section(), crane, defaultStarterFor(crane), { id: 'crane-program' })
    expect(created.ok).toBe(true)
    useBrickStore.getState().setRoboticsSection(writeRoboticsSection(created.section), 'Add program', { history: false })
    useBrickStore.getState().setRoboticsSection(writeRoboticsSection(setActiveProgram(section(), crane.id, 'crane-program')), 'Active program', { history: false })
    return { buggyId: section().creations[0].id, craneId: crane.id }
  }

  it('a brick studded onto both opens the card for the union; confirming makes one creation that keeps both programs', () => {
    const { buggyId, craneId } = twoCreations()
    expect(robotics().model.creations).toHaveLength(2)
    place('brick_2x4', 33, 1, 27)
    const card = robotics().card!
    expect(card.creationId).toBe(buggyId)
    expect(card.joining).toEqual({ creationIds: [craneId], names: ['Buggy', 'Crane'] })
    expect(card.suggestedName).toBe('Buggy')
    robotics().confirmCard('Big rig', false)
    expect(section().creations).toHaveLength(1)
    expect(section().creations[0]).toMatchObject({ id: buggyId, name: 'Big rig', activeProgramId: 'crane-program' })
    expect(section().programs.map((program) => program.creationId)).toEqual([buggyId])
    expect(robotics().model.creations[0].hubs).toHaveLength(2)
    expect(topLabel()).toBe('Join Buggy and Crane')
    // One undo brings both creations back, with the program on Crane again.
    useBrickStore.getState().undo()
    expect(section().creations.map((creation) => creation.name)).toEqual(['Buggy', 'Crane'])
    expect(section().programs[0].creationId).toBe(craneId)
    // Redo joins them again and the program follows.
    useBrickStore.getState().redo()
    expect(section().creations).toHaveLength(1)
    expect(section().programs[0].creationId).toBe(buggyId)
  })

  it('Not now joins them too, under the first creation\'s name', () => {
    twoCreations()
    place('brick_2x4', 33, 1, 27)
    robotics().confirmCard('', false)
    expect(section().creations.map((creation) => creation.name)).toEqual(['Buggy'])
  })

  it('two creations that only touch stay two, and no card opens', () => {
    twoCreations()
    // A brick on Buggy's plate right against Crane's plate edge: touching, not studded to it.
    place('brick_1x1', 33, 1, 26)
    expect(robotics().card).toBeNull()
    expect(section().creations).toHaveLength(2)
  })
})

describe('a nudge on a creation that can drive', () => {
  it('frames the creation with room ahead and behind, so it never rolls under a panel', async () => {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    robotics().confirmCard('Rover', false)
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    place(ROBOTICS_PART_IDS.motor, 31, 1, 31, 0)
    place(ROBOTICS_PART_IDS.axleShort, 26, 0, 32)
    place(ROBOTICS_PART_IDS.axleShort, 34, 0, 32)
    place(ROBOTICS_PART_IDS.wheel, 25, 0, 31)
    place(ROBOTICS_PART_IDS.wheel, 36, 0, 31)
    const rover = robotics().model.creations[0]
    expect(rover.drivePair).not.toBeNull()
    const before = robotics().frameRequest?.nonce ?? 0
    await robotics().startSim(rover.id)
    const request = robotics().frameRequest!
    expect(request.nonce).toBeGreaterThan(before)
    expect(request.brickIds).toEqual(rover.brickIds)
    expect(request.points).toHaveLength(2)
    // Ahead and behind along the drive pair's forward (-Z here), nine studs each way.
    const [ahead, behind] = request.points!
    expect(ahead.z).toBeLessThan(behind.z)
    expect(behind.z - ahead.z).toBeCloseTo(18 * 0.62, 5)
    robotics().resetSim()
  })
})
