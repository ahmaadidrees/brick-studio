import { beforeAll, describe, expect, it } from 'vitest'
import { installRoboticsParts } from '../parts/install'
import { connect, freePorts, hubPorts, livePort, moveToPort, planAssistedConnection, plugInto, swapPorts, unplug } from './control'
import { ROVER_IDS, roverBricks } from './fixtures'
import { emptyRoboticsSection, type RoboticsSection } from './section'

beforeAll(() => { installRoboticsParts(true) })

const HUB = ROVER_IDS.hub
const LEFT = ROVER_IDS.leftMotor
const RIGHT = ROVER_IDS.rightMotor
const SENSOR = ROVER_IDS.sensor

/** The rover wired as assisted wiring leaves it: left motor A, right motor B, sensor C. */
function wired(): RoboticsSection {
  let section = emptyRoboticsSection()
  section = connect(section, LEFT, HUB, 'A')
  section = connect(section, RIGHT, HUB, 'B')
  section = connect(section, SENSOR, HUB, 'C')
  return section
}
const everything = new Set(roverBricks().map((brick) => brick.id))
const without = (...ids: string[]) => new Set([...everything].filter((id) => !ids.includes(id)))
const portOf = (section: RoboticsSection, deviceId: string) => section.connections.find((connection) => connection.deviceId === deviceId)?.port ?? null

describe('unplug', () => {
  it('removes the device cable and nothing else', () => {
    const next = unplug(wired(), LEFT)
    expect(portOf(next, LEFT)).toBeNull()
    expect(next.connections.map((connection) => connection.port)).toEqual(['B', 'C'])
  })
  it('is a no-op, returning the same section, when the device has no cable', () => {
    const section = unplug(wired(), LEFT)
    expect(unplug(section, LEFT)).toBe(section)
  })
})

describe('plugInto', () => {
  it('plugs an unplugged device into a free port', () => {
    const next = plugInto(unplug(wired(), LEFT), LEFT, HUB, 'D', everything)
    expect(portOf(next, LEFT)).toBe('D')
  })
  it('refuses a port held by a present device (swap instead)', () => {
    const section = unplug(wired(), LEFT)
    expect(plugInto(section, LEFT, HUB, 'B', everything)).toBe(section)
  })
  it('a plugged device leaves its old port: a device holds one cable', () => {
    const next = plugInto(wired(), LEFT, HUB, 'D', everything)
    expect(portOf(next, LEFT)).toBe('D')
    expect(next.connections.filter((connection) => connection.deviceId === LEFT)).toHaveLength(1)
    expect(freePorts(next, HUB, everything)).toEqual(['A'])
  })
  it('plugging into the port it already holds changes nothing', () => {
    const section = wired()
    expect(plugInto(section, LEFT, HUB, 'A', everything)).toBe(section)
  })
})

describe('moveToPort', () => {
  it('moves a plugged device to a free port on the same hub', () => {
    const next = moveToPort(wired(), LEFT, 'D', everything)
    expect(portOf(next, LEFT)).toBe('D')
    expect(freePorts(next, HUB, everything)).toEqual(['A'])
  })
  it('an unplugged device, the same port, or a port a present device holds: no-op', () => {
    const section = wired()
    const unplugged = unplug(section, LEFT)
    expect(moveToPort(unplugged, LEFT, 'D', everything)).toBe(unplugged)
    expect(moveToPort(section, LEFT, 'A', everything)).toBe(section)
    expect(moveToPort(section, LEFT, 'C', everything)).toBe(section)
  })
})

describe('swapPorts', () => {
  it('two plugged devices exchange ports and the cable list keeps its order', () => {
    const next = swapPorts(wired(), LEFT, RIGHT)
    expect(next.connections).toEqual([
      { deviceId: LEFT, hubId: HUB, port: 'B' },
      { deviceId: RIGHT, hubId: HUB, port: 'A' },
      { deviceId: SENSOR, hubId: HUB, port: 'C' },
    ])
    expect(swapPorts(next, RIGHT, LEFT).connections).toEqual(wired().connections)
  })
  it('with one plugged, the other takes its port and the first is left unplugged', () => {
    const section = unplug(wired(), LEFT)
    const next = swapPorts(section, LEFT, SENSOR)
    expect(portOf(next, LEFT)).toBe('C')
    expect(portOf(next, SENSOR)).toBeNull()
    expect(swapPorts(section, SENSOR, LEFT)).toEqual(next)
  })
  it('neither plugged, or a device with itself: no-op', () => {
    const section = unplug(unplug(wired(), LEFT), RIGHT)
    expect(swapPorts(section, LEFT, RIGHT)).toBe(section)
    const whole = wired()
    expect(swapPorts(whole, LEFT, LEFT)).toBe(whole)
  })
})

