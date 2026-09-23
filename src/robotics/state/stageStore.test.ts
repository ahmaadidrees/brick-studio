import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { GATE_IDS, ROVER_IDS, fixtureDocument, gateBricks, roverBricks } from '../model/fixtures'
import { disconnect } from '../model/control'
import { emptyRoboticsSection, readRoboticsSection, writeRoboticsSection, type RoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import type { ProgramRuntime, TickSnapshot } from '../run/types'
import { installRoboticsWatcher, useRoboticsStore } from './roboticsStore'
import { resetStageStoreForTests, useStageStore } from './stageStore'

/**
 * The stage slice through the real brick store: the document is loaded with
 * `restoreDocument`, edits go through the studio's own actions, and the stage reacts
 * the way the Code view will see it.
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})

const ROVER_SECTION: RoboticsSection = {
  ...emptyRoboticsSection(),
  creations: [{ id: 'rover', name: 'Mars buggy', anchorBrickIds: [ROVER_IDS.hub] }],
  connections: [
    { deviceId: ROVER_IDS.leftMotor, hubId: ROVER_IDS.hub, port: 'A' },
    { deviceId: ROVER_IDS.rightMotor, hubId: ROVER_IDS.hub, port: 'B' },
    { deviceId: ROVER_IDS.sensor, hubId: ROVER_IDS.hub, port: 'C' },
  ],
}
const GATE_SECTION: RoboticsSection = {
  ...emptyRoboticsSection(),
  creations: [{ id: 'gate', name: 'Castle gate', anchorBrickIds: [GATE_IDS.hinge] }],
  connections: [{ deviceId: GATE_IDS.hinge, hubId: GATE_IDS.hub, port: 'A' }, { deviceId: GATE_IDS.sensor, hubId: GATE_IDS.hub, port: 'B' }],
}

const stageState = () => useStageStore.getState()
const section = () => readRoboticsSection(useBrickStore.getState().documentMetadata.robotics)
const document = () => JSON.stringify(useBrickStore.getState().getDocumentSnapshot())

function load(bricks = roverBricks(), robotics = ROVER_SECTION) {
  expect(useBrickStore.getState().restoreDocument(fixtureDocument(bricks, robotics)).ok).toBe(true)
  useRoboticsStore.getState().refreshModel()
}

const driveForward: ProgramRuntime & { snapshots: TickSnapshot[] } = {
  snapshots: [],
  tick(snapshot) {
    driveForward.snapshots.push(snapshot)
    const source = { scriptId: 's', blockId: 'b', controller: false }
    return { intents: [{ kind: 'motorPower', deviceId: ROVER_IDS.leftMotor, percent: 40, source }, { kind: 'motorPower', deviceId: ROVER_IDS.rightMotor, percent: -40, source }], activeBlockIds: ['b'], diagnostics: [], variables: {}, idle: false }
  },
  stop() {},
}

beforeEach(() => {
  resetStageStoreForTests()
  useRoboticsStore.getState().resetSim()
  useBrickStore.getState().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [], mode: 'build' })
  driveForward.snapshots = []
})

describe('the stage slice', () => {
  it('opens in the creation’s run space, runs a program, stops and resets, and never writes the document', async () => {
    load()
    const before = document()
    const opening = stageState().openStage('rover')
    expect(stageState().stageLoading).toBe(true)
    await opening
    const stage = stageState().stage!
    expect(stageState().stageLoading).toBe(false)
    expect(stage.space).toBe('testPlate')
    expect(stage.controller.hiddenBrickIds.size).toBe(roverBricks().length)
    expect(stage.controller.props.map((prop) => prop.kind)).toEqual(['wall'])
    expect(stageState().stageObservation?.phase).toBe('ready')

    stageState().runOnStage(driveForward)
    expect(stageState().stageObservation?.phase).toBe('running')
    for (let frame = 0; frame < 60; frame += 1) stage.controller.advance(1 / 60)
    expect(driveForward.snapshots).toHaveLength(120)
    expect(stage.controller.observe().speedStudsPerSecond).toBeGreaterThan(2)
    stageState().stopStage()
    expect(stageState().stageObservation?.phase).toBe('stopped')

    stageState().resetStage()
    const fresh = stageState().stage!
    expect(fresh).not.toBe(stage)
    expect(fresh.generation).toBeGreaterThan(stage.generation)
    expect(stage.controller.mechanics.disposed).toBe(true)
    expect(fresh.controller.phase).toBe('ready')
    expect([...fresh.controller.poses().values()].every((pose) => pose.position.z === 0)).toBe(true)
    expect(document()).toBe(before)
  })

  it('opens in a chosen space without writing it, and the gate gets its visitor', async () => {
    load(gateBricks(), GATE_SECTION)
    await stageState().openStage('gate', 'testPlate')
    expect(stageState().stage!.space).toBe('testPlate')
    expect(section().creations[0].testSpace).toBeUndefined()
    await stageState().openStage('gate')
    expect(stageState().stage!.space).toBe('myWorld')
    expect(stageState().stage!.controller.hiddenBrickIds).toEqual(stageState().stage!.controller.simulatedBrickIds)
    stageState().triggerVisitor()
    expect(stageState().stageObservation?.visitorPhase).toBe('arriving')
  })

  it('a construction edit resets the open stage at the new built pose; a rename does not', async () => {
    load()
    await stageState().openStage('rover')
    const stage = stageState().stage!
    stageState().runOnStage(driveForward)
    useRoboticsStore.getState().renameCreation('rover', 'Rover')
    expect(stageState().stage).toBe(stage)
    useBrickStore.getState().selectBrick(ROVER_IDS.sensor)
    useBrickStore.getState().nudge(1, 0, 0)
    const next = stageState().stage!
    expect(next).not.toBe(stage)
    expect(stage.controller.mechanics.disposed).toBe(true)
    expect(next.controller.phase).toBe('ready')
    expect(stageState().stageNotice?.reason).toBe('edit')
  })

  it('a cable edit resets it; a program-only change of the section does not', async () => {
    load()
    await stageState().openStage('rover')
    const stage = stageState().stage!
    // Anything outside the behaviour key (names, and later programs) leaves the stage alone.
    useBrickStore.getState().setRoboticsSection(writeRoboticsSection({ ...section(), devices: { [ROVER_IDS.leftMotor]: { name: 'Port motor' } } }), 'Rename device')
    expect(stageState().stage).toBe(stage)
    useBrickStore.getState().setRoboticsSection(writeRoboticsSection(disconnect(section(), ROVER_IDS.leftMotor)), 'Unplug')
    expect(stageState().stage).not.toBe(stage)
    expect(stageState().stage!.creation.motors.find((motor) => motor.brickId === ROVER_IDS.leftMotor)!.plugged).toBe(false)
  })

  it('an edit while it is still opening starts it again from the edited document', async () => {
    load()
    const opening = stageState().openStage('rover')
    useBrickStore.getState().selectBrick(ROVER_IDS.sensor)
    useBrickStore.getState().nudge(1, 0, 0)
    await opening
    await waitFor(() => stageState().stage !== null)
    const sensor = useBrickStore.getState().bricks.find((brick) => brick.id === ROVER_IDS.sensor)!
    expect(sensor.x).toBe(31)
    expect(stageState().stage!.bricks.find((brick) => brick.id === ROVER_IDS.sensor)).toEqual(sensor)
    expect(stageState().stageLoading).toBe(false)
  })

  it('closing cancels an open still in flight', async () => {
    load()
    const opening = stageState().openStage('rover')
    stageState().closeStage()
    await opening
    expect(stageState().stage).toBeNull()
    expect(stageState().stageLoading).toBe(false)
  })

  it('leaving build mode closes it; removing the creation closes it', async () => {
    load()
    await stageState().openStage('rover')
    const stage = stageState().stage!
    useBrickStore.getState().setMode('explore')
    expect(stageState().stage).toBeNull()
    expect(stage.controller.mechanics.disposed).toBe(true)
    useBrickStore.setState({ mode: 'build' })
    load()
    await stageState().openStage('rover')
    useBrickStore.getState().setRoboticsSection(writeRoboticsSection({ ...section(), creations: [] }), 'Remove creation')
    expect(stageState().stage).toBeNull()
  })

  it('opening retires a running nudge', async () => {
    load()
    await useRoboticsStore.getState().startSim('rover')
    expect(useRoboticsStore.getState().sim).not.toBeNull()
    await stageState().openStage('rover')
    expect(useRoboticsStore.getState().sim).toBeNull()
    expect(stageState().stage).not.toBeNull()
  })
})

async function waitFor(condition: () => boolean, attempts = 50) {
  for (let attempt = 0; attempt < attempts && !condition(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5))
  expect(condition()).toBe(true)
}
