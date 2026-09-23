import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { readRoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { DeviceInspector } from './DeviceInspector'
import { WiringModeToggle } from './WiringModeToggle'

/**
 * The device inspector through the real stores (the panel mounts it the same way:
 * a brick id and its creation). Every wiring change is made by clicking the
 * inspector's own buttons, and read back from the document and from what it shows.
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})
afterEach(cleanup)

function place(partId: string, x: number, y: number, z: number, rotation = 0) {
  const state = useBrickStore.getState()
  state.choosePart(partId)
  for (let turn = 0; turn < rotation; turn += 1) state.rotate()
  state.setDraftPosition(x, y, z)
  expect(state.placeDraft()).toBe(true)
  useBrickStore.getState().cancelInteraction()
  return useBrickStore.getState().bricks.at(-1)!.id
}
const section = () => readRoboticsSection(useBrickStore.getState().documentMetadata.robotics)
const portOf = (id: string) => section().connections.find((connection) => connection.deviceId === id)?.port ?? null
const robotics = () => useRoboticsStore.getState()

function rover() {
  place('plate_6x8', 28, 0, 26)
  const hub = place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
  robotics().confirmCard('Mars buggy', false)
  const left = place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
  const right = place(ROBOTICS_PART_IDS.motor, 31, 1, 31, 0)
  const sensor = place(ROBOTICS_PART_IDS.distanceSensor, 30, 1, 26)
  return { hub, left, right, sensor }
}

/** The inspector as the creation panel shows it: follows the selection and the creation it belongs to. */
function Inspected() {
  const selectedId = useBrickStore((state) => state.selectedId)
  const creations = useRoboticsStore((state) => state.model.creations)
  if (!selectedId) return null
  return <DeviceInspector brickId={selectedId} creation={creations.find((creation) => creation.brickIds.includes(selectedId)) ?? null} />
}
function inspect(id: string) {
  act(() => useBrickStore.getState().selectBrick(id))
  return render(<Inspected />)
}
/** Opens the part's own More (ports, the cable, the code line and the wiring buttons live there; lane P). */
function more() {
  const toggle = screen.getByRole('button', { name: /^More about / })
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
}
const chip = (port: string) => screen.getAllByRole('button').find((button) => button.dataset.port === port)!
const stateOf = () => screen.getByTestId('wiring-state').textContent
const chipStates = () => screen.getAllByRole('button').filter((button) => button.classList.contains('wiring-port')).map((button) => `${button.dataset.port}:${button.dataset.state}`).join(' ')

beforeEach(() => {
  robotics().resetSim()
  useBrickStore.getState().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [], toast: null })
  useRoboticsStore.setState({ card: null, wiringNote: null, frameRequest: null })
  robotics().refreshModel()
})

