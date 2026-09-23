import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { GATE_SECTION, loadWorld, storedPrograms, storedSection } from '../code/codeTestFixtures'
import { LIVE_ROOM_CODE_LINE, useCodeView } from '../code/codeViewState'
import { studioShortcutsSuspended } from '../code/studioKeys'
import { FOUR_WHEEL_IDS, GATE_IDS, ROVER_IDS, SIGNAL_IDS, fourWheelBricks, gateBricks, roverBricks, signalPostBricks } from '../model/fixtures'
import { emptyRoboticsSection, type RoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { resetStageStoreForTests, useStageStore } from '../state/stageStore'
import { RoboticsPanel } from '../ui/RoboticsPanel'
import DriveView, { keyAxes, tryResults } from './DriveView'
import { useDriveView } from './driveViewState'

/**
 * The Drive view through the real stores: the brick store holds the document, the robotics
 * store derives the robot, the stage store opens a real run controller (Rapier in Node) and
 * the program is compiled and run as in the browser. The scene is not mounted, so the tests
 * advance the controller themselves and publish its observation the way the scene does.
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})

beforeEach(() => {
  resetStageStoreForTests()
  useDriveView.setState({ creationId: null })
  useCodeView.setState({ creationId: null })
  useBrickStore.getState().newBuild()
  useRoboticsStore.setState({ card: null, wiringNote: null, frameRequest: null })
})

afterEach(() => {
  cleanup()
  resetStageStoreForTests()
})

const SIGNAL_SECTION: RoboticsSection = {
  ...emptyRoboticsSection(),
  creations: [{ id: 'signal', name: 'Signal light', anchorBrickIds: [SIGNAL_IDS.hub] }],
  connections: [{ deviceId: SIGNAL_IDS.sensor, hubId: SIGNAL_IDS.hub, port: 'A' }, { deviceId: SIGNAL_IDS.light, hubId: SIGNAL_IDS.hub, port: 'B' }],
}

const documentJson = () => JSON.stringify(useBrickStore.getState().getDocumentSnapshot())
const stage = () => useStageStore.getState().stage!
const COURSE_IDS = ['fence-ahead', 'fence-behind', 'fence-right', 'fence-left', 'post-right', 'post-left', 'post-far']

async function openDrive(id = 'rover', { live = false, strict = false } = {}) {
  act(() => useDriveView.getState().openDrive(id))
  const view = <DriveView live={live} />
  const utils = render(strict ? <StrictMode>{view}</StrictMode> : view)
  await screen.findByTestId('robo-drive')
  return utils
}
const running = async (space?: string) => {
  await waitFor(() => {
    const state = useStageStore.getState()
    expect(state.stage && !state.stageLoading && (!space || state.stage.space === space) && state.stageObservation?.phase === 'running').toBe(true)
  })
}
/** Steps the stage like the scene does (1/60 s frames) and publishes what it observes. */
function advance(seconds: number) {
  const current = stage()
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) current.controller.advance(1 / 60)
  act(() => useStageStore.getState().publishStageObservation(current.controller.observe()))
}
/** How far the chassis has moved along the robot's forward since the stage was built (world units). */
const travelled = (hub: string = ROVER_IDS.hub) => {
  const current = stage()
  const pose = current.controller.poses().get(current.controller.bodyOfBrick(hub)!)!
  const forward = current.creation.drivePair!.forward
  return pose.position.x * forward.x + pose.position.z * forward.z
}
/** The chassis's turn about the vertical since the stage was built, degrees (positive: to the left). */
const turned = (hub: string) => {
  const current = stage()
  const { rotation: q } = current.controller.poses().get(current.controller.bodyOfBrick(hub)!)!
  return (2 * Math.atan2(q.y, q.w) * 180) / Math.PI
}
const input = () => stage().controller.snapshot.input

