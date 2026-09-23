import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { useCodeView } from '../code/codeViewState'
import { useDriveView } from '../drive/driveViewState'
import type { DerivedCreation } from '../model/creations'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { RoboticsPanel } from './RoboticsPanel'
import { pickFocusedCreation, useRobotFocus } from './robotFocus'

/**
 * The panel follows the robot the student touches (lane P): the owner of the selected brick,
 * even while another robot's motor test runs (that test stops); with nothing selected, the robot
 * last focused, not the newest; back from Drive, Try it or Code, the robot that was open, framed.
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})
afterEach(cleanup)
beforeEach(() => {
  useRoboticsStore.getState().resetSim()
  useBrickStore.getState().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [], toast: null })
  useRoboticsStore.setState({ card: null, wiringNote: null, frameRequest: null })
  useRoboticsStore.getState().refreshModel()
  useRobotFocus.setState({ creationId: null })
  useCodeView.setState({ creationId: null })
  useDriveView.setState({ creationId: null })
})

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
const keepBuilding = (name: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Robot name' }), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Keep building' }))
}
const title = () => (screen.getByRole('textbox', { name: 'Robot name' }) as HTMLInputElement).value
const robot = (name: string) => useRoboticsStore.getState().model.creations.find((creation) => creation.name === name)!

/** A gate (a hinge motor with an arm, a sensor, a hub) and, after it, a signal light. */
function gateAndSignalLight() {
  const ids: Record<string, string> = {}
  place('plate_6x8', 20, 0, 20)
  place('pillar_1x1', 20, 1, 20)
  place('brick_1x1', 20, 10, 20)
  place('pillar_1x1', 25, 1, 20)
  place('brick_1x1', 25, 10, 20)
  place('brick_1x6', 20, 13, 20, 1)
  place('plate_2x4', 21, 1, 21, 1)
  ids.hinge = place(ROBOTICS_PART_IDS.hingeMotor, 21, 2, 21)
  keepBuilding('Gate')
  place('brick_1x4', 21, 8, 21, 1)
  ids.gateHub = place(ROBOTICS_PART_IDS.hub, 20, 1, 24)
  place(ROBOTICS_PART_IDS.distanceSensor, 21, 7, 27)
  ids.lightHub = place(ROBOTICS_PART_IDS.hub, 40, 0, 40)
  keepBuilding('Signal light')
  place(ROBOTICS_PART_IDS.distanceSensor, 41, 6, 40)
  ids.light = place(ROBOTICS_PART_IDS.light, 43, 6, 43)
  return ids
}

describe('which robot the panel shows (pure)', () => {
  const made = (id: string, brickIds: string[]) => ({ id, brickIds, wheels: [] }) as unknown as DerivedCreation
  const a = made('a', ['a1', 'a2'])
  const b = made('b', ['b1'])
  it('the selected brick’s robot; else the one focused last; else the newest', () => {
    expect(pickFocusedCreation([a, b], 'a2', 'b')?.id).toBe('a')
    expect(pickFocusedCreation([a, b], 'loose', 'a')?.id).toBe('a')
    expect(pickFocusedCreation([a, b], null, 'a')?.id).toBe('a')
    expect(pickFocusedCreation([a, b], null, 'gone')?.id).toBe('b')
    expect(pickFocusedCreation([a, b], null, null)?.id).toBe('b')
    expect(pickFocusedCreation([], 'a1', 'a')).toBeNull()
  })
})

describe('the panel follows the robot you touch', () => {
  it('a motor test on the Gate, then a click on the Signal light’s hub: its name, its steps and its Code; the Gate’s test stops', async () => {
    render(<RoboticsPanel />)
    const ids = gateAndSignalLight()
    act(() => useBrickStore.getState().selectBrick(ids.hinge))
    expect(title()).toBe('Gate')
    await act(async () => { await useRoboticsStore.getState().startSim(robot('Gate').id) })
    act(() => useRoboticsStore.getState().nudgeHinge(ids.hinge, 60))
    expect(useRoboticsStore.getState().sim?.creationId).toBe(robot('Gate').id)
    act(() => useBrickStore.getState().selectBrick(ids.lightHub))
    expect(title()).toBe('Signal light')
    expect(screen.getByTestId('robotics-hub-inspector')).toBeInTheDocument()
    expect(useRoboticsStore.getState().sim).toBeNull()
    fireEvent.click(screen.getByTestId('robotics-code-button'))
    expect(useCodeView.getState().creationId).toBe(robot('Signal light').id)
  })

  it('with nothing selected the robot touched last stays, not the newest one', () => {
    render(<RoboticsPanel />)
    const ids = gateAndSignalLight()
    expect(title()).toBe('Signal light')
    act(() => useBrickStore.getState().selectBrick(ids.hinge))
    act(() => useBrickStore.getState().selectBrick(null))
    expect(title()).toBe('Gate')
    // Placing a part on the Signal light makes it the panel's again.
    place('brick_1x1', 40, 6, 42)
    expect(title()).toBe('Signal light')
  })

  it('back from Drive / Try it or Code: that robot, framed snug in the free canvas', async () => {
    render(<RoboticsPanel />)
    gateAndSignalLight()
    act(() => useDriveView.getState().openDrive(robot('Gate').id))
    act(() => useRoboticsStore.setState({ frameRequest: null }))
    act(() => useDriveView.getState().closeDrive())
    await act(async () => { await Promise.resolve() })
    expect(title()).toBe('Gate')
    const request = useRoboticsStore.getState().frameRequest!
    expect(request.brickIds).toEqual(robot('Gate').brickIds)
    expect(request.snug).toBe(true)
    act(() => useBrickStore.getState().selectBrick(null))
    act(() => useCodeView.getState().openCode(robot('Signal light').id))
    act(() => useRoboticsStore.setState({ frameRequest: null }))
    act(() => useCodeView.getState().closeCode())
    await act(async () => { await Promise.resolve() })
    expect(title()).toBe('Signal light')
    expect(useRoboticsStore.getState().frameRequest?.brickIds).toEqual(robot('Signal light').brickIds)
  })

  it('opening Drive from Code frames nothing on the way (the Drive view frames its own stage)', async () => {
    render(<RoboticsPanel />)
    gateAndSignalLight()
    act(() => useCodeView.getState().openCode(robot('Gate').id))
    act(() => useRoboticsStore.setState({ frameRequest: null }))
    act(() => useDriveView.getState().openDrive(robot('Gate').id))
    await act(async () => { await Promise.resolve() })
    expect(useRoboticsStore.getState().frameRequest).toBeNull()
  })
})