describe('a device', () => {
  it('simple first: its name and one line in a third grader’s words; ports, the cable and the code line behind More', () => {
    const { left } = rover()
    inspect(left)
    const inspector = screen.getByTestId('robotics-device-inspector')
    expect(screen.getByRole('textbox', { name: 'Device name' })).toHaveValue('Left motor')
    expect(within(inspector).getByTestId('wiring-does')).toHaveTextContent('Turns a wheel once it has an axle · plugged in')
    // Nothing technical until More: no port letters, no code line, no Unplug or Move to port.
    expect(inspector.textContent).not.toMatch(/port [A-D]\b|\bport\b|run .* at|reversed|Unplug|Move to|name follows/i)
    expect(screen.queryByTestId('wiring-state')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unplug' })).toBeNull()
    expect(screen.getByRole('button', { name: 'More about Left motor' })).toHaveAttribute('aria-expanded', 'false')
    more()
    expect(within(inspector).getByTestId('wiring-sub')).toHaveTextContent('Motor · nothing in its socket')
    expect(stateOf()).toBe('Port A')
    expect(chipStates()).toBe('A:this B:used C:used D:free')
    expect(chip('A')).toBeDisabled()
    expect(chip('A')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('B')).toHaveAccessibleName('Port B: Right motor. Swap with Right motor')
    expect(chip('D')).toHaveAccessibleName('Port D: free. Move Left motor here')
    expect(screen.getByTestId('wiring-reading')).toHaveTextContent('Stopped')
    expect(screen.getByTestId('wiring-block')).toHaveTextContent('run Left motor · A ▾ at 40 %')
    expect(screen.getByRole('button', { name: 'Unplug' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move to port D' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Plug into/ })).toBeNull()
  })

  it('a chip on a free port moves it there; Unplug shows it unplugged; Plug into port brings it back', () => {
    const { left } = rover()
    inspect(left)
    more()
    fireEvent.click(chip('D'))
    expect(portOf(left)).toBe('D')
    expect(stateOf()).toBe('Port D')
    expect(useBrickStore.getState().toast).toBe('Left motor moved to port D. Port A is free again.')
    fireEvent.click(screen.getByRole('button', { name: 'Unplug' }))
    expect(portOf(left)).toBeNull()
    expect(stateOf()).toBe('Unplugged')
    expect(screen.getByTestId('wiring-reading')).toHaveTextContent('No power')
    expect(screen.getByTestId('wiring-block')).toHaveTextContent('Not plugged in')
    expect(chipStates()).toBe('A:free B:used C:used D:free')
    expect(chip('A')).toHaveAccessibleName('Port A: free. Plug Left motor in here')
    // Unplugged, the first line says so and offers one big "Plug it in".
    expect(screen.getByTestId('wiring-does')).toHaveTextContent('Turns a wheel once it has an axle · not plugged in')
    expect(screen.getByRole('button', { name: 'Plug it in' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Plug into port A' }))
    expect(portOf(left)).toBe('A')
    expect(screen.getByTestId('wiring-block')).not.toHaveTextContent('Not plugged in')
    expect(screen.queryByRole('button', { name: 'Plug it in' })).toBeNull()
  })

  it('"Plug it in" plugs it into the first free port with one tap', () => {
    const { left } = rover()
    act(() => { useBrickStore.getState().selectBrick(left) })
    render(<Inspected />)
    more()
    fireEvent.click(screen.getByRole('button', { name: 'Unplug' }))
    fireEvent.click(screen.getByRole('button', { name: 'Plug it in' }))
    expect(portOf(left)).toBe('A')
    expect(screen.getByTestId('wiring-does')).toHaveTextContent('plugged in')
  })

  it('each part says what it does: a wheel side, a sensor’s eyes, a light; a part off any robot says so', () => {
    const ids = rover()
    const leftAxle = place(ROBOTICS_PART_IDS.axleShort, 26, 0, 32)
    place(ROBOTICS_PART_IDS.axleShort, 34, 0, 32)
    place(ROBOTICS_PART_IDS.wheel, 25, 0, 31)
    place(ROBOTICS_PART_IDS.wheel, 36, 0, 31)
    expect(leftAxle).toBeTruthy()
    const light = place(ROBOTICS_PART_IDS.light, 33, 1, 28)
    const loose = place(ROBOTICS_PART_IDS.motor, 50, 0, 50)
    const line = (id: string) => { cleanup(); inspect(id); return screen.getByTestId('wiring-does').textContent }
    expect(line(ids.left)).toBe('Turns the left wheel · plugged in')
    expect(line(ids.right)).toBe('Turns the right wheel · plugged in')
    expect(line(ids.sensor)).toBe('The robot’s eyes: it sees what is in front · plugged in')
    expect(line(light)).toBe('Lights up in a color · plugged in')
    expect(line(loose)).toBe('Not on a robot yet · add a hub to plug it in')
  })

  it('a chip on a used port swaps with that device', () => {
    const { left, right } = rover()
    inspect(left)
    more()
    fireEvent.click(chip('B'))
    expect([portOf(left), portOf(right)]).toEqual(['B', 'A'])
    expect(stateOf()).toBe('Port B')
    expect(chipStates()).toBe('A:used B:this C:used D:free')
  })

  it('renames from the name field on Enter; Escape abandons the edit', () => {
    const { left } = rover()
    inspect(left)
    more()
    const field = screen.getByRole('textbox', { name: 'Device name' })
    fireEvent.change(field, { target: { value: 'Big wheel' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(section().devices[left]).toBeUndefined()
    expect(field).toHaveValue('Left motor')
    fireEvent.change(field, { target: { value: 'Big wheel' } })
    fireEvent.blur(field)
    expect(section().devices[left]).toEqual({ name: 'Big wheel' })
    expect(field).toHaveValue('Big wheel')
    expect(screen.getByTestId('wiring-block')).toHaveTextContent('Big wheel · A')
  })

  it('a full hub: the state says so, no plug-in button, chips offer swaps', () => {
    rover()
    place(ROBOTICS_PART_IDS.light, 33, 1, 28)
    const second = place(ROBOTICS_PART_IDS.light, 28, 1, 27)
    inspect(second)
    expect(screen.getByTestId('wiring-does')).toHaveTextContent('Lights up in a color · not plugged in')
    expect(screen.queryByRole('button', { name: 'Plug it in' })).toBeNull()
    more()
    expect(stateOf()).toBe('No free port')
    expect(chipStates()).toBe('A:used B:used C:used D:used')
    expect(screen.queryByRole('button', { name: /^Plug into/ })).toBeNull()
    expect(screen.getByTestId('wiring-block')).toHaveTextContent('set Light ▾ to red ▾Not plugged in')
  })

  it('a device with no hub says to add one and shows no chips', () => {
    place('plate_6x8', 28, 0, 26)
    const motor = place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    inspect(motor)
    more()
    expect(stateOf()).toBe('No hub')
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('the reading follows a running nudge through the one selector', async () => {
    const { left } = rover()
    const creationId = section().creations[0].id
    inspect(left)
    more()
    await act(async () => { await robotics().startSim(creationId) })
    act(() => {
      robotics().nudgeMotor(left, 0.4)
      robotics().publishSimReports([], {}, { [left]: Math.PI / 2 })
    })
    expect(screen.getByTestId('wiring-reading')).toHaveTextContent('40 % · output at 90°')
    act(() => robotics().resetSim())
    expect(screen.getByTestId('wiring-reading')).toHaveTextContent('Stopped')
  })
})

describe('the part card (Sam, 8, on an iPad)', () => {
  it('shows a picture; the name only becomes a text field from its pencil, so a low tap never opens the keyboard', () => {
    const { left } = rover()
    inspect(left)
    const inspector = screen.getByTestId('robotics-device-inspector')
    expect(inspector.querySelector('.wiring-picture .part-thumbnail')).not.toBeNull()
    const field = screen.getByRole('textbox', { name: 'Device name' })
    expect(field).toHaveAttribute('readonly')
    fireEvent.click(screen.getByRole('button', { name: 'Rename Left motor' }))
    expect(field).not.toHaveAttribute('readonly')
    expect(document.activeElement).toBe(field)
    fireEvent.change(field, { target: { value: 'Zoom' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(section().devices[left]).toEqual({ name: 'Zoom' })
    expect(screen.getByRole('textbox', { name: 'Device name' })).toHaveAttribute('readonly')
  })

  it('big Turn and Remove act on this part alone', () => {
    const { left, right } = rover()
    inspect(left)
    const before = useBrickStore.getState().bricks.find((brick) => brick.id === left)!.rotation
    fireEvent.click(screen.getByRole('button', { name: 'Turn Left motor' }))
    expect(useBrickStore.getState().bricks.find((brick) => brick.id === left)!.rotation).toBe((before + 1) % 4)
    expect(useBrickStore.getState().undoStack.at(-1)?.label).toBe('Rotate brick')
    // A motor's default name follows the way it faces, so after a turn it is found by what it is.
    fireEvent.click(screen.getByTestId('wiring-remove'))
    expect(useBrickStore.getState().bricks.some((brick) => brick.id === left)).toBe(false)
    expect(useBrickStore.getState().bricks.some((brick) => brick.id === right)).toBe(true)
  })
})

describe('the hub', () => {
  it('is the robot’s brain and says what is plugged in by name, no port letters; More lists the ports', () => {
    rover()
    const hub = section().connections[0].hubId
    inspect(hub)
    const inspector = screen.getByTestId('robotics-hub-inspector')
    expect(within(inspector).getByTestId('wiring-does')).toHaveTextContent('The robot’s brain')
    expect(within(inspector).getByTestId('hub-plugged')).toHaveTextContent('Plugged in: Left motor, Right motor and Front sensor')
    expect(inspector.textContent).not.toMatch(/\bport\b|Cables route themselves/i)
    expect(screen.queryByRole('list', { name: 'Ports' })).toBeNull()
    more()
    expect(screen.getByRole('list', { name: 'Ports' })).toBeInTheDocument()
  })

  it('lists its ports with their devices; a port selects its device; a deleted device’s port reads free (was …)', () => {
    const { hub, right, sensor } = rover()
    inspect(hub)
    more()
    const list = screen.getByRole('list', { name: 'Ports' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['ALeft motor', 'BRight motor', 'CFront sensor', 'DPort D · free'])
    fireEvent.click(screen.getByRole('button', { name: 'Port C: Front sensor. Select Front sensor' }))
    expect(useBrickStore.getState().selectedId).toBe(sensor)
    act(() => {
      useBrickStore.getState().selectBrick(right)
      useBrickStore.getState().deleteSelected()
      useBrickStore.getState().selectBrick(hub)
    })
    expect(screen.getByTestId('hub-plugged')).toHaveTextContent('Plugged in: Left motor and Front sensor')
    more()
    expect(within(screen.getByRole('list', { name: 'Ports' })).getAllByRole('listitem')[1]).toHaveTextContent('Port B · free (was Right motor)')
  })
})

describe('the wiring mode toggle', () => {
  it('"Plug in by itself: On / Off" switches the project between assisted and manual, pressed state and all', () => {
    rover()
    render(<WiringModeToggle />)
    const group = screen.getByRole('group', { name: 'Plug in by itself' })
    expect(within(group).getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(group).getByRole('button', { name: 'Off' }))
    expect(section().settings.wiring).toBe('manual')
    expect(within(group).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true')
    expect(useBrickStore.getState().undoStack.at(-1)?.label).toBe('Plug in by itself: off')
    expect(useBrickStore.getState().toast).toBe('Plug in by itself is off. New parts wait for you to plug them in.')
  })
})
