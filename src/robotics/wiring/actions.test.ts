import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { readRoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { hubForDevice, lastKnownDeviceName, moveDeviceToPort, plugDeviceIn, portsOfHub, renameDevice, setWiringMode, swapDevicePorts, unplugDevice } from './actions'

/**
 * The wiring actions through the real brick and robotics stores: placements go through
 * choosePart → setDraftPosition → placeDraft, so assisted wiring runs as it does in the
 * app, and every wiring edit is checked for its section, its history label, its toast
 * and its Undo.
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
  return useBrickStore.getState().bricks.at(-1)!.id
}

const section = () => readRoboticsSection(useBrickStore.getState().documentMetadata.robotics)
const portOf = (id: string) => section().connections.find((connection) => connection.deviceId === id)?.port ?? null
const topLabel = () => useBrickStore.getState().undoStack.at(-1)?.label
const toast = () => useBrickStore.getState().toast
const robotics = () => useRoboticsStore.getState()
const undo = () => useBrickStore.getState().undo()
const redo = () => useBrickStore.getState().redo()

/** The checkpoint-1 rover: left motor A, right motor B, front sensor C, by assisted wiring. */
function rover() {
  const plate = place('plate_6x8', 28, 0, 26)
  const hub = place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
  robotics().confirmCard('Mars buggy', false)
  const left = place(ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)
  const right = place(ROBOTICS_PART_IDS.motor, 31, 1, 31, 0)
  const sensor = place(ROBOTICS_PART_IDS.distanceSensor, 30, 1, 26)
  expect([portOf(left), portOf(right), portOf(sensor)]).toEqual(['A', 'B', 'C'])
  return { plate, hub, left, right, sensor, creationId: section().creations[0].id }
}

beforeEach(() => {
  robotics().resetSim()
  useBrickStore.getState().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [], toast: null })
  useRoboticsStore.setState({ card: null, wiringNote: null, frameRequest: null })
  robotics().refreshModel()
})

describe('unplug and plug in', () => {
  it('Unplug removes the cable as an undoable edit with the mock’s words', () => {
    const { left } = rover()
    expect(unplugDevice(left)).toBe(true)
    expect(portOf(left)).toBeNull()
    expect(topLabel()).toBe('Unplug Left motor')
    expect(toast()).toBe('Left motor is unplugged. Blocks that use it show “Not plugged in”.')
    expect(robotics().model.creations[0].motors.find((motor) => motor.brickId === left)!.plugged).toBe(false)
    undo()
    expect(portOf(left)).toBe('A')
    expect(toast()).toBe('Undid: Unplug Left motor.')
    redo()
    expect(portOf(left)).toBeNull()
    // Unplugging an unplugged device records nothing.
    const depth = useBrickStore.getState().undoStack.length
    expect(unplugDevice(left)).toBe(false)
    expect(useBrickStore.getState().undoStack).toHaveLength(depth)
  })

  it('Plug in takes the first free port of the device’s hub, or the port asked for', () => {
    const { left, hub } = rover()
    unplugDevice(left)
    expect(hubForDevice(left)).toBe(hub)
    expect(plugDeviceIn(left)).toBe(true)
    expect(portOf(left)).toBe('A')
    expect(topLabel()).toBe('Plug Left motor into port A')
    expect(toast()).toBe('Left motor connected to port A.')
    unplugDevice(left)
    expect(plugDeviceIn(left, 'D')).toBe(true)
    expect(portOf(left)).toBe('D')
    // A port another present device holds is refused (a swap is the way to take it).
    unplugDevice(left)
    expect(plugDeviceIn(left, 'B')).toBe(false)
    expect(portOf(left)).toBeNull()
  })

  it('a full hub or no hub changes nothing and says why', () => {
    rover()
    const light = place(ROBOTICS_PART_IDS.light, 33, 1, 28)
    expect(portOf(light)).toBe('D')
    const second = place(ROBOTICS_PART_IDS.light, 28, 1, 27)
    expect(robotics().wiringNote?.text).toBe('Ports A–D are full. Unplug something to plug in Light')
    const depth = useBrickStore.getState().undoStack.length
    expect(plugDeviceIn(second)).toBe(false)
    expect(toast()).toBe('The hub is full. Unplug something to free a port.')
    expect(useBrickStore.getState().undoStack).toHaveLength(depth)
    // Swapping still works on a full hub: the second light takes D, the first is left unplugged.
    expect(swapDevicePorts(second, light)).toBe(true)
    expect([portOf(second), portOf(light)]).toEqual(['D', null])
    const lonely = place(ROBOTICS_PART_IDS.motor, 5, 0, 5)
    expect(plugDeviceIn(lonely)).toBe(false)
    expect(toast()).toMatch(/^Add a hub to plug \w+ motor in\.$/)
  })
})