describe('Drive', () => {
  it('opens driving-ready on the test plate’s course: nothing to code, no Run button, nothing saved', async () => {
    loadWorld()
    const before = documentJson()
    await openDrive('rover', { strict: true })
    await running('testPlate')
    expect(stage().controller.props.map((prop) => prop.id)).toEqual(COURSE_IDS)
    expect(screen.getByTestId('robo-drive')).toHaveAttribute('data-kind', 'drive')
    expect(screen.getByTestId('robo-drive-hint')).toHaveTextContent('Drag the joystick or use the arrow keys')
    expect(screen.getByRole('button', { name: 'Test plate' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /^Run$/ })).toBeNull()
    expect(screen.getByTestId('robo-drive-speed')).toHaveTextContent('Speed0.0studs a second')
    expect(studioShortcutsSuspended()).toBe(true)
    // Framed: the robot's bricks and the course's corners.
    expect(useRoboticsStore.getState().frameRequest?.points).toHaveLength(4)
    expect(storedPrograms()).toEqual([])
    expect(documentJson()).toBe(before)
  })

  it('W and the arrow keys drive the program’s joystick; the page never sees them; a text field keeps its keys', async () => {
    loadWorld()
    await openDrive()
    await running()
    // A key the view takes is not left to the page (no scrolling) or the studio.
    expect(fireEvent.keyDown(window, { key: 'w' })).toBe(false)
    advance(1)
    expect(input().joystick).toEqual({ up: 100, right: 0 })
    expect(travelled()).toBeGreaterThan(1)
    expect(Number(screen.getByTestId('robo-drive-speed').querySelector('strong')!.textContent)).toBeGreaterThan(1)
    fireEvent.keyUp(window, { key: 'w' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    advance(0.1)
    expect(input().joystick).toEqual({ up: 0, right: -100 })
    // The knob leans the way the keys push.
    expect(screen.getByTestId('robo-drive-joystick')).toHaveAttribute('data-right', '-100')
    fireEvent.keyUp(window, { key: 'ArrowLeft' })
    advance(0.1)
    expect(input().joystick).toEqual({ up: 0, right: 0 })
    const field = document.createElement('input')
    document.body.appendChild(field)
    expect(fireEvent.keyDown(field, { key: 'd' })).toBe(true)
    advance(0.1)
    expect(input().joystick).toEqual({ up: 0, right: 0 })
    field.remove()
  })

  it('the joystick drives it with a drag, and letting go centres it', async () => {
    loadWorld()
    await openDrive()
    await running()
    const stick = screen.getByTestId('robo-drive-joystick')
    // jsdom lays nothing out: the stick's centre is (0, 0), and its knob travels 48 px.
    fireEvent.pointerDown(stick, { pointerId: 1, clientX: 0, clientY: -48 })
    advance(0.5)
    expect(input().joystick).toEqual({ up: 100, right: 0 })
    expect(travelled()).toBeGreaterThan(0.5)
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 24, clientY: 0 })
    advance(0.05)
    expect(input().joystick).toEqual({ up: 0, right: 50 })
    // A second finger is ignored.
    fireEvent.pointerDown(stick, { pointerId: 2, clientX: -48, clientY: 0 })
    fireEvent.pointerMove(stick, { pointerId: 2, clientX: -48, clientY: 0 })
    advance(0.05)
    expect(input().joystick).toEqual({ up: 0, right: 50 })
    fireEvent.pointerUp(stick, { pointerId: 1 })
    advance(0.05)
    expect(input().joystick).toEqual({ up: 0, right: 0 })
    expect(stick).toHaveAttribute('data-up', '0')
  })

  it('Test plate / My world switch without writing the document; Reset starts it again where it was built', async () => {
    loadWorld()
    const before = documentJson()
    await openDrive()
    await running('testPlate')
    fireEvent.click(screen.getByRole('button', { name: 'My world' }))
    await running('myWorld')
    expect(stage().controller.props).toEqual([])
    expect(stage().creation.bodies.every((body) => !body.anchored)).toBe(true)
    expect(storedSection().creations[0].testSpace).toBeUndefined()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    advance(1)
    fireEvent.keyUp(window, { key: 'ArrowUp' })
    expect(travelled()).toBeGreaterThan(1)
    const generation = stage().generation
    fireEvent.click(screen.getByTestId('robo-drive-reset'))
    await running('myWorld')
    expect(stage().generation).toBeGreaterThan(generation)
    expect(Math.abs(travelled())).toBeLessThan(0.01)
    fireEvent.click(screen.getByRole('button', { name: 'Test plate' }))
    await running('testPlate')
    expect(stage().controller.props.map((prop) => prop.id)).toEqual(COURSE_IDS)
    expect(documentJson()).toBe(before)
  })

  it('a four-wheel car drives too: all four motors, from the keys, on its own course', async () => {
    const ids = FOUR_WHEEL_IDS
    loadWorld(fourWheelBricks(), { ...emptyRoboticsSection(), creations: [{ id: 'car', name: 'Four-wheel car', anchorBrickIds: [ids.hub] }], connections: ([[ids.frontLeftMotor, 'A'], [ids.frontRightMotor, 'B'], [ids.backLeftMotor, 'C'], [ids.backRightMotor, 'D']] as const).map(([deviceId, port]) => ({ deviceId, hubId: ids.hub, port })) })
    const before = documentJson()
    await openDrive('car')
    await running('testPlate')
    expect(stage().controller.props.map((prop) => prop.id)).toEqual(COURSE_IDS)
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    advance(1)
    const motors = stage().controller.observe().motors
    expect([ids.frontLeftMotor, ids.frontRightMotor, ids.backLeftMotor, ids.backRightMotor].every((id) => Math.abs(motors[id].powerPercent) > 50)).toBe(true)
    expect(travelled(ids.hub)).toBeGreaterThan(1)
    fireEvent.keyUp(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'a' })
    advance(1.2)
    fireEvent.keyUp(window, { key: 'a' })
    // Four wheels skid round more slowly than the rover's two, but they turn it the way A says: left.
    expect(turned(ids.hub)).toBeGreaterThan(15)
    expect(storedPrograms('car')).toEqual([])
    expect(documentJson()).toBe(before)
  })

  it('drives with the robot’s own joystick program when it has one', async () => {
    const workspace = { blocks: { languageVersion: 0, blocks: [{ type: 'robo_when_joystick_moves', id: 'hat', x: 40, y: 40, next: { block: { type: 'robo_drive_joystick', id: 'drive' } } }] } }
    loadWorld(roverBricks(), { ...emptyRoboticsSection(), creations: [{ id: 'rover', name: 'Mars buggy', anchorBrickIds: [ROVER_IDS.hub], activeProgramId: 'mine' }], connections: [{ deviceId: ROVER_IDS.leftMotor, hubId: ROVER_IDS.hub, port: 'A' }, { deviceId: ROVER_IDS.rightMotor, hubId: ROVER_IDS.hub, port: 'B' }], programs: [{ id: 'mine', creationId: 'rover', name: 'Zoom', workspace, deviceNames: {}, revision: 2 }] })
    const before = documentJson()
    await openDrive()
    await running()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    advance(0.5)
    // The saved program's own blocks are the ones running (the starter's ids begin "joystick-drive:").
    const active = stage().controller.observe().activeBlockIds
    expect(active).toContain('hat')
    expect(active.some((id) => id.startsWith('joystick-drive:'))).toBe(false)
    expect(travelled()).toBeGreaterThan(0.2)
    expect(documentJson()).toBe(before)
  })
})

