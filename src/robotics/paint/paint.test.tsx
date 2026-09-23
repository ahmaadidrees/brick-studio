import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BRICK_COLORS } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import { useCodeView } from '../code/codeViewState'
import { useDriveView } from '../drive/driveViewState'
import { deriveCreations } from '../model/creations'
import { ROVER_IDS, fixtureInput, gateBricks, GATE_IDS, roverBricks } from '../model/fixtures'
import { emptyRoboticsSection, readRoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { brickTapsTaken, takeBrickTap } from '../scene/brickTap'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { RoboticsPanel } from '../ui/RoboticsPanel'
import { useRobotFocus } from '../ui/robotFocus'
import { colorName, robotLooksPainted, robotPaintTargets, usePaintMode } from './paint'

/**
 * Painting the way a third grader expects (lane P), through the real stores and the robot panel:
 * a colour chip starts painting, a tap on a brick (the scene's `takeBrickTap`, as a click or a
 * touch tap calls it) paints it as one Undo, "Paint all of <name>" paints the robot in one Undo,
 * and Done, Escape or arming a part stops it.
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})
afterEach(cleanup)
beforeEach(() => {
  usePaintMode.getState().stop()
  useRoboticsStore.getState().resetSim()
  useBrickStore.getState().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [], toast: null, activeColor: BRICK_COLORS[5] })
  useRoboticsStore.setState({ card: null, wiringNote: null, frameRequest: null })
  useRoboticsStore.getState().refreshModel()
  useRobotFocus.setState({ creationId: null })
  useCodeView.setState({ creationId: null })
  useDriveView.setState({ creationId: null })
})

const RED = '#e7473c'
const GREEN = '#65b85a'

function place(partId: string, x: number, y: number, z: number, rotation = 0) {
  act(() => {
    const state = useBrickStore.getState()
    state.choosePart(partId)
    for (let turn = 0; turn < rotation; turn += 1) state.rotate()
    state.setDraftPosition(x, y, z)
    expect(state.placeDraft()).toBe(true)
    useBrickStore.getState().cancelInteraction()
  })
  return useBrickStore.getState().bricks.at(-1)!.id
}
const brick = (id: string) => useBrickStore.getState().bricks.find((candidate) => candidate.id === id)!
const colorOf = (id: string) => brick(id).color
const labels = () => useBrickStore.getState().undoStack.map((entry) => entry.label)

/** The rover of the spike fixtures, placed and named Buggy on its card. */
function buggy() {
  const ids: Record<string, string> = {}
  ids.plate = place('plate_6x8', 28, 0, 26)
  ids.hub = place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
  fireEvent.change(screen.getByRole('textbox', { name: 'Robot name' }), { target: { value: 'Buggy' } })
  fireEvent.click(screen.getByRole('button', { name: 'Keep building' }))
  ids.rightMotor = place(ROBOTICS_PART_IDS.motor, 31, 1, 31, 0)
  ids.leftMotor = place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
  ids.rightAxle = place(ROBOTICS_PART_IDS.axleShort, 34, 0, 32, 0)
  ids.leftAxle = place(ROBOTICS_PART_IDS.axleShort, 26, 0, 32, 0)
  ids.rightWheel = place(ROBOTICS_PART_IDS.wheel, 36, 0, 31, 0)
  ids.leftWheel = place(ROBOTICS_PART_IDS.wheel, 25, 0, 31, 0)
  ids.sensor = place(ROBOTICS_PART_IDS.distanceSensor, 30, 1, 26, 0)
  act(() => useBrickStore.setState({ undoStack: [], redoStack: [], toast: null }))
  return ids
}

describe('what painting a robot means (pure)', () => {
  it('"Paint all" paints the plate, hub and motors; wheels, axles and the sensor keep the colour that says what they do', () => {
    const input = fixtureInput(roverBricks(), { ...emptyRoboticsSection(), creations: [{ id: 'robot', name: 'Buggy', anchorBrickIds: [ROVER_IDS.hub] }] })
    const robot = deriveCreations(input)[0]
    const R = ROVER_IDS
    expect(robotPaintTargets(robot, input.bricks).sort()).toEqual([R.plate, R.hub, R.leftMotor, R.rightMotor].sort())
  })

  it('a gate: its frame, arm, plate, hub and hinge motor; not its sensor', () => {
    const bricks = gateBricks()
    const input = fixtureInput(bricks, { ...emptyRoboticsSection(), creations: [{ id: 'gate', name: 'Gate', anchorBrickIds: [GATE_IDS.hinge] }] })
    const gate = deriveCreations(input)[0]
    const targets = new Set(robotPaintTargets(gate, input.bricks))
    expect(targets.has(GATE_IDS.hinge)).toBe(true)
    expect(targets.has(GATE_IDS.door)).toBe(true)
    expect(targets.has(GATE_IDS.leftPost)).toBe(true)
    expect(targets.has(GATE_IDS.sensor)).toBe(false)
  })

  it('looks painted once a hub, motor, hinge motor or seat is not its own colour; colours have kid names', () => {
    const input = fixtureInput(roverBricks(), { ...emptyRoboticsSection(), creations: [{ id: 'robot', name: 'Buggy', anchorBrickIds: [ROVER_IDS.hub] }] })
    const robot = deriveCreations(input)[0]
    expect(robotLooksPainted(robot, input.bricks)).toBe(false)
    expect(robotLooksPainted(robot, input.bricks.map((candidate) => (candidate.id === ROVER_IDS.hub ? { ...candidate, color: RED } : candidate)))).toBe(true)
    expect(BRICK_COLORS.map(colorName)).toEqual(['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'white', 'gray', 'dark gray', 'brown'])
    expect(colorName('#123456')).toBeNull()
  })
})

describe('the Paint row and paint mode', () => {
  it('a chip starts painting: the row and the bar say so; each tap on a brick paints it as one Undo, with nothing selected', () => {
    render(<RoboticsPanel />)
    const ids = buggy()
    const paint = within(screen.getByTestId('robotics-paint'))
    expect(paint.getAllByRole('button', { name: /^Paint / })).toHaveLength(12)
    expect(screen.queryByTestId('robotics-paint-bar')).toBeNull()
    expect(brickTapsTaken()).toBe(false)
    fireEvent.click(paint.getByRole('button', { name: 'Paint red' }))
    expect(usePaintMode.getState().painting).toBe(true)
    expect(useBrickStore.getState().activeColor).toBe(RED)
    expect(paint.getByRole('button', { name: 'Paint red' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('robotics-paint-line')).toHaveTextContent('Tap bricks to paint them red.')
    const bar = within(screen.getByTestId('robotics-paint-bar'))
    expect(bar.getByText('Painting')).toBeInTheDocument()
    expect(bar.getByText('Red')).toBeInTheDocument()
    expect(bar.getByText('Tap bricks to paint them')).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Done painting' })).toBeInTheDocument()

    act(() => { expect(takeBrickTap(ids.plate)).toBe(true) })
    act(() => { expect(takeBrickTap(ids.hub)).toBe(true) })
    expect([colorOf(ids.plate), colorOf(ids.hub)]).toEqual([RED, RED])
    expect(labels()).toEqual(['Paint brick red', 'Paint brick red'])
    expect(useBrickStore.getState().selectedIds).toEqual([])
    // A tap on a brick already that colour paints nothing and still selects nothing.
    act(() => { expect(takeBrickTap(ids.hub)).toBe(true) })
    expect(labels()).toHaveLength(2)
    // Undo takes back the last brick only; painting goes on.
    act(() => useBrickStore.getState().undo())
    expect(colorOf(ids.hub)).toBe('#f5eee0')
    expect(colorOf(ids.plate)).toBe(RED)
    expect(useBrickStore.getState().selectedIds).toEqual([])
    expect(usePaintMode.getState().painting).toBe(true)
  })

  it('"Paint all of Buggy" paints its plate, hub and motors in one Undo, never its wheels, axles or sensor', () => {
    render(<RoboticsPanel />)
    const ids = buggy()
    const before = Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, colorOf(id)]))
    fireEvent.click(within(screen.getByTestId('robotics-paint')).getByRole('button', { name: 'Paint green' }))
    fireEvent.click(screen.getByRole('button', { name: 'Paint all of Buggy' }))
    for (const name of ['plate', 'hub', 'leftMotor', 'rightMotor']) expect(colorOf(ids[name])).toBe(GREEN)
    for (const name of ['leftWheel', 'rightWheel', 'leftAxle', 'rightAxle', 'sensor']) expect(colorOf(ids[name])).toBe(before[name])
    expect(labels()).toEqual(['Paint Buggy green'])
    expect(useBrickStore.getState().toast).toBe('Buggy is green now!')
    act(() => useBrickStore.getState().undo())
    for (const [name, color] of Object.entries(before)) expect(colorOf(ids[name])).toBe(color)
    expect(useBrickStore.getState().redoStack).toHaveLength(1)
  })

  it('a chip with a brick picked paints it too, then nothing is picked', () => {
    render(<RoboticsPanel />)
    const ids = buggy()
    act(() => useBrickStore.getState().selectBrick(ids.hub))
    fireEvent.click(within(screen.getByTestId('robotics-paint')).getByRole('button', { name: 'Paint purple' }))
    expect(colorOf(ids.hub)).toBe('#6857d9')
    expect(useBrickStore.getState().selectedIds).toEqual([])
    expect(usePaintMode.getState().painting).toBe(true)
  })

  it('Done, Escape, arming a part, selecting and opening Code each stop painting; then a tap selects again', () => {
    render(<RoboticsPanel />)
    const ids = buggy()
    const start = () => fireEvent.click(within(screen.getByTestId('robotics-paint')).getByRole('button', { name: 'Paint red' }))
    start()
    fireEvent.click(within(screen.getByTestId('robotics-paint-bar')).getByRole('button', { name: 'Done painting' }))
    expect(usePaintMode.getState().painting).toBe(false)
    expect(brickTapsTaken()).toBe(false)
    expect(takeBrickTap(ids.plate)).toBe(false)
    start()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(usePaintMode.getState().painting).toBe(false)
    start()
    act(() => useBrickStore.getState().choosePart('brick_2x2'))
    expect(usePaintMode.getState().painting).toBe(false)
    act(() => useBrickStore.getState().cancelInteraction())
    start()
    act(() => useBrickStore.getState().selectBrick(ids.hub))
    expect(usePaintMode.getState().painting).toBe(false)
    act(() => useBrickStore.getState().selectBrick(null))
    start()
    act(() => useCodeView.getState().openCode(readRoboticsSection(useBrickStore.getState().documentMetadata.robotics).creations[0].id))
    expect(usePaintMode.getState().painting).toBe(false)
  })

  it('painting a brick of another robot makes that robot the panel’s', () => {
    render(<RoboticsPanel />)
    buggy()
    const lonelyHub = place(ROBOTICS_PART_IDS.hub, 50, 0, 50)
    fireEvent.click(screen.getByRole('button', { name: 'Keep building' }))
    const second = useRoboticsStore.getState().model.creations.find((creation) => creation.brickIds.includes(lonelyHub))!
    act(() => useRobotFocus.getState().focus(useRoboticsStore.getState().model.creations[0].id))
    expect(screen.getByRole('textbox', { name: 'Robot name' })).toHaveValue('Buggy')
    fireEvent.click(within(screen.getByTestId('robotics-paint')).getByRole('button', { name: 'Paint red' }))
    act(() => { takeBrickTap(lonelyHub) })
    expect(useRobotFocus.getState().creationId).toBe(second.id)
    expect(screen.getByRole('textbox', { name: 'Robot name' })).toHaveValue(second.name)
  })
})
