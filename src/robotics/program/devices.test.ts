import { describe, expect, it } from 'vitest'
import { GATE_IDS, ROVER_IDS, SIGNAL_IDS } from '../model/fixtures'
import { deviceLabel, deviceOptions, referencedDevices, rememberDeviceNames } from './devices'
import { startersFor } from './starters'
import { wiredGate, wiredRover, wiredSignalPost } from './testFixtures'

const workspaceNaming = (fields: Record<string, string>[]) => ({
  blocks: { languageVersion: 0, blocks: fields.map((field, index) => ({ type: 'robo_stop_motor', id: `b${index}`, fields: field })) },
})

describe('device dropdowns', () => {
  it('lists the creation’s devices by brick id, labelled name · port', () => {
    const { creation } = wiredRover()
    expect(deviceOptions(creation, null, 'motor')).toEqual([['Left motor · A', ROVER_IDS.leftMotor], ['Right motor · B', ROVER_IDS.rightMotor]])
    expect(deviceOptions(creation, null, 'sensor')).toEqual([['Front sensor · C', ROVER_IDS.sensor]])
    expect(deviceOptions(creation, null, 'light')).toEqual([['no light yet', '']])
    expect(deviceOptions(creation, null, 'button')).toEqual([['no button yet', '']])
  })

  it('motor menus list hinge motors too', () => {
    expect(deviceOptions(wiredGate().creation, null, 'motor')).toEqual([['Arm motor · A', GATE_IDS.hinge]])
    expect(deviceOptions(wiredSignalPost().creation, null, 'light')).toEqual([['Light · B', SIGNAL_IDS.light]])
  })

  it('an unplugged device says so in its label; moving its cable changes the label, never the value', () => {
    const unplugged = wiredRover({ unplug: [ROVER_IDS.leftMotor] }).creation
    expect(deviceOptions(unplugged, null, 'motor')[0]).toEqual(['Left motor · not plugged in', ROVER_IDS.leftMotor])
    expect(deviceLabel({ name: 'Left motor', plugged: true, port: { hubId: 'h', port: 'C' } })).toBe('Left motor · C')
  })

  it('keeps an id the program references but the creation no longer has, labelled missing from deviceNames', () => {
    const { creation } = wiredRover()
    const program = { workspace: workspaceNaming([{ MOTOR: ROVER_IDS.leftMotor }, { SENSOR: 'gone-sensor' }]), deviceNames: { 'gone-sensor': 'front sensor' } }
    expect(deviceOptions(creation, program, 'sensor')).toEqual([['Front sensor · C', ROVER_IDS.sensor], ['front sensor (missing)', 'gone-sensor']])
    // Only the kind whose field references it.
    expect(deviceOptions(creation, program, 'motor')).toHaveLength(2)
    // No remembered name: a plain word.
    expect(deviceOptions(creation, { ...program, deviceNames: {} }, 'sensor')[1]).toEqual(['A sensor (missing)', 'gone-sensor'])
    // The field's current value is kept too, and a device of another kind is named as such.
    expect(deviceOptions(creation, null, 'light', ROVER_IDS.sensor)).toEqual([['Front sensor (not a light)', ROVER_IDS.sensor]])
    expect(deviceOptions(creation, null, 'light', 'elsewhere')).toEqual([['A light (missing)', 'elsewhere']])
  })

  it('finds references anywhere in the workspace: hats, nested inputs and statement inputs', () => {
    const { creation } = wiredGate()
    const [smartGate] = startersFor(creation)
    expect(referencedDevices(smartGate.workspace)).toEqual([{ kind: 'sensor', deviceId: GATE_IDS.sensor }, { kind: 'motor', deviceId: GATE_IDS.hinge }])
    const [stop] = startersFor(wiredRover().creation)
    expect(referencedDevices(stop.workspace)).toEqual([{ kind: 'sensor', deviceId: ROVER_IDS.sensor }])
    expect(referencedDevices(null)).toEqual([])
  })
})

describe('remembered device names', () => {
  it('refreshes names of referenced devices, keeps names of missing ones, forgets unreferenced ones', () => {
    const { creation } = wiredRover()
    const program = {
      workspace: workspaceNaming([{ MOTOR: ROVER_IDS.leftMotor }, { SENSOR: 'gone-sensor' }]),
      deviceNames: { [ROVER_IDS.leftMotor]: 'Old name', 'gone-sensor': 'front sensor', unreferenced: 'Whatever' },
    }
    const refreshed = rememberDeviceNames(program, creation)
    expect(refreshed.deviceNames).toEqual({ 'gone-sensor': 'front sensor', [ROVER_IDS.leftMotor]: 'Left motor' })
    expect(Object.keys(refreshed.deviceNames)).toEqual([...Object.keys(refreshed.deviceNames)].sort())
    // Nothing to change: the same object back.
    expect(rememberDeviceNames(refreshed, creation)).toBe(refreshed)
  })
})
