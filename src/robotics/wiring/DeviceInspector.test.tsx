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
  it('shows its name, port, the four port chips, what it is doing and the block that uses it', () => {
    const { left } = rover()
    inspect(left)
    const inspector = screen.getByTestId('robotics-device-inspector')
    expect(screen.getByRole('textbox', { name: 'Device name' })).toHaveValue('Left motor')
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
    fireEvent.click(screen.getByRole('button', { name: 'Plug into port A' }))
    expect(portOf(left)).toBe('A')
    expect(screen.getByTestId('wiring-block')).not.toHaveTextContent('Not plugged in')
  })

  it('a chip on a used port swaps with that device', () => {
    const { left, right } = rover()
    inspect(left)
    fireEvent.click(chip('B'))
    expect([portOf(left), portOf(right)]).toEqual(['B', 'A'])
    expect(stateOf()).toBe('Port B')
    expect(chipStates()).toBe('A:used B:this C:used D:free')
  })

  it('renames from the name field on Enter; Escape abandons the edit', () => {
    const { left } = rover()
    inspect(left)
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
    expect(stateOf()).toBe('No free port')
    expect(chipStates()).toBe('A:used B:used C:used D:used')
    expect(screen.queryByRole('button', { name: /^Plug into/ })).toBeNull()
    expect(screen.getByTestId('wiring-block')).toHaveTextContent('set Light ▾ to red ▾Not plugged in')
  })

  it('a device with no hub says to add one and shows no chips', () => {
    place('plate_6x8', 28, 0, 26)
    const motor = place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
    inspect(motor)
    expect(stateOf()).toBe('No hub')
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('the reading follows a running nudge through the one selector', async () => {
    const { left } = rover()
    const creationId = section().creations[0].id
    inspect(left)
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

describe('the hub', () => {
  it('lists its ports with their devices; a port selects its device; a deleted device’s port reads free (was …)', () => {
    const { hub, right, sensor } = rover()
    inspect(hub)
    const list = screen.getByRole('list', { name: 'Ports' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['ALeft motor', 'BRight motor', 'CFront sensor', 'DPort D · free'])
    fireEvent.click(screen.getByRole('button', { name: 'Port C: Front sensor. Select Front sensor' }))
    expect(useBrickStore.getState().selectedId).toBe(sensor)
    act(() => {
      useBrickStore.getState().selectBrick(right)
      useBrickStore.getState().deleteSelected()
      useBrickStore.getState().selectBrick(hub)
    })
    expect(within(screen.getByRole('list', { name: 'Ports' })).getAllByRole('listitem')[1]).toHaveTextContent('Port B · free (was Right motor)')
  })
})

describe('the wiring mode toggle', () => {
  it('switches the project between assisted and manual, pressed state and all', () => {
    rover()
    render(<WiringModeToggle />)
    const group = screen.getByRole('group', { name: 'Wiring' })
    expect(within(group).getByRole('button', { name: 'assisted' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(group).getByRole('button', { name: 'manual' }))
    expect(section().settings.wiring).toBe('manual')
    expect(within(group).getByRole('button', { name: 'manual' })).toHaveAttribute('aria-pressed', 'true')
    expect(useBrickStore.getState().undoStack.at(-1)?.label).toBe('Wiring: manual')
  })
})
