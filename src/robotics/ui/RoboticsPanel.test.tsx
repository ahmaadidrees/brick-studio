import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { useCodeView } from '../code/codeViewState'
import { useDriveView } from '../drive/driveViewState'
import { fourWheelBricks } from '../model/fixtures'
import { readRoboticsSection, writeRoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { RoboticsPanel } from './RoboticsPanel'

/**
 * The card and the robot panel through the real stores, the way a student meets them:
 * parts are placed with the studio's own placement actions (so the card opens and
 * assisted wiring runs), and everything after that is a click on what the panel shows.
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
const section = () => readRoboticsSection(useBrickStore.getState().documentMetadata.robotics)
const robotId = () => section().creations[0].id
const keepBuilding = () => fireEvent.click(screen.getByRole('button', { name: 'Keep building' }))
const panel = () => screen.getByTestId('robotics-panel')
const steps = () => screen.getByTestId('robotics-next-steps')
const currentStep = () => within(steps()).getAllByRole('button').find((button) => button.getAttribute('aria-current') === 'step') ?? null
const playButton = () => screen.queryByTestId('robotics-play-button')

/** The rover of the spike fixtures, named on its card; `upTo` stops after that many parts. */
function rover(upTo = 7) {
  const ids: Record<string, string> = {}
  ids.plate = place('plate_6x8', 28, 0, 26)
  ids.hub = place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
  keepBuilding()
  const parts: [string, string, number, number, number, number][] = [
    ['rightMotor', ROBOTICS_PART_IDS.motor, 31, 1, 31, 0],
    ['leftMotor', ROBOTICS_PART_IDS.motor, 28, 1, 31, 2],
    ['rightAxle', ROBOTICS_PART_IDS.axleShort, 34, 0, 32, 0],
    ['leftAxle', ROBOTICS_PART_IDS.axleShort, 26, 0, 32, 0],
    ['rightWheel', ROBOTICS_PART_IDS.wheel, 36, 0, 31, 0],
    ['leftWheel', ROBOTICS_PART_IDS.wheel, 25, 0, 31, 0],
    ['sensor', ROBOTICS_PART_IDS.distanceSensor, 30, 1, 26, 0],
  ]
  for (const [name, partId, x, y, z, rotation] of parts.slice(0, upTo)) ids[name] = place(partId, x, y, z, rotation)
  return ids
}

describe('the card', () => {
  it('a first robotics part: "You started a robot!", a name ready to change, one big button, the why behind "?"', () => {
    render(<RoboticsPanel />)
    place('plate_6x8', 28, 0, 26)
    expect(screen.queryByTestId('robotics-creation-card')).toBeNull()
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    const card = screen.getByTestId('robotics-creation-card')
    expect(within(card).getByText('You started a robot!')).toBeInTheDocument()
    expect(within(card).getByRole('textbox', { name: 'Robot name' })).toHaveValue('Robot')
    expect(within(card).getAllByRole('button').map((button) => button.textContent)).toEqual(['?', 'Keep building'])
    expect(within(card).queryByText(/Bricks joined by studs/)).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'What does this mean?' }))
    expect(within(card).getByText(/Bricks joined by studs move together/)).toBeInTheDocument()
    expect(card.textContent).not.toMatch(/creation|assembly|mechanism|anchored|nudge/i)
    fireEvent.change(within(card).getByRole('textbox', { name: 'Robot name' }), { target: { value: 'Zoom' } })
    keepBuilding()
    expect(screen.queryByTestId('robotics-creation-card')).toBeNull()
    expect(section().creations.map((creation) => creation.name)).toEqual(['Zoom'])
    expect(screen.getByRole('textbox', { name: 'Robot name' })).toHaveValue('Zoom')
  })

  it('Enter in the name field keeps building; later parts never reopen the card', () => {
    render(<RoboticsPanel />)
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    const field = within(screen.getByTestId('robotics-creation-card')).getByRole('textbox', { name: 'Robot name' })
    fireEvent.change(field, { target: { value: 'Rex' } })
    fireEvent.submit(field)
    expect(section().creations[0].name).toBe('Rex')
    place(ROBOTICS_PART_IDS.motor, 31, 1, 31)
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    expect(screen.queryByTestId('robotics-creation-card')).toBeNull()
  })

  it('a hinge motor starts a gate: the name is "Gate"; a light on a hub starts a robot', () => {
    render(<RoboticsPanel />)
    place('plate_2x4', 21, 0, 21, 1)
    place(ROBOTICS_PART_IDS.hingeMotor, 21, 1, 21)
    expect(screen.getByRole('textbox', { name: 'Robot name' })).toHaveValue('Gate')
  })
})