describe('Try it', () => {
  it('a gate runs Smart gate (made on the fly) in My world, and the door opens when someone walks up', async () => {
    loadWorld(gateBricks(), GATE_SECTION)
    const before = documentJson()
    await openDrive('gate')
    await running('myWorld')
    expect(screen.getByTestId('robo-drive')).toHaveAttribute('data-kind', 'try')
    expect(screen.queryByRole('button', { name: 'My world' })).toBeNull()
    expect(screen.getByTestId('robo-drive-hint')).toHaveTextContent('Press the big button. Watch what happens.')
    expect(screen.getByTestId('robo-drive-results')).toHaveTextContent('Arm motorclosed')
    fireEvent.click(screen.getByRole('button', { name: 'Someone walks up' }))
    expect(useStageStore.getState().stageObservation?.visitorPhase).toBe('arriving')
    expect(screen.getByRole('button', { name: 'Someone walks up' })).toBeDisabled()
    let opened = false
    for (let second = 0; second < 8 && !opened; second += 0.5) {
      advance(0.5)
      opened = /Arm motoropen/.test(screen.getByTestId('robo-drive-results').textContent ?? '')
    }
    expect(opened).toBe(true)
    expect(screen.getByTestId('robo-drive-results')).toHaveTextContent('Front sensorsees something')
    expect(storedPrograms('gate')).toEqual([])
    expect(documentJson()).toBe(before)
  })

  it('a signal light turns red when someone walks up', async () => {
    loadWorld(signalPostBricks(), SIGNAL_SECTION)
    await openDrive('signal')
    await running('myWorld')
    expect(screen.getByTestId('robo-drive-results')).toHaveTextContent('Lightoff')
    fireEvent.click(screen.getByRole('button', { name: 'Someone walks up' }))
    let red = false
    for (let second = 0; second < 8 && !red; second += 0.5) {
      advance(0.5)
      red = /Lightred/.test(screen.getByTestId('robo-drive-results').textContent ?? '')
    }
    expect(red).toBe(true)
    expect(useStageStore.getState().stageObservation?.lights[SIGNAL_IDS.light]).toBe('red')
    expect(storedPrograms('signal')).toEqual([])
  })
})