describe('move and swap', () => {
  it('Move to port C: the cable moves, the old port is free again, one undo puts it back', () => {
    const { left, sensor } = rover()
    moveDeviceToPort(sensor, 'D')
    expect(moveDeviceToPort(left, 'C')).toBe(true)
    expect(portOf(left)).toBe('C')
    expect(topLabel()).toBe('Move Left motor to port C')
    expect(toast()).toBe('Left motor moved to port C. Port A is free again.')
    undo()
    expect(portOf(left)).toBe('A')
    // Onto a port a present device holds: refused.
    expect(moveDeviceToPort(left, 'B')).toBe(false)
    expect(portOf(left)).toBe('A')
  })

  it('Swap exchanges two devices’ ports in one undoable edit', () => {
    const { left, right } = rover()
    expect(swapDevicePorts(left, right)).toBe(true)
    expect([portOf(left), portOf(right)]).toEqual(['B', 'A'])
    expect(topLabel()).toBe('Swap ports of Left motor and Right motor')
    expect(toast()).toBe('Swapped ports. Left motor is on port B, Right motor is on port A.')
    undo()
    expect([portOf(left), portOf(right)]).toEqual(['A', 'B'])
  })

  it('Swap with an unplugged device hands it the port and leaves the other unplugged', () => {
    const { left, sensor } = rover()
    unplugDevice(left)
    expect(swapDevicePorts(left, sensor)).toBe(true)
    expect([portOf(left), portOf(sensor)]).toEqual(['C', null])
    expect(toast()).toBe('Swapped ports. Left motor is on port C, Front sensor is unplugged.')
  })

  it('the assisted-wiring line is dismissed by a wiring edit (its Undo would describe an old cable)', () => {
    const { left } = rover()
    expect(robotics().wiringNote).not.toBeNull()
    moveDeviceToPort(left, 'D')
    expect(robotics().wiringNote).toBeNull()
  })
})

describe('the stale-cable rule in the studio', () => {
  it('deleting a wired device keeps its cable, frees its port by its last known name, and Undo restores the connection', () => {
    const { right, hub } = rover()
    useBrickStore.getState().selectBrick(right)
    useBrickStore.getState().deleteSelected()
    expect(portOf(right)).toBe('B')
    expect(lastKnownDeviceName(right)).toBe('Right motor')
    expect(portsOfHub(hub)[1]).toEqual({ port: 'B', deviceId: right, deviceMissing: true, used: false, staleName: 'Right motor' })
    undo()
    expect(useBrickStore.getState().bricks.some((brick) => brick.id === right)).toBe(true)
    expect(portOf(right)).toBe('B')
    expect(robotics().model.creations[0].motors.find((motor) => motor.brickId === right)!.port?.port).toBe('B')
  })

  it('a present device plugged into the stale port drops the stale cable; assisted wiring offers that port too', () => {
    const { left, right } = rover()
    useBrickStore.getState().selectBrick(right)
    useBrickStore.getState().deleteSelected()
    unplugDevice(left)
    expect(plugDeviceIn(left, 'B')).toBe(true)
    expect(toast()).toBe('Left motor connected to port B. The old cable from Right motor is gone.')
    expect(section().connections.some((connection) => connection.deviceId === right)).toBe(false)
    // Undo the plug-in and the delete: the right motor comes back to its cable.
    undo()
    undo()
    expect(portOf(right)).toBe('B')
    // Assisted wiring: delete it again and place a light; the light takes the stale port B.
    useBrickStore.getState().selectBrick(right)
    useBrickStore.getState().deleteSelected()
    const light = place(ROBOTICS_PART_IDS.light, 33, 1, 28)
    expect(robotics().wiringNote?.text).toBe('Light connected to port B')
    expect(portOf(light)).toBe('B')
    expect(section().connections.some((connection) => connection.deviceId === right)).toBe(false)
  })
})