describe('the panel', () => {
  it('a hub alone: Code, the hub checked, and two ways to go (no Drive yet)', () => {
    render(<RoboticsPanel />)
    rover(0)
    expect(playButton()).toBeNull()
    expect(screen.getByTestId('robotics-code-button')).toBeEnabled()
    expect(within(steps()).getByText('Add a hub. It is the robot’s brain.')).toBeInTheDocument()
    expect(within(steps()).getByText('What should it do?')).toBeInTheDocument()
    fireEvent.click(within(steps()).getByRole('button', { name: /Make it move/ }))
    expect(useBrickStore.getState().draft).toMatchObject({ partId: ROBOTICS_PART_IDS.motor, rotation: 0 })
    fireEvent.click(within(steps()).getByRole('button', { name: /Make it see and light up/ }))
    expect(useBrickStore.getState().draft?.partId).toBe(ROBOTICS_PART_IDS.distanceSensor)
  })

  it('not ready: Drive is off and says why (the highlighted step); tapping the step arms the part, turned the right way', () => {
    render(<RoboticsPanel />)
    rover(1)
    const drive = playButton()!
    expect(drive).toHaveTextContent('Drive')
    expect(drive).toBeDisabled()
    expect(drive).toHaveAccessibleDescription('Put a motor on the other side.')
    expect(currentStep()).toHaveTextContent('Put a motor on the other side.')
    expect(within(steps()).getByText('Add a hub. It is the robot’s brain.').closest('li')).toHaveAttribute('data-state', 'done')
    fireEvent.click(currentStep()!)
    expect(useBrickStore.getState().draft).toMatchObject({ partId: ROBOTICS_PART_IDS.motor, rotation: 2 })
    // The next steps move on as parts arrive.
    place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    expect(currentStep()).toHaveTextContent('Put an axle in Right motor.')
    fireEvent.click(currentStep()!)
    expect(useBrickStore.getState().draft?.partId).toBe(ROBOTICS_PART_IDS.axleShort)
  })

  it('ready: Drive is on and opens Drive; "Ready to drive!" too; ideas follow; Parts and More are folded', () => {
    render(<RoboticsPanel />)
    rover()
    const drive = playButton()!
    expect(drive).toBeEnabled()
    expect(drive).not.toHaveAttribute('aria-describedby')
    fireEvent.click(drive)
    expect(useDriveView.getState().creationId).toBe(robotId())
    act(() => useDriveView.getState().closeDrive())
    expect(currentStep()).toHaveTextContent('Ready to drive!')
    fireEvent.click(currentStep()!)
    expect(useDriveView.getState().creationId).toBe(robotId())
    // The Drive view takes the panel's place while it is open (lane D); back to build for the rest.
    act(() => useDriveView.getState().closeDrive())
    const ideas = screen.getByTestId('robotics-ideas')
    expect(within(ideas).getAllByRole('listitem').map((item) => `${item.dataset.step}:${item.dataset.state}`)).toEqual(['idea-sensor:done', 'idea-light:todo', 'idea-seat:todo', 'idea-stack:todo'])
    fireEvent.click(within(ideas).getByRole('button', { name: /Add a seat/ }))
    expect(useBrickStore.getState().draft?.partId).toBe(ROBOTICS_PART_IDS.seat)
    // Folded: the parts list, the run space, the wiring mode and the motor tests are out of sight.
    expect(screen.queryByRole('list', { name: 'Parts found' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Drive forward' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Plug in by itself' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Parts/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /^More/ })).toHaveAttribute('aria-expanded', 'false')
    const words = panel().textContent ?? ''
    expect(words).not.toMatch(/creation|assembly|mechanism|anchored|nudge|drive pair|reversed|assisted|manual/i)
    expect(words).not.toMatch(/port [A-D]\b/)
  })

  it('Parts opens the part rows and what it drives with; More opens where it runs, wiring and motor tests', () => {
    render(<RoboticsPanel />)
    const ids = rover()
    fireEvent.click(screen.getByRole('button', { name: /^Parts/ }))
    const rows = within(screen.getByRole('list', { name: 'Parts found' })).getAllByRole('listitem')
    expect(rows.find((row) => row.dataset.brickId === ids.rightMotor)).toHaveTextContent('Right motor · axle and wheel on it · plugged in · faces the other way')
    expect(rows.find((row) => row.dataset.brickId === ids.leftMotor)).toHaveTextContent('Left motor · axle and wheel on it · plugged in')
    expect(screen.getByTestId('robotics-drive-sides')).toHaveTextContent('Left side: Left motor · Right side: Right motor')
    expect(panel()).toHaveTextContent('Right motor faces the other way')
    fireEvent.click(screen.getByRole('button', { name: /^More/ }))
    // In a third grader's words (lane P): where it runs, plug in by itself, spin and swing (no % or °).
    expect(screen.getByRole('group', { name: 'Where it runs' })).toHaveTextContent('Where it runsTest plateMy world')
    expect(screen.getByRole('button', { name: 'Test plate' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'My world' }))
    expect(section().creations[0].testSpace).toBe('myWorld')
    expect(screen.getByRole('group', { name: 'Plug in by itself' })).toHaveTextContent('Plug in by itselfOnOff')
    const tests = within(screen.getByRole('region', { name: 'Test the motors' }))
    expect(tests.getByRole('button', { name: 'Drive forward' })).toBeInTheDocument()
    expect(tests.getAllByRole('button', { name: 'Spin' })).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'Test the motors' }).textContent).not.toMatch(/%|°/)
    expect(screen.getByTestId('robotics-sim-status')).toHaveTextContent('Stopped')
  })

  it('a motor left unplugged: "Plug Left motor into the hub." plugs it in with one tap', () => {
    render(<RoboticsPanel />)
    const ids = rover()
    act(() => useBrickStore.getState().setRoboticsSection(writeRoboticsSection({ ...section(), connections: section().connections.filter((cable) => cable.deviceId !== ids.leftMotor) }), 'Unplug Left motor'))
    expect(playButton()).toBeDisabled()
    expect(currentStep()).toHaveTextContent('Plug Left motor into the hub.')
    fireEvent.click(currentStep()!)
    expect(section().connections.some((cable) => cable.deviceId === ids.leftMotor)).toBe(true)
    expect(playButton()).toBeEnabled()
  })

  it('a four-wheel car: Drive waits for all four motors; Parts lists them by side', () => {
    render(<RoboticsPanel />)
    for (const brick of fourWheelBricks()) place(brick.partId, brick.x, brick.y, brick.z, brick.rotation)
    keepBuilding()
    expect(playButton()).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /^Parts/ }))
    expect(screen.getByTestId('robotics-drive-sides')).toHaveTextContent('Left side: Front left motor and Back left motor · Right side: Front right motor and Back right motor')
    expect(panel()).toHaveTextContent('Front right motor and Back right motor face the other way')
    const backRight = useBrickStore.getState().bricks.find((brick) => brick.x === 31 && brick.z === 28 && brick.partId === ROBOTICS_PART_IDS.motor)!.id
    act(() => useBrickStore.getState().setRoboticsSection(writeRoboticsSection({ ...section(), connections: section().connections.filter((cable) => cable.deviceId !== backRight) }), 'Unplug Back right motor'))
    expect(playButton()).toBeDisabled()
    expect(currentStep()).toHaveTextContent('Plug Back right motor into the hub.')
    fireEvent.click(currentStep()!)
    expect(playButton()).toBeEnabled()
  })

  it('a part picked: its panel shows under the one step that matters now', () => {
    render(<RoboticsPanel />)
    const ids = rover(3)
    act(() => useBrickStore.getState().selectBrick(ids.leftMotor))
    expect(screen.getByTestId('robotics-device-inspector')).toBeInTheDocument()
    expect(within(steps()).getAllByRole('listitem')).toHaveLength(1)
    expect(currentStep()).toHaveTextContent('Put an axle in Left motor.')
    expect(within(steps()).getByRole('heading')).toHaveTextContent('Next step')
  })

  it('the name is edited in place', () => {
    render(<RoboticsPanel />)
    rover(2)
    const name = screen.getByRole('textbox', { name: 'Robot name' })
    fireEvent.change(name, { target: { value: 'Speedy' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    fireEvent.blur(name)
    expect(section().creations[0].name).toBe('Speedy')
  })
})

describe('a gate and a signal light', () => {
  function gate({ stuck = false } = {}) {
    place('plate_6x8', 20, 0, 20)
    place('pillar_1x1', 20, 1, 20)
    place('brick_1x1', 20, 10, 20)
    place('pillar_1x1', 25, 1, 20)
    place('brick_1x1', 25, 10, 20)
    place('brick_1x6', 20, 13, 20, 1)
    place('plate_2x4', 21, 1, 21, 1)
    place(ROBOTICS_PART_IDS.hingeMotor, 21, 2, 21)
    keepBuilding()
    place('brick_1x4', 21, 8, 21, 1)
    place(ROBOTICS_PART_IDS.hub, 20, 1, 24)
    const bridge = stuck ? [place('brick_2x2', 23, 2, 21), place('brick_2x2', 23, 5, 21)] : []
    return { bridge }
  }

  it('a gate: Try it waits for a sensor, then tries it', () => {
    render(<RoboticsPanel />)
    gate()
    expect(playButton()).toHaveTextContent('Try it')
    expect(playButton()).toBeDisabled()
    expect(currentStep()).toHaveTextContent('Add a sensor so it can see.')
    place(ROBOTICS_PART_IDS.distanceSensor, 21, 7, 27)
    expect(playButton()).toBeEnabled()
    expect(currentStep()).toHaveTextContent('Ready to try!')
    // Ready, a gate gets ideas too (lane P): paint it, name it, how far it opens in Code.
    const ideas = within(screen.getByTestId('robotics-ideas')).getAllByRole('listitem').map((item) => item.dataset.step)
    expect(ideas).toEqual(['idea-paint', 'idea-name', 'idea-code'])
  })

  it('a gate stuck to its frame: the fix row picks the brick to take off', () => {
    render(<RoboticsPanel />)
    const { bridge } = gate({ stuck: true })
    place(ROBOTICS_PART_IDS.distanceSensor, 21, 7, 27)
    expect(currentStep()).toHaveTextContent('The arm is stuck to the frame. Take off the brick that joins them.')
    fireEvent.click(currentStep()!)
    expect(useBrickStore.getState().selectedId).toBe(bridge[1])
  })

  it('a signal light: a sensor and a light on a hub, Try it on', () => {
    render(<RoboticsPanel />)
    place(ROBOTICS_PART_IDS.hub, 40, 0, 40)
    keepBuilding()
    place(ROBOTICS_PART_IDS.distanceSensor, 41, 6, 40)
    expect(playButton()).toHaveTextContent('Try it')
    expect(currentStep()).toHaveTextContent('Add a light so it can show what it sees.')
    place(ROBOTICS_PART_IDS.light, 43, 6, 43)
    expect(playButton()).toBeEnabled()
    fireEvent.click(playButton()!)
    expect(useDriveView.getState().creationId).toBe(robotId())
  })
})

describe('in a live room', () => {
  it('Drive and Code are off with one line saying why; building steps still work', () => {
    render(<RoboticsPanel live />)
    rover()
    expect(playButton()).toBeDisabled()
    expect(screen.getByTestId('robotics-code-button')).toBeDisabled()
    expect(screen.getByTestId('robotics-live-code-line')).toHaveTextContent('Drive and Code are off in a shared world for now. Building still works.')
    expect(currentStep()).toBeDisabled()
    fireEvent.click(within(screen.getByTestId('robotics-ideas')).getByRole('button', { name: /Add a light/ }))
    expect(useBrickStore.getState().draft?.partId).toBe(ROBOTICS_PART_IDS.light)
  })
})