describe('when it cannot run', () => {
  it('a robot that is not ready says the one thing to do, and opens no stage', async () => {
    loadWorld(roverBricks({ leftWheelOff: true }))
    await openDrive()
    expect(screen.getByTestId('robo-drive')).toHaveAttribute('data-state', 'not-ready')
    expect(screen.getByTestId('robo-drive-not-ready')).toHaveTextContent(/Mars buggy is almost ready!Put a wheel on .*axle\./)
    expect(useStageStore.getState().stage).toBeNull()
    expect(useStageStore.getState().stageLoading).toBe(false)
    fireEvent.click(screen.getByTestId('robo-drive-back'))
    expect(useDriveView.getState().creationId).toBeNull()
  })

  it('a gate with no sensor has nothing to try yet: it says to add one', async () => {
    loadWorld(gateBricks().filter((brick) => brick.id !== GATE_IDS.sensor), { ...GATE_SECTION, connections: GATE_SECTION.connections.filter((connection) => connection.deviceId !== GATE_IDS.sensor) })
    await openDrive('gate')
    expect(screen.getByTestId('robo-drive-not-ready')).toHaveTextContent('Castle gate is almost ready!Add a sensor so it can see.')
    expect(useStageStore.getState().stage).toBeNull()
  })

  it('in a live room it gives the Code view’s one line instead of a stage', async () => {
    loadWorld()
    await openDrive('rover', { live: true })
    expect(screen.getByTestId('robo-drive-live')).toHaveTextContent(LIVE_ROOM_CODE_LINE)
    expect(useStageStore.getState().stage).toBeNull()
    expect(useStageStore.getState().stageLoading).toBe(false)
  })
})

describe('closing', () => {
  it('a construction edit closes it (the construction is the truth); a rename does not', async () => {
    loadWorld()
    await openDrive()
    await running()
    act(() => useRoboticsStore.getState().renameCreation('rover', 'Zippy'))
    expect(useDriveView.getState().creationId).toBe('rover')
    expect(screen.getByText('Zippy')).toBeInTheDocument()
    act(() => {
      useBrickStore.getState().selectBrick(ROVER_IDS.sensor)
      useBrickStore.getState().nudge(1, 0, 0)
    })
    expect(useDriveView.getState().creationId).toBeNull()
    await waitFor(() => expect(screen.queryByTestId('robo-drive')).toBeNull())
    expect(useStageStore.getState().stage).toBeNull()
    expect(studioShortcutsSuspended()).toBe(false)
  })

  it('leaving Build closes it; so do Back to build and Escape', async () => {
    loadWorld()
    await openDrive()
    await running()
    act(() => useBrickStore.getState().setMode('explore'))
    expect(useDriveView.getState().creationId).toBeNull()
    cleanup()
    act(() => useBrickStore.setState({ mode: 'build' }))
    await openDrive()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useDriveView.getState().creationId).toBeNull()
    cleanup()
    await openDrive()
    fireEvent.click(screen.getByTestId('robo-drive-back'))
    expect(useDriveView.getState().creationId).toBeNull()
  })
})

describe('the mount', () => {
  it('shows in the robotics panel’s place, like the Code view, and opening it closes Code', async () => {
    loadWorld()
    act(() => useBrickStore.getState().selectBrick(ROVER_IDS.hub))
    render(<RoboticsPanel />)
    expect(screen.getByTestId('robotics-panel')).toBeInTheDocument()
    act(() => useCodeView.getState().openCode('rover'))
    act(() => useDriveView.getState().openDrive('rover'))
    expect(useCodeView.getState().creationId).toBeNull()
    expect(await screen.findByTestId('robo-drive')).toBeInTheDocument()
    expect(screen.queryByTestId('robotics-panel')).toBeNull()
    fireEvent.click(await screen.findByTestId('robo-drive-back'))
    expect(await screen.findByTestId('robotics-panel')).toBeInTheDocument()
  })
})

describe('pure parts', () => {
  it('the knob leans the way the held keys push', () => {
    expect(keyAxes(new Set())).toEqual({ up: 0, right: 0 })
    expect(keyAxes(new Set(['up', 'left'] as const))).toEqual({ up: 100, right: -100 })
    expect(keyAxes(new Set(['up', 'down'] as const))).toEqual({ up: 0, right: 0 })
  })

  it('the Try it results name the student’s parts in words', () => {
    loadWorld(gateBricks(), GATE_SECTION)
    const gate = useRoboticsStore.getState().model.creations[0]
    expect(tryResults(gate, null).map((result) => `${result.label}: ${result.value}`)).toEqual(['Front sensor: sees nothing', 'Arm motor: closed'])
  })
})