describe('rename and wiring mode', () => {
  it('Rename writes the device name; the default name clears it; blank changes nothing', () => {
    const { left } = rover()
    expect(renameDevice(left, '  Big   wheel ')).toBe(true)
    expect(section().devices[left]).toEqual({ name: 'Big wheel' })
    expect(topLabel()).toBe('Rename Left motor to Big wheel')
    expect(toast()).toBe('Left motor is now called Big wheel. Blocks that use it show the new name.')
    expect(robotics().model.creations[0].motors.find((motor) => motor.brickId === left)!.name).toBe('Big wheel')
    expect(renameDevice(left, '   ')).toBe(false)
    expect(renameDevice(left, 'Big wheel')).toBe(false)
    expect(renameDevice(left, 'Left motor')).toBe(true)
    expect(section().devices[left]).toBeUndefined()
    undo()
    expect(section().devices[left]).toEqual({ name: 'Big wheel' })
  })

  it('Wiring: manual ("Plug in by itself: off") is an undoable setting; a device placed in manual gets no cable and the line says where to plug it', () => {
    const { hub } = rover()
    expect(setWiringMode('manual')).toBe(true)
    expect(section().settings.wiring).toBe('manual')
    expect(topLabel()).toBe('Plug in by itself: off')
    expect(toast()).toBe('Plug in by itself is off. New parts wait for you to plug them in.')
    expect(setWiringMode('manual')).toBe(false)
    const light = place(ROBOTICS_PART_IDS.light, 33, 1, 28)
    expect(portOf(light)).toBeNull()
    expect(robotics().wiringNote).toMatchObject({ text: 'Light placed · plug it into a port in its panel', undoable: false })
    expect(hubForDevice(light)).toBe(hub)
    expect(plugDeviceIn(light)).toBe(true)
    expect(portOf(light)).toBe('D')
    setWiringMode('assisted')
    expect(section().settings.wiring).toBe('assisted')
    undo()
    expect(section().settings.wiring).toBe('manual')
  })
})

describe('a running nudge', () => {
  it('a wiring edit retires it; a rename or a mode change does not', async () => {
    const { left, right, creationId } = rover()
    await robotics().startSim(creationId)
    const sim = robotics().sim!
    robotics().nudgeMotor(left, 0.4)
    renameDevice(left, 'Big wheel')
    expect(robotics().sim).toBe(sim)
    setWiringMode('manual')
    expect(robotics().sim).toBe(sim)
    swapDevicePorts(left, right)
    expect(robotics().sim).toBeNull()
    expect(sim.mechanics.disposed).toBe(true)
    for (const edit of [() => moveDeviceToPort(left, 'D'), () => unplugDevice(left), () => plugDeviceIn(left)]) {
      await robotics().startSim(creationId)
      const running = robotics().sim!
      expect(edit()).toBe(true)
      expect(robotics().sim).toBeNull()
      expect(running.mechanics.disposed).toBe(true)
    }
  })
})