describe('the stale-cable rule', () => {
  it('a deleted device keeps its cable, but its port counts as free', () => {
    const section = wired()
    const present = without(RIGHT)
    expect(section.connections.some((connection) => connection.deviceId === RIGHT)).toBe(true)
    expect(freePorts(section, HUB, present)).toEqual(['B', 'D'])
    // A caller that knows nothing about bricks treats every cable as present.
    expect(freePorts(section, HUB)).toEqual(['D'])
  })
  it('hubPorts reports the device, whether it is there, and the stale device by its last known name', () => {
    const section: RoboticsSection = { ...wired(), devices: { [SENSOR]: { name: 'Eyes' } } }
    const ports = hubPorts(section, HUB, without(RIGHT, SENSOR), (id) => (id === RIGHT ? 'Right motor' : null))
    expect(ports).toEqual([
      { port: 'A', deviceId: LEFT, deviceMissing: false, used: true, staleName: null },
      { port: 'B', deviceId: RIGHT, deviceMissing: true, used: false, staleName: 'Right motor' },
      { port: 'C', deviceId: SENSOR, deviceMissing: true, used: false, staleName: 'Eyes' },
      { port: 'D', deviceId: null, deviceMissing: false, used: false, staleName: null },
    ])
    expect(hubPorts(section, HUB, without(RIGHT))[1].staleName).toBe('a part')
  })
  it('a present device plugged into the stale port drops the stale cable', () => {
    const section = unplug(wired(), LEFT)
    const present = without(RIGHT)
    const next = plugInto(section, LEFT, HUB, 'B', present)
    expect(portOf(next, LEFT)).toBe('B')
    expect(next.connections.some((connection) => connection.deviceId === RIGHT)).toBe(false)
    // Moving onto a stale port does the same.
    const moved = moveToPort(wired(), LEFT, 'B', present)
    expect(portOf(moved, LEFT)).toBe('B')
    expect(moved.connections.some((connection) => connection.deviceId === RIGHT)).toBe(false)
  })
  it('assisted wiring offers the stale port, first free in A–D order', () => {
    const bricks = roverBricks()
    const newcomer = { ...bricks.find((brick) => brick.id === LEFT)!, id: 'another-motor' }
    const present = new Set([...without(RIGHT), newcomer.id])
    expect(planAssistedConnection(wired(), newcomer, [HUB], present)).toEqual({ ok: true, hubId: HUB, port: 'B' })
    // Without presence (every cable counts) the hub offers D.
    expect(planAssistedConnection(wired(), newcomer, [HUB])).toEqual({ ok: true, hubId: HUB, port: 'D' })
  })
  it('a live port needs the hub too: a cable to a deleted hub is not plugged in', () => {
    expect(livePort(wired(), LEFT, everything)?.port).toBe('A')
    expect(livePort(wired(), LEFT, without(HUB))).toBeNull()
  })
})

describe('a full hub', () => {
  const full = () => connect(wired(), 'light', HUB, 'D')
  const present = new Set([...everything, 'light', 'button'])
  it('has no free port, refuses assisted wiring and refuses a plug-in anywhere', () => {
    const section = full()
    const button = { id: 'button', partId: 'robo_button', x: 0, y: 1, z: 0, rotation: 0 as const, color: '#fff' }
    expect(freePorts(section, HUB, present)).toEqual([])
    expect(planAssistedConnection(section, button, [HUB], present)).toEqual({ ok: false, reason: 'ports-full' })
    for (const port of ['A', 'B', 'C', 'D'] as const) expect(plugInto(section, 'button', HUB, port, present)).toBe(section)
  })
  it('a swap still works when the hub is full, and so does taking a port from a plugged device', () => {
    const section = full()
    expect(portOf(swapPorts(section, LEFT, 'light'), LEFT)).toBe('D')
    const taken = swapPorts(section, 'button', 'light')
    expect(portOf(taken, 'button')).toBe('D')
    expect(portOf(taken, 'light')).toBeNull()
  })
})
